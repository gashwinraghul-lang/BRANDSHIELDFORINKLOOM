// server/src/services/agents/claim.js
import { extractClaims, judgeClaim, factToRetrieverDoc } from '../claims.js';

export async function runClaimAgent(context) {
  const {
    content = '',
    facts = [],
    organizationId,
    confidentiality = 'internal',
    useLlm = true,
  } = context;

  if (!String(content || '').trim()) return { findings: [], verdicts: [] };

  const claims = extractClaims(content);
  const retrieverFacts = facts.map(factToRetrieverDoc);
  const findings = [];
  const verdicts = [];

  for (const claim of claims.slice(0, 24)) {
    const result = await judgeClaim({
      claim,
      facts: retrieverFacts,
      organizationId,
      confidentiality,
      useLlm,
    });
    const match = result.match;
    const severity =
      result.verdict === 'contradicted' || result.verdict === 'outdated'
        ? 'warning'
        : result.verdict === 'supported'
          ? 'info'
          : 'suggestion';

    const title = {
      supported: 'Claim supported by an approved fact',
      contradicted: 'Claim conflicts with an approved fact',
      outdated: 'Claim relies on an outdated fact',
      unsupported: 'Claim has no approved source',
    }[result.verdict];

    const explanation =
      result.verdict === 'supported' && match
        ? `${result.explanation} Source: ${match.source || 'approved fact'} (owner: ${match.owner || 'unassigned'}).`
        : result.verdict === 'unsupported'
          ? `${result.explanation} Unsupported claims are suggestions; they never block submission.`
          : result.explanation;

    const finding = {
      category: 'claims',
      finding_type: `claim_${result.verdict}`,
      severity,
      title,
      explanation,
      suggested_fix:
        result.suggested_fix ||
        (match && result.verdict === 'contradicted'
          ? `Align the claim with the approved fact: “${match.statement}”.`
          : result.verdict === 'outdated'
            ? 'Refresh the figure with the current source, or remove the claim.'
            : result.verdict === 'unsupported'
              ? 'Add the claim as an approved fact with a source, or soften it.'
              : ''),
      confidence: result.confidence,
      engine: result.engine,
      location: { start: claim.start, end: claim.end },
      source_reference: match
        ? `Approved fact${match.source ? ` — ${match.source}` : ''}`
        : 'No approved fact found',
      fact_id: match?.id ?? null,
      evidence: {
        type: 'claim',
        claim: claim.text,
        verdict: result.verdict,
        matchedFact: match
          ? {
              id: match.id,
              statement: match.statement,
              source: match.source,
              owner: match.owner,
              expires_at: match.expires_at,
            }
          : null,
        similarity: Number((result.similarity || 0).toFixed(3)),
        engine: result.engine,
      },
    };
    findings.push(finding);
    verdicts.push({
      claim_text: claim.text,
      verdict: result.verdict,
      matched_fact_id: match?.id ?? null,
      similarity: result.similarity || 0,
      engine: result.engine,
      source: match?.source ?? null,
      owner: match?.owner ?? null,
      expires_at: match?.expires_at ?? null,
      detail: result.explanation,
    });
  }

  return { findings, verdicts };
}
