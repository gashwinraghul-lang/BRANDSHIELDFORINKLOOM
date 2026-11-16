// server/src/services/extract.js
import fs from 'node:fs/promises';
import path from 'node:path';

const TEXT_EXT = new Set(['.txt', '.md', '.markdown', '.html', '.htm', '.csv', '.json']);

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function extractText(filePath, originalName = '', mimeType = '') {
  const ext = path.extname(originalName || filePath).toLowerCase();
  const buffer = await fs.readFile(filePath);

  if (TEXT_EXT.has(ext) || mimeType.startsWith('text/')) {
    const raw = buffer.toString('utf8');
    if (ext === '.html' || ext === '.htm' || mimeType === 'text/html') return stripHtml(raw);
    return raw;
  }

  if (ext === '.docx') {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  }

  if (ext === '.pdf') {
    const mod = await import('pdf-parse');
    const pdfParse = mod.default || mod;
    const result = await pdfParse(buffer);
    return result.text || '';
  }

  throw Object.assign(new Error('Unsupported file type. Use text, markdown, HTML, DOCX or PDF.'), {
    status: 415,
    code: 'UNSUPPORTED_FILE',
  });
}

export function isImage(mimeType = '', name = '') {
  const ext = path.extname(name).toLowerCase();
  return mimeType.startsWith('image/') || ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(ext);
}
