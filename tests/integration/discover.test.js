import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, registerUser, addCourse, CS35L, CS111, MATH131A } from './helpers.js';

let ctx;
let me;

before(async () => {
  ctx = await startServer();
  // me: CS 35L (Eggert, MW 14:00), CS 111 (Reiher, TR 10:00), MATH 131A (Lu, MW 13:00)
  me = await registerUser(ctx.base, { username: 'me_test', email: 'me@test.dev' });
  await addCourse(ctx.base, me.cookie, CS35L);
  await addCourse(ctx.base, me.cookie, CS111);
  await addCourse(ctx.base, me.cookie, MATH131A);

  // u3: 3 shared courses (same instructors, same times)
  const u3 = await registerUser(ctx.base, { username: 'u3x', email: 'u3@test.dev' });
  await addCourse(ctx.base, u3.cookie, CS35L);
  await addCourse(ctx.base, u3.cookie, CS111);
  await addCourse(ctx.base, u3.cookie, MATH131A);

  // u2: 2 shared courses
  const u2 = await registerUser(ctx.base, { username: 'u2x', email: 'u2@test.dev' });
  await addCourse(ctx.base, u2.cookie, CS35L);
  await addCourse(ctx.base, u2.cookie, CS111);
  await addCourse(ctx.base, u2.cookie, { course_code: 'ART 1', meetings: [] });

  // u1: 1 shared course (CS 35L only, different time so pure course overlap)
  const u1 = await registerUser(ctx.base, { username: 'u1x', email: 'u1@test.dev' });
  await addCourse(ctx.base, u1.cookie, { ...CS35L, instructor: 'Jane Doe', meetings: [{ days: ['TUE'], start_time: '09:00', end_time: '10:50' }] });

  // u0: no overlap at all
  const u0 = await registerUser(ctx.base, { username: 'u0x', email: 'u0@test.dev' });
  await addCourse(ctx.base, u0.cookie, {
    course_code: 'BIO 41',
    instructor: 'R. Shah',
    meetings: [{ days: ['MON', 'WED', 'FRI'], start_time: '08:00', end_time: '08:50' }],
  });

  // ui: same instructor (Eggert) on a DIFFERENT course, different time
  const ui = await registerUser(ctx.base, { username: 'uix', email: 'ui@test.dev' });
  await addCourse(ctx.base, ui.cookie, { course_code: 'CS 31', instructor: 'Paul R. Eggert', meetings: [{ days: ['TUE'], start_time: '16:00', end_time: '17:50' }] });

  // ut: same time as my CS 35L but a different course + instructor
  const ut = await registerUser(ctx.base, { username: 'utx', email: 'ut@test.dev' });
  await addCourse(ctx.base, ut.cookie, { course_code: 'CHEM 14A', instructor: 'S. Nakamura', meetings: [{ days: ['MON', 'WED'], start_time: '14:00', end_time: '15:50' }] });

  // up: partial time overlap (MON/WED 15:00-16:50 overlaps my CS 35L 14:00-15:50)
  const up = await registerUser(ctx.base, { username: 'upx', email: 'up@test.dev' });
  await addCourse(ctx.base, up.cookie, { course_code: 'PSYC 1', instructor: 'L. Moreau', meetings: [{ days: ['MON', 'WED'], start_time: '15:00', end_time: '16:50' }] });
});

after(async () => {
  ctx.server.close();
});

async function discover(cookie, params = '') {
  const res = await fetch(`${ctx.base}/api/discover${params ? `?${params}` : ''}`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  return (await res.json()).results;
}

test('discover excludes users with zero overlap', async () => {
  const rows = await discover(me.cookie);
  const ids = rows.map((r) => r.user.username);
  assert.ok(!ids.includes('u0x'));
  assert.equal(ids.length, 6);
});

test('sort=course orders by shared course count desc (3,2,1,...)', async () => {
  const rows = await discover(me.cookie, 'sort=course');
  const by = rows.map((r) => ({ u: r.user.username, n: r.match.courseOverlapCount }));
  assert.deepEqual(by[0], { u: 'u3x', n: 3 });
  assert.deepEqual(by[1], { u: 'u2x', n: 2 });
  assert.equal(by[2].n, 1);
});

test('sort=instructor puts same-instructor users on top', async () => {
  const rows = await discover(me.cookie, 'sort=instructor');
  assert.equal(rows[0].user.username, 'u3x'); // 3 shared instructors
  assert.equal(rows[0].match.instructorOverlapCount, 3);
  assert.equal(rows[1].user.username, 'u2x'); // 2 shared instructors
  const uiRow = rows.find((r) => r.user.username === 'uix');
  assert.equal(uiRow.match.instructorOverlapCount, 1);
  assert.equal(uiRow.match.courseOverlapCount, 0); // instructor-only match
});

test('sort=time puts time-overlap users on top and counts partial overlaps', async () => {
  const rows = await discover(me.cookie, 'sort=time');
  assert.equal(rows[0].user.username, 'u3x'); // 3 time overlaps
  const utRow = rows.find((r) => r.user.username === 'utx');
  const upRow = rows.find((r) => r.user.username === 'upx');
  // CHEM 14A (MW 14:00-15:50) overlaps my CS 35L exactly (110min x2) AND my
  // MATH 131A 13:00-14:50 partially (50min x2).
  assert.equal(utRow.match.timeOverlapCount, 2);
  assert.equal(utRow.match.totalOverlapMinutes, 110 * 2 + 50 * 2);
  assert.equal(upRow.match.timeOverlapCount, 1); // PSYC 1 partial vs CS 35L
  assert.equal(upRow.match.totalOverlapMinutes, 50 * 2);
});

test('sort=best (default) ranks multi-dimension overlap first', async () => {
  const rows = await discover(me.cookie);
  assert.equal(rows[0].user.username, 'u3x');
  // score decreases monotonically
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1].match.totalScore >= rows[i].match.totalScore);
  }
});

test('match payload explains WHY users match', async () => {
  const rows = await discover(me.cookie, 'sort=course');
  const u3 = rows[0];
  assert.deepEqual(u3.match.matchedCourses.sort(), ['CS 111', 'CS 35L', 'MATH 131A']);
  assert.ok(Array.isArray(u3.match.matchedInstructors));
  assert.ok(u3.match.matchedInstructors.length === 3);
  assert.ok(u3.match.totalScore > 0);
  assert.ok(typeof u3.match.courseOverlapRatio === 'number');
});

test('filters: course filter with variant notation finds the right people', async () => {
  const rows = await discover(me.cookie, 'sort=course&course=CS35L');
  assert.ok(rows.length >= 3);
  for (const r of rows) {
    assert.ok(r.match.courseOverlapCount >= 1 || r.match.instructorOverlapCount > 0 || r.match.timeOverlapCount > 0);
  }
  const usernames = rows.map((r) => r.user.username);
  assert.ok(usernames.includes('u3x'));
});

test('filters: course OR within category, AND across categories', async () => {
  // CS35L OR CS111
  const rows1 = await discover(me.cookie, 'course=CS35L,CS111');
  const ids1 = rows1.map((r) => r.user.username);
  assert.ok(ids1.includes('u1x')); // has CS 35L
  assert.ok(ids1.includes('u3x'));

  // CS35L AND instructor Eggert -> u1 has Jane Doe so excluded
  const rows2 = await discover(me.cookie, 'course=CS35L&instructor=Eggert');
  const ids2 = rows2.map((r) => r.user.username);
  assert.ok(!ids2.includes('u1x'));
  assert.ok(ids2.includes('u3x'));
});

test('filters: day filter (Tue) and time filter (14:00)', async () => {
  const tue = await discover(me.cookie, 'day=TUE');
  const tueIds = tue.map((r) => r.user.username);
  assert.ok(tueIds.includes('u1x')); // CS 35L on Tuesday
  assert.ok(!tueIds.includes('utx')); // CHEM is MW only

  const at2 = await discover(me.cookie, 'time=14:00');
  const at2Ids = at2.map((r) => r.user.username);
  assert.ok(at2Ids.includes('utx')); // MW 14:00-15:50 covers 14:00
  assert.ok(!at2Ids.includes('upx')); // PSYC 15:00-16:50 does NOT cover 14:00
});

test('filters: combined day+time (Tue 2pm)', async () => {
  const rows = await discover(me.cookie, 'day=MON&time=14:00');
  const ids = rows.map((r) => r.user.username);
  assert.ok(ids.includes('utx'));
  // up starts at 15:00 so a 14:00 filter should NOT match them
  assert.ok(!ids.includes('upx'));
});

test('filters: fuzzy course search (partial code, name, casing)', async () => {
  // "CS 35" (partial) finds everyone sharing CS 35L
  const partial = await discover(me.cookie, 'course=CS 35');
  const partialIds = partial.map((r) => r.user.username);
  assert.ok(partialIds.includes('u3x'));
  assert.ok(partialIds.includes('u1x')); // has CS 35L (Jane Doe section)
  assert.ok(!partialIds.includes('uix')); // ui has CS 31, not 35L

  // course-name search: CS 35L is "Intro to Programming in Python"
  const byName = await discover(me.cookie, 'course=python');
  assert.ok(byName.map((r) => r.user.username).includes('u3x'));

  // lowercase + no spaces
  const loose = await discover(me.cookie, 'course=cs35');
  assert.ok(loose.map((r) => r.user.username).includes('u3x'));

  // partial instructor: "egg" hits Eggert courses
  const egg = await discover(me.cookie, 'instructor=egg');
  const eggIds = egg.map((r) => r.user.username);
  assert.ok(eggIds.includes('u3x'));
  assert.ok(eggIds.includes('uix')); // CS 31 with Paul R. Eggert
  assert.ok(!eggIds.includes('u1x')); // Jane Doe only

  // "12pm" style time input equals 14:00 filter? No — 12:00. Use "2pm".
  const pm = await discover(me.cookie, 'time=2pm');
  const pmIds = pm.map((r) => r.user.username);
  const at2 = await discover(me.cookie, 'time=14:00');
  assert.deepEqual(pmIds.sort(), at2.map((r) => r.user.username).sort());
});

test('unauthenticated discover is rejected', async () => {
  const res = await fetch(`${ctx.base}/api/discover`);
  assert.equal(res.status, 401);
});
