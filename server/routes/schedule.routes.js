import { Router } from 'express';
import multer from 'multer';
import crypto from 'node:crypto';
import path from 'node:path';
import { mkdirSync, rm } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { getDb } from '../db.js';
import { requireAuth } from '../auth.js';
import { config } from '../../src/config.js';
import { validateScheduleImage, parseScheduleImage, ScheduleParseError } from '../../src/scheduleParser.js';
import { parseMeetings, findDuplicateCourse } from '../validate.js';

const router = Router();
router.use(requireAuth);

const scheduleUpload = multer({ limits: { fileSize: config.maxUploadBytes } });

mkdirSync(path.join(config.uploadsDir, 'schedules'), { recursive: true });

/**
 * POST /api/schedule/upload
 * multipart field "image" (jpeg/png/webp).
 * Returns { uploadId, overallConfidence, lowConfidence, candidates }
 * Candidates are stored pending review — nothing becomes a real course
 * until /api/schedule/confirm is called.
 */
router.post('/upload', (req, res, next) => {
  scheduleUpload.single('image')(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: 'Image is too large (max 10 MB).' });
      }
      return res.status(400).json({ error: 'Could not read the uploaded file.' });
    }
    next();
  });
}, async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: 'Missing image file (field name: image).' });

  let validation;
  try {
    validation = validateScheduleImage(file.mimetype, file.buffer);
  } catch (e) {
    if (e instanceof ScheduleParseError) return res.status(e.status).json({ error: e.message, code: e.code });
    return res.status(500).json({ error: 'Failed to validate the upload.' });
  }

  const d = getDb();
  const uploadId = crypto.randomUUID();
  const name = `${uploadId}.${validation.ext}`;
  const relPath = path.join('uploads', 'schedules', name);

  try {
    await writeFile(path.join(config.dataDir, relPath), file.buffer);
    const parsed = await parseScheduleImage(path.join(config.dataDir, relPath), { tesseractBin: config.tesseractBin });

    d.prepare(
      'INSERT INTO schedule_uploads (id, user_id, original_filename, storage_path, status, raw_text) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(uploadId, req.user.id, (file.originalname || '').slice(0, 200), relPath, 'pending', parsed.rawText);
    const insertCandidate = d.prepare(
      `INSERT INTO schedule_candidates
        (id, upload_id, course_code, course_name, instructor, section, location, term, days, start_time, end_time, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const candidates = parsed.candidates.map((c) => {
      const id = crypto.randomUUID();
      insertCandidate.run(
        id, uploadId, c.course_code, c.course_name, c.instructor, c.section,
        c.location, c.term, c.days, c.start_time, c.end_time, c.confidence
      );
      return { id, ...c };
    });

    res.status(201).json({
      uploadId,
      overallConfidence: parsed.overallConfidence,
      lowConfidence: parsed.lowConfidence,
      candidates,
    });
  } catch (e) {
    if (e instanceof ScheduleParseError) {
      d.prepare(
        'INSERT INTO schedule_uploads (id, user_id, original_filename, storage_path, status, raw_text) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(uploadId, req.user.id, (file.originalname || '').slice(0, 200), relPath, 'failed', '');
      return res.status(e.status).json({ error: e.message, code: e.code, uploadId });
    }
    console.error('schedule upload error:', e);
    return res.status(500).json({ error: 'Something went wrong while processing the image.' });
  }
});

function findPendingUpload(req, res) {
  const uploadId = (req.body || {}).uploadId;
  const upload = getDb().prepare('SELECT * FROM schedule_uploads WHERE id = ? AND user_id = ?').get(uploadId, req.user.id);
  if (!upload) {
    res.status(404).json({ error: 'Upload not found.' });
    return null;
  }
  if (upload.status !== 'pending') {
    res.status(409).json({ error: 'This upload was already processed.' });
    return null;
  }
  return upload;
}

/**
 * POST /api/schedule/confirm
 * { uploadId, courses: [{ include: true, course_code, course_name, instructor,
 *   section, location, term, days: [..], start_time, end_time, meeting_location }] }
 * Only courses with include=true are saved. Every field is editable — OCR
 * output is never trusted blindly.
 */
router.post('/confirm', (req, res) => {
  const upload = findPendingUpload(req, res);
  if (!upload) return;

  const courses = (req.body || {}).courses;
  if (!Array.isArray(courses)) {
    return res.status(400).json({ error: 'courses must be an array.' });
  }
  const d = getDb();
  const created = [];
  const skipped = [];
  for (const c of courses) {
    if (!c || c.include === false) continue;
    const body = { ...c };
    delete body.include;
    const code = typeof body.course_code === 'string' ? body.course_code.trim() : '';
    if (!code || code.length > 40) {
      return res.status(400).json({ error: 'Each saved course needs a valid course code (max 40 chars).' });
    }
    const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    body.meetings =
      body.start_time && body.start_time.trim() && body.days
        ? [{ days: body.days, start_time: body.start_time, end_time: body.end_time || body.start_time, location: str(body.meeting_location, 80) }]
        : [];
    if (body.meetings.length) {
      const parsed = parseMeetings(body.meetings);
      if (parsed.error) return res.status(400).json({ error: parsed.error });
    }
    // Re-importing a schedule must not create duplicate courses: skip any
    // candidate that matches an existing course (same code + same meeting).
    if (findDuplicateCourse(req.user.id, code, body.meetings)) {
      skipped.push({ course_code: code });
      continue;
    }
    const id = crypto.randomUUID();
    d.prepare(
      'INSERT INTO courses (id, user_id, course_code, course_name, instructor, section, location, term) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      id, req.user.id, code,
      str(body.course_name, 120), str(body.instructor, 120),
      str(body.section, 20), str(body.location, 80), str(body.term, 40)
    );
    for (const m of body.meetings) {
      d.prepare('INSERT INTO meetings (id, course_id, days, start_time, end_time, location) VALUES (?, ?, ?, ?, ?, ?)').run(
        crypto.randomUUID(), id, m.days.join(','), m.start_time, m.end_time, m.location
      );
    }
    created.push({ id, course_code: code });
  }
  d.prepare("UPDATE schedule_uploads SET status = 'confirmed' WHERE id = ?").run(upload.id);
  // Clean the stored image after a successful confirm.
  rm(path.join(config.dataDir, upload.storage_path), { force: true }, () => {});
  d.prepare('DELETE FROM schedule_candidates WHERE upload_id = ?').run(upload.id);
  res.status(201).json({ ok: true, saved: created.length, skipped: skipped.length, courses: created, skippedCourses: skipped });
});

/** GET /api/schedule/uploads — my uploads with pending candidates. */
router.get('/uploads', (req, res) => {
  const d = getDb();
  const uploads = d
    .prepare("SELECT * FROM schedule_uploads WHERE user_id = ? AND status = 'pending' ORDER BY created_at DESC")
    .all(req.user.id);
  const candStmt = d.prepare('SELECT * FROM schedule_candidates WHERE upload_id = ? ORDER BY confidence DESC');
  res.json({
    uploads: uploads.map((u) => ({
      id: u.id,
      original_filename: u.original_filename,
      created_at: u.created_at,
      candidates: candStmt.all(u.id).map((c) => ({
        id: c.id,
        course_code: c.course_code,
        course_name: c.course_name,
        instructor: c.instructor,
        section: c.section,
        location: c.location,
        term: c.term,
        days: c.days ? c.days.split(',') : [],
        start_time: c.start_time,
        end_time: c.end_time,
        confidence: c.confidence,
      })),
    })),
  });
});

export default router;
