// server/src/services/orchestrator.js
// Runs every review agent in parallel, dedupes and persists findings.
import { query, execute, one } from '../db.js';
import { logAudit } from '../lib/observability.js';
import { runToneAgent } from './agents/tone.js';
import { runTerminologyAgent } from './agents/terminology.js';
import { runMessagingAgent } from './agents/messaging.js';
import { runClaimAgent } from './agents/claim.js';
import { runVisualAgent } from './agents/visual.js';
import { runAccessibilityAgent } from './agents/accessibility.js';

export async function loadReviewContext(submission) {
  const [guidelineRows, terms, facts, assets] = await Promise.all([
    query(
      `SELECT g.id, g.title, g.category, g.content, g.version, g.confidentiality, g.status,
              (SELECT id FROM guideline_versions gv WHERE gv.guideline_id = g.id ORDER BY gv.version DESC LIMIT 1) AS version_id
         FROM guidelines g
        WHERE g.organization_id = ? AND g.status = 'active'`,
      [submission.organization_id]
    ),
    query('SELECT * FROM terminology_terms WHERE organization_id = ?', [submission.organization_id]),
    query('SELECT * FROM approved_facts WHERE organization_id = ?', [submission.organization_id]),
    query('SELECT * FROM brand_assets WHERE organization_id = ?', [submission.organization_id]),
  ]);
  return { guidelines: guidelineRows, terms, facts, assets };
}

function dedupe(findings) {
  const seen = new Set();
  const out = [];
  for (const f of findings) {
    const key = [
      f.category,
      f.finding_type,
      f.title,
      f.location?.start ?? '',
      f.evidence?.claim ?? '',
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(f);
  }
  return out;
}

export async function runReview(submissionId, { organizationId, actorId = null } = {}) {
  const submission = await one('SELECT * FROM submissions WHERE id = ? AND organization_id = ?', [
    submissionId,
    organizationId,
  ]);
  if (!submission) throw Object.assign(new Error('Submission not found'), { status: 404 });

  await execute(
    "UPDATE submissions SET processing_status='processing', processing_error=NULL WHERE id=?",
    [submissionId]
  );

  try {
    const context = await loadReviewContext(submission);
    const restricted = submission.confidentiality === 'restricted';
    const useLlm = !restricted;

    const base = {
      content: submission.content || '',
      guidelines: context.guidelines,
      terms: context.terms,
      facts: context.facts,
      assets: context.assets,
      submission: { ...submission, file_path: submission.source_file },
      organizationId,
      confidentiality: submission.confidentiality,
      useLlm,
    };

    const [tone, terminology, messaging, claims, visual, accessibility] = await Promise.all([
      Promise.resolve(runToneAgent(base)),
      Promise.resolve(runTerminologyAgent(base)),
      Promise.resolve(runMessagingAgent(base)),
      runClaimAgent(base),
      runVisualAgent(base),
      runAccessibilityAgent(base),
    ]);

    const claimFindings = claims.findings || [];
    const claimVerdicts = claims.verdicts || [];
    const all = dedupe([
      ...tone,
      ...terminology,
      ...messaging,
      ...claimFindings,
      ...(visual.findings || []),
      ...(accessibility.findings || []),
    ]);

    // A fresh review replaces the previous suggestion set. Decisions on old
    // findings stay in finding_events for the audit trail.
    await execute('DELETE FROM claim_verdicts WHERE submission_id = ?', [submissionId]);
    await execute('DELETE FROM findings WHERE submission_id = ?', [submissionId]);

    const inserted = [];
    for (const f of all) {
      const result = await execute(
        `INSERT INTO findings
          (submission_id, category, severity, location, explanation, source_reference, confidence,
           suggested_fix, engine, status, title, finding_type, evidence, region, guideline_id,
           guideline_version_id, fact_id, asset_id)
         VALUES (?,?,?,?,?,?,?,?,?,'open',?,?,?,?,?,?,?,?)`,
        [
          submissionId,
          f.category,
          f.severity,
          f.location ? JSON.stringify(f.location) : null,
          f.explanation,
          f.source_reference || null,
          f.confidence ?? null,
          f.suggested_fix || null,
          f.engine || 'deterministic',
          f.title || null,
          f.finding_type || null,
          f.evidence ? JSON.stringify(f.evidence) : null,
          f.region ? JSON.stringify(f.region) : null,
          f.guideline_id || null,
          f.guideline_version_id || null,
          f.fact_id || null,
          f.asset_id || null,
        ]
      );
      inserted.push({ ...f, id: result.insertId });
    }

    for (const v of claimVerdicts) {
      const matching = inserted.find(
        (f) => f.category === 'claims' && f.evidence?.claim === v.claim_text
      );
      await execute(
        `INSERT INTO claim_verdicts
          (submission_id, finding_id, claim_text, verdict, matched_fact_id, similarity, engine, source, owner, expires_at, detail)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
        [
          submissionId,
          matching?.id ?? null,
          v.claim_text,
          v.verdict,
          v.matched_fact_id || null,
          v.similarity || null,
          v.engine || 'deterministic',
          v.source || null,
          v.owner || null,
          v.expires_at || null,
          v.detail || null,
        ]
      );
    }

    const engines = [...new Set(inserted.map((f) => f.engine))];
    await execute(
      `UPDATE submissions
          SET processing_status='complete', processing_error=NULL, engine=?, updated_at=NOW()
        WHERE id=?`,
      [engines.join(', ') || 'deterministic', submissionId]
    );

    await logAudit({
      organizationId,
      userId: actorId,
      action: 'review.completed',
      entityType: 'submission',
      entityId: submissionId,
      details: {
        findings: inserted.length,
        claims: claimVerdicts.length,
        engines,
        confidentiality: submission.confidentiality,
      },
    });

    return {
      findings: inserted,
      claimVerdicts,
      analysis: { visual: visual.analysis || null, accessibility: accessibility.analysis || null },
    };
  } catch (err) {
    await execute(
      "UPDATE submissions SET processing_status='failed', processing_error=? WHERE id=?",
      [String(err.message).slice(0, 500), submissionId]
    ).catch(() => {});
    throw err;
  }
}

// Ad-hoc review used by the Agentverse bridge. Nothing is persisted and
// restricted-derived material is excluded from the context before running.
export async function runAdHocReview({ text, organizationId, title = 'Agentverse review' }) {
  const submission = {
    organization_id: organizationId,
    content: text,
    content_type: 'text',
    confidentiality: 'internal',
    source_file: null,
    title,
  };
  const context = await loadReviewContext(submission);
  const safeFacts = context.facts.filter((f) => f.confidentiality !== 'restricted');
  const safeAssets = context.assets.filter((a) => a.confidentiality !== 'restricted');
  const safeGuidelines = context.guidelines.filter((g) => g.confidentiality !== 'restricted');
  const base = {
    content: text,
    guidelines: safeGuidelines,
    terms: context.terms,
    facts: safeFacts,
    assets: safeAssets,
    submission,
    organizationId,
    confidentiality: 'internal',
    useLlm: false,
  };
  const [tone, terminology, messaging, claims] = await Promise.all([
    Promise.resolve(runToneAgent(base)),
    Promise.resolve(runTerminologyAgent(base)),
    Promise.resolve(runMessagingAgent(base)),
    runClaimAgent(base),
  ]);
  const findings = dedupe([...tone, ...terminology, ...messaging, ...(claims.findings || [])]);
  return {
    findings,
    claimVerdicts: claims.verdicts || [],
    summary: {
      total: findings.length,
      errors: findings.filter((f) => f.severity === 'error').length,
      warnings: findings.filter((f) => f.severity === 'warning').length,
      suggestions: findings.filter((f) => f.severity === 'suggestion').length,
      info: findings.filter((f) => f.severity === 'info').length,
    },
    excludedRestricted: context.facts.length - safeFacts.length,
  };
}
