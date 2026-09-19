import { Router } from 'express';
import crypto from 'node:crypto';
import { getDb, userWithCourses } from '../db.js';
import { hashPassword, verifyPassword, createSession, destroySession, setSessionCookie, clearSessionCookie, getSessionUser } from '../auth.js';
import { isEmail, isUsername } from '../validate.js';

const router = Router();

function publicUser(user) {
  // Never expose email or password material to the client's other contexts.
  const { password_hash, ...rest } = user || {};
  return rest;
}

router.post('/register', (req, res) => {
  const { username, email, password } = req.body || {};
  if (!isUsername(username)) {
    return res.status(400).json({ error: 'Username must be 3-30 characters (letters, numbers, underscore).' });
  }
  if (!isEmail(email)) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters.' });
  }
  const d = getDb();
  const exists =
    d.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
  if (exists) {
    return res.status(409).json({ error: 'A user with that username or email already exists.' });
  }
  const id = crypto.randomUUID();
  const passwordHash = hashPassword(password);
  d.prepare('INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)').run(id, username, email, passwordHash);
  d.prepare('INSERT INTO profiles (user_id, display_name) VALUES (?, ?)').run(id, username);
  const token = createSession(id);
  setSessionCookie(res, token);
  res.status(201).json({ user: publicUser({ id, username, email, created_at: new Date().toISOString() }) });
});

router.post('/login', (req, res) => {
  const { identifier, password } = req.body || {};
  if (typeof identifier !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Please provide your email/username and password.' });
  }
  const d = getDb();
  const row = d
    .prepare('SELECT id, username, email, password_hash, created_at FROM users WHERE username = ? OR email = ?')
    .get(identifier.trim(), identifier.trim());
  if (!row || !verifyPassword(password, row.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }
  const token = createSession(row.id);
  setSessionCookie(res, token);
  res.json({ user: { id: row.id, username: row.username, email: row.email, created_at: row.created_at } });
});

router.post('/logout', (req, res) => {
  const token = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith('session='));
  if (token) {
    destroySession(decodeURIComponent(token.slice('session='.length)));
  }
  clearSessionCookie(res);
  res.json({ ok: true });
});

export default router;
