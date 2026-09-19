import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCandidates, validateScheduleImage, ScheduleParseError } from '../../src/scheduleParser.js';

test('validateScheduleImage: accepts jpg/png/webp buffers', () => {
  assert.deepEqual(validateScheduleImage('image/png', Buffer.from([1, 2, 3])), { ext: 'png' });
  assert.deepEqual(validateScheduleImage('image/jpeg', Buffer.from([1])), { ext: 'jpg' });
  assert.deepEqual(validateScheduleImage('image/webp', Buffer.from([1])), { ext: 'webp' });
});

test('validateScheduleImage: rejects bad type, empty, oversized', () => {
  assert.throws(() => validateScheduleImage('application/pdf', Buffer.from([1])), (e) => e instanceof ScheduleParseError && e.status === 415);
  assert.throws(() => validateScheduleImage('image/png', Buffer.alloc(0)), /empty/i);
  assert.throws(() => validateScheduleImage('image/png', Buffer.alloc(11 * 1024 * 1024)), /large/i);
});

test('extractCandidates: block layout with labels', () => {
  const text = `
University of California, Los Angeles
Student: Frank Zhang Term: Fall 2026

CS 35L Intro to Programming in Python
Instructor: Paul R. Eggert
Days: MW Time: 2:00 PM - 3:50 PM Location: ENG 1102

CS 111 Data Science
Instructor: Christian Reiher
Days: TR Time: 10:00 AM - 11:50 AM Location: HEO 1050
`;
  const cands = extractCandidates(text);
  assert.equal(cands.length, 2);

  assert.equal(cands[0].course_code, 'CS 35L');
  assert.equal(cands[0].instructor, 'Paul R Eggert');
  assert.equal(cands[0].days, 'MON,WED');
  assert.equal(cands[0].start_time, '14:00');
  assert.equal(cands[0].end_time, '15:50');
  assert.equal(cands[0].location, 'ENG 1102');
  assert.ok(cands[0].confidence > 0.8);

  assert.equal(cands[1].course_code, 'CS 111');
  assert.equal(cands[1].instructor, 'Christian Reiher');
  assert.equal(cands[1].days, 'TUE,THU');
  assert.equal(cands[1].start_time, '10:00');
  assert.equal(cands[1].end_time, '11:50');
});

test('extractCandidates: single-line table layout', () => {
  const text = `
Course Title Instructor Days Time Location
CS 35L Intro to Programming Paul R. Eggert MW 2:00PM - 3:50PM ENG 1102
MATH 131A Linear Algebra D. G. Lu HW 1:00PM - 2:50PM PEP 338
`;
  const cands = extractCandidates(text);
  assert.equal(cands.length, 2);
  assert.equal(cands[0].course_code, 'CS 35L');
  assert.equal(cands[0].days, 'MON,WED');
  assert.equal(cands[0].start_time, '14:00');
  assert.equal(cands[1].course_code, 'MATH 131A');
  assert.equal(cands[1].start_time, '13:00');
});

test('extractCandidates: OCR underscore artifacts are tolerated', () => {
  const text = `
CS 35L_ Intro to Programming in Python
Instructor: Paul R. Eggert

Days: MW_ Time: 2:00 PM - 3:50 PM__ Location: ENG 1102
`;
  const cands = extractCandidates(text);
  assert.equal(cands.length, 1);
  assert.equal(cands[0].course_code, 'CS 35L');
  assert.equal(cands[0].days, 'MON,WED');
});

test('extractCandidates: no courses -> empty list', () => {
  assert.deepEqual(extractCandidates('hello world\nnothing here'), []);
  assert.deepEqual(extractCandidates(''), []);
});

test('extractCandidates: location lines are not new courses', () => {
  const text = `
CS 35L Intro
Days: MW Time: 2:00 PM - 3:50 PM Location: ENG 1102
`;
  const cands = extractCandidates(text);
  assert.equal(cands.length, 1);
  assert.equal(cands[0].location, 'ENG 1102');
});
