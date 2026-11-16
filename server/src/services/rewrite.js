// server/src/services/rewrite.js
import { chatJson, isLlmAvailable } from './llmClient.js';

const SOFTEN = [
  [/\brevolutionary\b/gi, 'notably different'],
  [/\bgame[- ]changing\b/gi, 'significant'],
  [/\bworld[- ]class\b/gi, 'experienced'],
  [/\bguaranteed\b/gi, 'designed to'],
  [/\bthe best\b/gi, 'a strong'],
  [/\bthe fastest\b/gi, 'a fast'],
  [/\bthe cheapest\b/gi, 'an affordable'],
];

function deterministicRewrite(content, findings) {
  let text = String(content || '');
  const replacements = findings
    .filter((f) => f.suggested_fix && f.location)
    .slice(0, 20);
  for (const finding of replacements) {
    if (!finding.location) continue;
    const { start, end } = finding.location;
    if (typeof start !== 'number' || typeof end !== 'number') continue;
    const original = text.slice(start, end);
    const preferred = finding.suggested_fix.match(/“([^”]+)”/);
    if (preferred && finding.category === 'terminology' && original.toLowerCase() !== preferred[1].toLowerCase()) {
      text = `${text.slice(0, start)}${preferred[1]}${text.slice(end)}`;
    }
  }
  for (const [re, replacement] of SOFTEN) text = text.replace(re, replacement);
  return text.replace(/!{2,}/g, '!').replace(/\s+/g, ' ').trim();
}

export async function rewriteContent({ content, findings = [], organizationId, confidentiality, purpose }) {
  const deterministic = deterministicRewrite(content, findings);
  const canUseLlm = isLlmAvailable() && confidentiality !== 'restricted';
  if (!canUseLlm) {
    return {
      rewritten: deterministic,
      engine: 'deterministic',
      changes: findings.slice(0, 8).map((f) => ({ category: f.category, change: f.suggested_fix })),
    };
  }

  const result = await chatJson({
    organizationId,
    category: 'rewrite',
    maxTokens: 1400,
    system:
      'You are a brand editor. Rewrite the submitted content so it follows the listed findings while preserving the writer’s purpose and every factual detail. Do not invent facts. Reply with JSON: {"rewritten":"...","changes":[{"change":"...","reason":"..."}]}.',
    user: `Purpose: ${purpose || 'not stated'}\nFindings to address:\n${findings
      .slice(0, 12)
      .map((f, i) => `${i + 1}. [${f.category}/${f.severity}] ${f.title || f.explanation} — ${f.suggested_fix || 'no suggestion'}`)
      .join('\n')}\n\nContent:\n<untrusted_content>${content}</untrusted_content>`,
  });
  if (!result) {
    return { rewritten: deterministic, engine: 'deterministic', changes: [] };
  }
  return {
    rewritten: result.data.rewritten,
    engine: result.engine,
    changes: result.data.changes || [],
  };
}
