// courseutil.js — normalization for course codes and instructor names.
// Original display values are always preserved; these keys exist so that
// "CS 35L", "CS35L" and "COM SCI 35L" can be recognized as the same course.

// Department name aliases (UCLA-style) mapped to the canonical short code.
const DEPT_ALIASES = {
  'com sci': 'cs',
  'comsci': 'cs',
  'comp sci': 'cs',
  'compsci': 'cs',
  'computer science': 'cs',
  'cs': 'cs',
  'math': 'math',
  'mathematics': 'math',
  'ece': 'ece',
  'electrical computer engineering': 'ece',
  'bio': 'bio',
  'biology': 'bio',
  'biol': 'bio',
  'biological sciences': 'bio',
  'chem': 'chem',
  'chemistry': 'chem',
  'physics': 'phys',
  'phys': 'phys',
  'psych': 'psych',
  'psy': 'psych',
  'psychology': 'psych',
  'engl': 'engl',
  'english': 'engl',
  'phil': 'phil',
  'philosophy': 'phil',
  'hist': 'hist',
  'history': 'hist',
  'econ': 'econ',
  'economics': 'econ',
  'stat': 'stat',
  'statistics': 'stat',
  'art': 'art',
  'mus': 'mus',
  'music': 'mus',
  'soc': 'soc',
  'sociology': 'soc',
  'anth': 'anth',
  'anthropology': 'anth',
  'cs35': 'cs',
};

function cleanText(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize a course reference to a canonical matching key.
 * "CS 35L" / "CS35L" / "COM SCI 35L" / "Computer Science 35L" -> "cs35l"
 * Course titles after the code are ignored:
 * "CS 35L Intro to Programming in Python" -> "cs35l".
 * Returns '' for empty input.
 */
export function normalizeCourse(input) {
  const text = cleanText(input);
  if (!text) return '';
  // dept + number near the start of the string; the number may carry a
  // prefix letter (e.g. UCLA "CS M146" = masters-level) and/or suffix letter
  // (e.g. "CS 35L").
  const withDept = text.match(/^([a-z]+(?: [a-z]+)*?)\s+([a-z]?\d{1,4}[a-z]?)\b/);
  if (withDept) {
    const deptRaw = withDept[1].trim();
    const dept = DEPT_ALIASES[deptRaw] || deptRaw;
    return `${dept}${withDept[2]}`;
  }
  // Bare number with optional letters ("35L") — no department part.
  const bare = text.match(/^([a-z]?\d{1,4}[a-z]?)\b/);
  return bare ? bare[1] : text;
}

/**
 * Extract the short code (e.g. "CS 35L") from a course display string, if it
 * is present. Used for UI chips. Returns the trimmed input as fallback.
 */
export function extractCourseCode(input) {
  const s = String(input || '').trim();
  // If the whole string is already a code, keep it intact ("COM SCI 35L").
  if (/^[A-Za-z]{2,5}(?:\s?[A-Za-z]+)*\s?\d{1,4}[A-Za-z]?$/.test(s)) return s;
  const m = s.match(/([A-Za-z]{2,5}\s?\d{1,4}[A-Za-z]?)/);
  return m ? m[1].replace(/\s+/g, ' ') : s;
}

function cleanName(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/,/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalize an instructor name for matching.
 * "Paul Eggert" / "paul  eggert" / "Paul R. Eggert" / "Eggert, Paul"
 * all normalize to forms that instructorsMatch() can equate.
 * "Last, First" form is reordered to "First Last" before cleaning.
 */
export function normalizeInstructor(input) {
  if (!input) return '';
  const raw = String(input).trim();
  if (!raw) return '';
  const comma = raw.split(',');
  if (comma.length === 2 && comma[0].trim() && comma[1].trim()) {
    return `${cleanName(comma[1])} ${cleanName(comma[0])}`.trim();
  }
  return cleanName(raw);
}

export function instructorTokens(name) {
  return normalizeInstructor(name).split(' ').filter(Boolean);
}

/**
 * Decide whether two instructor display names likely refer to the same
 * person. Deterministic rules:
 *  - exact normalized match, or
 *  - same first AND last token and one token list contains the other
 *    (handles middle initials: "paul r eggert" vs "paul eggert"), or
 *  - "last, first" style: first token of one equals last token of the other
 *    AND the remaining tokens align.
 */
export function instructorsMatch(a, b) {
  const na = normalizeInstructor(a);
  const nb = normalizeInstructor(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ta = na.split(' ');
  const tb = nb.split(' ');
  // Single-token query: treat it as a surname search ("Eggert" -> "Paul Eggert").
  if (ta.length >= 2 && tb.length === 1) return ta[ta.length - 1] === tb[0];
  if (tb.length >= 2 && ta.length === 1) return tb[tb.length - 1] === ta[0];
  if (ta.length < 2 || tb.length < 2) return false;
  const sameFirstLast = ta[0] === tb[0] && ta[ta.length - 1] === tb[tb.length - 1];
  const subsequence = isSubsequence(ta, tb) || isSubsequence(tb, ta);
  if (sameFirstLast && subsequence) return true;
  // "eggert paul" vs "paul eggert"
  if (ta.length === tb.length) {
    const flipped = ta.every((tok, i) => tok === tb[tb.length - 1 - i]);
    if (flipped && ta[0] !== tb[0]) return true;
  }
  return false;
}

function isSubsequence(a, b) {
  // every token of a appears in b in order
  let j = 0;
  for (let i = 0; i < b.length && j < a.length; i++) {
    if (b[i] === a[j]) j++;
  }
  return j === a.length;
}

/**
 * Fuzzy course search (Discover filter). A query matches a course when
 *   - the normalized query key is a SUBSTRING of the normalized course-code
 *     key ("CS 35" -> cs35 ⊂ cs35l, "131" ⊂ math131a), or
 *   - every query word appears in the course name ("python" hits
 *     "Intro to Programming in Python").
 * Case, spacing and partial input are all tolerated by design.
 */
export function courseSearchMatches(query, course) {
  const q = String(query || '').trim();
  if (!q) return false;
  const qKey = normalizeCourse(q);
  const codeKey = normalizeCourse(course?.course_code || '');
  if (qKey && codeKey && codeKey.includes(qKey)) return true;
  const name = String(course?.course_name || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (name) {
    const words = q
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    if (words.length && words.every((w) => name.includes(w))) return true;
  }
  return false;
}

/**
 * Fuzzy instructor search (Discover filter): every query token must
 * prefix-match some token of the candidate's normalized name, so "Eggert",
 * "egger" and "paul e" all find "Paul R. Eggert".
 */
export function instructorSearchMatches(query, instructorName) {
  const nq = normalizeInstructor(query);
  const nc = normalizeInstructor(instructorName);
  if (!nq || !nc) return false;
  if (nq === nc) return true;
  const qt = nq.split(' ').filter(Boolean);
  const ct = nc.split(' ').filter(Boolean);
  return qt.every((q) => ct.some((c) => c.startsWith(q)));
}
