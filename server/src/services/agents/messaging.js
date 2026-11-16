// server/src/services/agents/messaging.js
function parseMessagingRules(guidelines) {
  const required = [];
  const banned = [];
  for (const g of guidelines) {
    const lines = String(g.content || '').split(/\n+/);
    for (const line of lines) {
      const must = line.match(/(?:must|should|always) (?:include|mention|state|say|add)[:\s-]+(.{3,200})/i);
      if (must) {
        required.push({ text: must[1].replace(/[.;]+$/, '').trim(), guideline: g });
      }
      const never = line.match(/(?:never|do not|don't|avoid) (?:say|include|mention|promise|use)[:\s-]+(.{2,200})/i);
      if (never) {
        banned.push({ text: never[1].replace(/[.;]+$/, '').trim(), guideline: g });
      }
    }
  }
  return { required, banned };
}

function normalise(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function runMessagingAgent(context) {
  const { content = '', guidelines = [] } = context;
  const body = String(content);
  const normalisedBody = normalise(body);
  const { required, banned } = parseMessagingRules(guidelines);
  const findings = [];

  for (const rule of required) {
    const phrase = normalise(rule.text);
    if (!phrase) continue;
    const words = phrase.split(' ').filter((w) => w.length > 3);
    const present = words.length
      ? words.every((w) => normalisedBody.includes(w))
      : normalisedBody.includes(phrase);
    if (!present) {
      findings.push({
        category: 'messaging',
        finding_type: 'missing_message',
        severity: 'warning',
        title: 'Required message may be missing',
        explanation: `The guideline “${rule.guideline.title}” says this content should include: “${rule.text}”.`,
        suggested_fix: `Add a natural sentence that includes “${rule.text}”.`,
        confidence: 0.65,
        engine: 'deterministic',
        location: null,
        source_reference: `Guideline: ${rule.guideline.title} (v${rule.guideline.version})`,
        guideline_id: rule.guideline.id,
        guideline_version_id: rule.guideline.version_id,
      });
    }
  }

  for (const rule of banned) {
    const phrase = normalise(rule.text);
    if (!phrase) continue;
    const index = normalisedBody.indexOf(phrase);
    if (index >= 0) {
      findings.push({
        category: 'messaging',
        finding_type: 'banned_message',
        severity: 'warning',
        title: 'Off-brand message',
        explanation: `The guideline “${rule.guideline.title}” asks writers not to use: “${rule.text}”.`,
        suggested_fix: 'Remove or rephrase this message.',
        confidence: 0.8,
        engine: 'deterministic',
        location: null,
        source_reference: `Guideline: ${rule.guideline.title} (v${rule.guideline.version})`,
        guideline_id: rule.guideline.id,
        guideline_version_id: rule.guideline.version_id,
      });
    }
  }

  return findings;
}
