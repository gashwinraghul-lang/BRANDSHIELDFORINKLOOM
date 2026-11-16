// server/src/routes/submissions.js
import express from 'express';
import path from 'node:path';
import { z } from 'zod';
import { query, one, execute } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { ah } from '../lib/http.js';
import { badRequest, notFound, forbidden, conflict } from '../lib/errors.js';
import { logAudit } from '../lib/observability.js';
import { uploadSubmission, removeFile } from '../lib/upload.js';
import { extractText, isImage } from '../services/extract.js';
import { runReview } from '../services/orchestrator.js';
import { rewriteContent } from '../services/rewrite.js';

const router = express.Router();

const submissionSchema = z.object({
  title: z.string().trim().min(3, 'Give this a title').max(255),
  content: z.string().max(500000).default(''),
  contentType: z.enum(['text', 'document', 'image']).default('text'),
  confidentiality: z.enum(['public', 'internal', 'restricted']).default('internal'),
  purpose: z.string().trim().max(500).optional().nullable(),
  assignedTo: z.coerce.number().int().positive().optional().nullable(),
});

const decisionSchema = z.object({
  status: z.enum(['accepted', 'rejected', 'overridden', 'open']),
  reason: z.string().trim().max(1000).optional().nullable(),
  editedFix: z.string().trim().max(4000).optional().nullable(),
});

function parseFinding(row) {
  return {
    ...row,
    location: row.location ? safeJson(row.location) : null,
    evidence: row.evidence ? safeJson(row.evidence) : null,
    region: row.region ? safeJson(row.region) : null,
  };
}

function safeJson(value) {
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

async function getSubmission(id, organizationId) {
  const submission = await one(
    `SELECT s.*, u.name AS creator_name, u.email AS creator_email, u.role AS creator_role,
            a.name AS assignee_name
       FROM submissions s
       JOIN users u ON u.id=s.user_id
       LEFT JOIN users a ON a.id=s.assigned_to
      WHERE s.id=? AND s.organization_id=?`,
    [id, organizationId]
  );
  if (!submission) throw notFound('Submission not found');
  return submission;
}

async function createSubmission({ req, data, file, contentType }) {
  const result = await execute(
    `INSERT INTO submissions
       (organization_id, user_id, title, status, content, content_type, source_file, confidentiality,
        assigned_to, current_revision, processing_status, submitted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      req.organizationId,
      req.user.id,
      data.title,
      'draft',
      data.content || '',
      contentType,
      file?.path || null,
      data.confidentiality || 'internal',
      data.assignedTo || null,
      1,
      'queued',
      null,
    ]
  );
  await execute(
    `INSERT INTO submission_revisions (submission_id, version, content, content_type, file_path, note, created_by)
     VALUES (?,?,?,?,?,?,?)`,
    [result.insertId, 1, data.content || '', contentType, file?.path || null, 'Initial version', req.user.id]
  );
  await logAudit({
    organizationId: req.organizationId,
    userId: req.user.id,
    action: 'submission.created',
    entityType: 'submission',
    entityId: result.insertId,
    details: { title: data.title, contentType },
  });
  return result.insertId;
}

function kickOffReview(submissionId, organizationId, actorId) {
  // Fire and forget so uploads stay snappy; the client polls processing_status.
  runReview(submissionId, { organizationId, actorId }).catch((err) => {
    console.error('review failed', submissionId, err.message);
  });
}

function canSeeSubmission(user, submission) {
  return user.organization_id === submission.organization_id;
}

// ---------------------------------------------------------------------------
// List / read
// ---------------------------------------------------------------------------
router.get(
  '/submissions',
  authenticate,
  ah(async (req, res) => {
    const { status, mine, assigned, q, category } = req.query;
    const params = [req.organizationId];
    let sql = `SELECT s.id, s.title, s.status, s.content_type, s.confidentiality, s.processing_status,
                      s.engine, s.created_at, s.updated_at, s.submitted_at, s.decided_at,
                      u.name AS creator_name, u.role AS creator_role,
                      a.name AS assignee_name,
                      (SELECT COUNT(*) FROM findings f WHERE f.submission_id=s.id) AS findings_count,
                      (SELECT COUNT(*) FROM findings f WHERE f.submission_id=s.id AND f.severity IN ('error','warning')) AS issue_count
                 FROM submissions s
                 JOIN users u ON u.id=s.user_id
                 LEFT JOIN users a ON a.id=s.assigned_to
                WHERE s.organization_id=?`;
    if (status) {
      sql += ' AND s.status=?';
      params.push(status);
    }
    if (mine === 'true') {
      sql += ' AND s.user_id=?';
      params.push(req.user.id);
    }
    if (assigned === 'true') {
      sql += ' AND s.assigned_to=?';
      params.push(req.user.id);
    }
    if (category) {
      sql += ` AND EXISTS (SELECT 1 FROM findings f WHERE f.submission_id=s.id AND f.category=?)`;
      params.push(category);
    }
    if (q) {
      sql += ' AND s.title LIKE ?';
      params.push(`%${q}%`);
    }
    sql += ' ORDER BY s.updated_at DESC LIMIT 200';
    const submissions = await query(sql, params);
    res.json({ submissions });
  })
);

router.get(
  '/submissions/:id',
  authenticate,
  ah(async (req, res) => {
    const submission = await getSubmission(req.params.id, req.organizationId);
    if (!canSeeSubmission(req.user, submission)) throw forbidden();
    const findings = (await query(
      'SELECT * FROM findings WHERE submission_id=? ORDER BY FIELD(severity, "error","warning","suggestion","info"), id ASC',
      [submission.id]
    )).map(parseFinding);
    const [revisions, comments, approvals, claims] = await Promise.all([
      query(
        `SELECT r.*, u.name AS author_name FROM submission_revisions r
           LEFT JOIN users u ON u.id=r.created_by
          WHERE r.submission_id=? ORDER BY r.version DESC`,
        [submission.id]
      ),
      query(
        `SELECT c.*, u.name AS author_name, u.email AS author_email, u.role AS author_role
           FROM comments c LEFT JOIN users u ON u.id=c.user_id
          WHERE c.submission_id=? ORDER BY c.created_at ASC`,
        [submission.id]
      ),
      query(
        `SELECT ap.*, u.name AS reviewer_name FROM approvals ap
           JOIN users u ON u.id=ap.reviewer_id
          WHERE ap.submission_id=? ORDER BY ap.created_at DESC`,
        [submission.id]
      ),
      query(
        `SELECT cv.*, f.status AS finding_status, f.severity AS finding_severity
           FROM claim_verdicts cv LEFT JOIN findings f ON f.id=cv.finding_id
          WHERE cv.submission_id=? ORDER BY cv.id ASC`,
        [submission.id]
      ),
    ]);
    res.json({
      submission: { ...submission, file_url: submission.source_file ? `/api/submissions/${submission.id}/file` : null },
      findings,
      revisions,
      comments,
      approvals,
      claims,
      counts: {
        total: findings.length,
        errors: findings.filter((f) => f.severity === 'error').length,
        warnings: findings.filter((f) => f.severity === 'warning').length,
        suggestions: findings.filter((f) => f.severity === 'suggestion').length,
        info: findings.filter((f) => f.severity === 'info').length,
        open: findings.filter((f) => f.status === 'open').length,
      },
    });
  })
);

router.get(
  '/submissions/:id/file',
  authenticate,
  ah(async (req, res) => {
    const submission = await getSubmission(req.params.id, req.organizationId);
    if (!submission.source_file) throw notFound('This submission has no attachment');
    res.sendFile(path.resolve(submission.source_file));
  })
);

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------
router.post(
  '/submissions',
  authenticate,
  ah(async (req, res) => {
    const data = submissionSchema.parse(req.body);
    if (!data.content?.trim()) throw badRequest('Paste the content you want reviewed');
    const id = await createSubmission({ req, data, contentType: 'text' });
    kickOffReview(id, req.organizationId, req.user.id);
    const submission = await getSubmission(id, req.organizationId);
    res.status(202).json({ submission, message: 'Review started' });
  })
);

router.post(
  '/submissions/upload',
  authenticate,
  uploadSubmission.single('file'),
  ah(async (req, res) => {
    if (!req.file) throw badRequest('Choose a file to review');
    const title = (req.body.title || path.parse(req.file.originalname).name).slice(0, 255);
    const image = isImage(req.file.mimetype, req.file.originalname);
    let content = '';
    let contentType = 'document';
    try {
      if (image) {
        contentType = 'image';
      } else {
        content = await extractText(req.file.path, req.file.originalname, req.file.mimetype);
        if (!content.trim()) throw badRequest('No readable text found in that file');
      }
      const data = submissionSchema.parse({
        title,
        content: content.slice(0, 500000),
        contentType,
        confidentiality: req.body.confidentiality || 'internal',
        purpose: req.body.purpose || null,
      });
      const id = await createSubmission({ req, data, file: req.file, contentType });
      kickOffReview(id, req.organizationId, req.user.id);
      const submission = await getSubmission(id, req.organizationId);
      res.status(202).json({ submission, message: 'Review started' });
    } catch (err) {
      removeFile(req.file.path);
      throw err;
    }
  })
);

router.patch(
  '/submissions/:id',
  authenticate,
  ah(async (req, res) => {
    const submission = await getSubmission(req.params.id, req.organizationId);
    const isOwner = submission.user_id === req.user.id;
    const canManage = ['admin', 'manager', 'reviewer'].includes(req.user.role);
    if (!isOwner && !canManage) throw forbidden();

    const data = z
      .object({
        title: z.string().trim().min(3).max(255).optional(),
        content: z.string().max(500000).optional(),
        confidentiality: z.enum(['public', 'internal', 'restricted']).optional(),
        assignedTo: z.coerce.number().int().positive().nullable().optional(),
        purpose: z.string().trim().max(500).nullable().optional(),
        note: z.string().trim().max(500).optional(),
      })
      .parse(req.body);

    const contentChanged = typeof data.content === 'string' && data.content !== submission.content;
    let nextRevision = submission.current_revision;
    if (contentChanged) {
      nextRevision += 1;
      await execute(
        `INSERT INTO submission_revisions (submission_id, version, content, content_type, file_path, note, created_by)
         VALUES (?,?,?,?,?,?,?)`,
        [
          submission.id,
          nextRevision,
          data.content,
          submission.content_type,
          submission.source_file,
          data.note || 'Content revised',
          req.user.id,
        ]
      );
    }

    await execute(
      `UPDATE submissions SET title=?, content=?, confidentiality=?, assigned_to=?, current_revision=?, updated_at=NOW()
        WHERE id=?`,
      [
        data.title ?? submission.title,
        data.content ?? submission.content,
        data.confidentiality ?? submission.confidentiality,
        data.assignedTo !== undefined ? data.assignedTo : submission.assigned_to,
        nextRevision,
        submission.id,
      ]
    );

    if (contentChanged) kickOffReview(submission.id, req.organizationId, req.user.id);
    await logAudit({
      organizationId: req.organizationId,
      userId: req.user.id,
      action: contentChanged ? 'submission.revised' : 'submission.updated',
      entityType: 'submission',
      entityId: submission.id,
      details: { revision: nextRevision },
    });
    res.json({ submission: await getSubmission(submission.id, req.organizationId) });
  })
);

router.post(
  '/submissions/:id/review',
  authenticate,
  ah(async (req, res) => {
    const submission = await getSubmission(req.params.id, req.organizationId);
    kickOffReview(submission.id, req.organizationId, req.user.id);
    await logAudit({
      organizationId: req.organizationId,
      userId: req.user.id,
      action: 'review.requested',
      entityType: 'submission',
      entityId: submission.id,
    });
    res.status(202).json({ ok: true, processingStatus: 'processing' });
  })
);

router.delete(
  '/submissions/:id',
  authenticate,
  ah(async (req, res) => {
    const submission = await getSubmission(req.params.id, req.organizationId);
    if (submission.user_id !== req.user.id && !['admin', 'manager'].includes(req.user.role)) {
      throw forbidden();
    }
    if (!['draft', 'changes_requested', 'rejected'].includes(submission.status)) {
      throw conflict('An approved or in-review submission cannot be deleted');
    }
    await execute('DELETE FROM submissions WHERE id=?', [submission.id]);
    if (submission.source_file) removeFile(submission.source_file);
    await logAudit({
      organizationId: req.organizationId,
      userId: req.user.id,
      action: 'submission.deleted',
      entityType: 'submission',
      entityId: submission.id,
    });
    res.json({ ok: true });
  })
);

// ---------------------------------------------------------------------------
// Findings decisions
// ---------------------------------------------------------------------------
router.post(
  '/findings/:id/decision',
  authenticate,
  ah(async (req, res) => {
    const data = decisionSchema.parse(req.body);
    const finding = await one(
      `SELECT f.*, s.organization_id, s.id AS submission_id, s.user_id AS creator_id
         FROM findings f JOIN submissions s ON s.id=f.submission_id
        WHERE f.id=? AND s.organization_id=?`,
      [req.params.id, req.organizationId]
    );
    if (!finding) throw notFound('Finding not found');
    const canDecide = ['admin', 'manager', 'reviewer'].includes(req.user.role) || finding.creator_id === req.user.id;
    if (!canDecide) throw forbidden();
    if (data.status === 'overridden' && !data.reason?.trim()) {
      throw badRequest('A reason is required when overriding a finding');
    }
    if (finding.category === 'claims' && data.status === 'overridden' && !data.reason?.trim()) {
      throw badRequest('A reason is required to override a claim verdict');
    }

    const nextStatus = data.status === 'open' ? 'open' : data.status;
    await execute(
      'UPDATE findings SET status=?, reviewer_reason=?, suggested_fix=COALESCE(?, suggested_fix), updated_at=NOW() WHERE id=?',
      [nextStatus, data.reason || null, data.editedFix || null, finding.id]
    );
    await execute(
      `INSERT INTO finding_events (finding_id, event_type, actor_id, from_status, to_status, reason, details)
       VALUES (?,?,?,?,?,?,?)`,
      [
        finding.id,
        data.status === 'open' ? 'reopened' : data.status,
        req.user.id,
        finding.status,
        nextStatus,
        data.reason || null,
        JSON.stringify({ editedFix: data.editedFix || null }),
      ]
    );
    await logAudit({
      organizationId: req.organizationId,
      userId: req.user.id,
      action: `finding.${nextStatus}`,
      entityType: 'finding',
      entityId: finding.id,
      details: {
        before: { status: finding.status, suggested_fix: finding.suggested_fix },
        after: { status: nextStatus, suggested_fix: data.editedFix || finding.suggested_fix },
        reason: data.reason || null,
        category: finding.category,
      },
    });
    res.json({
      finding: parseFinding(await one('SELECT * FROM findings WHERE id=?', [finding.id])),
    });
  })
);

// ---------------------------------------------------------------------------
// Rewrite and claim evidence
// ---------------------------------------------------------------------------
router.post(
  '/submissions/:id/rewrite',
  authenticate,
  ah(async (req, res) => {
    const submission = await getSubmission(req.params.id, req.organizationId);
    const findings = (await query('SELECT * FROM findings WHERE submission_id=?', [submission.id])).map(parseFinding);
    const result = await rewriteContent({
      content: submission.content || '',
      findings,
      organizationId: req.organizationId,
      confidentiality: submission.confidentiality,
      purpose: req.body?.purpose || submission.title,
    });
    await logAudit({
      organizationId: req.organizationId,
      userId: req.user.id,
      action: 'rewrite.generated',
      entityType: 'submission',
      entityId: submission.id,
      details: { engine: result.engine },
    });
    res.json(result);
  })
);

router.get(
  '/submissions/:id/claims',
  authenticate,
  ah(async (req, res) => {
    const submission = await getSubmission(req.params.id, req.organizationId);
    const claims = await query(
      `SELECT cv.*, f.status AS finding_status, f.severity, f.suggested_fix, f.engine AS finding_engine
         FROM claim_verdicts cv LEFT JOIN findings f ON f.id=cv.finding_id
        WHERE cv.submission_id=? ORDER BY cv.id ASC`,
      [submission.id]
    );
    const facts = await query(
      'SELECT id, statement, source, owner, expires_at, confidentiality FROM approved_facts WHERE organization_id=?',
      [req.organizationId]
    );
    res.json({
      claims: claims.map((c) => ({
        ...c,
        matchedFact: facts.find((f) => f.id === c.matched_fact_id) || null,
      })),
    });
  })
);

// Add an unsourced claim as an approved fact (prefilled form helper).
router.post(
  '/claims/:id/add-fact',
  authenticate,
  authorize('admin', 'manager', 'reviewer'),
  ah(async (req, res) => {
    const claim = await one(
      `SELECT cv.*, s.organization_id FROM claim_verdicts cv
         JOIN submissions s ON s.id=cv.submission_id
        WHERE cv.id=? AND s.organization_id=?`,
      [req.params.id, req.organizationId]
    );
    if (!claim) throw notFound('Claim not found');
    const data = z
      .object({
        statement: z.string().trim().min(5).max(2000),
        source: z.string().trim().max(500).optional().nullable(),
        owner: z.string().trim().max(200).optional().nullable(),
        expiresAt: z.string().trim().optional().nullable(),
        tags: z.string().trim().max(500).optional().nullable(),
      })
      .parse(req.body);
    const result = await execute(
      `INSERT INTO approved_facts (organization_id, statement, source, owner, expires_at, confidentiality, tags, created_by)
       VALUES (?,?,?,?,?,'internal',?,?)`,
      [
        req.organizationId,
        data.statement,
        data.source || null,
        data.owner || null,
        data.expiresAt || null,
        data.tags || 'from-claim-review',
        req.user.id,
      ]
    );
    await logAudit({
      organizationId: req.organizationId,
      userId: req.user.id,
      action: 'fact.created_from_claim',
      entityType: 'approved_fact',
      entityId: result.insertId,
      details: { claim: claim.claim_text },
    });
    res.status(201).json({ fact: await one('SELECT * FROM approved_facts WHERE id=?', [result.insertId]) });
  })
);

export default router;
