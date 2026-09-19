import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import { mkdirSync, rm } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { getDb, userWithCourses } from '../db.js';
import { requireAuth } from '../auth.js';
import { textField } from '../validate.js';
import { config } from '../../src/config.js';

const router = Router();
router.use(requireAuth);

mkdirSync(path.join(config.uploadsDir, 'avatars'), { recursive: true });

const avatarUpload = multer({
  limits: { fileSize: config.maxAvatarBytes },
});

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function avatarUrl(avatarPath) {
  return avatarPath ? `/uploads/avatars/${path.basename(avatarPath)}` : null;
}

function publicMe(full) {
  const { id, username, email, created_at, updated_at, display_name, bio, major, year, avatar_path, courses } = full;
  return {
    id,
    username,
    email,
    display_name,
    bio,
    major,
    year,
    avatar_url: avatarUrl(avatar_path),
    created_at,
    updated_at,
    courses,
  };
}

/** GET /api/me — current user with profile + courses. */
router.get('/', (req, res) => {
  const full = userWithCourses(req.user.id);
  if (!full) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: publicMe(full) });
});

/** PATCH /api/me — update profile fields. Users can only edit themselves. */
router.patch('/', (req, res) => {
  const body = req.body || {};
  const d = getDb();
  const profile = d.prepare('SELECT * FROM profiles WHERE user_id = ?').get(req.user.id);

  const updates = {};
  if (body.display_name !== undefined) {
    const { value, error } = textField(body.display_name, 'display_name', 60, { required: true });
    if (error) return res.status(400).json({ error: error });
    updates.display_name = value;
  }
  if (body.bio !== undefined) {
    const { value, error } = textField(body.bio, 'bio', 500);
    if (error) return res.status(400).json({ error: error });
    updates.bio = value;
  }
  if (body.major !== undefined) {
    const { value, error } = textField(body.major, 'major', 80);
    if (error) return res.status(400).json({ error: error });
    updates.major = value;
  }
  if (body.year !== undefined) {
    const allowed = ['', '1', '2', '3', '4', '5', '1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year', 'Graduate'];
    if (typeof body.year !== 'string' || !allowed.includes(body.year)) {
      return res.status(400).json({ error: 'year must be one of 1st Year, 2nd Year, 3rd Year, 4th Year, 5th Year, Graduate.' });
    }
    updates.year = body.year;
  }
  if (body.username !== undefined) {
    if (typeof body.username !== 'string' || !/^[a-zA-Z0-9_]{3,30}$/.test(body.username.trim())) {
      return res.status(400).json({ error: 'Username must be 3-30 characters (letters, numbers, underscore).' });
    }
    const u = body.username.trim();
    const clash = d.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(u, req.user.id);
    if (clash) return res.status(409).json({ error: 'That username is taken.' });
    updates.username = u;
  }

  if (Object.keys(updates).length > 0) {
    if (updates.username !== undefined) {
      d.prepare('UPDATE users SET username = ?, updated_at = strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\') WHERE id = ?').run(updates.username, req.user.id);
      delete updates.username;
    }
    if (Object.keys(updates).length > 0) {
      const sets = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
      d.prepare(`UPDATE profiles SET ${sets}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE user_id = ?`).run(
        ...Object.values(updates),
        req.user.id
      );
    }
  }
  res.json({ user: publicMe(userWithCourses(req.user.id)) });
});

/** POST /api/me/avatar — upload profile picture (jpeg/png/webp, <=5MB). */
router.post('/avatar', (req, res, next) => {
  avatarUpload.single('avatar')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Avatar is too large (max 5 MB).' });
      }
      return res.status(400).json({ error: 'Could not read the uploaded file.' });
    }
    next();
  });
}, async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Missing avatar file (field name: avatar).' });
  if (!config.allowedAvatarMime.includes(file.mimetype)) {
    return res.status(415).json({ error: 'Unsupported avatar format. Please upload a JPG, PNG or WebP image.' });
  }
  if (!file.buffer.length) return res.status(400).json({ error: 'The uploaded image is empty.' });
  const d = getDb();
  const profile = d.prepare('SELECT avatar_path FROM profiles WHERE user_id = ?').get(req.user.id);
  const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[file.mimetype];
  const name = `${req.user.id}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  const relPath = path.join('uploads', 'avatars', name);
  try {
    await writeFile(path.join(config.dataDir, relPath), file.buffer);
    d.prepare("UPDATE profiles SET avatar_path = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE user_id = ?").run(relPath, req.user.id);
    if (profile.avatar_path) {
      rm(path.join(config.dataDir, profile.avatar_path), { force: true }, () => {});
    }
    res.status(201).json({ avatar_url: `/uploads/avatars/${name}` });
  } catch (e) {
    console.error('avatar write failed:', e);
    res.status(500).json({ error: 'Failed to store avatar.' });
  }
});

export default router;
