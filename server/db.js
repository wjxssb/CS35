import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { config } from '../src/config.js';

let db = null;

export function getDb() {
  if (!db) {
    mkdirSync(dirname(config.databasePath), { recursive: true });
    db = new DatabaseSync(config.databasePath);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA foreign_keys = ON;');
    migrate(db);
  }
  return db;
}

export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL DEFAULT '',
      bio TEXT NOT NULL DEFAULT '',
      major TEXT NOT NULL DEFAULT '',
      year TEXT NOT NULL DEFAULT '',
      avatar_path TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS courses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      course_code TEXT NOT NULL,
      course_name TEXT NOT NULL DEFAULT '',
      instructor TEXT NOT NULL DEFAULT '',
      section TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      term TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      days TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      location TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS schedule_uploads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      original_filename TEXT NOT NULL DEFAULT '',
      storage_path TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      raw_text TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS schedule_candidates (
      id TEXT PRIMARY KEY,
      upload_id TEXT NOT NULL REFERENCES schedule_uploads(id) ON DELETE CASCADE,
      course_code TEXT NOT NULL DEFAULT '',
      course_name TEXT NOT NULL DEFAULT '',
      instructor TEXT NOT NULL DEFAULT '',
      section TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      term TEXT NOT NULL DEFAULT '',
      days TEXT NOT NULL DEFAULT '',
      start_time TEXT NOT NULL DEFAULT '',
      end_time TEXT NOT NULL DEFAULT '',
      confidence REAL NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_courses_user ON courses(user_id);
    CREATE INDEX IF NOT EXISTS idx_meetings_course ON meetings(course_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_candidates_upload ON schedule_candidates(upload_id);
  `);
}

// ---------- row mappers ----------

export function rowToCourse(row) {
  const meetings = getDb().prepare('SELECT id, days, start_time, end_time, location FROM meetings WHERE course_id = ? ORDER BY start_time').all(row.id);
  return {
    id: row.id,
    course_code: row.course_code,
    course_name: row.course_name,
    instructor: row.instructor,
    section: row.section,
    location: row.location,
    term: row.term,
    created_at: row.created_at,
    updated_at: row.updated_at,
    meetings: meetings.map((m) => ({ id: m.id, days: m.days, start_time: m.start_time, end_time: m.end_time, location: m.location })),
  };
}

export function userWithCourses(userId) {
  const d = getDb();
  const user = d.prepare('SELECT id, username, email, created_at, updated_at FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  const profile = d.prepare('SELECT display_name, bio, major, year, avatar_path FROM profiles WHERE user_id = ?').get(userId);
  const courses = d.prepare('SELECT * FROM courses WHERE user_id = ? ORDER BY course_code').all(userId).map(rowToCourse);
  return { ...user, ...profile, courses };
}

/** All users with profile + courses (for matching). Internal IDs included;
 *  callers must sanitize before responding. */
export function allUsersWithCourses() {
  return getDb()
    .prepare('SELECT id, username, email, created_at, updated_at FROM users')
    .all()
    // NB: map the id, not the row object — node:sqlite would treat a plain
    // object argument as a named-parameter bag.
    .map((u) => userWithCourses(u.id));
}
