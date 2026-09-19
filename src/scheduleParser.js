// scheduleParser.js — image -> structured course candidates.
//
// Pipeline:
//   image bytes/path
//     -> validation (format, emptiness)
//     -> OCR (tesseract CLI; swappable: any implementation of
//        parseScheduleImage(imagePath) is acceptable)
//     -> line-based extraction of course/instructor/days/time/location
//     -> structured candidates with per-candidate confidence
//
// The module is pure w.r.t. the database: it never writes course rows.
// The upload API persists candidates so the user can review, edit and
// confirm before anything is saved as real course data.

import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { normalizeCourse, extractCourseCode } from './courseutil.js';
import { parseDays, parseTimeRange } from './timeutil.js';

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export class ScheduleParseError extends Error {
  constructor(message, { status = 422, code = 'PARSE_FAILED' } = {}) {
    super(message);
    this.name = 'ScheduleParseError';
    this.status = status;
    this.code = code;
  }
}

/** Validate an uploaded buffer; returns { ext } or throws ScheduleParseError. */
export function validateScheduleImage(mime, buffer) {
  if (!ALLOWED_MIME.has(mime)) {
    throw new ScheduleParseError('Unsupported file type. Please upload a JPG, PNG or WebP image.', { status: 415, code: 'BAD_FORMAT' });
  }
  if (!buffer || buffer.length === 0) {
    throw new ScheduleParseError('The uploaded image is empty.', { code: 'EMPTY_IMAGE' });
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new ScheduleParseError('Image is too large (max 10 MB).', { code: 'TOO_LARGE' });
  }
  return { ext: MIME_EXT[mime] };
}

/** Run tesseract OCR on an image file. Returns the raw recognized text. */
export async function ocrImage(imagePath, { tesseractBin = 'tesseract' } = {}) {
  const args = [imagePath, 'stdout', '-l', 'eng', '--psm', '6', '--dpi', '200'];
  return new Promise((resolve, reject) => {
    const child = spawn(tesseractBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => reject(new ScheduleParseError(`OCR engine unavailable: ${e.message}`, { code: 'OCR_UNAVAILABLE' })));
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new ScheduleParseError(`OCR failed (exit ${code}): ${err.slice(0, 300)}`, { code: 'OCR_FAILED' }));
        return;
      }
      resolve(out);
    });
  });
}

// Department may be one or two words ("CS", "COM SCI", "EC ENGR"); the number
// may carry a prefix letter (UCLA "CS M146") and/or suffix letter ("CS 35L").
const COURSE_RE = /\b([A-Z]{2,5}(?:\s+[A-Z]{2,5})?)\s+([A-Z]?\d{1,4}[A-Za-z]?)(?!\d)/;
const LOCATION_RE = /\b([A-Z]{2,5}\s?\d{2,5}[A-Za-z]?)\b/;
const TIME_RANGE_RE = /(\d{1,2}(?::\d{2})?(?::\d{2})?\s*(?:AM|PM)?(?:\s*(?:-|–|—|to)\s*)\d{1,2}(?::\d{2})?(?::\d{2})?\s*(?:AM|PM)?)/i;
const DAY_TOKEN_RE = /\b(MON|TUE|WED|THU|FRI|SAT|SUN|MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY|MWF|MTW|MTR|MTWR|MWH|MW|TR|TTH|TH|TW|TWF|TF|M|T|W|R|F|S|U)\b/gi;

/**
 * Extract course candidates from raw OCR text.
 *
 * Handles two common layouts:
 *  1. One line per course:  "CS 35L  Intro...  Paul R. Eggert  MW  2:00PM-3:50PM  ENG 1102"
 *  2. Blocks: a course line followed by "Instructor: ...", "Days: ... Time: ... Location: ..."
 *
 * Returns an array of candidate objects with confidence in [0,1].
 */
export function extractCandidates(rawText) {
  if (!rawText || !rawText.trim()) return [];
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const candidates = [];
  let current = null;

  for (const line of lines) {
    const courseMatch = line.match(COURSE_RE);
    const looksLikeCourse =
      courseMatch &&
      // "LEC 1"/"DIS 1A" are section markers, not course codes.
      !/^(LEC|DIS|LAB)$/i.test(courseMatch[1].trim()) &&
      // A code at the tail of a "Location: ..." line is a room, not a course.
      !/location\s*:.*$/i.test(line.slice(0, courseMatch.index).trim()) &&
      !/^(?:course|time|days?)\s*[:.]/i.test(line);
    if (looksLikeCourse) {
      if (current) candidates.push(current);
      current = newCandidate(courseMatch, line);
      applyLineToCandidate(current, line.slice(courseMatch[0].length), true);
    } else if (current) {
      applyLineToCandidate(current, line, false);
    }
  }
  if (current) candidates.push(current);

  for (const c of candidates) {
    let confidence = 0.1;
    if (c.course_code) confidence += 0.3;
    if (c.days) confidence += 0.2;
    if (c.start_time) confidence += 0.2;
    if (c.instructor) confidence += 0.15;
    if (c.location) confidence += 0.05;
    // A "meeting" spanning most of a day is almost certainly sidebar prose
    // (e.g. an iCal page footer "8am-5pm"), not a class.
    if (c.start_time && c.end_time) {
      const [sh, sm] = c.start_time.split(':').map(Number);
      const [eh, em] = c.end_time.split(':').map(Number);
      const dur = eh * 60 + em - (sh * 60 + sm);
      if (dur > 300 || dur <= 0) confidence -= 0.2;
    }
    c.confidence = Math.min(Math.round(confidence * 100) / 100, 0.98);
    c.confidence = Math.max(c.confidence, 0.05);
  }
  // Merge rows that refer to the same course (calendars repeat blocks).
  return mergeByCourseKey(candidates);
}

/** Merge candidates whose normalized course codes are equal (keep best fields). */
function mergeByCourseKey(candidates) {
  const byKey = new Map();
  for (const c of candidates) {
    const key = normalizeCourse(c.course_code) || c.course_code.toLowerCase();
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, c);
      continue;
    }
    for (const f of ['course_name', 'instructor', 'section', 'location', 'days', 'start_time', 'end_time']) {
      if (!prev[f] && c[f]) prev[f] = c[f];
    }
    prev.confidence = Math.max(prev.confidence, c.confidence);
  }
  return [...byKey.values()];
}

function newCandidate(courseMatch, line) {
  let dept = courseMatch[1];
  // OCR often fuses a calendar grid line ("|") into a stray leading "I":
  // "ICOM SCI" -> "COM SCI". Only strip when the remainder looks like a dept.
  const firstWord = dept.split(' ')[0];
  if (firstWord.length > 3 && firstWord[0] === 'I' && /^[A-Z]{2,5}$/.test(firstWord.slice(1))) {
    dept = dept.replace(firstWord, firstWord.slice(1));
  }
  return {
    course_code: `${dept} ${courseMatch[2]}`,
    course_name: guessCourseName(line.slice(courseMatch[0].length)),
    instructor: '',
    section: '',
    location: '',
    term: '',
    days: '',
    start_time: '',
    end_time: '',
    confidence: 0,
  };
}

/** Best-effort course title from the text right after the code. */
function guessCourseName(rest) {
  let name = rest
    .replace(/(?:instructor|days|time|location|section)\s*:.*$/i, ' ');
  const timeMatch = name.match(TIME_RANGE_RE);
  let head = timeMatch ? name.slice(0, timeMatch.index) : name;
  // Drop a trailing instructor name run (2+ consecutive capitalized words).
  head = head.replace(/(?:\s+[A-Z][A-Za-z.']*){2,}\s*$/, ' ');
  head = head
    .replace(DAY_TOKEN_RE, ' ')
    .replace(/[^A-Za-z'’ -]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // All-caps tokens are codes/sections/buildings, not title words.
  const words = head.split(' ').filter((w) => w && w.length > 2 && !/^[A-Z]+$/.test(w));
  return words.slice(0, 6).join(' ');
}

/**
 * Split a line into labeled segments, e.g.
 * "Days: TR  Time: 10:00 AM - 11:50 AM  Location: HEO 1050"
 * -> { days: "TR", time: "10:00 AM - 11:50 AM", location: "HEO 1050",
 *      __rest: <text before the first label> }
 * Lines without labels are returned as { __rest: line }.
 */
function splitLabeledLine(line) {
  const LABELS = ['instructor', 'professor', 'prof', 'days', 'day', 'time', 'location', 'section', 'course'];
  const re = new RegExp(`\\b(?:${LABELS.join('|')})\\s*[:.]\\s*`, 'gi');
  const positions = [];
  let match;
  while ((match = re.exec(line)) !== null) positions.push(match);
  if (positions.length === 0) return { __rest: line };
  const out = { __rest: line.slice(0, positions[0].index) };
  for (let i = 0; i < positions.length; i++) {
    const p = positions[i];
    const label = p[0].trim().toLowerCase().replace(/[.:]\s*$/, '');
    const start = p.index + p[0].length;
    const end = i + 1 < positions.length ? positions[i + 1].index : line.length;
    const key = label === 'day' || label === 'days' ? 'days' : label;
    out[key] = line.slice(start, end).trim();
  }
  return out;
}

/** Merge fields found in a line into the current candidate (in place). */
function applyLineToCandidate(c, line, isCourseLine = false) {
  if (!line) return;
  const seg = splitLabeledLine(line);

  // --- days ---
  const daysSource = seg.days ?? seg.__rest ?? '';
  let days = null;
  if (daysSource) {
    // Single-letter initials in names ("Paul R.") are not weekdays.
    const tokens = [...daysSource.matchAll(DAY_TOKEN_RE)]
      .filter((m) => !(m[1].length === 1 && daysSource[m.index + m[1].length] === '.'))
      .map((m) => m[1].toUpperCase());
    if (tokens.length) days = parseDays(tokens.join(' '));
    // Calendar week headers ("Sun … Sat") are grid noise, not meeting days.
    if (days && days.length >= 6) days = null;
  }
  if (days) c.days = days.join(',');

  // --- time ---
  const timeSource = seg.time ?? seg.__rest ?? '';
  const timeMatch = timeSource.match(TIME_RANGE_RE);
  if (timeMatch) {
    const range = parseTimeRange(timeMatch[1]);
    if (range) {
      c.start_time = formatMin(range.startMinutes);
      c.end_time = formatMin(((range.endMinutes % 1440) + 1440) % 1440);
    }
  }

  // --- location ---
  if (seg.location) {
    const tokens = seg.location
      .replace(DAY_TOKEN_RE, ' ')
      .replace(TIME_RANGE_RE, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(-2);
    if (tokens.length) c.location = tokens.join(' ').toUpperCase();
  } else if (!c.location) {
    const rest = seg.__rest || '';
    // "(Boelter Hall 3400)" — real iCal calendar blocks wrap the room in parens.
    const paren = rest.match(/\(([^()]{3,60})\)/);
    if (paren && /\d{2,}/.test(paren[1]) && paren[1].trim().split(/\s+/).length >= 2) {
      c.location = paren[1].trim().slice(0, 60);
    } else {
      const locMatch = rest.match(/([A-Z]{2,5}\s?\d{2,5}[A-Za-z]?)\s*$/);
      if (locMatch) c.location = locMatch[1].replace(/\s+/g, ' ');
    }
  }

  // --- section ---
  if (seg.section) {
    const s = seg.section.trim().slice(0, 20);
    if (s) c.section = c.section || s;
  }
  // "LEC 1", "DIS 1A", "LAB 2" embedded in a course block (iCal grids).
  if (isCourseLine) {
    const sm = line.match(/\b(LEC|DIS|LAB)\s?(\d{1,2}[A-Za-z]?)\b/i);
    if (sm) c.section = c.section || `${sm[1].toUpperCase()} ${sm[2]}`;
  }

  // --- instructor ---
  if (seg.instructor || seg.professor || seg.prof) {
    const raw = (seg.instructor || seg.professor || seg.prof).trim();
    if (raw) c.instructor = c.instructor || cleanName(raw);
  } else if (!c.instructor && !isCourseLine) {
    // Continuation line with an unlabeled name, e.g. "Paul Eggert".
    // The name run must dominate the line (sidebar prose like
    // "Calendar application such as Google Calendar" must not count).
    const words = (seg.__rest || '').split(/[\s,;–—-]+/).filter(Boolean);
    let best = [];
    let run = [];
    for (const w of words) {
      if (/^[A-Z][a-z]{1,20}$/.test(w) && !/^(The|And|For|Lab|Lecture|Office|Time|Days|Course|Intro)$/i.test(w)) {
        run.push(w);
      } else {
        if (run.length > best.length) best = run;
        run = [];
      }
    }
    if (run.length > best.length) best = run;
    const DAY_WORDS = /^(mon|tue|tues|tuesday|wed|wednesday|thu|thurs|thursday|fri|friday|sat|saturday|sun|sunday|monday|tuesday|weds?day|thurs?day|friday|saturday|sunday)$/i;
    const PLACE_WORDS = /^(hall|building|center|library|room|tower|block|annex|court|plaza|wing|village|labs?)$/i;
    const dominated = words.length > 0 && best.length / words.length >= 0.6;
    if (
      best.length >= 2 &&
      best.length <= 4 &&
      dominated &&
      !/\d/.test(best.join(' ')) &&
      !best.some((w) => PLACE_WORDS.test(w) || DAY_WORDS.test(w) || w.toLowerCase().endsWith('ing'))
    ) {
      c.instructor = cleanName(best.join(' '));
    }
  }
}

function cleanName(s) {
  return s
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function formatMin(m) {
  m = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

/**
 * Public interface. `imagePath` is a file on disk (the upload API has already
 * validated the buffer). Replaces OCR: swap ocrImage for a vision API call.
 */
export async function parseScheduleImage(imagePath, options = {}) {
  const info = await stat(imagePath).catch(() => null);
  if (!info) throw new ScheduleParseError('Image file is missing.', { code: 'EMPTY_IMAGE' });
  if (info.size === 0) throw new ScheduleParseError('The uploaded image is empty.', { code: 'EMPTY_IMAGE' });
  const rawText = await ocrImage(imagePath, options);
  const candidates = extractCandidates(rawText);
  if (candidates.length === 0) {
    throw new ScheduleParseError(
      "We couldn't confidently read any courses from this image. You can retry or enter the courses manually.",
      { code: 'NO_COURSES_DETECTED' }
    );
  }
  const overall = candidates.reduce((s, c) => s + c.confidence, 0) / candidates.length;
  return {
    candidates,
    rawText: rawText.slice(0, 8000),
    overallConfidence: Math.round(overall * 100) / 100,
    lowConfidence: overall < 0.65,
  };
}
