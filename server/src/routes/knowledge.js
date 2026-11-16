// server/src/routes/knowledge.js
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { query, one, execute } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { ah } from '../lib/http.js';
import { badRequest, notFound } from '../lib/errors.js';
import { logAudit } from '../lib/observability.js';
import { uploadAsset, uploadImport, removeFile } from '../lib/upload.js';
import { extractText } from '../services/extract.js';
import { analyseGuidelineClarity } from '../services/clarity.js';

const router = express.Router();

const confidentiality = z.enum(['public', 'internal', 'restricted']).default('internal');
const severity = z.enum(['info', 'suggestion', 'warning', 'error']).default('warning');

const guidelineSchema = z.object({
  title: z.string().trim().min(3).max(255),
  category: z.string().trim().max(80).default('general'),
  description: z.string().trim().max(2000).optional().default(''),
  content: z.string().trim().min(10, 'Guideline content is too short').max(200000),
  confidentiality,
});

const termSchema = z.object({
  term: z.string().trim().min(1).max(180),
  preferredTerm: z.string().trim().max(180).optional().nullable(),
  definition: z.string().trim().max(2000).optional().nullable(),
  category: z.string().trim().max(80).default('general'),
  severity,
});

const factSchema = z.object({
  statement: z.string().trim().min(5).max(2000),
  source: z.string().trim().max(500).optional().nullable(),
  owner: z.string().trim().max(200).optional().nullable(),
  expiresAt: z.string().trim().optional().nullable(),
  confidentiality,
  tags: z.union([z.string(), z.array(z.string())]).optional().nullable(),
});

const assetSchema = z.object({
  name: z.string().trim().min(2).max(200),
  type: z.enum(['logo', 'palette', 'font', 'image']),
  hexValues: z.string().trim().max(500).optional().nullable(),
  fontFamily: z.string().trim().max(200).optional().nullable(),
  confidentiality,
});

function normaliseTags(tags) {
  if (!tags) return null;
  if (Array.isArray(tags)) return tags.map((t) => t.trim()).filter(Boolean).join(',');
  return String(tags)
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .join(',');
}

async function createGuideline({ organizationId, userId, data, changeNote = 'Initial version' }) {
  const result = await execute(
    `INSERT INTO guidelines (organization_id, title, version, content, confidentiality, description, category, created_by)
     VALUES (?,?,?,?,?,?,?,?)`,
    [
      organizationId,
      data.title,
      1,
      data.content,
      data.confidentiality,
      data.description || null,
      data.category || 'general',
      userId,
    ]
  );
  await execute(
    `INSERT INTO guideline_versions (guideline_id, version, title, content, change_note, created_by)
     VALUES (?,?,?,?,?,?)`,
    [result.insertId, 1, data.title, data.content, changeNote, userId]
  );
  await logAudit({
    organizationId,
    userId,
    action: 'guideline.created',
    entityType: 'guideline',
    entityId: result.insertId,
    details: { title: data.title },
  });
  return result.insertId;
}

// ---------------------------------------------------------------------------
// Guidelines
// ---------------------------------------------------------------------------
router.get(
  '/guidelines',
  authenticate,
  ah(async (req, res) => {
    const { status, q, category } = req.query;
    const params = [req.organizationId];
    let sql = `SELECT g.*, u.name AS created_by_name,
                 (SELECT COUNT(*) FROM guideline_versions gv WHERE gv.guideline_id = g.id) AS version_count,
                 (SELECT COUNT(*) FROM findings f WHERE f.guideline_id = g.id) AS trigger_count
                 FROM guidelines g LEFT JOIN users u ON u.id = g.created_by
                WHERE g.organization_id = ?`;
    if (status) {
      sql += ' AND g.status = ?';
      params.push(status);
    }
    if (category) {
      sql += ' AND g.category = ?';
      params.push(category);
    }
    if (q) {
      sql += ' AND (g.title LIKE ? OR g.content LIKE ?)';
      params.push(`%${q}%`, `%${q}%`);
    }
    sql += ' ORDER BY g.updated_at DESC';
    const rows = await query(sql, params);
    res.json({ guidelines: rows });
  })
);

router.get(
  '/guidelines/:id',
  authenticate,
  ah(async (req, res) => {
    const guideline = await one(
      `SELECT g.*, u.name AS created_by_name FROM guidelines g
         LEFT JOIN users u ON u.id=g.created_by
        WHERE g.id=? AND g.organization_id=?`,
      [req.params.id, req.organizationId]
    );
    if (!guideline) throw notFound('Guideline not found');
    const versions = await query(
      `SELECT gv.*, u.name AS created_by_name FROM guideline_versions gv
         LEFT JOIN users u ON u.id=gv.created_by
        WHERE gv.guideline_id=? ORDER BY gv.version DESC`,
      [guideline.id]
    );
    const drafts = await query(
      'SELECT * FROM guideline_drafts WHERE guideline_id=? ORDER BY created_at DESC',
      [guideline.id]
    );
    res.json({ guideline, versions, drafts });
  })
);

router.post(
  '/guidelines',
  authenticate,
  authorize('admin', 'manager'),
  ah(async (req, res) => {
    const data = guidelineSchema.parse(req.body);
    const id = await createGuideline({
      organizationId: req.organizationId,
      userId: req.user.id,
      data,
    });
    const guideline = await one('SELECT * FROM guidelines WHERE id=?', [id]);
    res.status(201).json({ guideline });
  })
);

router.patch(
  '/guidelines/:id',
  authenticate,
  authorize('admin', 'manager'),
  ah(async (req, res) => {
    const existing = await one('SELECT * FROM guidelines WHERE id=? AND organization_id=?', [
      req.params.id,
      req.organizationId,
    ]);
    if (!existing) throw notFound('Guideline not found');
    const data = guidelineSchema.partial().parse(req.body);
    const nextVersion = existing.version + 1;
    const content = data.content ?? existing.content;
    const title = data.title ?? existing.title;
    await execute(
      `UPDATE guidelines SET title=?, category=?, description=?, content=?, confidentiality=?, version=?, updated_at=NOW()
        WHERE id=? AND organization_id=?`,
      [
        title,
        data.category ?? existing.category,
        data.description ?? existing.description,
        content,
        data.confidentiality ?? existing.confidentiality,
        nextVersion,
        existing.id,
        req.organizationId,
      ]
    );
    await execute(
      `INSERT INTO guideline_versions (guideline_id, version, title, content, change_note, created_by)
       VALUES (?,?,?,?,?,?)`,
      [existing.id, nextVersion, title, content, req.body.changeNote || 'Updated guideline', req.user.id]
    );
    await logAudit({
      organizationId: req.organizationId,
      userId: req.user.id,
      action: 'guideline.version.created',
      entityType: 'guideline',
      entityId: existing.id,
      details: { version: nextVersion },
    });
    const guideline = await one('SELECT * FROM guidelines WHERE id=?', [existing.id]);
    res.json({ guideline });
  })
);

router.delete(
  '/guidelines/:id',
  authenticate,
  authorize('admin'),
  ah(async (req, res) => {
    const existing = await one('SELECT * FROM guidelines WHERE id=? AND organization_id=?', [
      req.params.id,
      req.organizationId,
    ]);
    if (!existing) throw notFound('Guideline not found');
    await execute("UPDATE guidelines SET status='archived' WHERE id=?", [existing.id]);
    await logAudit({
      organizationId: req.organizationId,
      userId: req.user.id,
      action: 'guideline.archived',
      entityType: 'guideline',
      entityId: existing.id,
    });
    res.json({ ok: true });
  })
);

router.post(
  '/guidelines/import',
  authenticate,
  authorize('admin', 'manager'),
  uploadImport.single('file'),
  ah(async (req, res) => {
    if (!req.file) throw badRequest('Choose a .txt, .md, .docx or .pdf file to import');
    try {
      const text = await extractText(req.file.path, req.file.originalname, req.file.mimetype);
      if (!text.trim()) throw badRequest('No readable text found in that file');
      const title = (req.body.title || path.parse(req.file.originalname).name).slice(0, 255);
      const id = await createGuideline({
        organizationId: req.organizationId,
        userId: req.user.id,
        data: {
          title,
          content: text.slice(0, 200000),
          category: req.body.category || 'general',
          description: req.body.description || `Imported from ${req.file.originalname}`,
          confidentiality: req.body.confidentiality || 'internal',
        },
        changeNote: `Imported from ${req.file.originalname}`,
      });
      res.status(201).json({ guideline: await one('SELECT * FROM guidelines WHERE id=?', [id]) });
    } finally {
      removeFile(req.file.path);
    }
  })
);

// ---------------------------------------------------------------------------
// Terminology
// ---------------------------------------------------------------------------
router.get(
  '/terminology',
  authenticate,
  ah(async (req, res) => {
    const terms = await query(
      `SELECT t.*, u.name AS created_by_name FROM terminology_terms t
         LEFT JOIN users u ON u.id=t.created_by
        WHERE t.organization_id=? ORDER BY t.term ASC`,
      [req.organizationId]
    );
    res.json({ terms });
  })
);

router.post(
  '/terminology',
  authenticate,
  authorize('admin', 'manager', 'reviewer'),
  ah(async (req, res) => {
    const data = termSchema.parse(req.body);
    const result = await execute(
      `INSERT INTO terminology_terms (organization_id, term, preferred_term, definition, category, severity, created_by)
       VALUES (?,?,?,?,?,?,?)`,
      [
        req.organizationId,
        data.term,
        data.preferredTerm || null,
        data.definition || null,
        data.category,
        data.severity,
        req.user.id,
      ]
    );
    await logAudit({
      organizationId: req.organizationId,
      userId: req.user.id,
      action: 'terminology.created',
      entityType: 'terminology_term',
      entityId: result.insertId,
      details: { term: data.term, preferredTerm: data.preferredTerm },
    });
    res.status(201).json({ term: await one('SELECT * FROM terminology_terms WHERE id=?', [result.insertId]) });
  })
);

router.patch(
  '/terminology/:id',
  authenticate,
  authorize('admin', 'manager', 'reviewer'),
  ah(async (req, res) => {
    const existing = await one('SELECT * FROM terminology_terms WHERE id=? AND organization_id=?', [
      req.params.id,
      req.organizationId,
    ]);
    if (!existing) throw notFound('Term not found');
    const data = termSchema.partial().parse(req.body);
    await execute(
      `UPDATE terminology_terms SET term=?, preferred_term=?, definition=?, category=?, severity=? WHERE id=?`,
      [
        data.term ?? existing.term,
        data.preferredTerm ?? existing.preferred_term,
        data.definition ?? existing.definition,
        data.category ?? existing.category,
        data.severity ?? existing.severity,
        existing.id,
      ]
    );
    res.json({ term: await one('SELECT * FROM terminology_terms WHERE id=?', [existing.id]) });
  })
);

router.delete(
  '/terminology/:id',
  authenticate,
  authorize('admin', 'manager'),
  ah(async (req, res) => {
    const result = await execute('DELETE FROM terminology_terms WHERE id=? AND organization_id=?', [
      req.params.id,
      req.organizationId,
    ]);
    if (!result.affectedRows) throw notFound('Term not found');
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Approved facts
// ---------------------------------------------------------------------------
router.get(
  '/facts',
  authenticate,
  ah(async (req, res) => {
    const facts = await query(
      `SELECT f.*, u.name AS created_by_name FROM approved_facts f
         LEFT JOIN users u ON u.id=f.created_by
        WHERE f.organization_id=? ORDER BY f.created_at DESC`,
      [req.organizationId]
    );
    res.json({ facts });
  })
);

router.post(
  '/facts',
  authenticate,
  authorize('admin', 'manager', 'reviewer'),
  ah(async (req, res) => {
    const data = factSchema.parse(req.body);
    const result = await execute(
      `INSERT INTO approved_facts (organization_id, statement, source, owner, expires_at, confidentiality, tags, created_by)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        req.organizationId,
        data.statement,
        data.source || null,
        data.owner || null,
        data.expiresAt || null,
        data.confidentiality,
        normaliseTags(data.tags),
        req.user.id,
      ]
    );
    await logAudit({
      organizationId: req.organizationId,
      userId: req.user.id,
      action: 'fact.created',
      entityType: 'approved_fact',
      entityId: result.insertId,
      details: { statement: data.statement },
    });
    res.status(201).json({ fact: await one('SELECT * FROM approved_facts WHERE id=?', [result.insertId]) });
  })
);

router.patch(
  '/facts/:id',
  authenticate,
  authorize('admin', 'manager', 'reviewer'),
  ah(async (req, res) => {
    const existing = await one('SELECT * FROM approved_facts WHERE id=? AND organization_id=?', [
      req.params.id,
      req.organizationId,
    ]);
    if (!existing) throw notFound('Fact not found');
    const data = factSchema.partial().parse(req.body);
    await execute(
      `UPDATE approved_facts SET statement=?, source=?, owner=?, expires_at=?, confidentiality=?, tags=? WHERE id=?`,
      [
        data.statement ?? existing.statement,
        data.source ?? existing.source,
        data.owner ?? existing.owner,
        data.expiresAt ?? existing.expires_at,
        data.confidentiality ?? existing.confidentiality,
        data.tags !== undefined ? normaliseTags(data.tags) : existing.tags,
        existing.id,
      ]
    );
    res.json({ fact: await one('SELECT * FROM approved_facts WHERE id=?', [existing.id]) });
  })
);

router.delete(
  '/facts/:id',
  authenticate,
  authorize('admin', 'manager'),
  ah(async (req, res) => {
    const result = await execute('DELETE FROM approved_facts WHERE id=? AND organization_id=?', [
      req.params.id,
      req.organizationId,
    ]);
    if (!result.affectedRows) throw notFound('Fact not found');
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Brand assets
// ---------------------------------------------------------------------------
router.get(
  '/assets',
  authenticate,
  ah(async (req, res) => {
    const assets = await query(
      `SELECT a.*, u.name AS created_by_name FROM brand_assets a
         LEFT JOIN users u ON u.id=a.created_by
        WHERE a.organization_id=? ORDER BY a.created_at DESC`,
      [req.organizationId]
    );
    res.json({
      assets: assets.map((a) => ({ ...a, file_url: a.file_path ? `/api/assets/${a.id}/file` : null })),
    });
  })
);

router.get(
  '/assets/:id/file',
  authenticate,
  ah(async (req, res) => {
    const asset = await one('SELECT * FROM brand_assets WHERE id=? AND organization_id=?', [
      req.params.id,
      req.organizationId,
    ]);
    if (!asset?.file_path || !fs.existsSync(asset.file_path)) throw notFound('Asset file not found');
    res.type(asset.mime_type || 'application/octet-stream');
    res.sendFile(path.resolve(asset.file_path));
  })
);

router.post(
  '/assets',
  authenticate,
  authorize('admin', 'manager', 'reviewer'),
  uploadAsset.single('file'),
  ah(async (req, res) => {
    try {
      const data = assetSchema.parse(req.body);
      if (['logo', 'image'].includes(data.type) && !req.file) {
        throw badRequest('Upload an image file for logo or image assets');
      }
      if (data.type === 'palette' && !data.hexValues) {
        throw badRequest('Add at least one hex colour for a palette asset');
      }
      const result = await execute(
        `INSERT INTO brand_assets (organization_id, name, type, file_path, mime_type, hex_values, font_family, confidentiality, metadata, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
        [
          req.organizationId,
          data.name,
          data.type,
          req.file?.path || null,
          req.file?.mimetype || null,
          data.hexValues || null,
          data.fontFamily || null,
          data.confidentiality,
          req.file ? JSON.stringify({ originalName: req.file.originalname, size: req.file.size }) : null,
          req.user.id,
        ]
      );
      await logAudit({
        organizationId: req.organizationId,
        userId: req.user.id,
        action: 'asset.created',
        entityType: 'brand_asset',
        entityId: result.insertId,
        details: { name: data.name, type: data.type },
      });
      const asset = await one('SELECT * FROM brand_assets WHERE id=?', [result.insertId]);
      res.status(201).json({
        asset: { ...asset, file_url: asset.file_path ? `/api/assets/${asset.id}/file` : null },
      });
    } catch (err) {
      if (req.file) removeFile(req.file.path);
      throw err;
    }
  })
);

router.delete(
  '/assets/:id',
  authenticate,
  authorize('admin', 'manager'),
  ah(async (req, res) => {
    const asset = await one('SELECT * FROM brand_assets WHERE id=? AND organization_id=?', [
      req.params.id,
      req.organizationId,
    ]);
    if (!asset) throw notFound('Asset not found');
    await execute('DELETE FROM brand_assets WHERE id=?', [asset.id]);
    if (asset.file_path) removeFile(asset.file_path);
    res.json({ ok: true });
  })
);

// CSV import for terminology and facts.
router.post(
  '/knowledge/import-csv',
  authenticate,
  authorize('admin', 'manager'),
  uploadImport.single('file'),
  ah(async (req, res) => {
    try {
      const type = req.body.type;
      if (!['terms', 'facts'].includes(type)) throw badRequest('type must be terms or facts');
      if (!req.file) throw badRequest('Upload a CSV file');
      const raw = fs.readFileSync(req.file.path, 'utf8');
      const lines = raw.split(/\r?\n/).filter((l) => l.trim());
      if (!lines.length) throw badRequest('The CSV file is empty');
      const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const hasHeader = header.some((h) => ['term', 'statement', 'preferred', 'source'].includes(h));
      const rows = hasHeader ? lines.slice(1) : lines;
      let created = 0;
      for (const line of rows) {
        const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').trim());
        if (!cells) continue;
        if (type === 'terms' && cells[0]) {
          await execute(
            `INSERT INTO terminology_terms (organization_id, term, preferred_term, definition, category, severity, created_by)
             VALUES (?,?,?,?,?,?,?)`,
            [req.organizationId, cells[0], cells[1] || null, cells[2] || null, cells[3] || 'general', 'warning', req.user.id]
          );
          created += 1;
        }
        if (type === 'facts' && cells[0]) {
          await execute(
            `INSERT INTO approved_facts (organization_id, statement, source, owner, expires_at, confidentiality, tags, created_by)
             VALUES (?,?,?,?,?,?,?,?)`,
            [
              req.organizationId,
              cells[0],
              cells[1] || null,
              cells[2] || null,
              cells[3] || null,
              ['public', 'internal', 'restricted'].includes(cells[4]) ? cells[4] : 'internal',
              cells[5] || null,
              req.user.id,
            ]
          );
          created += 1;
        }
      }
      await logAudit({
        organizationId: req.organizationId,
        userId: req.user.id,
        action: `knowledge.${type}.imported`,
        entityType: type === 'terms' ? 'terminology_term' : 'approved_fact',
        details: { created, filename: req.file.originalname },
      });
      res.status(201).json({ created });
    } finally {
      if (req.file) removeFile(req.file.path);
    }
  })
);

router.get(
  '/knowledge/summary',
  authenticate,
  ah(async (req, res) => {
    const [guidelines, terms, facts, assets, restricted] = await Promise.all([
      one("SELECT COUNT(*) AS n FROM guidelines WHERE organization_id=? AND status='active'", [req.organizationId]),
      one('SELECT COUNT(*) AS n FROM terminology_terms WHERE organization_id=?', [req.organizationId]),
      one('SELECT COUNT(*) AS n FROM approved_facts WHERE organization_id=?', [req.organizationId]),
      one('SELECT COUNT(*) AS n FROM brand_assets WHERE organization_id=?', [req.organizationId]),
      one(
        "SELECT COUNT(*) AS n FROM approved_facts WHERE organization_id=? AND confidentiality='restricted'",
        [req.organizationId]
      ),
    ]);
    res.json({
      guidelines: guidelines.n,
      terms: terms.n,
      facts: facts.n,
      assets: assets.n,
      restrictedFacts: restricted.n,
    });
  })
);

router.get(
  '/guidelines/:id/clarity',
  authenticate,
  ah(async (req, res) => {
    const result = await analyseGuidelineClarity(req.organizationId, Number(req.params.id));
    if (!result) throw notFound('Guideline not found');
    res.json(result);
  })
);

export default router;
