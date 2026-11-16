// server/src/lib/upload.js
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import config from '../config.js';

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export const STORAGE = {
  uploads: ensureDir(path.join(config.storageDir, 'uploads')),
  assets: ensureDir(path.join(config.storageDir, 'assets')),
  tmp: ensureDir(path.join(config.storageDir, 'tmp')),
};

const ALLOWED = new Set([
  '.txt', '.md', '.markdown', '.html', '.htm', '.csv', '.json',
  '.docx', '.pdf',
  '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg',
]);

function makeStorage(folder) {
  return multer.diskStorage({
    destination(req, file, cb) {
      cb(null, folder);
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
    },
  });
}

function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED.has(ext)) {
    return cb(Object.assign(new Error(`Unsupported file type: ${ext || 'unknown'}`), { status: 415 }));
  }
  return cb(null, true);
}

export const uploadSubmission = multer({
  storage: makeStorage(STORAGE.uploads),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter,
});

export const uploadAsset = multer({
  storage: makeStorage(STORAGE.assets),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter,
});

export const uploadImport = multer({
  storage: makeStorage(STORAGE.tmp),
  limits: { fileSize: 15 * 1024 * 1024, files: 1 },
  fileFilter,
});

export function removeFile(filePath) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    /* best effort */
  }
}
