// server/src/routes/settings.js
import express from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { query, one, execute } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { ah } from '../lib/http.js';
import { badRequest } from '../lib/errors.js';
import { logAudit } from '../lib/observability.js';
import { isLlmAvailable, currentModelName } from '../services/llmClient.js';
import { isEmailConfigured, sendMail } from '../utils/email.js';
import config from '../config.js';

const router = express.Router();

router.get(
  '/settings',
  authenticate,
  ah(async (req, res) => {
    const [organization, team, calls, agentCalls] = await Promise.all([
      one('SELECT id, name, slug, brand_tone, created_at FROM organizations WHERE id=?', [req.organizationId]),
      query(
        `SELECT id, name, email, role, status, email_verified_at, last_login_at, created_at
           FROM users WHERE organization_id=? ORDER BY created_at ASC`,
        [req.organizationId]
      ),
      one(
        "SELECT COUNT(*) AS n FROM ai_call_log WHERE organization_id=? AND service='groq' AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)",
        [req.organizationId]
      ),
      one(
        'SELECT MAX(created_at) AS last_call, SUM(ok) AS successes, COUNT(*) AS total FROM agent_calls WHERE organization_id=?',
        [req.organizationId]
      ),
    ]);
    res.json({
      organization,
      team,
      ai: {
        provider: 'Groq',
        configured: isLlmAvailable(),
        model: isLlmAvailable() ? currentModelName() : null,
        fallback: 'deterministic engines',
        callsLast30Days: Number(calls.n),
        disclosure:
          'Groq receives submitted text with emails and phone numbers redacted. Restricted material is never sent. OCR, palette analysis and retrieval run locally.',
      },
      agent: {
        configured: Boolean(config.agent.bridgeUrl || config.agent.address),
        online: Boolean(config.agent.bridgeUrl),
        address: config.agent.address || null,
        mode: config.agent.bridgeUrl ? 'bridge' : 'offline',
        lastCall: agentCalls.last_call || null,
        totalCalls: Number(agentCalls.total || 0),
        successes: Number(agentCalls.successes || 0),
      },
      email: { configured: isEmailConfigured(), host: config.smtp.host || null },
      confidentiality: {
        levels: ['public', 'internal', 'restricted'],
        rule: 'Restricted facts, assets and guidelines are never sent to external services. Restricted submissions are reviewed fully locally.',
      },
      retention: {
        uploads: 'Stored under server/storage and served only through authenticated routes.',
        auditLog: 'Append-only.',
      },
      metrics: config.metrics,
    });
  })
);

router.patch(
  '/settings/organization',
  authenticate,
  authorize('admin'),
  ah(async (req, res) => {
    const data = z
      .object({
        name: z.string().trim().min(2).max(160).optional(),
        brandTone: z.string().trim().max(255).optional().nullable(),
      })
      .parse(req.body);
    await execute('UPDATE organizations SET name=COALESCE(?, name), brand_tone=COALESCE(?, brand_tone) WHERE id=?', [
      data.name ?? null,
      data.brandTone ?? null,
      req.organizationId,
    ]);
    await logAudit({
      organizationId: req.organizationId,
      userId: req.user.id,
      action: 'settings.organization.updated',
      entityType: 'organization',
      entityId: req.organizationId,
      details: data,
    });
    res.json({ organization: await one('SELECT id, name, slug, brand_tone FROM organizations WHERE id=?', [req.organizationId]) });
  })
);

router.get(
  '/settings/ai-log',
  authenticate,
  authorize('admin', 'manager'),
  ah(async (req, res) => {
    const rows = await query(
      `SELECT * FROM ai_call_log WHERE organization_id=? ORDER BY created_at DESC LIMIT 100`,
      [req.organizationId]
    );
    res.json({ calls: rows });
  })
);

router.get(
  '/settings/agent-calls',
  authenticate,
  ah(async (req, res) => {
    const rows = await query(
      'SELECT * FROM agent_calls WHERE organization_id=? ORDER BY created_at DESC LIMIT 50',
      [req.organizationId]
    );
    res.json({ calls: rows });
  })
);

router.post(
  '/settings/invite',
  authenticate,
  authorize('admin', 'manager'),
  ah(async (req, res) => {
    const data = z
      .object({
        email: z.string().trim().toLowerCase().email(),
        name: z.string().trim().max(160).optional().nullable(),
        role: z.enum(['admin', 'manager', 'reviewer', 'creator', 'agency']).default('creator'),
      })
      .parse(req.body);
    const existing = await one('SELECT id FROM users WHERE email=?', [data.email]);
    if (existing) throw badRequest('That person is already in a BrandShield workspace');
    const tempPassword = crypto.randomBytes(12).toString('base64url');
    const bcrypt = (await import('bcryptjs')).default;
    const hash = await bcrypt.hash(tempPassword, 11);
    const result = await execute(
      `INSERT INTO users (organization_id, email, password_hash, role, name, status) VALUES (?,?,?,?,?,'invited')`,
      [req.organizationId, data.email, hash, data.role, data.name || data.email.split('@')[0]]
    );
    await execute('INSERT INTO memberships (user_id, organization_id, role) VALUES (?,?,?)', [
      result.insertId,
      req.organizationId,
      data.role,
    ]);
    const token = crypto.randomBytes(32).toString('hex');
    const { hashToken } = await import('../lib/tokens.js');
    await execute('INSERT INTO email_tokens (user_id, token, type, expires_at) VALUES (?,?,?,?)', [
      result.insertId,
      hashToken(token),
      'reset',
      new Date(Date.now() + 7 * 24 * 3600 * 1000),
    ]);
    const url = `${config.appUrl}/reset-password?token=${token}`;
    const mail = await sendMail({
      to: data.email,
      subject: `${req.user.name || 'Your team'} invited you to BrandShield.ai`,
      text: `You were invited as ${data.role}. Set your password: ${url}`,
      html: `<p>You were invited as <strong>${data.role}</strong>.</p><p><a href="${url}">Set your password</a></p>`,
    });
    await logAudit({
      organizationId: req.organizationId,
      userId: req.user.id,
      action: 'team.invited',
      entityType: 'user',
      entityId: result.insertId,
      details: { email: data.email, role: data.role },
    });
    res.status(201).json({
      invited: { id: result.insertId, email: data.email, role: data.role },
      emailSent: Boolean(mail.sent),
      resetUrl: config.nodeEnv === 'production' ? undefined : url,
    });
  })
);

router.post(
  '/settings/agent/ping',
  authenticate,
  ah(async (req, res) => {
    if (!config.agent.bridgeUrl) {
      return res.json({ online: false, message: 'No agent bridge configured. The website falls back to direct review.' });
    }
    const started = Date.now();
    try {
      const response = await fetch(`${config.agent.bridgeUrl.replace(/\/$/, '')}/health`, {
        signal: AbortSignal.timeout(4000),
      });
      const ok = response.ok;
      await execute('INSERT INTO agent_calls (organization_id, source, ok, duration_ms, detail) VALUES (?,?,?,?,?)', [
        req.organizationId,
        'website_ping',
        ok ? 1 : 0,
        Date.now() - started,
        `HTTP ${response.status}`,
      ]);
      res.json({ online: ok, status: response.status, latencyMs: Date.now() - started });
    } catch (err) {
      await execute('INSERT INTO agent_calls (organization_id, source, ok, duration_ms, detail) VALUES (?,?,?,?,?)', [
        req.organizationId,
        'website_ping',
        0,
        Date.now() - started,
        err.message.slice(0, 200),
      ]);
      res.json({ online: false, error: err.message });
    }
  })
);

export default router;
