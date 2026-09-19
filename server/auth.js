import crypto from 'node:crypto';
import { getDb } from './db.js';
import { config } from '../src/config.js';

const SALT_LEN = 16;
const KEY_LEN = 32;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const COOKIE_NAME = 'session';

/** Hash a password with scrypt. Stored as scrypt$N$r$p$saltHex$hashHex. */
export function hashPassword(password) {
  const salt = crypto.randomBytes(SALT_LEN);
  const hash = crypto.scryptSync(password, salt, KEY_LEN, SCRYPT_PARAMS);
  return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** Constant-time password verification. */
export function verifyPassword(password, stored) {
  try {
    const [scheme, N, r, p, saltHex, hashHex] = String(stored).split('$');
    if (scheme !== 'scrypt') return false;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, salt, expected.length, { N: Number(N), r: Number(r), p: Number(p) });
    return crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

function sha256hex(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

/** Create a session row and return the raw token (set it as cookie). */
export function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + config.sessionTtlMs;
  getDb().prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(sha256hex(token), userId, expiresAt);
  return token;
}

export function destroySession(token) {
  if (!token) return;
  getDb().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256hex(token));
}

export function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

/**
 * Resolve the current user for a request, or null.
 * Also refreshes lazy session expiry (delete expired rows).
 */
export function getSessionUser(req) {
  const token = parseCookies(req)[COOKIE_NAME];
  if (!token) return null;
  const row = getDb().prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').get(sha256hex(token));
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    destroySession(token);
    return null;
  }
  return getDb().prepare('SELECT id, username, email, created_at, updated_at FROM users WHERE id = ?').get(row.user_id) || null;
}

export function requireAuth(req, res, next) {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  req.user = user;
  next();
}

export function setSessionCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(config.sessionTtlMs / 1000)}${secure}`);
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}
