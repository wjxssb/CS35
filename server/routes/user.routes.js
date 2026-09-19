import { Router } from 'express';
import { getDb, userWithCourses } from '../db.js';
import { getSessionUser } from '../auth.js';
import { rankCandidates } from '../../src/matching.js';

const router = Router();

/**
 * GET /api/users/:id — public profile.
 * Privacy: email, password hash and session material are never returned.
 * If the requester is logged in and viewing someone else, the match
 * breakdown is included so the profile page can show "why you match".
 */
router.get('/:id', (req, res) => {
  const target = userWithCourses(req.params.id);
  if (!target) return res.status(404).json({ error: 'User not found.' });

  const { email, avatar_path, ...safe } = target;
  const result = {
    user: {
      id: safe.id,
      username: safe.username,
      display_name: safe.display_name,
      bio: safe.bio,
      major: safe.major,
      year: safe.year,
      avatar_url: avatar_path ? `/uploads/avatars/${avatar_path.split('/').pop()}` : null,
      created_at: safe.created_at,
      courses: (target.courses || []).map((c) => ({
        id: c.id,
        course_code: c.course_code,
        course_name: c.course_name,
        instructor: c.instructor,
        section: c.section,
        location: c.location,
        term: c.term,
        meetings: (c.meetings || []).map((m) => ({
          id: m.id,
          days: m.days,
          start_time: m.start_time,
          end_time: m.end_time,
          location: m.location,
        })),
      })),
    },
  };

  const me = getSessionUser(req);
  if (me && me.id !== target.id) {
    const meFull = userWithCourses(me.id);
    const ranked = rankCandidates(meFull, [target], { sort: 'best' });
    if (ranked.length) result.match = ranked[0].match;
  }
  res.json(result);
});

export default router;
