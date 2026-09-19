import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDays,
  parseTimeToMinutes,
  parseTimeRange,
  formatMinutesTo12h,
  formatMinutesTo24h,
  meetingOverlapMinutes,
  doesMeetingOverlap,
  normalizeMeeting,
  intervalOverlapMinutes,
} from '../../src/timeutil.js';

test('parseDays: full names and 3-letter codes', () => {
  assert.deepEqual(parseDays('MON'), ['MON']);
  assert.deepEqual(parseDays('monday'), ['MON']);
  assert.deepEqual(parseDays('Tuesday'), ['TUE']);
  assert.deepEqual(parseDays('tuesday'), ['TUE']);
});

test('parseDays: single letters', () => {
  assert.deepEqual(parseDays('M'), ['MON']);
  assert.deepEqual(parseDays('R'), ['THU']);
  assert.deepEqual(parseDays('F'), ['FRI']);
});

test('parseDays: compounds', () => {
  assert.deepEqual(parseDays('MW'), ['MON', 'WED']);
  assert.deepEqual(parseDays('MWF'), ['MON', 'WED', 'FRI']);
  assert.deepEqual(parseDays('TR'), ['TUE', 'THU']);
  assert.deepEqual(parseDays('TTh'), ['TUE', 'THU']);
  assert.deepEqual(parseDays('MTW'), ['MON', 'TUE', 'WED']);
  assert.deepEqual(parseDays('MTWR'), ['MON', 'TUE', 'WED', 'THU']);
});

test('parseDays: separators and lists', () => {
  assert.deepEqual(parseDays('Mon/Wed'), ['MON', 'WED']);
  assert.deepEqual(parseDays('Mon, Wed, Fri'), ['MON', 'WED', 'FRI']);
  assert.deepEqual(parseDays('M W F'), ['MON', 'WED', 'FRI']);
});

test('parseDays: ranges', () => {
  assert.deepEqual(parseDays('MON-FRI'), ['MON', 'TUE', 'WED', 'THU', 'FRI']);
  assert.deepEqual(parseDays('Mon - Fri'), ['MON', 'TUE', 'WED', 'THU', 'FRI']);
});

test('parseDays: arrays and null', () => {
  assert.deepEqual(parseDays(['MON', 'WED']), ['MON', 'WED']);
  assert.equal(parseDays(''), null);
  assert.equal(parseDays(null), null);
  assert.equal(parseDays('XYZZY'), null);
});

test('parseTimeToMinutes: 24h and 12h formats', () => {
  assert.equal(parseTimeToMinutes('14:00'), 840);
  assert.equal(parseTimeToMinutes('2:00 PM'), 840);
  assert.equal(parseTimeToMinutes('2:00 pm'), 840);
  assert.equal(parseTimeToMinutes('2PM'), 840);
  assert.equal(parseTimeToMinutes('2 PM'), 840);
  assert.equal(parseTimeToMinutes('11:59 PM'), 23 * 60 + 59);
  assert.equal(parseTimeToMinutes('12:00 AM'), 0);
  assert.equal(parseTimeToMinutes('12:00 PM'), 720);
  assert.equal(parseTimeToMinutes('9:05'), 545);
});

test('parseTimeToMinutes: invalid values', () => {
  assert.equal(parseTimeToMinutes(''), null);
  assert.equal(parseTimeToMinutes('25:00'), null);
  assert.equal(parseTimeToMinutes('2:60 PM'), null);
  assert.equal(parseTimeToMinutes('abc'), null);
});

test('parseTimeRange: standard ranges', () => {
  assert.deepEqual(parseTimeRange('2:00 PM - 3:50 PM'), { startMinutes: 840, endMinutes: 950 });
  assert.deepEqual(parseTimeRange('14:00-15:50'), { startMinutes: 840, endMinutes: 950 });
  assert.deepEqual(parseTimeRange('2pm-4pm'), { startMinutes: 840, endMinutes: 960 });
  assert.deepEqual(parseTimeRange('10:00 AM - 11:50 AM'), { startMinutes: 600, endMinutes: 710 });
});

test('parseTimeRange: shared meridiem', () => {
  // "2:00PM - 3:50" — the second time inherits PM
  assert.deepEqual(parseTimeRange('2:00PM - 3:50'), { startMinutes: 840, endMinutes: 950 });
});

test('parseTimeRange: cross-midnight', () => {
  const r = parseTimeRange('11:00 PM - 12:00 AM');
  assert.deepEqual(r, { startMinutes: 23 * 60, endMinutes: 24 * 60 });
});

test('parseTimeRange: invalid', () => {
  assert.equal(parseTimeRange(''), null);
  assert.equal(parseTimeRange('10:00'), null); // single time
  assert.equal(parseTimeRange('10:00 - 10:00'), null); // zero length
});

test('format helpers', () => {
  assert.equal(formatMinutesTo12h(840), '2:00 PM');
  assert.equal(formatMinutesTo12h(0), '12:00 AM');
  assert.equal(formatMinutesTo12h(720), '12:00 PM');
  assert.equal(formatMinutesTo12h(950), '3:50 PM');
  assert.equal(formatMinutesTo24h(840), '14:00');
  assert.equal(formatMinutesTo24h(950), '15:50');
});

test('intervalOverlapMinutes: exact / partial / none', () => {
  // 10:00-11:00 vs 10:30-12:00 -> 30 minutes
  assert.equal(intervalOverlapMinutes(600, 660, 630, 720), 30);
  // identical
  assert.equal(intervalOverlapMinutes(600, 660, 600, 660), 60);
  // none (touching endpoints is not overlap)
  assert.equal(intervalOverlapMinutes(600, 660, 660, 720), 0);
  // one contains the other
  assert.equal(intervalOverlapMinutes(600, 720, 630, 690), 60);
});

test('meeting overlap: exact, partial, different day, no overlap', () => {
  const exactA = { days: ['MON', 'WED'], startMinutes: 840, endMinutes: 950 };
  const exactB = { days: ['MON', 'WED'], startMinutes: 840, endMinutes: 950 };
  assert.equal(meetingOverlapMinutes(exactA, exactB), 110 * 2); // 110 min on two days
  assert.equal(doesMeetingOverlap(exactA, exactB), true);

  const partial = { days: ['MON', 'WED'], startMinutes: 900, endMinutes: 1010 };
  // MON/WED 15:00-16:50 vs 14:00-15:50 -> 50 min per shared day
  assert.equal(meetingOverlapMinutes(exactA, partial), 50 * 2);

  const diffDay = { days: ['TUE', 'THU'], startMinutes: 840, endMinutes: 950 };
  assert.equal(meetingOverlapMinutes(exactA, diffDay), 0);
  assert.equal(doesMeetingOverlap(exactA, diffDay), false);

  const none = { days: ['MON', 'WED'], startMinutes: 1020, endMinutes: 1100 };
  assert.equal(meetingOverlapMinutes(exactA, none), 0);
});

test('meeting overlap: day intersection only', () => {
  const a = { days: ['MON', 'WED', 'FRI'], startMinutes: 840, endMinutes: 950 };
  const b = { days: ['WED', 'FRI'], startMinutes: 840, endMinutes: 950 };
  assert.equal(meetingOverlapMinutes(a, b), 110 * 2);
});

test('meeting overlap: cross-midnight meeting', () => {
  const night = { days: ['MON'], startMinutes: 23 * 60, endMinutes: 24 * 60 + 30 };
  const early = { days: ['MON'], startMinutes: 0, endMinutes: 60 };
  assert.equal(meetingOverlapMinutes(night, early), 30);
});

test('normalizeMeeting: stored row to internal form', () => {
  const m = normalizeMeeting({ days: 'MON,WED', start_time: '14:00', end_time: '15:50', location: 'ENG 1102' });
  assert.deepEqual(m.days, ['MON', 'WED']);
  assert.equal(m.startMinutes, 840);
  assert.equal(m.endMinutes, 950);
  assert.equal(m.location, 'ENG 1102');
  assert.match(m.label, /2:00 PM/);

  // JSON array form for days
  const m2 = normalizeMeeting({ days: '["TUE","THU"]', start_time: '10:00', end_time: '11:50' });
  assert.deepEqual(m2.days, ['TUE', 'THU']);

  assert.equal(normalizeMeeting({ days: 'XXX', start_time: '10:00', end_time: '11:00' }), null);
  assert.equal(normalizeMeeting({ days: 'MON', start_time: 'bad', end_time: '11:00' }), null);
});
