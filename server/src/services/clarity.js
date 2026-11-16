// server/src/services/clarity.js
// Closed-loop guideline improvement: diagnose weak guidelines, draft clearer
// versions, then measure before/after with a two-proportion test.
import { query, one, execute } from '../db.js';
import config from '../config.js';
import { chatJson, isLlmAvailable } from './llmClient.js';

function normalCdf(z) {
  // Abramowitz & Stegun approximation, plenty accurate for a demo threshold.
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp((-z * z) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

export function twoProportionTest(successesA, nA, successesB, nB) {
  if (nA < 1 || nB < 1) return { z: null, pValue: null, significant: false };
  const pA = successesA / nA;
  const pB = successesB / nB;
  const pooled = (successesA + successesB) / (nA + nB);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / nA + 1 / nB));
  if (!se) return { z: 0, pValue: 1, significant: false };
  const z = (pB - pA) / se;
  const pValue = 2 * (1 - normalCdf(Math.abs(z)));
  return { z: Number(z.toFixed(3)), pValue: Number(pValue.toFixed(4)), significant: pValue < 0.05 };
}

export async function analyseGuidelineClarity(organizationId, guidelineId) {
  const guideline = await one('SELECT * FROM guidelines WHERE id=? AND organization_id=?', [
    guidelineId,
    organizationId,
  ]);
  if (!guideline) return null;

  const findings = await query(
    `SELECT f.id, f.severity, f.status, f.title, f.explanation, f.created_at,
            s.user_id, u.role AS creator_role, s.id AS submission_id
       FROM findings f
       JOIN submissions s ON s.id=f.submission_id
       JOIN users u ON u.id=s.user_id
      WHERE f.guideline_id=?`,
    [guidelineId]
  );

  const events = await query(
    `SELECT fe.*, f.guideline_id FROM finding_events fe
       JOIN findings f ON f.id=fe.finding_id
      WHERE f.guideline_id=?`,
    [guidelineId]
  );

  const total = findings.length;
  const rejected = findings.filter((f) => f.status === 'rejected').length;
  const overridden = findings.filter((f) => f.status === 'overridden' || f.status === 'accepted').length;
  const rejectionEvents = events.filter((e) => e.to_status === 'rejected' || e.event_type === 'rejected').length;
  const overrideEvents = events.filter(
    (e) => e.to_status === 'overridden' || e.event_type === 'overridden' || e.event_type === 'accepted'
  ).length;

  const samples = total || events.length;
  const overrideRate = samples ? Math.max(overridden, overrideEvents) / samples : 0;
  const rejectionRate = samples ? Math.max(rejected, rejectionEvents) / samples : 0;

  const byGroup = {};
  for (const f of findings) {
    const group = f.creator_role === 'agency' ? 'agency' : 'internal';
    byGroup[group] = byGroup[group] || { total: 0, rejected: 0, overridden: 0 };
    byGroup[group].total += 1;
    if (f.status === 'rejected') byGroup[group].rejected += 1;
    if (f.status === 'overridden' || f.status === 'accepted') byGroup[group].overridden += 1;
  }

  const reasons = events
    .filter((e) => e.reason)
    .map((e) => e.reason)
    .slice(0, 8);

  const needsClarity =
    samples >= config.metrics.minSample &&
    (overrideRate >= config.metrics.clarityThreshold || rejectionRate >= config.metrics.clarityThreshold);

  const worstGroup = Object.entries(byGroup).sort(
    (a, b) => b[1].rejected / Math.max(1, b[1].total) - a[1].rejected / Math.max(1, a[1].total)
  )[0];

  return {
    guideline: {
      id: guideline.id,
      title: guideline.title,
      version: guideline.version,
      category: guideline.category,
      confidentiality: guideline.confidentiality,
    },
    sampleSize: samples,
    triggers: total,
    overridden: Math.max(overridden, overrideEvents),
    rejected: Math.max(rejected, rejectionEvents),
    overrideRate: Number(overrideRate.toFixed(3)),
    rejectionRate: Number(rejectionRate.toFixed(3)),
    byGroup,
    needsClarity,
    minimumSample: config.metrics.minSample,
    threshold: config.metrics.clarityThreshold,
    evidence:
      samples === 0
        ? 'No reviews have triggered this guideline yet.'
        : worstGroup && samples >= config.metrics.minSample
          ? `Rejected or overridden ${Math.max(rejected, rejectionEvents)} of ${samples} times, mostly by ${worstGroup[0]} users.`
          : `Only ${samples} review${samples === 1 ? '' : 's'} so far. Not enough data to tell yet.`,
    commonReasons: [...new Set(reasons)],
    sampleFindings: findings.slice(0, 5),
  };
}

export async function analyseAllGuidelines(organizationId) {
  const guidelines = await query(
    "SELECT id, title, category, version, updated_at FROM guidelines WHERE organization_id=? AND status='active'",
    [organizationId]
  );
  const results = [];
  for (const g of guidelines) {
    const analysis = await analyseGuidelineClarity(organizationId, g.id);
    if (analysis) results.push(analysis);
  }
  return results.sort((a, b) => b.rejectionRate - a.rejectionRate);
}

function deterministicDraft(guideline, analysis) {
  const lines = String(guideline.content || '')
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean);

  const bullets = lines.filter((l) => /^[-*•]/.test(l)).map((l) => l.replace(/^[-*•]\s*/, ''));
  const prose = lines.filter((l) => !/^[-*•]/.test(l));
  return {
    content: [
      `# ${guideline.title}`,
      '',
      '## Why this guideline exists',
      prose[0] || 'This guideline keeps our brand clear, consistent and trustworthy.',
      '',
      '## What good looks like',
      ...(bullets.length ? bullets.map((b) => `- ${b}`) : ['- Write plainly and specifically.', '- Support claims with an approved source.']),
      '',
      '## What to avoid',
      '- Unsupported superlatives ("best", "first", "guaranteed").',
      '- Phrases the brand has banned in the tone guidelines.',
      '- Jargon when a plain word works.',
      '',
      '## Worked examples',
      '**Good:** “Our support team replies within one business day.” — specific and verifiable.',
      '**Bad:** “We offer the fastest support in the world.” — a superlative with no source.',
      '',
      analysis.needsClarity
        ? `## Why this revision (data) — ${analysis.evidence}`
        : '## Why this revision — the wording was tightened for clarity.',
    ].join('\n'),
    rationale: [
      { change: 'Added “Why this guideline exists”', reason: 'Gives writers the intent, not just the rule.' },
      { change: 'Added “What good looks like”', reason: 'Turns abstract guidance into a checklist.' },
      { change: 'Added worked good/bad example', reason: 'Shows the boundary case reviewers keep rejecting.' },
      ...(analysis.commonReasons.slice(0, 2).map((r) => ({ change: 'Incorporated reviewer feedback', reason: r }))),
    ],
    examples: {
      good: 'Our support team replies within one business day.',
      bad: 'We offer the fastest support in the world.',
    },
    engine: 'deterministic',
  };
}

export async function createGuidelineDraft({ organizationId, guidelineId, userId }) {
  const analysis = await analyseGuidelineClarity(organizationId, guidelineId);
  if (!analysis) throw Object.assign(new Error('Guideline not found'), { status: 404 });
  const guideline = await one('SELECT * FROM guidelines WHERE id=?', [guidelineId]);

  let draft = deterministicDraft(guideline, analysis);
  if (isLlmAvailable() && guideline.confidentiality !== 'restricted') {
    const result = await chatJson({
      organizationId,
      category: 'guideline_clarity',
      maxTokens: 1400,
      system:
        'You improve brand guidelines so they are unambiguous and easy to follow. Keep the intent, never invent policy. Reply with JSON: {"content": "markdown", "rationale":[{"change":"...","reason":"..."}], "examples":{"good":"...","bad":"..."}}.',
      user: `Current guideline:\n<untrusted_content>${guideline.content}</untrusted_content>\n\nObserved problems: ${analysis.evidence}\nCommon reviewer reasons: ${analysis.commonReasons.join('; ') || 'none recorded'}\n\nRewrite it with clear sections and two worked examples (one good, one bad).`,
    });
    if (result) {
      draft = {
        content: result.data.content,
        rationale: result.data.rationale,
        examples: result.data.examples,
        engine: result.engine,
      };
    }
  }

  const inserted = await execute(
    `INSERT INTO guideline_drafts (guideline_id, base_version, content, examples, rationale, created_by)
     VALUES (?,?,?,?,?,?)`,
    [
      guidelineId,
      guideline.version,
      draft.content,
      JSON.stringify(draft.examples || {}),
      JSON.stringify(draft.rationale || []),
      userId,
    ]
  );
  return {
    id: inserted.insertId,
    guideline_id: guidelineId,
    base_version: guideline.version,
    content: draft.content,
    examples: draft.examples,
    rationale: draft.rationale,
    engine: draft.engine,
    analysis,
  };
}

export async function compareGuidelineImpact(organizationId, guidelineId) {
  const guideline = await one('SELECT * FROM guidelines WHERE id=? AND organization_id=?', [
    guidelineId,
    organizationId,
  ]);
  if (!guideline) return null;

  const latest = await one(
    'SELECT * FROM guideline_versions WHERE guideline_id=? ORDER BY version DESC LIMIT 1',
    [guidelineId]
  );
  const activation = latest?.created_at ? new Date(latest.created_at) : null;
  const beforeStart = activation ? new Date(activation.getTime() - 30 * 24 * 3600 * 1000) : null;

  const before = activation
    ? await one(
        `SELECT COUNT(*) AS n,
                SUM(CASE WHEN f.status IN ('accepted','overridden') THEN 1 ELSE 0 END) AS overrides,
                SUM(CASE WHEN f.status='rejected' THEN 1 ELSE 0 END) AS rejections
           FROM findings f JOIN submissions s ON s.id=f.submission_id
          WHERE f.guideline_id=? AND s.organization_id=? AND f.created_at >= ? AND f.created_at < ?`,
        [guidelineId, organizationId, beforeStart, activation]
      )
    : { n: 0, overrides: 0, rejections: 0 };

  const after = activation
    ? await one(
        `SELECT COUNT(*) AS n,
                SUM(CASE WHEN f.status IN ('accepted','overridden') THEN 1 ELSE 0 END) AS overrides,
                SUM(CASE WHEN f.status='rejected' THEN 1 ELSE 0 END) AS rejections
           FROM findings f JOIN submissions s ON s.id=f.submission_id
          WHERE f.guideline_id=? AND s.organization_id=? AND f.created_at >= ?`,
        [guidelineId, organizationId, activation]
      )
    : { n: 0, overrides: 0, rejections: 0 };

  const nA = Number(before.n || 0);
  const nB = Number(after.n || 0);
  const rateA = nA ? Number(before.rejections || 0) / nA : 0;
  const rateB = nB ? Number(after.rejections || 0) / nB : 0;
  const enoughData = nA >= config.metrics.minSample && nB >= config.metrics.minSample;
  const test = twoProportionTest(Number(before.rejections || 0), nA, Number(after.rejections || 0), nB);

  return {
    guideline: { id: guideline.id, title: guideline.title, version: guideline.version },
    activation: activation?.toISOString() || null,
    windowDays: 30,
    before: { sample: nA, rejections: Number(before.rejections || 0), rate: Number(rateA.toFixed(3)) },
    after: { sample: nB, rejections: Number(after.rejections || 0), rate: Number(rateB.toFixed(3)) },
    test,
    enoughData,
    conclusion: !enoughData
      ? 'Not enough data to tell. Collect at least the minimum sample on both sides.'
      : test.significant
        ? test.z < 0
          ? 'Rejection rate decreased significantly (p < 0.05).'
          : 'Rejection rate increased significantly (p < 0.05).'
        : 'No statistically significant change (p ≥ 0.05).',
  };
}
