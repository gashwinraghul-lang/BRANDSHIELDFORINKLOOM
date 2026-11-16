// server/src/middleware/auth.js
import { execute, one } from '../db.js';
import { verifyAccessToken, ACCESS_COOKIE } from '../lib/tokens.js';
import { unauthorized, forbidden } from '../lib/errors.js';

export async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
    const token = bearer || req.cookies?.[ACCESS_COOKIE];
    if (!token) throw unauthorized('Please sign in to continue');

    let payload;
    try {
      payload = verifyAccessToken(token);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        throw unauthorized('Your session expired', 'TOKEN_EXPIRED');
      }
      throw unauthorized('Invalid session');
    }

    const user = await one(
      `SELECT u.id, u.email, u.name, u.role, u.organization_id, u.email_verified_at, u.status,
              o.name AS organization_name
         FROM users u JOIN organizations o ON o.id = u.organization_id
        WHERE u.id = ?`,
      [payload.sub]
    );
    if (!user || user.status !== 'active') throw unauthorized('Account is not active');
    req.user = user;
    req.organizationId = user.organization_id;
    return next();
  } catch (err) {
    return next(err);
  }
}

export function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) return next(unauthorized());
    if (roles.length && !roles.includes(req.user.role)) {
      return next(forbidden(`This action requires one of: ${roles.join(', ')}`));
    }
    return next();
  };
}

export async function auditTouch(req, action, entityType, entityId, details = null) {
  try {
    await execute(
      `INSERT INTO audit_log (organization_id, user_id, action, entity_type, entity_id, details)
       VALUES (?,?,?,?,?,?)`,
      [req.organizationId, req.user?.id ?? null, action, entityType, entityId, details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error('audit write failed', err.message);
  }
}
