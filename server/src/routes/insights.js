// server/src/routes/insights.js
import express from 'express';
import { z } from 'zod';
import { query, one, execute } from '../db.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { ah } from '../lib/http.js';
import { notFound, badRequest } from '../lib/errors.js';
import { logAudit } from '../lib/observability.js';
import { analyseAllGuidelines, createGuidelineDraft, compareGuidelineImpact } from '../services/clarity.js';

const router = express.Router();

router.get(
  '/insights/overview',
  authenticate,
  ah(async (req, res) => {
    const org = req.organizationId;
    const [statusRows, categories, severities, topRules, byRole, turnaround, weekly, claimRows, totals] =
      await Promise.all([
        query('SELECT status, COUNT(*) AS n FROM submissions WHERE organization_id=? GROUP BY status', [org]),
        query(
          `SELECT f.category, COUNT(*) AS n, SUM(CASE WHEN f.severity IN ('error','warning') THEN 1 ELSE 0 END) AS serious
             FROM findings f JOIN submissions s ON s.id=f.submission_id
            WHERE s.organization_id=? GROUP BY f.category ORDER BY n DESC`,
          [org]
        ),
        query(
          `SELECT f.severity, COUNT(*) AS n FROM findings f JOIN submissions s ON s.id=f.submission_id
            WHERE s.organization_id=? GROUP BY f.severity`,
          [org]
        ),
        query(
          `SELECT COALESCE(f.source_reference, f.title, f.category) AS rule, f.category, COUNT(*) AS n,
                  SUM(CASE WHEN f.status IN ('accepted','overridden') THEN 1 ELSE 0 END) AS accepted,
                  SUM(CASE WHEN f.status='rejected' THEN 1 ELSE 0 END) AS rejected
             FROM findings f JOIN submissions s ON s.id=f.submission_id
            WHERE s.organization_id=? GROUP BY rule, f.category ORDER BY n DESC LIMIT 10`,
          [org]
        ),
        query(
          `SELECT u.role, COUNT(DISTINCT s.id) AS submissions,
                  COUNT(f.id) AS findings,
                  SUM(CASE WHEN f.status='rejected' THEN 1 ELSE 0 END) AS rejected
             FROM submissions s JOIN users u ON u.id=s.user_id
             LEFT JOIN findings f ON f.submission_id=s.id
            WHERE s.organization_id=? GROUP BY u.role ORDER BY findings DESC`,
          [org]
        ),
        one(
          `SELECT AVG(TIMESTAMPDIFF(HOUR, submitted_at, decided_at)) AS avg_hours,
                  COUNT(*) AS decided
             FROM submissions WHERE organization_id=? AND submitted_at IS NOT NULL AND decided_at IS NOT NULL`,
          [org]
        ),
        query(
          `SELECT DATE_FORMAT(created_at, '%Y-%u') AS week, COUNT(*) AS submissions
             FROM submissions WHERE organization_id=? AND created_at >= DATE_SUB(NOW(), INTERVAL 8 WEEK)
            GROUP BY week ORDER BY week ASC`,
          [org]
        ),
        query(
          `SELECT verdict, COUNT(*) AS n FROM claim_verdicts cv
             JOIN submissions s ON s.id=cv.submission_id
            WHERE s.organization_id=? GROUP BY verdict`,
          [org]
        ),
        one(
          `SELECT COUNT(*) AS submissions,
                  SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approved
             FROM submissions WHERE organization_id=?`,
          [org]
        ),
      ]);

    const byStatus = Object.fromEntries(statusRows.map((r) => [r.status, Number(r.n)]));
    const decidedTotal = Object.values(byStatus).reduce((sum, n) => sum + n, 0);
    const approvalRate = decidedTotal ? (byStatus.approved || 0) / decidedTotal : 0;

    res.json({
      totals: {
        submissions: Number(totals.submissions || 0),
        approved: Number(totals.approved || 0),
        approvalRate: Number(approvalRate.toFixed(3)),
        avgTurnaroundHours: turnaround.avg_hours ? Number(Number(turnaround.avg_hours).toFixed(1)) : null,
        decided: Number(turnaround.decided || 0),
      },
      byStatus,
      categories,
      severities: Object.fromEntries(severities.map((r) => [r.severity, Number(r.n)])),
      topRules,
      byRole,
      weekly,
      claims: Object.fromEntries(claimRows.map((r) => [r.verdict, Number(r.n)])),
    });
  })
);

router.get(
  '/insights/unsourced-claims',
  authenticate,
  ah(async (req, res) => {
    const rows = await query(
      `SELECT cv.claim_text, COUNT(*) AS frequency, MAX(cv.created_at) AS last_seen,
              MIN(cv.id) AS sample_claim_id, MIN(cv.submission_id) AS sample_submission_id,
              MAX(cv.engine) AS engine
         FROM claim_verdicts cv JOIN submissions s ON s.id=cv.submission_id
        WHERE s.organization_id=? AND cv.verdict='unsupported'
        GROUP BY cv.claim_text ORDER BY frequency DESC, last_seen DESC LIMIT 30`,
      [req.organizationId]
    );
    res.json({ claims: rows });
  })
);

router.get(
  '/insights/guidelines',
  authenticate,
  ah(async (req, res) => {
    const analyses = await analyseAllGuidelines(req.organizationId);
    res.json({
      guidelines: analyses,
      needsClarity: analyses.filter((a) => a.needsClarity).length,
      insufficientData: analyses.filter((a) => a.sampleSize < a.minimumSample).length,
    });
  })
);

router.post(
  '/guidelines/:id/draft',
  authenticate,
  authorize('admin', 'manager'),
  ah(async (req, res) => {
    const draft = await createGuidelineDraft({
      organizationId: req.organizationId,
      guidelineId: Number(req.params.id),
      userId: req.user.id,
    });
    await logAudit({
      organizationId: req.organizationId,
      userId: req.user.id,
      action: 'guideline.draft.created',
      entityType: 'guideline',
      entityId: Number(req.params.id),
      details: { draftId: draft.id, engine: draft.engine },
    });
    res.status(201).json({ draft });
  })
);

router.get(
  '/guideline-drafts/:id',
  authenticate,
  ah(async (req, res) => {
    const draft = await one(
      `SELECT d.*, g.title, g.organization_id, g.version AS current_version
         FROM guideline_drafts d JOIN guidelines g ON g.id=d.guideline_id
        WHERE d.id=? AND g.organization_id=?`,
      [req.params.id, req.organizationId]
    );
    if (!draft) throw notFound('Draft not found');
    const analysis = await compareGuidelineImpact(req.organizationId, draft.guideline_id);
    res.json({
      draft: {
        ...draft,
        examples: draft.examples ? JSON.parse(draft.examples) : null,
        rationale: draft.rationale ? JSON.parse(draft.rationale) : [],
      },
      impact: analysis,
    });
  })
);

router.post(
  '/guideline-drafts/:id/decision',
  authenticate,
  authorize('admin', 'manager'),
  ah(async (req, res) => {
    const draft = await one(
      `SELECT d.*, g.organization_id, g.version AS current_version, g.title, g.category
         FROM guideline_drafts d JOIN guidelines g ON g.id=d.guideline_id
        WHERE d.id=? AND g.organization_id=?`,
      [req.params.id, req.organizationId]
    );
    if (!draft) throw notFound('Draft not found');
    if (draft.status !== 'pending') throw badRequest('This draft has already been reviewed');
    const data = z
      .object({
        decision: z.enum(['accepted', 'rejected']),
        content: z.string().max(200000).optional(),
        note: z.string().max(2000).optional().nullable(),
      })
      .parse(req.body);

    if (data.decision === 'rejected') {
      await execute(
        "UPDATE guideline_drafts SET status='rejected', reviewed_by=?, review_note=?, updated_at=NOW() WHERE id=?",
        [req.user.id, data.note || null, draft.id]
      );
      await logAudit({
        organizationId: req.organizationId,
        userId: req.user.id,
        action: 'guideline.draft.rejected',
        entityType: 'guideline',
        entityId: draft.guideline_id,
        details: { draftId: draft.id, note: data.note || null },
      });
      return res.json({ ok: true, status: 'rejected' });
    }

    const content = data.content || draft.content;
    const nextVersion = draft.current_version + 1;
    await execute(
      `UPDATE guidelines SET content=?, version=?, updated_at=NOW() WHERE id=?`,
      [content, nextVersion, draft.guideline_id]
    );
    await execute(
      `INSERT INTO guideline_versions (guideline_id, version, title, content, change_note, created_by)
       VALUES (?,?,?,?,?,?)`,
      [draft.guideline_id, nextVersion, draft.title, content, data.note || `Accepted clarity draft #${draft.id}`, req.user.id]
    );
    await execute(
      "UPDATE guideline_drafts SET status='accepted', reviewed_by=?, review_note=?, updated_at=NOW() WHERE id=?",
      [req.user.id, data.note || null, draft.id]
    );
    await logAudit({
      organizationId: req.organizationId,
      userId: req.user.id,
      action: 'guideline.draft.accepted',
      entityType: 'guideline',
      entityId: draft.guideline_id,
      details: { draftId: draft.id, version: nextVersion },
    });
    res.json({ ok: true, status: 'accepted', version: nextVersion });
  })
);

router.get(
  '/guidelines/:id/impact',
  authenticate,
  ah(async (req, res) => {
    const impact = await compareGuidelineImpact(req.organizationId, Number(req.params.id));
    if (!impact) throw notFound('Guideline not found');
    res.json(impact);
  })
);

router.get(
  '/insights/confidentiality',
  authenticate,
  ah(async (req, res) => {
    const [facts, assets, guidelines, restrictedSubmissions, aiCalls] = await Promise.all([
      query('SELECT confidentiality, COUNT(*) AS n FROM approved_facts WHERE organization_id=? GROUP BY confidentiality', [
        req.organizationId,
      ]),
      query('SELECT confidentiality, COUNT(*) AS n FROM brand_assets WHERE organization_id=? GROUP BY confidentiality', [
        req.organizationId,
      ]),
      query('SELECT confidentiality, COUNT(*) AS n FROM guidelines WHERE organization_id=? GROUP BY confidentiality', [
        req.organizationId,
      ]),
      one(
        "SELECT COUNT(*) AS n FROM submissions WHERE organization_id=? AND confidentiality='restricted'",
        [req.organizationId]
      ),
      one(
        "SELECT COUNT(*) AS n FROM ai_call_log WHERE organization_id=? AND service='groq'",
        [req.organizationId]
      ),
    ]);
    res.json({
      facts,
      assets,
      guidelines,
      restrictedSubmissions: Number(restrictedSubmissions.n),
      externalAiCalls: Number(aiCalls.n),
    });
  })
);

export default router;
