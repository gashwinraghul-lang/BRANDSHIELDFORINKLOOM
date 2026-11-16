// server/src/services/agents/tone.js
import { splitSentences } from '../claims.js';

const HYPE = [
  { re: /\b(revolutionary|game[- ]changing|world[- ]class|unparalleled|cutting[- ]edge|disruptive)\b/gi, fix: 'Say what is new in concrete, plain language.' },
  { re: /\b(guaranteed|risk[- ]free|no[- ]risk|100% safe)\b/gi, fix: 'Remove absolute promises unless an approved fact supports them.' },
  { re: /\b(cheapest|best in the world|the only|number one)\b/gi, fix: 'Use a specific, evidence-backed benefit instead of a superlative.' },
  { re: /\b(obviously|clearly|everyone knows|just)\b/gi, fix: 'Remove wording that talks down to the reader.' },
];

function parseToneRules(guidelines) {
  const rules = [];
  for (const g of guidelines) {
    const lines = String(g.content || '').split(/\n+/);
    for (const line of lines) {
      const match = line.match(/(?:avoid|never use|do not use|don't use|banned words?)[:\s-]+(.{2,160})/i);
      if (match) {
        const body = match[1].replace(/[.;]+$/, '').trim();
        for (const phrase of body.split(/,\s*|\s+or\s+/)) {
          const clean = phrase.replace(/^["'“]|["'”]$/g, '').trim();
          if (clean.length >= 2 && clean.length <= 60) rules.push({ phrase: clean, guideline: g });
        }
      }
    }
  }
  return rules;
}

export function runToneAgent(context) {
  const { content = '', guidelines = [] } = context;
  const findings = [];
  const body = String(content);
  const sentences = splitSentences(body);
  const rules = parseToneRules(guidelines);

  for (const rule of rules) {
    const re = new RegExp(`\\b${rule.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    let match;
    while ((match = re.exec(body))) {
      findings.push({
        category: 'tone',
        finding_type: 'banned_phrase',
        severity: 'warning',
        title: `Banned phrase: “${rule.phrase}”`,
        explanation: `The guideline “${rule.guideline.title}” asks writers to avoid this phrase. It can read as hype or make a promise the brand cannot keep.`,
        suggested_fix: 'Remove the phrase or replace it with a concrete, verifiable benefit.',
        confidence: 0.9,
        engine: 'deterministic',
        location: { start: match.index, end: match.index + match[0].length },
        source_reference: `Guideline: ${rule.guideline.title} (v${rule.guideline.version})`,
        guideline_id: rule.guideline.id,
        guideline_version_id: rule.guideline.version_id,
      });
    }
  }

  for (const entry of HYPE) {
    entry.re.lastIndex = 0;
    let match;
    while ((match = entry.re.exec(body))) {
      findings.push({
        category: 'tone',
        finding_type: 'hype_language',
        severity: 'suggestion',
        title: `Hype language: “${match[0]}”`,
        explanation: 'This wording is hard to prove and often weakens trust. A specific benefit is stronger.',
        suggested_fix: entry.fix,
        confidence: 0.72,
        engine: 'deterministic',
        location: { start: match.index, end: match.index + match[0].length },
        source_reference: 'Brand tone guidance',
      });
    }
  }

  const exclamations = (body.match(/!/g) || []).length;
  if (exclamations >= 2) {
    findings.push({
      category: 'tone',
      finding_type: 'excessive_punctuation',
      severity: 'suggestion',
      title: 'Lots of exclamation marks',
      explanation: `${exclamations} exclamation marks can feel shouty. Most brand tone guides recommend at most one.`,
      suggested_fix: 'Keep one exclamation mark at most; let the sentence carry the energy.',
      confidence: 0.8,
      engine: 'deterministic',
      location: null,
      source_reference: 'Brand tone guidance',
    });
  }

  const caps = [...body.matchAll(/\b[A-Z]{3,}\b/g)].filter(
    (m) => !['API', 'URL', 'PDF', 'CSV', 'FAQ', 'SLA', 'CRM', 'GDPR', 'AI', 'LLM', 'OK'].includes(m[0])
  );
  if (caps.length >= 2) {
    findings.push({
      category: 'tone',
      finding_type: 'all_caps',
      severity: 'suggestion',
      title: 'Words in ALL CAPS',
      explanation: `${caps.length} all-caps words can read as shouting and are harder to read, especially for screen-reader users.`,
      suggested_fix: 'Use sentence case and emphasis instead of all caps.',
      confidence: 0.85,
      engine: 'deterministic',
      location: { start: caps[0].index, end: caps[0].index + caps[0][0].length },
      source_reference: 'Accessibility and tone guidance',
    });
  }

  const long = sentences.filter((s) => s.text.split(/\s+/).length > 32);
  if (long.length) {
    findings.push({
      category: 'tone',
      finding_type: 'long_sentence',
      severity: 'info',
      title: 'Very long sentence',
      explanation: `One sentence has ${long[0].text.split(/\s+/).length} words. Short sentences are easier to scan.`,
      suggested_fix: 'Split it into two shorter sentences.',
      confidence: 0.7,
      engine: 'deterministic',
      location: { start: long[0].start, end: long[0].end },
      source_reference: 'Plain-language guidance',
    });
  }

  return findings;
}
