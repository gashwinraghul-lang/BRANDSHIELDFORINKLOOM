// server/src/services/agents/accessibility.js
import { reviewImage } from '../imageEngine.js';

export async function runAccessibilityAgent(context) {
  const { submission, content = '' } = context;
  const findings = [];

  if (submission.content_type === 'image' && submission.file_path) {
    const { findings: imageFindings, analysis } = await reviewImage({
      filePath: submission.file_path,
      paletteHexes: [],
      logoAssets: [],
      enableOcr: true,
    });
    for (const f of imageFindings) {
      if (f.category === 'accessibility') findings.push(f);
    }
    return { findings, analysis };
  }

  const text = String(content || '');
  if (!text.trim()) return { findings, analysis: null };

  const paragraphs = text.split(/\n{2,}/);
  const walls = paragraphs.filter((p) => p.split(/\s+/).length > 120);
  if (walls.length) {
    findings.push({
      category: 'accessibility',
      finding_type: 'reading_wall',
      severity: 'suggestion',
      title: 'Long unbroken block of text',
      explanation: 'Blocks over 120 words are hard to scan. Breaking them up helps readers with dyslexia, ADHD and small screens.',
      suggested_fix: 'Split into shorter paragraphs and add a subheading.',
      confidence: 0.65,
      engine: 'deterministic',
      location: null,
      source_reference: 'Accessibility guidance (WCAG 2.1)',
    });
  }

  const caps = text.match(/\b[A-Z]{4,}\b/g);
  if (caps && caps.length >= 3) {
    findings.push({
      category: 'accessibility',
      finding_type: 'all_caps_readability',
      severity: 'warning',
      title: 'All-caps passages are harder to read',
      explanation: 'All caps remove word-shape cues and can be read as shouting by screen readers.',
      suggested_fix: 'Use sentence case and bold or headings for emphasis.',
      confidence: 0.85,
      engine: 'deterministic',
      location: null,
      source_reference: 'Accessibility guidance (WCAG 2.1)',
    });
  }

  const jargon = ['utilise', 'leverage', 'synergy', 'paradigm', 'holistic', 'best-in-class', 'robust solution'];
  for (const word of jargon) {
    const re = new RegExp(`\\b${word}\\b`, 'gi');
    let match;
    while ((match = re.exec(text))) {
      findings.push({
        category: 'accessibility',
        finding_type: 'jargon',
        severity: 'info',
        title: `Jargon: “${match[0]}”`,
        explanation: 'Plain words are understood by more people and translate better.',
        suggested_fix: 'Try “use”, “combine”, “complete” or a concrete description instead.',
        confidence: 0.6,
        engine: 'deterministic',
        location: { start: match.index, end: match.index + match[0].length },
        source_reference: 'Plain-language guidance',
      });
    }
  }

  return { findings, analysis: null };
}
