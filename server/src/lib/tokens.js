// server/src/lib/tokens.js
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import config from '../config.js';

export const ACCESS_COOKIE = 'bs_access';
export const REFRESH_COOKIE = 'bs_refresh';
export const CSRF_COOKIE = 'bs_csrf';

export function signAccessToken(user) {
  return jwt.sign(
    {
      sub: String(user.id),
      role: user.role,
      org: String(user.organization_id),
      email: user.email,
      name: user.name || user.email,
    },
    config.jwtSecret,
    { expiresIn: config.accessExpires }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwtSecret);
}

export function newRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function newCsrfToken() {
  return crypto.randomBytes(24).toString('hex');
}

export function cookieOptions(maxAgeMs) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    maxAge: maxAgeMs,
    path: '/',
  };
}
