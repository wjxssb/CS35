import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// NB: new URL(...).pathname is percent-encoded and would break on non-ASCII
// project paths containing Unicode characters; fileURLToPath decodes them properly.
const DEFAULT_DATA_DIR = fileURLToPath(new URL('../data/', import.meta.url));
const DATA_DIR = process.env.DATA_DIR || DEFAULT_DATA_DIR;

export const config = {
  port: Number(process.env.PORT || 3000),
  databasePath: process.env.DATABASE_PATH || path.join(DATA_DIR, 'app.db'),
  uploadsDir: process.env.UPLOADS_DIR || path.join(DATA_DIR, 'uploads'),
  sessionSecret: process.env.SESSION_SECRET || 'dev-session-secret-change-me',
  sessionTtlMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  maxUploadBytes: 10 * 1024 * 1024,
  maxAvatarBytes: 5 * 1024 * 1024,
  allowedImageMime: ['image/jpeg', 'image/png', 'image/webp'],
  allowedAvatarMime: ['image/jpeg', 'image/png', 'image/webp'],
  tesseractBin: process.env.TESSERACT_BIN || 'tesseract',
  dataDir: DATA_DIR,
  newId: randomUUID,
};
