import { Router } from 'express';
import crypto from 'node:crypto';
import { getDb, rowToCourse } from '../db.js';
import { requireAuth } from '../auth.js';
import { textField, parseMeetings, findDuplicateCourse } from '../validate.js';

const router = Router();
router.use(requireAuth);

function ownCourse(req, res) {
  const d = getDb();
  const course = d.prepare('SELECT * FROM courses WHERE id = ?').get(req.params.id);
  if (!course || course.user_id !== req.user.id) {
    res.status(404).json({ error: 'Course not found.' });
    return null;
  }
  return course;
}

function replaceMeetings(d, courseId, meetings) {
  d.prepare('DELETE FROM meetings WHERE course_id = ?').run(courseId);
  const insert = d.prepare('INSERT INTO meetings (id, course_id, days, start_time, end_time, location) VALUES (?, ?, ?, ?, ?, ?)');
  for (const m of meetings) {
    insert.run(crypto.randomUUID(), courseId, m.days.join(','), m.start_time, m.end_time, m.location);
  }
}

/** GET /api/courses — my courses. */
router.get('/', (req, res) => {
  const d = getDb();
  const rows = d.prepare('SELECT * FROM courses WHERE user_id = ? ORDER BY course_code').all(req.user.id);
  res.json({ courses: rows.map(rowToCourse) });
});

/** POST /api/courses — create a course. */
router.post('/', (req, res) => {
  const body = req.body || {};
  const code = textField(body.course_code, 'course_code', 40, { required: true });
  if (code.error) return res.status(400).json({ error: code.error });
  const name = textField(body.course_name, 'course_name', 120);
  if (name.error) return res.status(400).json({ error: name.error });
  const instructor = textField(body.instructor, 'instructor', 120);
  if (instructor.error) return res.status(400).json({ error: instructor.error });
  const section = textField(body.section, 'section', 20);
  if (section.error) return res.status(400).json({ error: section.error });
  const location = textField(body.location, 'location', 80);
  if (location.error) return res.status(400).json({ error: location.error });
  const term = textField(body.term, 'term', 40);
  if (term.error) return res.status(400).json({ error: term.error });
  const { meetings, error } = parseMeetings(body.meetings);
  if (error) return res.status(400).json({ error });

  const d = getDb();
  const dup = findDuplicateCourse(req.user.id, code.value, meetings);
  if (dup) {
    return res.status(409).json({ error: `Duplicate: ${dup.course_code} already exists with the same days and time.` });
  }
  const id = crypto.randomUUID();
  d.prepare(
    'INSERT INTO courses (id, user_id, course_code, course_name, instructor, section, location, term) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.user.id, code.value, name.value, instructor.value, section.value, location.value, term.value);
  replaceMeetings(d, id, meetings);
  const created = d.prepare('SELECT * FROM courses WHERE id = ?').get(id);
  res.status(201).json({ course: rowToCourse(created) });
});

/** PATCH /api/courses/:id — update my course (fields + meetings replaced). */
router.patch('/:id', (req, res) => {
  const course = ownCourse(req, res);
  if (!course) return;
  const body = req.body || {};
  const d = getDb();

  const updates = {};
  const fields = [
    ['course_code', 40, true],
    ['course_name', 120, false],
    ['instructor', 120, false],
    ['section', 20, false],
    ['location', 80, false],
    ['term', 40, false],
  ];
  for (const [field, max, required] of fields) {
    if (body[field] !== undefined) {
      const { value, error } = textField(body[field], field, max, { required });
      if (error) return res.status(400).json({ error });
      updates[field] = value;
    }
  }
  let meetings = course.meetings ? course.meetings.map((m) => ({ days: m.days, start_time: m.start_time, end_time: m.end_time, location: m.location })) : [];
  if (body.meetings !== undefined) {
    const parsed = parseMeetings(body.meetings);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    meetings = parsed.meetings;
  }

  // Duplicate guard: same course code (normalized) + same meeting window already exists.
  if (updates.course_code || body.meetings !== undefined) {
    const newCode = updates.course_code ?? course.course_code;
    const dup = findDuplicateCourse(req.user.id, newCode, meetings, course.id);
    if (dup) {
      return res.status(409).json({ error: `Duplicate: ${dup.course_code} already exists with the same days and time.` });
    }
  }

  if (Object.keys(updates).length > 0) {
    const sets = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
    d.prepare(`UPDATE courses SET ${sets}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).run(...Object.values(updates), course.id);
  }
  replaceMeetings(d, course.id, meetings);
  const updated = d.prepare('SELECT * FROM courses WHERE id = ?').get(course.id);
  res.json({ course: rowToCourse(updated) });
});

/** DELETE /api/courses/:id — delete my course (meetings cascade). */
router.delete('/:id', (req, res) => {
  const course = ownCourse(req, res);
  if (!course) return;
  getDb().prepare('DELETE FROM courses WHERE id = ?').run(course.id);
  res.json({ ok: true });
});

export default router;
