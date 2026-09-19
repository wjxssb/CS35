// timeutil.js — canonical weekday + meeting time parsing.
// Internal representation: weekdays are MON|TUE|WED|THU|FRI|SAT|SUN,
// times are integer minutes since midnight (0..1439). Never compare raw strings.

export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

const NAME_TO_DAY = {
  MON: 'MON', MONDAY: 'MON',
  TUE: 'TUE', TUESDAY: 'TUE',
  WED: 'WED', WEDNESDAY: 'WED',
  THU: 'THU', THURS: 'THU', THURSDAY: 'THU',
  FRI: 'FRI', FRIDAY: 'FRI',
  SAT: 'SAT', SATURDAY: 'SAT',
  SUN: 'SUN', SUNDAY: 'SUN',
};

// Single-letter codes commonly used on university schedules.
const LETTER_TO_DAY = { M: 'MON', T: 'TUE', W: 'WED', R: 'THU', F: 'FRI', S: 'SAT', U: 'SUN' };

// Common multi-letter compounds.
const COMPOUND_DAYS = {
  MW: ['MON', 'WED'],
  MWF: ['MON', 'WED', 'FRI'],
  MWH: ['MON', 'WED', 'SAT'],
  MTW: ['MON', 'TUE', 'WED'],
  MTR: ['MON', 'TUE', 'THU'],
  MTWR: ['MON', 'TUE', 'WED', 'THU'],
  MTF: ['MON', 'TUE', 'FRI'],
  TW: ['TUE', 'WED'],
  TR: ['TUE', 'THU'],
  TH: ['TUE', 'THU'],
  TTH: ['TUE', 'THU'],
  TWF: ['TUE', 'WED', 'FRI'],
  TF: ['TUE', 'FRI'],
  TFRI: ['TUE', 'FRI'],
};

function uniqueSorted(days) {
  const seen = new Set();
  for (const d of WEEKDAYS) {
    if (days.includes(d)) seen.add(d);
  }
  return [...seen];
}

/**
 * Parse a day expression into canonical weekday codes.
 * Handles: "Mon/Wed", "MW", "MWF", "TR", "TTh", "Mon-Fri", "M, T, W", "R" (Thu).
 * Returns array of WEEKDAYS codes, or null if unparseable.
 */
export function parseDays(input) {
  if (input == null) return null;
  if (Array.isArray(input)) {
    const out = input.map((x) => parseDays(x)).filter(Boolean);
    if (out.length === 0) return null;
    const flat = out.flat();
    return flat.length ? uniqueSorted(flat) : null;
  }
  let s = String(input).trim().toUpperCase();
  if (!s) return null;
  s = s.replace(/&/g, ' ').replace(/\./g, '');

  // Explicit range: "MON-FRI" / "MON - FRI" / "M-F"
  const range = s.match(/^([A-Z]{1,9})\s*[-–—]\s*([A-Z]{1,9})$/);
  if (range) {
    const a = parseDays(range[1]);
    const b = parseDays(range[2]);
    if (a && b && a.length === 1 && b.length === 1) {
      const ai = WEEKDAYS.indexOf(a[0]);
      const bi = WEEKDAYS.indexOf(b[0]);
      if (ai !== -1 && bi !== -1 && bi >= ai) {
        return uniqueSorted(WEEKDAYS.slice(ai, bi + 1));
      }
    }
  }

  // Split on common separators.
  const parts = s.split(/[\s/,]+/).filter(Boolean);
  const days = [];
  let parsedAny = false;
  for (const part of parts) {
    if (NAME_TO_DAY[part]) {
      days.push(NAME_TO_DAY[part]);
      parsedAny = true;
      continue;
    }
    if (COMPOUND_DAYS[part]) {
      days.push(...COMPOUND_DAYS[part]);
      parsedAny = true;
      continue;
    }
    // Letter scan for compounds like "MWH", "MTWR", or single letters.
    const scanned = scanLetterCompound(part);
    if (scanned) {
      days.push(...scanned);
      parsedAny = true;
      continue;
    }
    // Unknown token — reject the whole expression rather than guessing.
    return null;
  }
  if (!parsedAny) return null;
  return uniqueSorted(days);
}

function scanLetterCompound(part) {
  const out = [];
  for (const ch of part) {
    const day = LETTER_TO_DAY[ch];
    if (!day) return null;
    out.push(day);
  }
  return out.length ? out : null;
}

/**
 * Parse a single time like "2:30 PM", "14:30", "2 PM" into minutes since
 * midnight, or null when unparseable.
 */
export function parseTimeToMinutes(input) {
  if (input == null) return null;
  const s = String(input).trim().toUpperCase().replace(/[.\s]+/g, ' ');
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?(?::\d{2})?\s*(AM|PM)?$/);
  if (!m) return null;
  let hour = Number(m[1]);
  const minute = m[2] ? Number(m[2]) : 0;
  const meridiem = m[3];
  if (minute > 59) return null;
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = meridiem === 'PM' ? hour % 12 + 12 : hour % 12;
  } else if (hour > 23) {
    return null;
  }
  return hour * 60 + minute;
}

const TIME_TOKEN = /(\d{1,2}(?::\d{2})?(?::\d{2})?\s*(?:AM|PM)?)/;

/**
 * Parse a meeting time range. Accepts "2:00 PM - 3:50 PM", "14:00-15:50",
 * "2pm–4pm", "2:00-3:50PM" (shared meridiem). Returns
 * { startMinutes, endMinutes } or null. When end < start the meeting is
 * assumed to cross midnight (end becomes > 1440).
 */
export function parseTimeRange(input) {
  if (input == null) return null;
  const s = String(input).trim().toUpperCase();
  if (!s) return null;
  const tokens = [...s.matchAll(new RegExp(TIME_TOKEN.source, 'g'))].map((m) => m[1]);
  if (tokens.length < 2) return null;
  // A range uses the first two time tokens; anything after is ignored.
  let start = parseTimeToMinutes(tokens[0]);
  let end = parseTimeToMinutes(tokens[1]);
  if (start == null || end == null) return null;
  const rawSecond = tokens[1].trim();
  // Inherit meridiem from the first token, e.g. "2:00PM - 3:50".
  if (!/(AM|PM)$/i.test(rawSecond) && /(AM|PM)$/i.test(tokens[0].trim())) {
    const mer = /PM$/i.test(tokens[0].trim()) ? 1 : -1;
    const bare = parseTimeToMinutes(rawSecond.replace(/\s*$/,''));
    if (bare != null) {
      if (mer > 0) end = bare % 720 + 720;
      else end = bare % 720;
    }
  }
  if (start === end) return null;
  if (end < start) end += 24 * 60; // crosses midnight
  return { startMinutes: start, endMinutes: end };
}

/** Format minutes since midnight as "2:00 PM". */
export function formatMinutesTo12h(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  const hour24 = Math.floor(m / 60);
  const min = m % 60;
  const mer = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:${String(min).padStart(2, '0')} ${mer}`;
}

/** Format minutes since midnight as "14:00". */
export function formatMinutesTo24h(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Overlap minutes between two meetings on a single shared day.
 * Meetings may cross midnight (endMinutes > 1440).
 */
export function intervalOverlapMinutes(startA, endA, startB, endB) {
  const split = (s, e) => {
    if (e <= s) return [];
    if (e <= 1440) return [[s, e]];
    return [[s, 1440], [0, e - 1440]];
  };
  const ia = split(startA, Math.min(endA, 1440 * 2));
  const ib = split(startB, Math.min(endB, 1440 * 2));
  let total = 0;
  for (const [s1, e1] of ia) {
    for (const [s2, e2] of ib) {
      total += Math.max(0, Math.min(e1, e2) - Math.max(s1, s2));
    }
  }
  return total;
}

/**
 * Overlap minutes between two meetings (all shared days).
 * meeting: { days: string[], startMinutes: number, endMinutes: number }
 * Returns total minutes (0 when no shared day or no time intersection).
 */
export function meetingOverlapMinutes(a, b) {
  const shared = a.days.filter((d) => b.days.includes(d));
  if (shared.length === 0) return 0;
  return shared.length * intervalOverlapMinutes(a.startMinutes, a.endMinutes, b.startMinutes, b.endMinutes);
}

/** True when two meetings share at least one day and minute. */
export function doesMeetingOverlap(a, b) {
  return meetingOverlapMinutes(a, b) > 0;
}

/**
 * Parse a stored meeting row ({days: "MON,WED" or "[...]", start_time, end_time})
 * into the internal representation. Returns null when unparseable.
 */
export function normalizeMeeting(meeting) {
  if (!meeting) return null;
  let daysInput = meeting.days;
  if (typeof daysInput === 'string' && daysInput.trim().startsWith('[')) {
    try {
      daysInput = JSON.parse(daysInput);
    } catch {
      return null;
    }
  }
  const days = parseDays(daysInput);
  if (!days) return null;
  const startMinutes = parseTimeToMinutes(meeting.start_time);
  const endMinutes = parseTimeToMinutes(meeting.end_time);
  if (startMinutes == null || endMinutes == null) return null;
  let end = endMinutes;
  if (end <= startMinutes) end += 24 * 60;
  return {
    days,
    startMinutes,
    endMinutes: end,
    location: meeting.location || '',
    label: `${days.map(shortDay).join('')} ${formatMinutesTo12h(startMinutes)}–${formatMinutesTo12h(end)}`,
  };
}

function shortDay(day) {
  return day.slice(0, 1) === 'T' && day === 'THU' ? 'R' : day.slice(0, 1);
}
