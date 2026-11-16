// server/src/services/agents/visual.js
import { reviewImage } from '../imageEngine.js';

export async function runVisualAgent(context) {
  const { submission, assets = [], tolerance = 12 } = context;
  if (submission.content_type !== 'image' || !submission.file_path) {
    return { findings: [], analysis: null };
  }
  const palette = assets
    .filter((a) => a.type === 'palette' && a.confidentiality !== 'restricted')
    .flatMap((a) => String(a.hex_values || '').split(/[,\s]+/).filter(Boolean));
  const logos = assets.filter((a) => a.type === 'logo' && a.file_path);

  const { findings, analysis } = await reviewImage({
    filePath: submission.file_path,
    paletteHexes: palette,
    logoAssets: logos,
    tolerance,
    enableOcr: false,
  });
  return { findings, analysis };
}
