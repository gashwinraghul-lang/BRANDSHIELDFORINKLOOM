// server/src/services/imageEngine.js
// Pixel-level checks: palette compliance (CIEDE2000), WCAG text contrast
// (OCR word boxes) and logo verification (normalised cross-correlation).
// Everything runs locally with sharp; OCR is optional and degrades gracefully.
import sharp from 'sharp';
import { differenceCiede2000, parse } from 'culori';

const ciede2000 = differenceCiede2000();

function toHex(r, g, b) {
  const h = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`.toUpperCase();
}

function hexToRgb(hex) {
  const parsed = parse(hex);
  if (!parsed) return null;
  return {
    r: Math.round((parsed.r ?? 0) * 255),
    g: Math.round((parsed.g ?? 0) * 255),
    b: Math.round((parsed.b ?? 0) * 255),
  };
}

export function colourDistance(hexA, hexB) {
  const a = parse(hexA);
  const b = parse(hexB);
  if (!a || !b) return Infinity;
  return ciede2000(a, b);
}

/** Relative luminance per WCAG 2.1. */
export function luminance({ r, g, b }) {
  const channel = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(rgbA, rgbB) {
  const l1 = luminance(rgbA);
  const l2 = luminance(rgbB);
  const light = Math.max(l1, l2);
  const dark = Math.min(l1, l2);
  return (light + 0.05) / (dark + 0.05);
}

export async function extractPalette(filePath, buckets = 6) {
  const { data, info } = await sharp(filePath)
    .resize(120, 120, { fit: 'inside' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const counts = new Map();
  for (let i = 0; i < data.length; i += info.channels) {
    const a = info.channels === 4 ? data[i + 3] : 255;
    if (a < 40) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // 4-bit per channel quantisation keeps the palette small and stable.
    const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
    const entry = counts.get(key) || { r: 0, g: 0, b: 0, n: 0 };
    entry.r += r;
    entry.g += g;
    entry.b += b;
    entry.n += 1;
    counts.set(key, entry);
  }

  const total = [...counts.values()].reduce((sum, c) => sum + c.n, 0) || 1;
  return [...counts.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, buckets)
    .map((c) => ({
      hex: toHex(c.r / c.n, c.g / c.n, c.b / c.n),
      share: c.n / total,
      rgb: {
        r: Math.round(c.r / c.n),
        g: Math.round(c.g / c.n),
        b: Math.round(c.b / c.n),
      },
    }));
}

export function comparePalette(dominant, approvedHexes, tolerance = 12) {
  const approved = approvedHexes.map((h) => h.trim()).filter(Boolean);
  if (!approved.length) return [];
  return dominant
    .map((colour) => {
      let nearest = approved[0];
      let distance = Infinity;
      for (const candidate of approved) {
        const d = colourDistance(colour.hex, candidate);
        if (d < distance) {
          distance = d;
          nearest = candidate;
        }
      }
      return { ...colour, nearest, distance };
    })
    .filter((c) => c.share >= 0.035 && c.distance > tolerance)
    .sort((a, b) => b.share - a.share);
}

async function ocrWords(filePath) {
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', 1, { logger: () => {} });
    try {
      const { data } = await worker.recognize(filePath);
      return (data.words || [])
        .filter((w) => w.text && w.text.trim().length > 1)
        .map((w) => ({
          text: w.text.trim(),
          bbox: w.bbox,
          confidence: w.confidence,
        }));
    } finally {
      await worker.terminate();
    }
  } catch (err) {
    return { error: err.message };
  }
}

async function regionColours(filePath, bbox, meta) {
  const left = Math.max(0, Math.round(bbox.x0));
  const top = Math.max(0, Math.round(bbox.y0));
  const width = Math.min(meta.width - left, Math.max(2, Math.round(bbox.x1 - bbox.x0)));
  const height = Math.min(meta.height - top, Math.max(2, Math.round(bbox.y1 - bbox.y0)));
  if (width <= 0 || height <= 0) return null;
  const { data, info } = await sharp(filePath)
    .extract({ left, top, width, height })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const colours = new Map();
  for (let i = 0; i < data.length; i += info.channels) {
    const key = `${data[i] >> 3}-${data[i + 1] >> 3}-${data[i + 2] >> 3}`;
    const entry = colours.get(key) || { r: 0, g: 0, b: 0, n: 0 };
    entry.r += data[i];
    entry.g += data[i + 1];
    entry.b += data[i + 2];
    entry.n += 1;
    colours.set(key, entry);
  }
  const sorted = [...colours.values()].sort((a, b) => b.n - a.n);
  if (!sorted.length) return null;
  const bg = sorted[0];
  const bgRgb = { r: bg.r / bg.n, g: bg.g / bg.n, b: bg.b / bg.n };
  let fg = null;
  let bestDistance = -1;
  for (const c of sorted.slice(1)) {
    const rgb = { r: c.r / c.n, g: c.g / c.n, b: c.b / c.n };
    const d = colourDistance(toHex(rgb.r, rgb.g, rgb.b), toHex(bgRgb.r, bgRgb.g, bgRgb.b));
    if (d > bestDistance) {
      bestDistance = d;
      fg = rgb;
    }
  }
  if (!fg) return null;
  return {
    background: toHex(bgRgb.r, bgRgb.g, bgRgb.b),
    foreground: toHex(fg.r, fg.g, fg.b),
    ratio: contrastRatio(fg, bgRgb),
  };
}

async function grayscaleGrid(filePath, size = 128) {
  const { data, info } = await sharp(filePath)
    .resize(size, size, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function normalisedPatchCorrelation(image, logo) {
  const n = logo.length;
  let best = { score: -1, x: 0, y: 0 };
  for (let y = 0; y <= image.height - n; y += 2) {
    for (let x = 0; x <= image.width - n; x += 2) {
      let sumI = 0;
      let sumL = 0;
      let sumII = 0;
      let sumLL = 0;
      let sumIL = 0;
      for (let ly = 0; ly < n; ly += 1) {
        for (let lx = 0; lx < n; lx += 1) {
          const iv = image.data[(y + ly) * image.width + (x + lx)] / 255;
          const lv = logo[ly * n + lx] / 255;
          sumI += iv;
          sumL += lv;
          sumII += iv * iv;
          sumLL += lv * lv;
          sumIL += iv * lv;
        }
      }
      const count = n * n;
      const meanI = sumI / count;
      const meanL = sumL / count;
      const cov = sumIL / count - meanI * meanL;
      const varI = sumII / count - meanI * meanI;
      const varL = sumLL / count - meanL * meanL;
      const denom = Math.sqrt(Math.max(varI, 1e-6) * Math.max(varL, 1e-6));
      const score = cov / denom;
      if (score > best.score) best = { score, x, y };
    }
  }
  return best;
}

export async function verifyLogo(filePath, logoPath, options = {}) {
  try {
    const sizes = [16, 24, 32];
    let best = { score: -1, size: 0, x: 0, y: 0 };
    for (const size of sizes) {
      const { data: logo } = await sharp(logoPath)
        .resize(size, size, { fit: 'fill' })
        .grayscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      const image = await grayscaleGrid(filePath, 160);
      const result = normalisedPatchCorrelation(image, logo);
      if (result.score > best.score) best = { ...result, size };
    }

    const logoPalette = await extractPalette(logoPath, 3);
    const imagePalette = await extractPalette(filePath, 6);
    const logoColour = logoPalette[0]?.hex;
    let colourGap = Infinity;
    if (logoColour) {
      for (const colour of imagePalette) {
        const d = colourDistance(colour.hex, logoColour);
        if (d < colourGap) colourGap = d;
      }
    }

    const confidence = Math.max(0, Math.min(1, (best.score + 1) / 2));
    const threshold = options.threshold ?? 0.82;
    let verdict = 'could_not_verify';
    if (best.score >= threshold) verdict = 'approved';
    else if (best.score >= 0.55) verdict = colourGap > 14 ? 'altered' : 'approved';

    return {
      verdict,
      confidence: Number(confidence.toFixed(2)),
      correlation: Number(best.score.toFixed(3)),
      colourGap: Number.isFinite(colourGap) ? Number(colourGap.toFixed(1)) : null,
      region: { x: best.x, y: best.y, size: best.size },
    };
  } catch (err) {
    return { verdict: 'could_not_verify', confidence: 0, error: err.message };
  }
}

/**
 * Full image review. Returns findings (not persisted) plus analysis metadata.
 */
export async function reviewImage({
  filePath,
  paletteHexes = [],
  logoAssets = [],
  tolerance = 12,
  enableOcr = true,
}) {
  const meta = await sharp(filePath).metadata();
  const dominant = await extractPalette(filePath, 6);
  const findings = [];
  const analysis = { dominant, width: meta.width, height: meta.height };

  const offPalette = comparePalette(dominant, paletteHexes, tolerance);
  if (offPalette.length) {
    findings.push({
      category: 'visual',
      finding_type: 'palette_compliance',
      severity: 'warning',
      title: 'Colours outside the approved palette',
      explanation: `I found ${offPalette.length} prominent colour${offPalette.length > 1 ? 's' : ''} that are not close enough to the approved brand palette. This is a suggestion: confirm whether the difference is intentional for this campaign.`,
      suggested_fix: `Nearest approved colours: ${offPalette
        .slice(0, 3)
        .map((c) => `${c.hex} → ${c.nearest}`)
        .join(', ')}.`,
      confidence: 0.82,
      engine: 'deterministic',
      region: null,
      evidence: {
        type: 'palette',
        tolerance,
        colours: offPalette.map((c) => ({
          hex: c.hex,
          share: Number((c.share * 100).toFixed(1)),
          nearest: c.nearest,
          distance: Number(c.distance.toFixed(1)),
        })),
      },
    });
  }

  if (logoAssets.length) {
    for (const asset of logoAssets.slice(0, 3)) {
      if (!asset.file_path) continue;
      const logo = await verifyLogo(filePath, asset.file_path);
      const copy = {
        approved: {
          severity: 'info',
          title: 'Approved logo detected',
          explanation: 'The approved logo appears to be present and unmodified.',
        },
        altered: {
          severity: 'warning',
          title: 'Logo present but altered',
          explanation:
            'A logo is present but its colours or proportions differ from the approved asset. Confirm the version before publishing.',
        },
        could_not_verify: {
          severity: 'suggestion',
          title: 'Could not verify the logo',
          explanation:
            'I could not confidently match this image to an approved logo. This is not an error; please check manually.',
        },
      }[logo.verdict];
      findings.push({
        category: 'visual',
        finding_type: 'logo_verification',
        severity: copy.severity,
        title: copy.title,
        explanation: copy.explanation,
        suggested_fix:
          logo.verdict === 'altered'
            ? `Use the approved asset “${asset.name}”.`
            : logo.verdict === 'could_not_verify'
              ? 'Upload the logo asset to the knowledge base so future checks are more accurate.'
              : '',
        confidence: logo.confidence,
        engine: 'deterministic',
        asset_id: asset.id,
        region: logo.region,
        evidence: { type: 'logo', assetId: asset.id, assetName: asset.name, ...logo },
      });
    }
  }

  if (enableOcr) {
    const words = await ocrWords(filePath);
    if (Array.isArray(words) && words.length) {
      const checked = [];
      for (const word of words.slice(0, 120)) {
        const colours = await regionColours(filePath, word.bbox, meta);
        if (!colours) continue;
        const height = word.bbox.y1 - word.bbox.y0;
        const isLarge = height >= 24;
        const required = isLarge ? 3 : 4.5;
        if (colours.ratio < required) {
          checked.push({
            text: word.text,
            ratio: Number(colours.ratio.toFixed(2)),
            required,
            foreground: colours.foreground,
            background: colours.background,
            region: {
              x: word.bbox.x0,
              y: word.bbox.y0,
              width: word.bbox.x1 - word.bbox.x0,
              height: word.bbox.y1 - word.bbox.y0,
            },
          });
        }
      }
      analysis.contrastChecked = words.length;
      if (checked.length) {
        const unique = checked
          .sort((a, b) => a.ratio - b.ratio)
          .filter((c, i, arr) => arr.findIndex((x) => x.text === c.text) === i)
          .slice(0, 5);
        findings.push({
          category: 'accessibility',
          finding_type: 'text_contrast',
          severity: 'warning',
          title: 'Low text contrast',
          explanation: `Estimated contrast for ${unique.length} text region${unique.length > 1 ? 's' : ''} is below WCAG 2.1 AA. Measurements are pixel estimates, so treat them as a prompt to check, not a formal audit.`,
          suggested_fix: `Increase contrast, for example: ${unique
            .slice(0, 2)
            .map((c) => `“${c.text}” ${c.foreground} on ${c.background} (${c.ratio}:1 → needs ${c.required}:1)`)
            .join('; ')}.`,
          confidence: 0.7,
          engine: 'deterministic',
          region: unique[0].region,
          evidence: { type: 'contrast', regions: unique },
        });
      }
    } else if (words && words.error) {
      analysis.ocrWarning = `OCR unavailable: ${words.error}`;
    }
  }

  return { findings, analysis };
}
