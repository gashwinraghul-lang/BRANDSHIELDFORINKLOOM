// server/src/routes/agent.js
import express from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { query, one, execute } from '../db.js';
import config from '../config.js';
import { ah } from '../lib/http.js';
import { badRequest, notFound } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';
import { logAudit, logAgentCall } from '../lib/observability.js';
import { runAdHocReview, runReview } from '../services/orchestrator.js';

const router = express.Router();

function tokenMatches(provided) {
  if (!config.agent.serviceToken || !provided) return false;
  const a = Buffer.from(String(provided));
  const b = Buffer.from(String(config.agent.serviceToken));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function agentAuth(req, res, next) {
  const header = req.headers['x-agent-service-token'];
  const bearer = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.slice(7)
    : null;
  if (!tokenMatches(header || bearer)) {
    return res.status(401).json({ error: 'Invalid agent service token', code: 'AGENT_UNAUTHORIZED' });
  }
  return next();
}

async function resolveOrganization(requested) {
  if (requested) return Number(requested);
  if (config.agent.organizationId) return config.agent.organizationId;
  const org = await one('SELECT id FROM organizations ORDER BY id ASC LIMIT 1');
  if (!org) throw notFound('No organisation configured for the agent');
  return org.id;
}

function toTextSummary(result) {
  const top = result.findings
    .slice()
    .sort((a, b) => ['error', 'warning', 'suggestion', 'info'].indexOf(a.severity) - ['error', 'warning', 'suggestion', 'info'].indexOf(b.severity))
    .slice(0, 6);
  if (!top.length) return 'No issues found in the submitted content. It looks consistent with the available brand guidance.';
  const lines = top.map(
    (f, i) =>
      `${i + 1}. [${f.severity}] ${f.title || f.category} — ${f.explanation}${f.suggested_fix ? ` Suggestion: ${f.suggested_fix}` : ''}`
  );
  return `BrandShield found ${result.findings.length} item${result.findings.length > 1 ? 's' : ''} (${result.summary.warnings} warnings, ${result.summary.suggestions} suggestions).\n${lines.join('\n')}\n\nNothing is applied automatically. A human decides.`;
}

router.use(agentAuth);

router.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'brandshield-agent-bridge', bridge: Boolean(config.agent.bridgeUrl) });
});

router.post(
  '/review',
  ah(async (req, res) => {
    const data = z
      .object({
        text: z.string().trim().min(1).max(200000),
        organizationId: z.coerce.number().int().positive().optional(),
        title: z.string().trim().max(255).optional(),
      })
      .parse(req.body);
    const started = Date.now();
    const organizationId = await resolveOrganization(data.organizationId);
    const result = await runAdHocReview({
      text: data.text,
      organizationId,
      title: data.title || 'Agentverse review',
    });
    await logAgentCall({
      organizationId,
      source: 'agentverse',
      ok: true,
      durationMs: Date.now() - started,
      detail: `review: ${result.findings.length} findings`,
    });
    await logAudit({
      organizationId,
      userId: null,
      action: 'agent.review',
      entityType: 'agent',
      details: { findings: result.findings.length, source: 'agentverse', excludedRestricted: result.excludedRestricted },
    });
    res.json({
      ...result,
      reply: toTextSummary(result),
      disclosure:
        'Processed by BrandShield Reviewer via Agentverse. Findings are suggestions; a human makes the final decision. Restricted brand material was excluded.',
    });
  })
);

router.post(
  '/claims',
  ah(async (req, res) => {
    const data = z
      .object({
        text: z.string().trim().min(1).max(200000),
        organizationId: z.coerce.number().int().positive().optional(),
      })
      .parse(req.body);
    const started = Date.now();
    const organizationId = await resolveOrganization(data.organizationId);
    const result = await runAdHocReview({ text: data.text, organizationId, title: 'Claim check' });
    const claims = result.claimVerdicts;
    await logAgentCall({
      organizationId,
      source: 'agentverse',
      ok: true,
      durationMs: Date.now() - started,
      detail: `claims: ${claims.length} verdicts`,
    });
    await logAudit({
      organizationId,
      userId: null,
      action: 'agent.claims',
      entityType: 'agent',
      details: { claims: claims.length, source: 'agentverse' },
    });
    res.json({
      claims: claims.map(({ claim_text, verdict, similarity, source, owner, expires_at, engine }) => ({
        claim: claim_text,
        verdict,
        similarity,
        source,
        owner,
        expires_at,
        engine,
      })),
      disclosure: 'Restricted facts were excluded before processing.',
    });
  })
);

export default router;

// ---------------------------------------------------------------------------
// Website integration: POST /api/reviews/via-agent
// ---------------------------------------------------------------------------
export const websiteAgentRouter = express.Router();

websiteAgentRouter.post(
  '/reviews/via-agent',
  authenticate,
  ah(async (req, res) => {
    const data = z
      .object({
        title: z.string().trim().min(3).max(255),
        content: z.string().max(500000).default(''),
        confidentiality: z.enum(['public', 'internal', 'restricted']).default('internal'),
      })
      .parse(req.body);

    const result = await execute(
      `INSERT INTO submissions
         (organization_id, user_id, title, status, content, content_type, confidentiality, current_revision, processing_status, engine)
       VALUES (?,?,?,'draft',?,'text',?,1,'processing','agentverse')`,
      [req.organizationId, req.user.id, data.title, data.content, data.confidentiality]
    );
    await execute(
      `INSERT INTO submission_revisions (submission_id, version, content, content_type, note, created_by)
       VALUES (?,?,?,?,?,?)`,
      [result.insertId, 1, data.content, 'text', 'Initial version via BrandShield Agent', req.user.id]
    );

    let agentSummary = null;
    let agentOnline = false;
    const started = Date.now();
    if (config.agent.bridgeUrl) {
      try {
        const response = await fetch(`${config.agent.bridgeUrl.replace(/\/$/, '')}/review`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-agent-service-token': config.agent.serviceToken,
          },
          body: JSON.stringify({ text: data.content, title: data.title }),
          signal: AbortSignal.timeout(30000),
        });
        if (response.ok) {
          const payload = await response.json();
          agentSummary = payload.reply || payload.summary || null;
          agentOnline = true;
        }
      } catch {
        agentOnline = false;
      }
      await logAgentCall({
        organizationId: req.organizationId,
        source: 'website',
        ok: agentOnline,
        durationMs: Date.now() - started,
        detail: agentOnline ? 'review via agent bridge' : 'agent bridge unavailable; used direct review',
      });
    }

    // Always persist a normal finding set. The direct engines are the safety net
    // when the agent is offline, and the same review is shown either way.
    await runReview(result.insertId, { organizationId: req.organizationId, actorId: req.user.id });
    if (agentOnline) {
      await execute("UPDATE submissions SET engine='agentverse' WHERE id=?", [result.insertId]);
    }
    await logAudit({
      organizationId: req.organizationId,
      userId: req.user.id,
      action: 'review.via_agent',
      entityType: 'submission',
      entityId: result.insertId,
      details: { agentOnline },
    });
    const submission = await one('SELECT * FROM submissions WHERE id=?', [result.insertId]);
    res.status(201).json({ submission, agentOnline, agentSummary, fallbackUsed: !agentOnline });
  })
);
