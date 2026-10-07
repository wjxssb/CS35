/** Display helpers shared across pages. */

const DAY_LABELS = { MON: 'Mon', TUE: 'Tue', WED: 'Wed', THU: 'Thu', FRI: 'Fri', SAT: 'Sat', SUN: 'Sun' };

/** "MON,WED" -> "Mon/Wed" */
export function formatDays(days) {
  if (!days) return '';
  const list = String(days).split(',').filter(Boolean);
  return list.map((d) => DAY_LABELS[d] || d).join('/');
}

/** "14:00" -> "2:00 PM" */
export function formatTime(t) {
  if (!t) return '';
  const m = String(t).trim().match(/^(\d{1,2}):(\d{2})/);
  if (!m) return t;
  let hour = Number(m[1]);
  const min = m[2];
  const mer = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour}:${min} ${mer}`;
}

export function meetingLabel(meeting) {
  if (!meeting) return '';
  const days = formatDays(meeting.days) || 'TBA';
  const start = formatTime(meeting.start_time);
  const end = formatTime(meeting.end_time);
  return `${days} ${start}–${end}`;
}

export function initials(name) {
  const n = String(name || '?').trim();
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
export const DAY_OPTIONS = WEEKDAYS.map((d) => ({ value: d, label: DAY_LABELS[d] }));

/** Local wall-clock time ("2:00 PM") for an ISO timestamp — chat bubbles.
 *  (formatTime() itself is wall-clock only, used for course meeting times.) */
export function formatLocalTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString.endsWith('Z') ? isoString : isoString + 'Z');
  if (Number.isNaN(d.getTime())) return '';
  return formatTime(`${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`);
}

/** Compact relative time: "just now", "5m ago", "3h ago", "2d ago", else the date. */
export function timeAgo(isoString) {
  if (!isoString) return '';
  const then = new Date(isoString.endsWith('Z') ? isoString : isoString + 'Z');
  if (Number.isNaN(then.getTime())) return isoString;
  const diff = Date.now() - then.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hrs = Math.floor(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return then.toLocaleDateString('en-US');
}
