// server/src/services/claims.js
// Evidence-grounded claim extraction and verification. Deterministic by
// default; the LLM is used only when available and only for non-restricted
// material.
import { Retriever, extractNumbers, normaliseText } from './retriever.js';
import { chatJson, isLlmAvailable, zVerdict } from './llmClient.js';

const CLAIM_SIGNALS = [
  /\d/,
  /%|percent/i,
  /\$|€|£/,
  /\b(first|best|only|largest|fastest|cheapest|leading|number one|world'?s|industry'?s)\b/i,
  /\b(guarantee|guaranteed|promise|warranty|risk[- ]free|no[- ]risk)\b/i,
  /\b(certified|accredited|approved|licensed|award[- ]winning)\b/i,
  /\b(always|never|everyone|all customers|100%)\b/i,
  /\b(19|20)\d{2}\b/,
  /\b(increase|decrease|reduce|grow|save|earn|boost|double|triple|cut)\b/i,
  /\b(since|founded|established|launched)\b/i,
];

const SUPERLATIVES = /\b(first|best|only|largest|fastest|cheapest|leading|number one|world'?s|industry'?s|guaranteed|100%)\b/gi;

export function splitSentences(text = '') {
  const source = String(text).replace(/\s+/g, ' ');
  const sentences = [];
  const re = /[^.!?\n]+[.!?]*/g;
  let match;
  while ((match = re.exec(source))) {
    const value = match[0].trim();
    if (value) sentences.push({ text: value, start: match.index, end: match.index + match[0].length });
  }
  return sentences;
}

export function looksLikeClaim(sentence) {
  return CLAIM_SIGNALS.some((re) => re.test(sentence));
}

export function extractClaims(text = '') {
  return splitSentences(text)
    .filter((s) => s.text.split(/\s+/).length >= 4 && looksLikeClaim(s.text))
    .map((s) => ({ ...s, numbers: extractNumbers(s.text) }));
}

function hasConflict(claimNumbers, factNumbers) {
  if (!claimNumbers.length || !factNumbers.length) return false;
  const factSet = new Set(factNumbers.map((n) => Number(n)));
  return claimNumbers.some((n) => {
    if (typeof n === 'string') return !factSet.has(Number(n.split(':')[1]));
    return !factSet.has(Number(n));
  });
}

function polarity(text) {
  return /\b(not|no|never|cannot|can't|won't|without|none|neither|nor)\b/i.test(text) ? -1 : 1;
}

function superlativeTokens(text) {
  return [...String(text).toLowerCase().matchAll(SUPERLATIVES)].map((m) => m[0].toLowerCase());
}

function factorExpiry(fact) {
  if (!fact.expires_at) return false;
  const expiry = new Date(fact.expires_at);
  return !Number.isNaN(expiry.getTime()) && expiry.getTime() < Date.now();
}

/**
 * Deterministic verdict.
 * @returns {{verdict:string, confidence:number, explanation:string, match:object|null, similarity:number}}
 */
export function judgeDeterministic(claim, facts) {
  const retriever = new Retriever(facts);
  const results = retriever.search(claim.text, 4);
  const top = results[0];

  if (!top || top.score < 0.12) {
    return {
      verdict: 'unsupported',
      confidence: 0.55,
      explanation:
        'No approved fact in your brand knowledge base mentions this claim. It is shown as a suggestion to confirm before publishing, not as an error.',
      match: null,
      similarity: top?.score || 0,
    };
  }

  const fact = top.doc;
  const factNumbers = extractNumbers(`${fact.statement} ${fact.tags || ''}`);
  const claimNumbers = claim.numbers?.length ? claim.numbers : extractNumbers(claim.text);
  const numbersConflict = hasConflict(claimNumbers, factNumbers);
  const polarityConflict = polarity(claim.text) !== polarity(fact.statement);
  const claimSuperlatives = superlativeTokens(claim.text);
  const missingSuperlative =
    claimSuperlatives.length > 0 &&
    !claimSuperlatives.some((word) => normaliseText(fact.statement).includes(word));

  if (factorExpiry(fact)) {
    return {
      verdict: 'outdated',
      confidence: Math.max(0.55, Math.min(0.95, top.score)),
      explanation: `The closest approved fact has expired${fact.expires_at ? ` on ${new Date(fact.expires_at).toLocaleDateString()}` : ''}. Confirm the current figure before publishing.`,
      match: fact,
      similarity: top.score,
    };
  }

  if (numbersConflict || polarityConflict || (missingSuperlative && top.score >= 0.22)) {
    return {
      verdict: 'contradicted',
      confidence: Math.max(0.55, Math.min(0.95, top.score + 0.15)),
      explanation: numbersConflict
        ? 'The claim uses a different number from the closest approved fact. Same subject, different figure: this needs a human check.'
        : polarityConflict
          ? 'The claim and the approved fact have opposite polarity (one negates what the other states).'
          : 'The claim uses a superlative that the approved fact does not support.',
      match: fact,
      similarity: top.score,
    };
  }

  if (top.score >= 0.38) {
    return {
      verdict: 'supported',
      confidence: Math.min(0.96, Math.max(0.6, top.score + 0.2)),
      explanation: 'This claim closely matches an approved fact in your knowledge base.',
      match: fact,
      similarity: top.score,
    };
  }

  return {
    verdict: 'unsupported',
    confidence: Math.max(0.4, Math.min(0.7, 1 - top.score)),
    explanation:
      'The closest approved fact is only loosely related. Treat this as a suggestion to add a source, not a blocking error.',
    match: fact,
    similarity: top.score,
  };
}

export async function judgeClaim({
  claim,
  facts,
  organizationId = null,
  confidentiality = 'internal',
  useLlm = true,
}) {
  const deterministic = judgeDeterministic(claim, facts);
  const canUseLlm =
    useLlm && isLlmAvailable() && confidentiality !== 'restricted' && facts.length > 0;

  if (!canUseLlm) {
    return { ...deterministic, engine: 'deterministic' };
  }

  const llmFacts = facts.filter((f) => f.confidentiality !== 'restricted');
  const topFacts = new Retriever(llmFacts).search(claim.text, 4).map((r) => r.doc);
  if (!topFacts.length) return { ...deterministic, engine: 'deterministic' };

  const result = await chatJson({
    organizationId,
    category: 'claim_check',
    schema: zVerdict,
    system:
      'You are a precise brand-claims fact checker. Compare the claim with the approved facts. Verdicts: supported, contradicted, outdated, unsupported. Never invent facts. If no fact clearly supports the claim, answer unsupported. Numbers must match exactly. A fact past its expiry makes a matching claim outdated.',
    user: `Claim:\n<untrusted_content>${claim.text}</untrusted_content>\n\nApproved facts:\n${topFacts
      .map(
        (f, i) =>
          `[${i + 1}] ${f.statement}\nSource: ${f.source || 'n/a'}\nOwner: ${f.owner || 'n/a'}\nExpires: ${f.expires_at || 'never'}`
      )
      .join('\n\n')}\n\nReturn JSON: {"verdict":"supported|contradicted|outdated|unsupported","confidence":0-1,"explanation":"plain language","suggested_fix":"..."}.`,
  });

  if (!result) return { ...deterministic, engine: 'deterministic' };

  const match = topFacts[0] || null;
  return {
    verdict: result.data.verdict,
    confidence: result.data.confidence,
    explanation: result.data.explanation || deterministic.explanation,
    suggested_fix: result.data.suggested_fix || '',
    match,
    similarity: deterministic.similarity,
    engine: result.engine,
  };
}

export function factToRetrieverDoc(fact) {
  return {
    id: fact.id,
    statement: fact.statement,
    source: fact.source,
    owner: fact.owner,
    expires_at: fact.expires_at,
    tags: fact.tags ? String(fact.tags).split(',').map((t) => t.trim()).filter(Boolean) : [],
    confidentiality: fact.confidentiality,
  };
}
