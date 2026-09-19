import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCourse, normalizeInstructor, instructorsMatch, extractCourseCode, courseSearchMatches, instructorSearchMatches } from '../../src/courseutil.js';

test('normalizeCourse: basic codes', () => {
  assert.equal(normalizeCourse('CS 35L'), 'cs35l');
  assert.equal(normalizeCourse('CS35L'), 'cs35l');
  assert.equal(normalizeCourse('cs 35l'), 'cs35l');
  assert.equal(normalizeCourse('MATH 131A'), 'math131a');
  assert.equal(normalizeCourse('MATH131A'), 'math131a');
});

test('normalizeCourse: prefix letters (combined undergrad/grad courses)', () => {
  assert.equal(normalizeCourse('CS M146'), normalizeCourse('CS M146'));
  assert.equal(normalizeCourse('CSM146'), normalizeCourse('CS M146'));
  assert.equal(normalizeCourse('CS M146 Intro to ML'), normalizeCourse('CS M146'));
});

test('normalizeCourse: department aliases', () => {
  assert.equal(normalizeCourse('COM SCI 35L'), normalizeCourse('CS 35L'));
  assert.equal(normalizeCourse('Comp Sci 35L'), normalizeCourse('CS 35L'));
  assert.equal(normalizeCourse('Computer Science 35L'), normalizeCourse('CS 35L'));
});

test('normalizeCourse: empty and weird input', () => {
  assert.equal(normalizeCourse(''), '');
  assert.equal(normalizeCourse(null), '');
  assert.equal(normalizeCourse('   '), '');
});

test('extractCourseCode', () => {
  assert.equal(extractCourseCode('CS 35L Intro'), 'CS 35L');
  assert.equal(extractCourseCode('COM SCI 35L'), 'COM SCI 35L');
  assert.equal(extractCourseCode('no code here'), 'no code here');
});

test('normalizeInstructor: trim / lowercase / whitespace collapse / punctuation', () => {
  assert.equal(normalizeInstructor('Paul Eggert'), 'paul eggert');
  assert.equal(normalizeInstructor('paul eggert'), 'paul eggert');
  assert.equal(normalizeInstructor('Paul  Eggert'), 'paul eggert');
  assert.equal(normalizeInstructor('Paul R. Eggert'), 'paul r eggert');
  // "Last, First" form is reordered so both spellings share a key.
  assert.equal(normalizeInstructor('Eggert, Paul'), 'paul eggert');
});

test('instructorsMatch: equivalent names', () => {
  assert.equal(instructorsMatch('Paul Eggert', 'paul eggert'), true);
  assert.equal(instructorsMatch('Paul Eggert', 'Paul  Eggert'), true);
  assert.equal(instructorsMatch('Paul R. Eggert', 'Paul Eggert'), true);
  assert.equal(instructorsMatch('Eggert, Paul', 'Paul Eggert'), true);
  assert.equal(instructorsMatch('D. G. Lu', 'D G Lu'), true);
  assert.equal(instructorsMatch('Christian Reiher', 'Christian  Reiher'), true);
});

test('instructorsMatch: different people', () => {
  assert.equal(instructorsMatch('Paul Eggert', 'Christian Reiher'), false);
  assert.equal(instructorsMatch('', 'Paul Eggert'), false);
  assert.equal(instructorsMatch('Paul', 'Paul Eggert'), false);
});

test('instructorsMatch: no false positives on common surnames', () => {
  // Same first name, different last name -> no match
  assert.equal(instructorsMatch('Paul Eggert', 'Paul Smith'), false);
  // Same last name, different first name -> no match
  assert.equal(instructorsMatch('Paul Eggert', 'Mary Eggert'), false);
});

test('normalizeCourse: bare numbers do not produce undefined parts', () => {
  assert.equal(normalizeCourse('35L'), '35l');
  assert.equal(normalizeCourse('35'), '35');
  assert.equal(normalizeCourse('131'), '131');
  assert.equal(normalizeCourse('M146'), 'm146');
});

test('courseSearchMatches: partial codes, any casing, course names', () => {
  const c = { course_code: 'CS 35L', course_name: 'Intro to Programming in Python' };
  assert.equal(courseSearchMatches('CS 35', c), true); // partial code
  assert.equal(courseSearchMatches('cs35L', c), true); // no space, mixed case
  assert.equal(courseSearchMatches('  cs  35l  ', c), true); // extra spaces
  assert.equal(courseSearchMatches('35L', c), true); // number only
  assert.equal(courseSearchMatches('Python', c), true); // course name word
  assert.equal(courseSearchMatches('intro programming', c), true); // name AND
  assert.equal(courseSearchMatches('COM SCI 35L', c), true); // alias
  assert.equal(courseSearchMatches('MATH 131', c), false); // different course
  assert.equal(courseSearchMatches('xyz', c), false);
  assert.equal(courseSearchMatches('', c), false);
});

test('instructorSearchMatches: prefixes and multi-token queries', () => {
  assert.equal(instructorSearchMatches('Eggert', 'Paul R. Eggert'), true);
  assert.equal(instructorSearchMatches('egger', 'Paul R. Eggert'), true); // partial surname
  assert.equal(instructorSearchMatches('paul', 'Paul R. Eggert'), true);
  assert.equal(instructorSearchMatches('Paul E', 'Paul R. Eggert'), true); // first + initial
  assert.equal(instructorSearchMatches('eggert paul', 'Paul R. Eggert'), true); // flipped
  assert.equal(instructorSearchMatches('Jane', 'Paul R. Eggert'), false);
  assert.equal(instructorSearchMatches('zzz', 'Paul R. Eggert'), false);
  assert.equal(instructorSearchMatches('', 'Paul R. Eggert'), false);
});
