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
