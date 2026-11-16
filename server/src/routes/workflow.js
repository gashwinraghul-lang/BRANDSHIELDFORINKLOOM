// server/src/routes/workflow.js
import express from 'express';
import { z } from 'zod';
import { query, one, execute } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { ah } from '../lib/http.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { logAudit } from '../lib/observability.js';
import { sendMail } from '../utils/email.js';
import config from '../config.js';

const router = express.Router();

async function getSubmission(id, organizationId) {
  const submission = await one(
    `SELECT s.*, u.name AS creator_name, u.email AS creator_email,
            a.name AS assignee_name, a.email AS assignee_email
       FROM submissions s JOIN users u ON u.id=s.user_id
       LEFT JOIN users a ON a.id=s.assigned_to
      WHERE s.id=? AND s.organization_id=?`,
    [id, organizationId]
  );
  if (!submission) throw notFound('Submission not found');
  return submission;
}

function canReview(user) {
  return ['admin', 'manager', 'reviewer'].includes(user.role);
}

function notify(user, subject, body) {
  if (!user?.email) return;
  void sendMail({ to: user.email, subject, text: body, html: `<p>${body}</p>` }).catch(() => {});
}

router.get(
  '/workflow/summary',
  authenticate,
  ah(async (req, res) => {
    const rows = await query(
      `SELECT status, COUNT(*) AS n FROM submissions WHERE organization_id=? GROUP BY status`,
      [req.organizationId]
    );
    const byStatus = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
    const assigned = await one(
      "SELECT COUNT(*) AS n FROM submissions WHERE organization_id=? AND assigned_to=? AND status='in_review'",
      [req.organizationId, req.user.id]
    );
    const awaiting = await one(
      "SELECT COUNT(*) AS n FROM submissions WHERE organization_id=? AND status='in_review'",
      [req.organizationId]
    );
    res.json({
      byStatus,
      assignedToMe: Number(assigned.n),
      awaitingReview: Number(awaiting.n),
      canReview: canReview(req.user),
    });
  })
);

router.post(
  '/submissions/:id/submit',
  authenticate,
  ah(async (req, res) => {
    const submission = await getSubmission(req.params.id, req.organizationId);
    if (submission.user_id !== req.user.id && !canReview(req.user)) throw forbidden();
    if (!['draft', 'changes_requested'].includes(submission.status)) {
      throw badRequest('Only drafts or change requests can be submitted');
    }
    await execute(
      "UPDATE submissions SET status='in_review', submitted_at=COALESCE(submitted_at, NOW()), updated_at=NOW() WHERE id=?",
      [submission.id]
    );
    await execute(
      `INSERT INTO finding_events (finding_id, event_type, actor_id, reason)
       SELECT id, 'resubmitted', ?, ? FROM findings WHERE submission_id=?`,
      [req.user.id, req.body?.note || 'Resubmitted for review', submission.id]
    ).catch(() => {});
    await logAudit({
      organizationId: req.organizationId,
      userId: req.user.id,
      action: 'submission.submitted',
      entityType: 'submission',
      entityId: submission.id,
      details: { note: req.body?.note || null },
    });
    const reviewers = await query(
      "SELECT email, name FROM users WHERE organization_id=? AND role IN ('admin','manager','reviewer') AND status='active'",
      [req.organizationId]
    );
    for (const reviewer of reviewers) {
      notify(
        reviewer,
        `Review requested: ${submission.title}`,
        `${req.user.name || req.user.email} submitted “${submission.title}” for review. Open ${config.appUrl}/reviews/${submission.id}.`
      );
    }
    res.json({ submission: await getSubmission(submission.id, req.organizationId) });
  })
);

router.post(
  '/submissions/:id/assign',
  authenticate,
  authorize('admin', 'manager'),
  ah(async (req, res) => {
    const submission = await getSubmission(req.params.id, req.organizationId);
    const { userId } = z.object({ userId: z.coerce.number().int().positive() }).parse(req.body);
    const assignee = await one('SELECT id, name, email, role FROM users WHERE id=? AND organization_id=?', [
      userId,
      req.organizationId,
    ]);
    if (!assignee) throw notFound('That team member was not found');
    await execute('UPDATE submissions SET assigned_to=?, updated_at=NOW() WHERE id=?', [assignee.id, submission.id]);
    await execute(
      "UPDATE submissions SET status='in_review', submitted_at=COALESCE(submitted_at, NOW()) WHERE id=? AND status='draft'",
      [submission.id]
    );
    await logAudit({
      organizationId: req.organizationId,
      userId: req.user.id,
      action: 'submission.assigned',
      entityType: 'submission',
      entityId: submission.id,
      details: { assignee: assignee.name || assignee.email },
    });
    notify(
      assignee,
      `Assigned for review: ${submission.title}`,
      `${req.user.name || req.user.email} assigned “${submission.title}” to you. Open ${config.appUrl}/reviews/${submission.id}.`
    );
    res.json({ submission: await getSubmission(submission.id, req.organizationId) });
  })
);

router.post(
  '/submissions/:id/decision',
  authenticate,
  ah(async (req, res) => {
    const submission = await getSubmission(req.params.id, req.organizationId);
    if (!canReview(req.user)) throw forbidden('Only reviewers, managers or admins can decide');
    if (submission.status !== 'in_review') throw badRequest('This submission is not awaiting a decision');
    const data = z
      .object({
        decision: z.enum(['approved', 'changes_requested', 'rejected']),
        note: z.string().trim().max(2000).optional().nullable(),
      })
      .parse(req.body);
    const status = data.decision;
    await execute(
      "UPDATE submissions SET status=?, decided_at=NOW(), updated_at=NOW() WHERE id=?",
      [status, submission.id]
    );
    await execute('INSERT INTO approvals (submission_id, reviewer_id, decision, note) VALUES (?,?,?,?)', [
      submission.id,
      req.user.id,
      data.decision,
      data.note || null,
    ]);
    await execute(
      `INSERT INTO comments (submission_id, user_id, body) VALUES (?,?,?)`,
      [submission.id, req.user.id, data.note ? `Decision: ${data.decision} — ${data.note}` : `Decision: ${data.decision}`]
    ).catch(() => {});
    await logAudit({
      organizationId: req.organizationId,
      userId: req.user.id,
      action: `submission.${data.decision}`,
      entityType: 'submission',
      entityId: submission.id,
      details: { note: data.note || null },
    });
    notify(
      { email: submission.creator_email, name: submission.creator_name },
      `“${submission.title}” was ${data.decision.replace('_', ' ')}`,
      `${req.user.name || req.user.email} marked “${submission.title}” as ${data.decision.replace('_', ' ')}.${data.note ? ` Note: ${data.note}` : ''}`
    );
    res.json({ submission: await getSubmission(submission.id, req.organizationId) });
  })
);

router.get(
  '/submissions/:id/comments',
  authenticate,
  ah(async (req, res) => {
    const submission = await getSubmission(req.params.id, req.organizationId);
    const comments = await query(
      `SELECT c.*, u.name AS author_name, u.email AS author_email, u.role AS author_role
         FROM comments c LEFT JOIN users u ON u.id=c.user_id
        WHERE c.submission_id=? ORDER BY c.created_at ASC`,
      [submission.id]
    );
    res.json({ comments });
  })
);

router.post(
  '/submissions/:id/comments',
  authenticate,
  ah(async (req, res) => {
    const submission = await getSubmission(req.params.id, req.organizationId);
    const data = z
      .object({
        body: z.string().trim().min(1, 'Write a comment').max(5000),
        parentId: z.coerce.number().int().positive().nullable().optional(),
      })
      .parse(req.body);
    const mentions = [...data.body.matchAll(/@([\w.+-]+@[\w.-]+\.\w+|[\w.-]+)/g)].map((m) => m[1]);
    if (data.parentId) {
      const parent = await one('SELECT id FROM comments WHERE id=? AND submission_id=?', [
        data.parentId,
        submission.id,
      ]);
      if (!parent) throw notFound('Parent comment not found');
    }
    const result = await execute(
      'INSERT INTO comments (submission_id, parent_id, user_id, body, mentions) VALUES (?,?,?,?,?)',
      [submission.id, data.parentId || null, req.user.id, data.body, JSON.stringify(mentions)]
    );
    await logAudit({
      organizationId: req.organizationId,
      userId: req.user.id,
      action: 'comment.created',
      entityType: 'submission',
      entityId: submission.id,
      details: { commentId: result.insertId, mentions },
    });
    if (mentions.length) {
      const team = await query('SELECT name, email FROM users WHERE organization_id=?', [req.organizationId]);
      for (const person of team) {
        const handle = (person.email || '').split('@')[0];
        if (mentions.includes(person.email) || mentions.includes(handle) || mentions.includes(person.name)) {
          notify(
            person,
            `You were mentioned on “${submission.title}”`,
            `${req.user.name || req.user.email}: ${data.body}`
          );
        }
      }
    }
    const comment = await one(
      `SELECT c.*, u.name AS author_name, u.email AS author_email, u.role AS author_role
         FROM comments c LEFT JOIN users u ON u.id=c.user_id WHERE c.id=?`,
      [result.insertId]
    );
    res.status(201).json({ comment });
  })
);

router.delete(
  '/comments/:id',
  authenticate,
  ah(async (req, res) => {
    const comment = await one(
      `SELECT c.*, s.organization_id FROM comments c JOIN submissions s ON s.id=c.submission_id
        WHERE c.id=? AND s.organization_id=?`,
      [req.params.id, req.organizationId]
    );
    if (!comment) throw notFound('Comment not found');
    if (comment.user_id !== req.user.id && req.user.role !== 'admin') throw forbidden();
    await execute('DELETE FROM comments WHERE id=?', [comment.id]);
    res.json({ ok: true });
  })
);

export default router;
