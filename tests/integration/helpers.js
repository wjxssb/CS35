import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/**
 * Boot the real Express app against a throwaway SQLite database.
 * Must be called before importing anything that reads config.
 */
export async function startServer() {
  const dir = mkdtempSync(path.join(tmpdir(), '35l-int-'));
  process.env.DATA_DIR = dir;
  process.env.DATABASE_PATH = path.join(dir, 'test.db');
  process.env.UPLOADS_DIR = path.join(dir, 'uploads');
  process.env.SESSION_SECRET = 'test-secret';

  const [{ createApp }, { config }] = await Promise.all([
    import('../../server/app.js'),
    import('../../src/config.js'),
  ]);
  const app = createApp();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base, config, dataDir: dir };
}

export async function registerUser(base, { username, email, password = 'password123' }) {
  const res = await fetch(`${base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password }),
  });
  if (!res.ok) throw new Error(`register ${username} failed: ${res.status} ${await res.text()}`);
  const cookie = (res.headers.get('set-cookie') || '').split(';')[0];
  return { cookie, user: (await res.json()).user };
}

export async function addCourse(base, cookie, course) {
  const res = await fetch(`${base}/api/courses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify(course),
  });
  if (!res.ok) throw new Error(`addCourse failed: ${res.status} ${await res.text()}`);
  return (await res.json()).course;
}

export const CS35L = {
  course_code: 'CS 35L',
  course_name: 'Intro to Programming in Python',
  instructor: 'Paul R. Eggert',
  meetings: [{ days: ['MON', 'WED'], start_time: '14:00', end_time: '15:50' }],
};
export const CS111 = {
  course_code: 'CS 111',
  instructor: 'Christian Reiher',
  meetings: [{ days: ['TUE', 'THU'], start_time: '10:00', end_time: '11:50' }],
};
export const MATH131A = {
  course_code: 'MATH 131A',
  instructor: 'D. G. Lu',
  meetings: [{ days: ['MON', 'WED'], start_time: '13:00', end_time: '14:50' }],
};
