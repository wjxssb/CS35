import { Router } from 'express';
import { userWithCourses, allUsersWithCourses } from '../db.js';
import { requireAuth } from '../auth.js';
import { rankCandidates } from '../../src/matching.js';
import { courseSearchMatches, instructorSearchMatches } from '../../src/courseutil.js';
import { parseDays, parseTimeToMinutes, WEEKDAYS } from '../../src/timeutil.js';

const router = Router();

/**
 * GET /api/discover
 * Query params:
 *   sort=best|course|instructor|time   (default: best)
 *   course=<csv>    free-text course values, OR within the category
 *   instructor=<csv> free-text instructor values, OR within the category
 *   day=<csv>       MON..SUN, OR within the category
 *   time=<csv>      HH:MM times, OR within the category
 * Categories are AND-ed together.
 */
router.get('/', requireAuth, (req, res) => {
  const sort = ['best', 'course', 'instructor', 'time'].includes(req.query.sort) ? req.query.sort : 'best';

  const me = userWithCourses(req.user.id);
  if (!me) return res.status(404).json({ error: 'User not found.' });

  const csv = (v) => (typeof v === 'string' && v.trim() ? v.split(',').map((s) => s.trim()).filter(Boolean) : []);
  const filters = {
    courses: csv(req.query.course),
    instructors: csv(req.query.instructor),
    days: csv(req.query.day).flatMap((d) => parseDays(d) || []).filter((d) => WEEKDAYS.includes(d)),
    times: csv(req.query.time).map((t) => parseTimeToMinutes(t)).filter((t) => t != null),
  };

  const candidates = allUsersWithCourses().filter((u) => u.id !== me.id);
  const filtered = candidates.filter((u) => applyFilters(u, filters));
  const ranked = rankCandidates(me, filtered, { sort });

  res.json({
    sort,
    filters: {
      course: filters.courses,
      instructor: filters.instructors,
      day: filters.days,
      time: filters.times.map((t) => t),
    },
    results: ranked.map(({ user, match }) => ({
      user: {
        id: user.id,
        username: user.username,
        display_name: user.display_name,
        bio: user.bio,
        major: user.major,
        year: user.year,
        avatar_url: user.avatar_path ? `/uploads/avatars/${user.avatar_path.split('/').pop()}` : null,
      },
      match,
    })),
  });
});

/** AND across categories, OR within a category. Search is fuzzy:
 *  partial input, any casing and extra spaces all match. */
function applyFilters(user, f) {
  if (f.courses.length) {
    const any = f.courses.some((q) => (user.courses || []).some((c) => courseSearchMatches(q, c)));
    if (!any) return false;
  }
  if (f.instructors.length) {
    const ins = (user.courses || []).map((c) => c.instructor || '').filter(Boolean);
    const any = f.instructors.some((q) => ins.some((i) => instructorSearchMatches(q, i)));
    if (!any) return false;
  }
  if (f.days.length) {
    const hasDay = (user.courses || []).some((c) =>
      (c.meetings || []).some((m) => (m.days || '').split(',').some((d) => f.days.includes(d.toUpperCase())))
    );
    if (!hasDay) return false;
  }
  if (f.times.length) {
    const hasTime = (user.courses || []).some((c) =>
      (c.meetings || []).some((m) => {
        const start = parseTimeToMinutes(m.start_time);
        const end = parseTimeToMinutes(m.end_time);
        if (start == null || end == null) return false;
        return f.times.some((t) => {
          const e = end <= start ? end + 1440 : end;
          return t >= start && t < e;
        });
      })
    );
    if (!hasTime) return false;
  }
  return true;
}

export default router;
