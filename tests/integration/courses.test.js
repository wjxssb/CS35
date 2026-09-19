import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, registerUser, addCourse, CS35L } from './helpers.js';

let ctx;
let cookieA;
let cookieB;
let courseIdA;

before(async () => {
  ctx = await startServer();
  const a = await registerUser(ctx.base, { username: 'owner', email: 'owner@test.dev' });
  const b = await registerUser(ctx.base, { username: 'other', email: 'other@test.dev' });
  cookieA = a.cookie;
  cookieB = b.cookie;
  courseIdA = (await addCourse(ctx.base, cookieA, CS35L)).id;
});

after(async () => {
  ctx.server.close();
});

test('courses persist and include meetings', async () => {
  const res = await fetch(`${ctx.base}/api/courses`, { headers: { Cookie: cookieA } });
  const { courses } = await res.json();
  assert.equal(courses.length, 1);
  assert.equal(courses[0].course_code, 'CS 35L');
  assert.equal(courses[0].instructor, 'Paul R. Eggert');
  assert.equal(courses[0].meetings.length, 1);
  assert.equal(courses[0].meetings[0].start_time, '14:00');
});

test('course validation rejects bad payloads', async () => {
  const post = (body) =>
    fetch(`${ctx.base}/api/courses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieA },
      body: JSON.stringify(body),
    });
  assert.equal((await post({})).status, 400); // no code
  assert.equal((await post({ course_code: 'X'.repeat(50) })).status, 400);
  assert.equal((await post({ course_code: 'CS 1', meetings: [{ days: ['NOPE'], start_time: '10:00', end_time: '11:00' }] })).status, 400);
  assert.equal((await post({ course_code: 'CS 1', meetings: [{ days: ['MON'], start_time: '25:00', end_time: '11:00' }] })).status, 400);
  assert.equal((await post({ course_code: 'CS 1', meetings: [{ days: ['MON'], start_time: '10:00', end_time: '10:00' }] })).status, 400);
  // valid one still works
  assert.equal((await post({ course_code: 'CS 2' })).status, 201);
});

test('duplicate course (same code + same meeting) is rejected with 409', async () => {
  const res = await fetch(`${ctx.base}/api/courses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieA },
    body: JSON.stringify(CS35L),
  });
  assert.equal(res.status, 409);
});

test('same course with a different meeting is allowed', async () => {
  const res = await fetch(`${ctx.base}/api/courses`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookieA },
    body: JSON.stringify({ ...CS35L, section: 'B', meetings: [{ days: ['TUE'], start_time: '09:00', end_time: '10:50' }] }),
  });
  assert.equal(res.status, 201);
  const { course } = await res.json();
  // cleanup to keep later tests clean
  await fetch(`${ctx.base}/api/courses/${course.id}`, { method: 'DELETE', headers: { Cookie: cookieA } });
});

test("users cannot modify or delete another user's course", async () => {
  const patch = await fetch(`${ctx.base}/api/courses/${courseIdA}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookieB },
    body: JSON.stringify({ course_code: 'HACKED 1' }),
  });
  assert.equal(patch.status, 404);

  const del = await fetch(`${ctx.base}/api/courses/${courseIdA}`, {
    method: 'DELETE',
    headers: { Cookie: cookieB },
  });
  assert.equal(del.status, 404);

  // course A is still intact
  const list = await fetch(`${ctx.base}/api/courses`, { headers: { Cookie: cookieA } });
  const { courses } = await list.json();
  assert.ok(courses.some((c) => c.id === courseIdA && c.course_code === 'CS 35L'));
});

test('PATCH updates fields and replaces meetings', async () => {
  const res = await fetch(`${ctx.base}/api/courses/${courseIdA}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookieA },
    body: JSON.stringify({
      course_name: 'Programming in Python',
      meetings: [
        { days: ['MON', 'WED'], start_time: '14:00', end_time: '15:50' },
        { days: ['FRI'], start_time: '14:00', end_time: '14:50', location: 'LAB 1' },
      ],
    }),
  });
  assert.equal(res.status, 200);
  const { course } = await res.json();
  assert.equal(course.course_name, 'Programming in Python');
  assert.equal(course.meetings.length, 2);
});

test('DELETE removes the course and its meetings', async () => {
  const c = await addCourse(ctx.base, cookieA, { course_code: 'TEMP 9' });
  const res = await fetch(`${ctx.base}/api/courses/${c.id}`, { method: 'DELETE', headers: { Cookie: cookieA } });
  assert.equal(res.status, 200);
  const list = await fetch(`${ctx.base}/api/courses`, { headers: { Cookie: cookieA } });
  const { courses } = await list.json();
  assert.ok(!courses.some((x) => x.id === c.id));
});

test('public profile hides email and password data', async () => {
  const meRes = await fetch(`${ctx.base}/api/me`, { headers: { Cookie: cookieA } });
  const { user } = await meRes.json();
  const pub = await fetch(`${ctx.base}/api/users/${user.id}`, { headers: { Cookie: cookieB } });
  assert.equal(pub.status, 200);
  const body = await pub.json();
  assert.equal(body.user.email, undefined);
  assert.equal(JSON.stringify(body).toLowerCase().includes('password'), false);
  assert.equal(body.user.courses.length >= 1, true);
});
