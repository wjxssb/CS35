// matching.js — the classmate discovery engine.
//
// Pure, deterministic, dependency-free. All cross-user comparison goes
// through this module so weights live in ONE place.
//
// Data in:
//   user: { id, display_name, username, bio, major, year, avatar_path,
//           courses: [{ id, course_code, course_name, instructor, section,
//                      location, term, meetings: [{ id, days, start_time,
//                      end_time, location }] }] }
//   (course/meeting shapes match the JSON returned by the API)

import { normalizeCourse, normalizeInstructor, instructorsMatch } from './courseutil.js';
import { normalizeMeeting, meetingOverlapMinutes, doesMeetingOverlap } from './timeutil.js';

/**
 * Transparent, explainable scoring weights.
 * Best Match = count * weight + ratio * weight, per dimension.
 */
export const WEIGHTS = {
  course: 5,
  instructor: 3,
  time: 2,
};

/** Precompute a user's matching keys. Returns { courseKeys, instructorKeys, meetings }. */
export function buildUserIndex(user) {
  const courseKeys = new Map(); // key -> display label
  const instructorKeys = new Map(); // normalized instructor -> display label
  const meetings = [];
  for (const course of user.courses || []) {
    const key = normalizeCourse(`${course.course_code} ${course.course_name || ''}`);
    const display = course.course_code || course.course_name || key;
    if (key && !courseKeys.has(key)) courseKeys.set(key, display);
    const ins = normalizeInstructor(course.instructor || '');
    if (ins && !instructorKeys.has(ins)) instructorKeys.set(ins, course.instructor);
    for (const meeting of course.meetings || []) {
      const norm = normalizeMeeting(meeting);
      if (norm) {
        norm.courseCode = course.course_code;
        norm.courseId = course.id;
        meetings.push(norm);
      }
    }
  }
  return {
    id: user.id,
    courseKeys: [...courseKeys.entries()].map(([key, label]) => ({ key, label })),
    instructorKeys: [...instructorKeys.entries()].map(([key, label]) => ({ key, label })),
    meetings,
  };
}

/**
 * Course overlap: intersection of normalized course keys.
 * Returns { count, matched: [{key, label}] }.
 */
export function calculateCourseOverlap(me, them) {
  const their = new Map(them.courseKeys.map((c) => [c.key, c.label]));
  const matched = me.courseKeys.filter((c) => their.has(c.key)).map((c) => ({ key: c.key, label: c.label }));
  const union = new Set([...me.courseKeys, ...them.courseKeys].map((c) => c.key));
  return {
    count: matched.length,
    ratio: union.size ? matched.length / union.size : 0,
    matched,
  };
}

function groupInstructors(instructorKeys) {
  // Collapse entries that refer to the same person (e.g. "paul eggert" and
  // "paul r eggert") into a single person record.
  const persons = [];
  for (const { key, label } of instructorKeys) {
    const existing = persons.find((p) => personsSame(p, { key, label }));
    if (existing) {
      if (label && (!existing.label || label.length > existing.label.length)) existing.label = label;
    } else {
      persons.push({ key, label });
    }
  }
  return persons;
}

function personsSame(a, b) {
  if (a.key === b.key) return true;
  const la = a.label || a.key;
  const lb = b.label || b.key;
  if (normalizeInstructor(la) === normalizeInstructor(lb)) return true;
  return instructorsMatch(la, lb);
}

/**
 * Instructor overlap: intersection of normalized instructor names.
 * Two courses "match" on instructor when the normalized names equate via
 * instructorsMatch (handles middle initials and punctuation).
 */
export function calculateInstructorOverlap(me, them) {
  const myPersons = groupInstructors(me.instructorKeys);
  const theirPersons = groupInstructors(them.instructorKeys);
  const matched = [];
  for (const mine of myPersons) {
    const hit = theirPersons.find((t) => personsSame(mine, t));
    if (hit) matched.push({ key: mine.key, label: mine.label, theirLabel: hit.label });
  }
  const union = groupInstructors([...me.instructorKeys, ...them.instructorKeys]);
  const count = matched.length;
  return {
    count,
    ratio: union.length ? count / union.length : 0,
    matched,
  };
}

/**
 * Time overlap across ALL course meetings of both users.
 * Returns { count, ratio, totalMinutes, matched: [{...}] }.
 * count = number of meeting pairs that overlap by at least one minute.
 */
export function calculateTimeOverlap(me, them) {
  const matched = [];
  let totalMinutes = 0;
  for (const a of me.meetings) {
    for (const b of them.meetings) {
      const minutes = meetingOverlapMinutes(a, b);
      if (minutes > 0 && doesMeetingOverlap(a, b)) {
        totalMinutes += minutes;
        matched.push({
          myCourse: a.courseCode,
          theirCourse: b.courseCode,
          days: a.days.filter((d) => b.days.includes(d)).join(','),
          minutes,
          label: `${a.label} × ${b.label}`,
        });
      }
    }
  }
  const totalMeetings = me.meetings.length + them.meetings.length;
  const ratio = totalMeetings ? matched.length / totalMeetings : 0;
  return { count: matched.length, ratio, totalMinutes, matched };
}

/**
 * Full match between two users across all three dimensions.
 * Deterministic: same inputs always produce the same output.
 */
export function calculateUserMatch(me, them) {
  const courses = calculateCourseOverlap(me, them);
  const instructors = calculateInstructorOverlap(me, them);
  const times = calculateTimeOverlap(me, them);

  const totalScore =
    courses.count * WEIGHTS.course +
    courses.ratio * WEIGHTS.course +
    instructors.count * WEIGHTS.instructor +
    instructors.ratio * WEIGHTS.instructor +
    times.count * WEIGHTS.time +
    times.ratio * WEIGHTS.time +
    times.totalMinutes / 100; // small tie-breaker favoring long overlaps

  return {
    userId: them.id,
    courseOverlapCount: courses.count,
    instructorOverlapCount: instructors.count,
    timeOverlapCount: times.count,
    totalOverlapMinutes: times.totalMinutes,
    courseOverlapRatio: round3(courses.ratio),
    instructorOverlapRatio: round3(instructors.ratio),
    timeOverlapRatio: round3(times.ratio),
    totalScore: round3(totalScore),
    matchedCourses: courses.matched.map((c) => c.label),
    matchedInstructors: instructors.matched.map((i) => i.label),
    matchedMeetings: times.matched,
  };
}

/**
 * Rank a list of candidate users against `me` (raw user objects).
 * options.sort: 'best' | 'course' | 'instructor' | 'time'
 * Users with zero overlap in every dimension are excluded.
 * Ties are broken deterministically by totalScore DESC then display name ASC.
 */
export function rankCandidates(me, candidates, options = {}) {
  const sort = options.sort === 'course' || options.sort === 'instructor' || options.sort === 'time' ? options.sort : 'best';
  const meIndex = buildUserIndex(me);
  const rows = [];
  for (const candidate of candidates) {
    if (candidate.id === me.id) continue;
    const them = buildUserIndex(candidate);
    const match = calculateUserMatch(meIndex, them);
    if (match.courseOverlapCount + match.instructorOverlapCount + match.timeOverlapCount === 0) continue;
    rows.push({ user: candidate, match });
  }
  const by = {
    course: (a, b) => b.match.courseOverlapCount - a.match.courseOverlapCount,
    instructor: (a, b) => b.match.instructorOverlapCount - a.match.instructorOverlapCount,
    time: (a, b) => b.match.timeOverlapCount - a.match.timeOverlapCount || b.match.totalOverlapMinutes - a.match.totalOverlapMinutes,
    best: (a, b) => b.match.totalScore - a.match.totalScore,
  }[sort];
  rows.sort((a, b) => {
    const primary = by(a, b);
    if (primary !== 0) return primary;
    if (a.match.totalScore !== b.match.totalScore) return b.match.totalScore - a.match.totalScore;
    return (a.user.display_name || a.user.username || '').localeCompare(b.user.display_name || b.user.username || '');
  });
  return rows;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}
