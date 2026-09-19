import { Router } from 'express';
import { userWithCourses, allUsersWithCourses } from '../db.js';
import { requireAuth } from '../auth.js';
import { rankCandidates } from '../../src/matching.js';

const router = Router();

/**
 * GET /api/dashboard — real numbers for the home page.
 * { courseCount, shared: { threePlus, twoPlus, total }, recentCourses }
 */
router.get('/', requireAuth, (req, res) => {
  const me = userWithCourses(req.user.id);
  const others = allUsersWithCourses().filter((u) => u.id !== me.id);
  const ranked = rankCandidates(me, others, { sort: 'course' });
  const shared = {
    threePlus: ranked.filter((r) => r.match.courseOverlapCount >= 3).length,
    twoPlus: ranked.filter((r) => r.match.courseOverlapCount >= 2).length,
    total: ranked.length,
  };
  res.json({
    user: {
      id: me.id,
      username: me.username,
      display_name: me.display_name,
    },
    courseCount: me.courses.length,
    meetingCount: me.courses.reduce((n, c) => n + c.meetings.length, 0),
    shared,
  });
});

export default router;
