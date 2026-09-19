import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCourseOverlap,
  calculateInstructorOverlap,
  calculateTimeOverlap,
  calculateUserMatch,
  rankCandidates,
  buildUserIndex,
  WEIGHTS,
} from '../../src/matching.js';

const user = (id, displayName, courses) => ({
  id,
  username: id,
  display_name: displayName,
  bio: '',
  major: '',
  year: '',
  avatar_path: '',
  email: `${id}@test.local`,
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  courses,
});

const course = (code, opts = {}) => ({
  id: opts.id || `c-${code}-${Math.random().toString(36).slice(2, 6)}`,
  course_code: code,
  course_name: opts.name || '',
  instructor: opts.instructor || '',
  section: opts.section || '',
  location: opts.location || '',
  term: 'Fall 2026',
  meetings: (opts.meetings || []).map((m, i) => ({
    id: `m-${i}`,
    days: m.days.join(','),
    start_time: m.start,
    end_time: m.end,
    location: m.location || '',
  })),
});

const base = user('me', 'Me', [
  course('CS 35L', { instructor: 'Paul R. Eggert', meetings: [{ days: ['MON', 'WED'], start: '14:00', end: '15:50' }] }),
  course('CS 111', { instructor: 'Christian Reiher', meetings: [{ days: ['TUE', 'THU'], start: '10:00', end: '11:50' }] }),
  course('MATH 131A', { instructor: 'D. G. Lu', meetings: [{ days: ['MON', 'WED'], start: '13:00', end: '14:50' }] }),
]);

test('course overlap counts shared courses', () => {
  const them = user('them', 'Them', [
    course('CS 35L'),
    course('CS 111'),
    course('ECE 100'),
  ]);
  const r = calculateCourseOverlap(buildUserIndex(base), buildUserIndex(them));
  assert.equal(r.count, 2);
  assert.equal(r.ratio, 2 / 4); // 2 shared / 4 distinct
  assert.deepEqual(r.matched.map((m) => m.label).sort(), ['CS 111', 'CS 35L']);
});

test('course overlap normalizes notation variants', () => {
  const them = user('them', 'Them', [
    course('COM SCI 35L'),
    course('CS111'),
  ]);
  const r = calculateCourseOverlap(buildUserIndex(base), buildUserIndex(them));
  assert.equal(r.count, 2);
});

test('instructor overlap handles variants and counts distinct persons', () => {
  const them = user('them', 'Them', [
    course('CS 35L', { instructor: 'Eggert, Paul' }),
    course('CS 31', { instructor: 'Paul Eggert' }), // same person, different course
  ]);
  const r = calculateInstructorOverlap(buildUserIndex(base), buildUserIndex(them));
  assert.equal(r.count, 1); // one distinct shared person
});

test('instructor overlap: different instructor -> zero', () => {
  const them = user('them', 'Them', [
    course('CS 35L', { instructor: 'Jane Doe' }),
  ]);
  const r = calculateInstructorOverlap(buildUserIndex(base), buildUserIndex(them));
  assert.equal(r.count, 0);
});

test('time overlap: exact, partial, none, different day', () => {
  const themExact = user('t1', 'Exact', [
    course('CHEM 14A', { meetings: [{ days: ['MON', 'WED'], start: '14:00', end: '15:50' }] }),
  ]);
  // CHEM overlaps BOTH my CS 35L (exact, 110min) and my MATH 131A (partial, 50min)
  assert.equal(calculateTimeOverlap(buildUserIndex(base), buildUserIndex(themExact)).count, 2);
  assert.equal(calculateTimeOverlap(buildUserIndex(base), buildUserIndex(themExact)).totalMinutes, 110 * 2 + 50 * 2);

  const themPartial = user('t2', 'Partial', [
    course('PSYC 1', { meetings: [{ days: ['MON', 'WED'], start: '15:00', end: '16:50' }] }),
  ]);
  const r = calculateTimeOverlap(buildUserIndex(base), buildUserIndex(themPartial));
  assert.equal(r.count, 1);
  assert.equal(r.totalMinutes, 50 * 2);

  const themDiffDay = user('t3', 'DiffDay', [
    course('BIO 41', { meetings: [{ days: ['TUE', 'THU'], start: '14:00', end: '15:50' }] }),
  ]);
  assert.equal(calculateTimeOverlap(buildUserIndex(base), buildUserIndex(themDiffDay)).count, 0);

  const themNone = user('t4', 'None', [
    course('HIST 1', { meetings: [{ days: ['MON', 'WED'], start: '09:00', end: '10:50' }] }),
  ]);
  assert.equal(calculateTimeOverlap(buildUserIndex(base), buildUserIndex(themNone)).count, 0);
});

test('calculateUserMatch combines all dimensions with ratios and minutes', () => {
  const them = user('them', 'Them', [
    course('CS 35L', { instructor: 'Paul Eggert', meetings: [{ days: ['MON', 'WED'], start: '14:00', end: '15:50' }] }),
    course('CS 111', { instructor: 'Christian Reiher', meetings: [{ days: ['TUE', 'THU'], start: '10:00', end: '11:50' }] }),
  ]);
  const r = calculateUserMatch(buildUserIndex(base), buildUserIndex(them));
  assert.equal(r.userId, 'them');
  assert.equal(r.courseOverlapCount, 2);
  assert.equal(r.instructorOverlapCount, 2);
  // CS 35L exact (110min x2) + CS 111 exact (110min x2) + MATH 131A 13:00-14:50
  // partially overlaps their CS 35L 14:00-15:50 (50min x2)
  assert.equal(r.timeOverlapCount, 3);
  assert.equal(r.totalOverlapMinutes, 110 * 2 + 110 * 2 + 50 * 2);
  assert.equal(r.courseOverlapRatio, 0.667); // 2 shared of 3 distinct courses (union), rounded
  assert.ok(r.totalScore > 0);
  assert.deepEqual(r.matchedCourses.sort(), ['CS 111', 'CS 35L']);
  assert.equal(r.matchedInstructors.length, 2);
});

test('rankCandidates: sort=course orders by overlap count (3 > 2 > 1)', () => {
  const a = user('a', 'A Three', [
    course('CS 35L'), course('CS 111'), course('MATH 131A'),
  ]);
  const b = user('b', 'B Two', [
    course('CS 35L'), course('CS 111'),
  ]);
  const c = user('c', 'C One', [
    course('CS 35L'),
  ]);
  const none = user('none', 'Zero', [course('ART 1A')]);
  const rows = rankCandidates(base, [c, none, a, b], { sort: 'course' });
  assert.deepEqual(rows.map((r) => r.user.id), ['a', 'b', 'c']);
  assert.equal(rows[0].match.courseOverlapCount, 3);
  assert.equal(rows[1].match.courseOverlapCount, 2);
  assert.equal(rows[2].match.courseOverlapCount, 1);
  // zero-overlap users are excluded
  assert.ok(!rows.some((r) => r.user.id === 'none'));
});

test('rankCandidates: sort=instructor prefers instructor overlap', () => {
  // X shares 1 course with a different instructor; Y shares 0 courses but the same instructor
  const x = user('x', 'X', [course('CS 35L', { instructor: 'Jane Doe' })]);
  const y = user('y', 'Y', [course('CS 31', { instructor: 'Paul R. Eggert' })]);
  const rows = rankCandidates(base, [x, y], { sort: 'instructor' });
  assert.equal(rows[0].user.id, 'y');
  assert.equal(rows[0].match.instructorOverlapCount, 1);
  assert.equal(rows[1].match.instructorOverlapCount, 0);
});

test('rankCandidates: sort=time prefers time overlap', () => {
  const early = user('early', 'Early', [
    course('HIST 1', { meetings: [{ days: ['MON', 'WED'], start: '09:00', end: '10:50' }] }),
  ]);
  const same = user('same', 'Same', [
    course('CHEM 14A', { meetings: [{ days: ['MON', 'WED'], start: '14:00', end: '15:50' }] }),
  ]);
  const rows = rankCandidates(base, [early, same], { sort: 'time' });
  assert.equal(rows[0].user.id, 'same');
  assert.equal(rows[0].match.timeOverlapCount, 2); // CS 35L exact + MATH 131A partial
});

test('rankCandidates: best match combines dimensions; more shared courses wins', () => {
  const twoShared = user('two', 'Two', [
    course('CS 35L', { instructor: 'Paul R. Eggert', meetings: [{ days: ['MON', 'WED'], start: '14:00', end: '15:50' }] }),
    course('CS 111', { instructor: 'Christian Reiher', meetings: [{ days: ['TUE', 'THU'], start: '10:00', end: '11:50' }] }),
  ]);
  const oneSharedDifferent = user('one', 'One', [
    course('CS 35L', { instructor: 'Jane Doe', meetings: [{ days: ['MON'], start: '09:00', end: '10:50' }] }),
  ]);
  const rows = rankCandidates(base, [oneSharedDifferent, twoShared], { sort: 'best' });
  assert.equal(rows[0].user.id, 'two');
  assert.ok(rows[0].match.totalScore > rows[1].match.totalScore);
});

test('rankCandidates: deterministic (same input order-independent) and stable', () => {
  const list = [
    user('u1', 'Zed', [course('CS 35L')]),
    user('u2', 'Ann', [course('CS 35L'), course('CS 111')]),
    user('u3', 'Bob', [course('CS 111')]),
    user('u4', 'Cid', [course('CS 35L')]),
  ];
  const r1 = rankCandidates(base, list, { sort: 'course' });
  const r2 = rankCandidates(base, [...list].reverse(), { sort: 'course' });
  assert.deepEqual(
    r1.map((r) => r.user.id),
    r2.map((r) => r.user.id)
  );
  assert.deepEqual(r1.map((r) => r.match.totalScore), r2.map((r) => r.match.totalScore));
});

test('WEIGHTS live in one place and are sane', () => {
  assert.ok(WEIGHTS.course > WEIGHTS.instructor);
  assert.ok(WEIGHTS.instructor > WEIGHTS.time);
});

test('a user never matches against themselves', () => {
  const rows = rankCandidates(base, [base], { sort: 'best' });
  assert.equal(rows.length, 0);
});
