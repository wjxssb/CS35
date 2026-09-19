import { WEEKDAYS } from '../src/timeutil.js';
import { normalizeCourse } from '../src/courseutil.js';
import { getDb } from './db.js';

export function isEmail(s) {
  return typeof s === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) && s.length <= 254;
}

export function isUsername(s) {
  return typeof s === 'string' && /^[a-zA-Z0-9_]{3,30}$/.test(s);
}

/** Trim and bound a string field. Returns { value, error }. */
export function textField(input, field, max, { required = false } = {}) {
  if (input == null || input === '') {
    if (required) return { value: null, error: `${field} is required.` };
    return { value: '', error: null };
  }
  if (typeof input !== 'string') return { value: null, error: `${field} must be a string.` };
  const v = input.trim();
  if (v.length > max) return { value: null, error: `${field} is too long (max ${max}).` };
  return { value: v, error: null };
}

export function isValidDayList(days) {
  if (!Array.isArray(days) || days.length === 0 || days.length > 7) return false;
  return days.every((d) => typeof d === 'string' && WEEKDAYS.includes(d.toUpperCase()));
}

/**
 * Validate a meetings array from a course payload.
 * Returns { meetings: [{days, start_time, end_time, location}], error }.
 * Times are stored as 24h "HH:MM".
 */
export function parseMeetings(input) {
  if (input == null) return { meetings: [], error: null };
  if (!Array.isArray(input)) return { meetings: [], error: 'meetings must be an array.' };
  if (input.length > 6) return { meetings: [], error: 'A course can have at most 6 meetings.' };
  const meetings = [];
  for (let i = 0; i < input.length; i++) {
    const m = input[i] || {};
    if (!isValidDayList(m.days)) {
      return { meetings: [], error: `Meeting ${i + 1}: invalid days. Use codes like MON, TUE, WED, THU, FRI.` };
    }
    const start = normalizeTime(m.start_time);
    const end = normalizeTime(m.end_time);
    if (start === null) return { meetings: [], error: `Meeting ${i + 1}: invalid start_time (use HH:MM).` };
    if (end === null) return { meetings: [], error: `Meeting ${i + 1}: invalid end_time (use HH:MM).` };
    if (start === end) return { meetings: [], error: `Meeting ${i + 1}: start and end time must differ.` };
    const location = typeof m.location === 'string' ? m.location.slice(0, 80) : '';
    meetings.push({
      days: m.days.map((d) => d.toUpperCase()),
      start_time: start,
      end_time: end,
      location,
    });
  }
  // Reject exact duplicate meetings (same days + same time window).
  const seen = new Set();
  for (const m of meetings) {
    const key = `${[...m.days].sort().join(',')}|${m.start_time}|${m.end_time}|${m.location}`;
    if (seen.has(key)) return { meetings: [], error: 'Duplicate meeting (same days and time).' };
    seen.add(key);
  }
  return { meetings, error: null };
}

/** Normalize "HH:MM" or "HH:MM:SS" to "HH:MM". Returns null when invalid. */
export function normalizeTime(s) {
  if (typeof s !== 'string') return null;
  const m = s.trim().match(/^([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}`;
}

/**
 * Duplicate guard: same course code (normalized) + identical meeting window
 * already exists for this user. Returns the existing course row or null.
 * meetings: normalized meetings ({days: [...], start_time, end_time, location}[]).
 * excludeId: course id to skip (PATCH self).
 */
export function findDuplicateCourse(userId, code, meetings, excludeId = null) {
  const d = getDb();
  const key = normalizeCourse(code);
  const others = d
    .prepare('SELECT * FROM courses WHERE user_id = ? AND id != ?')
    .all(userId, excludeId ?? '');
  for (const other of others) {
    if (normalizeCourse(other.course_code) !== key) continue;
    const otherMeetings = d.prepare('SELECT * FROM meetings WHERE course_id = ?').all(other.id);
    for (const m of meetings) {
      const clash = otherMeetings.find(
        (om) => om.days === m.days.join(',') && om.start_time === m.start_time && om.end_time === m.end_time
      );
      if (clash) return other;
    }
    // Same course with no meetings on either side is also a duplicate.
    if (meetings.length === 0 && otherMeetings.length === 0) return other;
  }
  return null;
}
