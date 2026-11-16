// server/src/services/agents/terminology.js
export function runTerminologyAgent(context) {
  const { content = '', terms = [] } = context;
  const body = String(content);
  const findings = [];

  for (const term of terms) {
    if (!term.term) continue;
    const escaped = String(term.term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'gi');
    let match;
    while ((match = re.exec(body))) {
      // If the current word already equals the preferred spelling, skip it.
      if (term.preferred_term && match[0].toLowerCase() === term.preferred_term.toLowerCase()) {
        continue;
      }
      findings.push({
        category: 'terminology',
        finding_type: 'term_usage',
        severity: term.severity || 'warning',
        title: term.preferred_term
          ? `Use “${term.preferred_term}” instead of “${term.term}”`
          : `Check approved term: “${term.term}”`,
        explanation: term.definition
          ? term.definition
          : term.preferred_term
            ? `Your terminology list prefers “${term.preferred_term}” over “${term.term}”.`
            : 'This term is on your terminology list; confirm it is used with the approved meaning.',
        suggested_fix: term.preferred_term
          ? `Replace “${match[0]}” with “${term.preferred_term}”.`
          : 'Check the definition in the terminology list.',
        confidence: 0.95,
        engine: 'deterministic',
        location: { start: match.index, end: match.index + match[0].length },
        source_reference: `Terminology: ${term.term}`,
      });
    }
  }

  // Common inclusive-language patterns, only when a matching term exists.
  const inclusive = terms.filter((t) => /inclusive|inclusive language|respectful/i.test(`${t.category} ${t.definition}`));
  if (inclusive.length) {
    for (const rule of inclusive) {
      if (!rule.term) continue;
      const re = new RegExp(`\\b${String(rule.term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      let match;
      while ((match = re.exec(body))) {
        findings.push({
          category: 'terminology',
          finding_type: 'inclusive_language',
          severity: rule.severity || 'warning',
          title: `Consider “${rule.preferred_term || 'more inclusive wording'}”`,
          explanation: rule.definition || 'Inclusive-language guidance applies here.',
          suggested_fix: rule.preferred_term ? `Use “${rule.preferred_term}”.` : 'Rephrase in person-first, respectful language.',
          confidence: 0.9,
          engine: 'deterministic',
          location: { start: match.index, end: match.index + match[0].length },
          source_reference: `Terminology: ${rule.term}`,
        });
      }
    }
  }

  return findings;
}
