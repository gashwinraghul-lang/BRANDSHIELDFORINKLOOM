// server/src/routes/evaluation.js
import express from 'express';
import { query } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { ah } from '../lib/http.js';

const router = express.Router();

function parseDetails(row) {
  if (!row) return null;
  let details = row.details;
  if (typeof details === 'string') {
    try {
      details = JSON.parse(details);
    } catch {
      details = null;
    }
  }
  return { ...row, details };
}

router.get(
  '/evaluation/latest',
  authenticate,
  ah(async (req, res) => {
    const rows = await query(
      `SELECT e.* FROM eval_runs e
         JOIN (SELECT kind, MAX(created_at) AS latest FROM eval_runs GROUP BY kind) x
           ON x.kind=e.kind AND x.latest=e.created_at
        ORDER BY e.kind ASC`
    );
    const byKind = {};
    for (const row of rows) byKind[row.kind] = parseDetails(row);
    res.json({
      latest: byKind,
      note: 'Run npm run eval:claims and npm run eval:images to refresh these numbers. Failures are reported honestly, never hidden.',
    });
  })
);

router.get(
  '/evaluation/runs',
  authenticate,
  ah(async (req, res) => {
    const kind = req.query.kind;
    const params = [];
    let sql = 'SELECT * FROM eval_runs';
    if (kind) {
      sql += ' WHERE kind=?';
      params.push(kind);
    }
    sql += ' ORDER BY created_at DESC LIMIT 50';
    const rows = await query(sql, params);
    res.json({ runs: rows.map(parseDetails) });
  })
);

export default router;
