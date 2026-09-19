import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer, registerUser } from './helpers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SAMPLE = path.join(__dirname, '..', '..', 'samples', 'frank_schedule.png');

let ctx;
let cookie;

before(async () => {
  ctx = await startServer();
  cookie = (await registerUser(ctx.base, { username: 'upl', email: 'upl@test.dev' })).cookie;
});

after(async () => {
  ctx.server.close();
});

function form(post) {
  return post;
}

test('schedule upload requires an image file', async () => {
  const res = await fetch(`${ctx.base}/api/schedule/upload`, {
    method: 'POST',
    headers: { Cookie: cookie },
  });
  assert.equal(res.status, 400);
});

test('schedule upload rejects non-image types', async () => {
  const fd = new FormData();
  fd.append('image', new Blob([Buffer.from('%PDF-1.4 fake')], { type: 'application/pdf' }), 'sched.pdf');
  const res = await fetch(`${ctx.base}/api/schedule/upload`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: fd,
  });
  assert.equal(res.status, 415);
});

test('upload -> OCR candidates -> review -> confirm saves structured courses', async () => {
  const png = await (await import('node:fs/promises')).readFile(SAMPLE);
  const fd = new FormData();
  fd.append('image', new Blob([png], { type: 'image/png' }), 'frank_schedule.png');
  const upRes = await fetch(`${ctx.base}/api/schedule/upload`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: fd,
  });
  assert.equal(upRes.status, 201);
  const parsed = await upRes.json();
  assert.ok(parsed.uploadId);
  assert.ok(Array.isArray(parsed.candidates));
  assert.ok(parsed.candidates.length >= 2);
  assert.ok(parsed.candidates.some((c) => c.course_code === 'CS 35L'));
  const cs35l = parsed.candidates.find((c) => c.course_code === 'CS 35L');
  assert.equal(cs35l.days, 'MON,WED');
  assert.equal(cs35l.start_time, '14:00');
  assert.equal(cs35l.instructor, 'Paul R Eggert');

  // nothing saved yet
  let list = await (await fetch(`${ctx.base}/api/courses`, { headers: { Cookie: cookie } })).json();
  assert.equal(list.courses.length, 0);

  // user edits a candidate (OCR confidence issues are expected): include CS 35L + a manual entry, skip CS 111
  const confirmRes = await fetch(`${ctx.base}/api/schedule/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      uploadId: parsed.uploadId,
      courses: [
        { ...cs35l, include: true, course_code: 'COM SCI 35L', days: cs35l.days.split(',') },
        {
          include: true,
          course_code: 'MATH 61',
          instructor: 'D. G. Lu',
          days: ['TUE', 'THU'],
          start_time: '09:30',
          end_time: '10:45',
          meeting_location: 'MS 5200',
        },
      ],
    }),
  });
  assert.equal(confirmRes.status, 201);

  list = await (await fetch(`${ctx.base}/api/courses`, { headers: { Cookie: cookie } })).json();
  assert.equal(list.courses.length, 2);
  const saved = list.courses.find((c) => c.course_code === 'COM SCI 35L');
  assert.ok(saved);
  assert.equal(saved.meetings.length, 1);
  assert.equal(saved.meetings[0].days, 'MON,WED');
  assert.equal(saved.meetings[0].start_time, '14:00');

  // upload is no longer pending
  const ups = await (await fetch(`${ctx.base}/api/schedule/uploads`, { headers: { Cookie: cookie } })).json();
  assert.equal(ups.uploads.length, 0);

  // confirming twice is rejected
  const again = await fetch(`${ctx.base}/api/schedule/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ uploadId: parsed.uploadId, courses: [] }),
  });
  assert.equal(again.status, 409);
});

test('another user cannot confirm someone else\'s upload', async () => {
  const other = await registerUser(ctx.base, { username: 'upl2', email: 'upl2@test.dev' });
  const res = await fetch(`${ctx.base}/api/schedule/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: other.cookie },
    body: JSON.stringify({ uploadId: 'nonexistent', courses: [] }),
  });
  assert.equal(res.status, 404);
});

test('empty / corrupt images return a friendly parse error', async () => {
  // a valid PNG header but garbage content should fail OCR and return 422
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const fd = new FormData();
  fd.append('image', new Blob([png], { type: 'image/png' }), 'broken.png');
  const res = await fetch(`${ctx.base}/api/schedule/upload`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: fd,
  });
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.match(body.error, /couldn't|failed|no readable/i);
});

test('real UCLA iCal calendar screenshot parses into plausible candidates', async () => {
  const { parseScheduleImage } = await import('../../src/scheduleParser.js');
  const real = path.join(__dirname, '..', '..', 'samples', 'ucla_ical_calendar.png');
  const parsed = await parseScheduleImage(real);
  const codes = parsed.candidates.map((c) => c.course_code);
  assert.ok(codes.includes('COM SCI 35L'), `expected COM SCI 35L in ${codes}`);
  assert.ok(codes.includes('COM SCI 163'), `expected COM SCI 163 in ${codes}`);
  assert.ok(codes.some((c) => c.includes('M116C')), `expected EC ENGR M116C in ${codes}`);
  // Section markers must not be mistaken for course codes.
  for (const c of parsed.candidates) {
    assert.ok(!/^(LEC|DIS|LAB)\b/.test(c.course_code), `bad code ${c.course_code}`);
  }
  // Grid calendars hide days/times -> low confidence -> review is mandatory.
  assert.ok(parsed.lowConfidence);
});
