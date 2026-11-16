// server/src/routes/audit.js
import express from 'express';
import { query } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { ah } from '../lib/http.js';

const router = express.Router();

function filters(req) {
  const params = [req.organizationId];
  let where = 'WHERE a.organization_id=?';
  if (req.query.action) {
    where += ' AND a.action LIKE ?';
    params.push(`%${req.query.action}%`);
  }
  if (req.query.userId) {
    where += ' AND a.user_id=?';
    params.push(req.query.userId);
  }
  if (req.query.from) {
    where += ' AND a.created_at >= ?';
    params.push(req.query.from);
  }
  if (req.query.to) {
    where += ' AND a.created_at <= ?';
    params.push(req.query.to);
  }
  if (req.query.entityType) {
    where += ' AND a.entity_type=?';
    params.push(req.query.entityType);
  }
  return { where, params };
}

router.get(
  '/audit',
  authenticate,
  authorize('admin', 'manager'),
  ah(async (req, res) => {
    const { where, params } = filters(req);
    const limit = Math.min(Number(req.query.limit || 100), 500);
    const rows = await query(
      `SELECT a.*, u.name AS user_name, u.email AS user_email
         FROM audit_log a LEFT JOIN users u ON u.id=a.user_id
         ${where} ORDER BY a.created_at DESC LIMIT ${limit}`,
      params
    );
    res.json({
      entries: rows.map((r) => ({
        ...r,
        details: r.details ? safeParse(r.details) : null,
      })),
    });
  })
);

router.get(
  '/audit/export.csv',
  authenticate,
  authorize('admin', 'manager'),
  ah(async (req, res) => {
    const { where, params } = filters(req);
    const rows = await query(
      `SELECT a.id, a.created_at, a.action, a.entity_type, a.entity_id, a.details,
              u.name AS user_name, u.email AS user_email
         FROM audit_log a LEFT JOIN users u ON u.id=a.user_id
         ${where} ORDER BY a.created_at DESC LIMIT 5000`,
      params
    );
    const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['id', 'created_at', 'action', 'entity_type', 'entity_id', 'user', 'email', 'details'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.id,
          r.created_at?.toISOString?.() || r.created_at,
          r.action,
          r.entity_type,
          r.entity_id,
          r.user_name,
          r.user_email,
          r.details,
        ]
          .map(escape)
          .join(',')
      );
    }
    res.type('text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="brandshield-audit.csv"');
    res.send(lines.join('\n'));
  })
);

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export default router;
