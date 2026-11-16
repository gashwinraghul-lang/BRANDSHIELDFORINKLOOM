// server/src/routes/auth.js
import express from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { z } from 'zod';
import { execute, one, query } from '../db.js';
import { sendMail, isEmailConfigured } from '../utils/email.js';
import { badRequest, conflict, unauthorized, notFound } from '../lib/errors.js';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  CSRF_COOKIE,
  signAccessToken,
  verifyAccessToken,
  newRefreshToken,
  hashToken,
  newCsrfToken,
  cookieOptions,
} from '../lib/tokens.js';
import { authenticate } from '../middleware/auth.js';
import { logAudit } from '../lib/observability.js';
import config from '../config.js';

const router = express.Router();

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address');
const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(200, 'Password is too long');

const signupSchema = z.object({
  name: z.string().trim().min(2, 'Tell us your name').max(160),
  email: emailSchema,
  password: passwordSchema,
  organizationName: z.string().trim().min(2, 'Organisation name is required').max(160).optional(),
  inviteCode: z.string().trim().optional(),
});

const loginSchema = z.object({ email: emailSchema, password: z.string().min(1) });

function orgSlug(name) {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
  return `${base || 'org'}-${crypto.randomBytes(3).toString('hex')}`;
}

async function issueSession(res, user) {
  const access = signAccessToken(user);
  const refresh = newRefreshToken();
  const expires = new Date(Date.now() + config.refreshDays * 24 * 60 * 60 * 1000);
  await execute(
    'INSERT INTO refresh_tokens (user_id, token, expires_at) VALUES (?,?,?)',
    [user.id, hashToken(refresh), expires]
  );
  const csrf = newCsrfToken();
  res.cookie(ACCESS_COOKIE, access, cookieOptions(15 * 60 * 1000));
  res.cookie(REFRESH_COOKIE, refresh, cookieOptions(config.refreshDays * 24 * 60 * 60 * 1000));
  res.cookie(CSRF_COOKIE, csrf, {
    httpOnly: false,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    maxAge: config.refreshDays * 24 * 60 * 60 * 1000,
    path: '/',
  });
  return { access, csrf };
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    organizationId: user.organization_id,
    organizationName: user.organization_name,
    emailVerified: Boolean(user.email_verified_at),
    status: user.status,
  };
}

router.post('/signup', async (req, res, next) => {
  try {
    const data = signupSchema.parse(req.body);
    const existing = await one('SELECT id FROM users WHERE email = ?', [data.email]);
    if (existing) throw conflict('An account with that email already exists');

    let organization;
    if (data.inviteCode) {
      organization = await one('SELECT * FROM organizations WHERE slug = ?', [data.inviteCode]);
      if (!organization) throw badRequest('That invite code is not valid');
    } else {
      const name = data.organizationName || `${data.name}'s workspace`;
      const result = await execute(
        'INSERT INTO organizations (name, slug, brand_tone) VALUES (?,?,?)',
        [name, orgSlug(name), 'Confident, clear and human']
      );
      organization = { id: result.insertId, name };
    }

    const passwordHash = await bcrypt.hash(data.password, 11);
    const isFirst = (await one('SELECT COUNT(*) AS n FROM users WHERE organization_id = ?', [
      organization.id,
    ])).n === 0;
    const role = isFirst ? 'admin' : 'creator';

    const result = await execute(
      `INSERT INTO users (organization_id, email, password_hash, role, name, status)
       VALUES (?,?,?,?,?,?)`,
      [organization.id, data.email, passwordHash, role, data.name, 'active']
    );
    await execute(
      'INSERT INTO memberships (user_id, organization_id, role) VALUES (?,?,?)',
      [result.insertId, organization.id, role === 'admin' ? 'admin' : 'creator']
    );

    const token = crypto.randomBytes(32).toString('hex');
    await execute(
      'INSERT INTO email_tokens (user_id, token, type, expires_at) VALUES (?,?,?,?)',
      [result.insertId, hashToken(token), 'verification', new Date(Date.now() + 24 * 3600 * 1000)]
    );

    const verifyUrl = `${config.apiUrl}/api/auth/verify-email?token=${token}`;
    const mail = await sendMail({
      to: data.email,
      subject: 'Verify your BrandShield.ai account',
      text: `Welcome to BrandShield.ai. Verify your email: ${verifyUrl}`,
      html: `<p>Welcome to <strong>BrandShield.ai</strong>.</p><p><a href="${verifyUrl}">Verify your email address</a></p>`,
    });

    const user = await one(
      `SELECT u.*, o.name AS organization_name FROM users u JOIN organizations o ON o.id=u.organization_id WHERE u.id=?`,
      [result.insertId]
    );
    await issueSession(res, user);
    await logAudit({
      organizationId: organization.id,
      userId: user.id,
      action: 'auth.signup',
      entityType: 'user',
      entityId: user.id,
      ip: req.ip,
    });
    res.status(201).json({
      user: publicUser(user),
      verificationEmail: {
        sent: Boolean(mail.sent),
        previewUrl: mail.previewUrl || null,
        configured: isEmailConfigured(),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const user = await one(
      `SELECT u.*, o.name AS organization_name FROM users u
         JOIN organizations o ON o.id=u.organization_id WHERE u.email = ?`,
      [email]
    );
    if (!user) throw unauthorized('Email or password is incorrect');
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw unauthorized('Email or password is incorrect');
    if (user.status !== 'active') throw unauthorized('This account has been deactivated');

    await execute('UPDATE users SET last_login_at = NOW() WHERE id = ?', [user.id]);
    await issueSession(res, user);
    await logAudit({
      organizationId: user.organization_id,
      userId: user.id,
      action: 'auth.login',
      entityType: 'user',
      entityId: user.id,
      ip: req.ip,
    });
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/refresh', async (req, res, next) => {
  try {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw unauthorized('No refresh token');
    const stored = await one(
      `SELECT * FROM refresh_tokens WHERE token = ? AND expires_at > NOW()`,
      [hashToken(token)]
    );
    if (!stored) throw unauthorized('Refresh token is invalid or expired');
    const user = await one(
      `SELECT u.*, o.name AS organization_name FROM users u
         JOIN organizations o ON o.id=u.organization_id WHERE u.id = ?`,
      [stored.user_id]
    );
    if (!user || user.status !== 'active') throw unauthorized('Account is not active');
    await execute('DELETE FROM refresh_tokens WHERE id = ?', [stored.id]);
    await issueSession(res, user);
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) {
    await execute('DELETE FROM refresh_tokens WHERE token = ?', [hashToken(token)]).catch(() => {});
  }
  res.clearCookie(ACCESS_COOKIE, { path: '/' });
  res.clearCookie(REFRESH_COOKIE, { path: '/' });
  res.clearCookie(CSRF_COOKIE, { path: '/' });
  res.json({ ok: true });
});

router.get('/me', authenticate, async (req, res) => {
  res.json({ user: publicUser({ ...req.user, organization_name: req.user.organization_name }) });
});

router.get('/verify-email', async (req, res, next) => {
  try {
    const { token } = req.query;
    if (!token) throw badRequest('Missing verification token');
    const row = await one(
      `SELECT * FROM email_tokens WHERE token = ? AND type='verification' AND expires_at > NOW()`,
      [hashToken(String(token))]
    );
    if (!row) throw badRequest('This verification link is invalid or has expired');
    await execute('UPDATE users SET email_verified_at = NOW() WHERE id = ?', [row.user_id]);
    await execute('DELETE FROM email_tokens WHERE id = ?', [row.id]);
    res.json({ ok: true, message: 'Email verified' });
  } catch (err) {
    next(err);
  }
});

router.post('/resend-verification', authenticate, async (req, res, next) => {
  try {
    const token = crypto.randomBytes(32).toString('hex');
    await execute(
      `INSERT INTO email_tokens (user_id, token, type, expires_at) VALUES (?,?,?,?)`,
      [req.user.id, hashToken(token), 'verification', new Date(Date.now() + 24 * 3600 * 1000)]
    );
    const url = `${config.apiUrl}/api/auth/verify-email?token=${token}`;
    const mail = await sendMail({
      to: req.user.email,
      subject: 'Verify your BrandShield.ai account',
      text: `Verify your email: ${url}`,
      html: `<p><a href="${url}">Verify your email</a></p>`,
    });
    res.json({ sent: Boolean(mail.sent), previewUrl: mail.previewUrl || null });
  } catch (err) {
    next(err);
  }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = z.object({ email: emailSchema }).parse(req.body);
    const user = await one('SELECT id, email FROM users WHERE email = ?', [email]);
    // Always answer the same way so the endpoint cannot be used to enumerate accounts.
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      await execute(
        `INSERT INTO email_tokens (user_id, token, type, expires_at) VALUES (?,?,?,?)`,
        [user.id, hashToken(token), 'reset', new Date(Date.now() + 3600 * 1000)]
      );
      const url = `${config.appUrl}/reset-password?token=${token}`;
      const mail = await sendMail({
        to: user.email,
        subject: 'Reset your BrandShield.ai password',
        text: `Reset your password (valid for 1 hour): ${url}`,
        html: `<p><a href="${url}">Reset your password</a> (valid for 1 hour).</p>`,
      });
      res.json({
        ok: true,
        message: 'If that email exists, a reset link is on its way.',
        previewUrl: mail.previewUrl || null,
      });
      return;
    }
    res.json({ ok: true, message: 'If that email exists, a reset link is on its way.' });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const { token, password } = z
      .object({ token: z.string().min(10), password: passwordSchema })
      .parse(req.body);
    const row = await one(
      `SELECT * FROM email_tokens WHERE token = ? AND type='reset' AND expires_at > NOW()`,
      [hashToken(token)]
    );
    if (!row) throw badRequest('This reset link is invalid or has expired');
    const hash = await bcrypt.hash(password, 11);
    await execute('UPDATE users SET password_hash = ? WHERE id = ?', [hash, row.user_id]);
    await execute('DELETE FROM email_tokens WHERE user_id = ?', [row.user_id]);
    await execute('DELETE FROM refresh_tokens WHERE user_id = ?', [row.user_id]);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/team', authenticate, async (req, res) => {
  const users = await query(
    `SELECT id, name, email, role, email_verified_at, status, created_at, last_login_at
       FROM users WHERE organization_id = ? ORDER BY created_at ASC`,
    [req.organizationId]
  );
  res.json({ users });
});

router.patch('/team/:id', authenticate, async (req, res, next) => {
  try {
    if (!['admin', 'manager'].includes(req.user.role)) {
      return next(unauthorized('Only admins and managers can change roles'));
    }
    const { role } = z
      .object({ role: z.enum(['admin', 'manager', 'reviewer', 'creator', 'agency']) })
      .parse(req.body);
    const target = await one('SELECT id FROM users WHERE id=? AND organization_id=?', [
      req.params.id,
      req.organizationId,
    ]);
    if (!target) throw notFound('Team member not found');
    await execute('UPDATE users SET role=? WHERE id=?', [role, target.id]);
    await execute('UPDATE memberships SET role=? WHERE user_id=? AND organization_id=?', [
      role,
      target.id,
      req.organizationId,
    ]);
    await logAudit({
      organizationId: req.organizationId,
      userId: req.user.id,
      action: 'team.role_changed',
      entityType: 'user',
      entityId: target.id,
      details: { role },
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Used by the SPA to confirm its session after a refresh.
router.get('/session', (req, res) => {
  const token = req.cookies?.[ACCESS_COOKIE];
  if (!token) return res.json({ authenticated: false });
  try {
    verifyAccessToken(token);
    return res.json({ authenticated: true });
  } catch {
    return res.json({ authenticated: false });
  }
});

export default router;
