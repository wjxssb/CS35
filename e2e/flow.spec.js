import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const samples = path.join(__dirname, '..', 'samples');

const ts = Date.now().toString(36);
const A = { username: `ea_${ts}`, email: `ea_${ts}@e2e.dev`, password: 'password123', name: 'Ella Anchor' };
const B = { username: `eb_${ts}`, email: `eb_${ts}@e2e.dev`, password: 'password123', name: 'Ben Overlap' };

async function register(page, { username, email, password }) {
  await page.goto('/register');
  await page.fill('#reg-user', username);
  await page.fill('#reg-email', email);
  await page.fill('#reg-pw', password);
  await page.getByRole('button', { name: 'Sign up' }).click();
  await expect(page).toHaveURL(/\/profile/);
}

async function logout(page) {
  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login/);
}

async function login(page, { username, password }) {
  await page.goto('/login');
  await page.fill('#login-id', username);
  await page.fill('#login-pw', password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await expect(page).toHaveURL('/');
}

/** Add one course through the manual editor UI. */
async function addCourse(page, { code, name, instructor, days, start, end, location }) {
  await page.goto('/courses');
  await page.getByTestId('add-course-btn').click();
  const form = page.getByTestId('course-form');
  await form.locator('#cf-code').fill(code);
  if (name) await form.locator('#cf-name').fill(name);
  if (instructor) await form.locator('#cf-ins').fill(instructor);
  if (location) await form.locator('#cf-loc').fill(location);
  for (const d of days || []) {
    await form.locator(`[data-testid^="meeting-0"]`).getByRole('button', { name: d, exact: true }).click();
  }
  await form.locator('[data-testid="meeting-0"] input[type="time"]').first().fill(start);
  await form.locator('[data-testid="meeting-0"] input[type="time"]').nth(1).fill(end);
  await form.getByRole('button', { name: /Add course|Save changes/ }).click();
  await expect(page.getByTestId(`course-${code.replace(/\s+/g, '')}`)).toBeVisible();
}

test.describe('35L classmate discovery — full user flow', () => {
  test('User A: register, profile, avatar, manual courses, schedule image import', async ({ page }) => {
    // 1-2. Register + auto-login
    await register(page, A);

    // 3. Create profile
    await page.getByTestId('pf-name').fill(A.name);
    await page.getByTestId('pf-major').fill('Computer Science');
    await page.getByTestId('pf-year').selectOption('2nd Year');
    await page.getByTestId('pf-bio').fill('E2E tester. Looking for gym buddies and study groups.');
    await page.getByTestId('pf-save').click();
    await expect(page.getByText('Profile saved.')).toBeVisible();

    // 4. Upload avatar
    await page.setInputFiles('input[type="file"]', path.join(samples, 'avatar_blue.png'));
    await expect(page.getByText('Profile picture updated.')).toBeVisible();
    await expect(page.locator('img.avatar')).toBeVisible();

    // 5. Add 3+ courses manually
    await addCourse(page, { code: 'CS 35L', name: 'Intro to Programming in Python', instructor: 'Paul R. Eggert', days: ['Mon', 'Wed'], start: '14:00', end: '15:50', location: 'ENG 1102' });
    await addCourse(page, { code: 'CS 111', name: 'Data Science', instructor: 'Christian Reiher', days: ['Tue', 'Thu'], start: '10:00', end: '11:50', location: 'HEO 1050' });
    await addCourse(page, { code: 'MATH 131A', name: 'Linear Algebra', instructor: 'D. G. Lu', days: ['Mon', 'Wed'], start: '13:00', end: '14:50', location: 'PEP 338' });
    await addCourse(page, { code: 'CS M146', name: 'Intro to Machine Learning', instructor: 'Linjuan Wu', days: ['Tue', 'Thu'], start: '14:00', end: '15:50', location: 'ENG 4000' });
    await addCourse(page, { code: 'LING 1', name: 'Intro to Language', instructor: 'Timothy Stone', days: ['Mon', 'Wed', 'Fri'], start: '11:00', end: '11:50', location: 'HUM 1200' });

    // Dashboard reflects real data
    await page.goto('/');
    await expect(page.getByTestId('dash-course-count')).toHaveText('5');

    // 6-7. Upload a sample schedule image and review parsed candidates
    await page.goto('/upload');
    await page.setInputFiles('input[type="file"]', path.join(samples, 'extra_schedule.png'));
    await page.getByTestId('parse-btn').click();
    await expect(page.getByTestId('review-note')).toBeVisible();
    // OCR found both courses from the image (review before save is mandatory)
    await expect(page.locator('[data-testid^="candidate-"]').first()).toBeVisible();
    const reviewText = await page.locator('[data-testid^="candidate-"]').first().textContent();
    const allReviews = await page.locator('[data-testid^="candidate-"]').allTextContents();
    const blob = allReviews.join(' ');
    expect(blob).toContain('CS M146');
    expect(blob).toContain('LING 1');

    // 8. Confirm saves the parsed courses — both duplicate the manually
    // added CS M146 / LING 1, so they must be skipped, not duplicated.
    await page.getByTestId('confirm-save').click();
    await expect(page).toHaveURL(/\/courses/);
    await expect(page.getByText(/Skipped 2 duplicates/)).toBeVisible();
    for (const code of ['CS 35L', 'CS 111', 'MATH 131A', 'CS M146', 'LING 1']) {
      await expect(page.getByTestId(`course-${code.replace(/\s+/g, '')}`)).toBeVisible();
    }
    await expect(page.locator('[data-testid^="course-"]')).toHaveCount(5);
    // Parsed meetings were stored structurally (days + time, not a text blob)
    await expect(page.getByTestId('course-CSM146')).toContainText('Tue/Thu');
    await expect(page.getByTestId('course-CSM146')).toContainText('2:00 PM');

    await logout(page);
  });

  test('User B: register and add a partially overlapping schedule', async ({ page }) => {
    await register(page, B);
    await page.getByTestId('pf-name').fill(B.name);
    await page.getByTestId('pf-bio').fill('Half of my week is the same as Ella\'s.');
    await page.getByTestId('pf-save').click();
    await expect(page.getByText('Profile saved.')).toBeVisible();

    // CS 35L: same course, same instructor, same time as A
    await addCourse(page, { code: 'CS 35L', instructor: 'Paul R. Eggert', days: ['Mon', 'Wed'], start: '14:00', end: '15:50' });
    // PSYC 1: partial time overlap with A's CS 35L (15:00-16:50 vs 14:00-15:50)
    await addCourse(page, { code: 'PSYC 1', instructor: 'L. Moreau', days: ['Mon', 'Wed'], start: '15:00', end: '16:50' });
    // STAT 10: partial overlap with A's CS 111 (09:00-10:50 vs 10:00-11:50)
    await addCourse(page, { code: 'STAT 10', instructor: 'M. Chen', days: ['Tue', 'Thu'], start: '09:00', end: '10:50' });
    await logout(page);
  });

  test('User A: discover, all sorts, filters, B profile, persistence', async ({ page }) => {
    // 10-11. Login as A (tests login flow explicitly) and open Discover
    await login(page, A);
    await page.goto('/discover');
    const results = page.getByTestId('results');
    await expect(results).toBeVisible();

    // 12. User B appears
    const bCard = page.getByTestId(`match-${B.username}`);
    await expect(bCard).toBeVisible();

    // 13. Course sort: someone with 3 shared courses is first; B has 1
    await page.getByTestId('sort-course').click();
    await expect(results.locator('.match-card').first()).toContainText('3 shared courses');
    const courseCounts = await results.locator('.match-card [data-testid^="stat-course-"]').allTextContents();
    const nums = courseCounts.map((t) => parseInt(t, 10));
    for (let i = 1; i < nums.length; i++) {
      expect(nums[i - 1]).toBeGreaterThanOrEqual(nums[i]);
    }

    // 14. Instructor sort: instructor-only matches (erin: c0,i1) rank above time-only (felix: c0,i0)
    await page.getByTestId('sort-instructor').click();
    await expect(results).toBeVisible();
    const cards = results.locator('.match-card');
    const count = await cards.count();
    const names = [];
    for (let i = 0; i < count; i++) names.push(await cards.nth(i).getAttribute('data-testid'));
    if (names.includes('match-erin') && names.includes('match-felix')) {
      expect(names.indexOf('match-erin')).toBeLessThan(names.indexOf('match-felix'));
    }
    const firstCard = cards.first();
    const firstStats = await firstCard.locator('.match-stats').textContent();
    expect(parseInt(firstStats.match(/(\d+) shared courses?/)?.[1] || '0', 10)).toBeGreaterThanOrEqual(
      parseInt((await cards.nth(1).locator('.match-stats').textContent()).match(/(\d+) shared courses?/)?.[1] || '0', 10)
    );

    // 15. Time sort: time-only matches (felix, t2) rank above instructor-only (erin, t0)
    await page.getByTestId('sort-time').click();
    await expect(results).toBeVisible();
    const names2 = [];
    for (let i = 0; i < count; i++) names2.push(await cards.nth(i).getAttribute('data-testid'));
    if (names2.includes('match-felix') && names2.includes('match-erin')) {
      expect(names2.indexOf('match-felix')).toBeLessThan(names2.indexOf('match-erin'));
    }

    // 16. Best match shows B with the right explanation numbers
    await page.getByTestId('sort-best').click();
    await expect(bCard).toBeVisible();
    await expect(bCard).toContainText('1 shared course');
    await expect(bCard).toContainText('1 same instructor');
    await expect(bCard).toContainText(/time overlaps?/);
    // shared course chips explain WHY
    const sharedSection = bCard.locator('.match-section', { hasText: 'Shared courses' });
    await expect(sharedSection.locator('.chips')).toContainText('CS 35L');

    // 17. Filters
    await page.getByTestId('filter-course').fill('CS35L');
    await expect(bCard).toBeVisible(); // B takes CS 35L
    const erinVisible = await page.getByTestId('match-erin').isVisible().catch(() => false);
    expect(erinVisible).toBe(false); // erin has no CS 35L
    await page.getByTestId('filter-instructor').fill('Eggert');
    await expect(bCard).toBeVisible();

    // day+time combined: MON at 13:00 -> dave has MATH 131A at 13:00, B does not
    await page.getByTestId('filter-course').fill('');
    await page.getByTestId('filter-instructor').fill('');
    await page.getByTestId('filter-day-MON').click();
    await page.getByTestId('filter-time').fill('13:00');
    await expect(page.getByTestId('match-dave')).toBeVisible();
    await expect(bCard).not.toBeVisible();

    // clear filters
    await page.getByRole('button', { name: 'Clear filters' }).click();
    await expect(bCard).toBeVisible();

    // 18-19. Open B's profile: info + shared classes, no private data
    await bCard.getByTestId(`view-${B.username}`).click();
    await expect(page).toHaveURL(/\/profile\//);
    await expect(page.getByTestId('profile-name')).toHaveText(B.name);
    await expect(page.getByTestId('profile-match')).toBeVisible();
    await expect(page.getByTestId('profile-match-courses')).toContainText('1 shared course');
    await expect(page.getByTestId('shared-CS35L')).toBeVisible();
    await expect(page.getByTestId('pub-course-PSYC1')).toBeVisible();
    const body = await page.locator('body').textContent();
    expect(body).not.toContain(B.email);
    expect(body.toLowerCase()).not.toContain('password');

    // 20. Persistence: logout, login again, courses still there
    await logout(page);
    await login(page, A);
    await page.goto('/courses');
    for (const code of ['CS 35L', 'CS 111', 'MATH 131A', 'CS M146', 'LING 1']) {
      await expect(page.getByTestId(`course-${code.replace(/\s+/g, '')}`)).toBeVisible();
    }
    await page.goto('/');
    await expect(page.getByTestId('dash-course-count')).toHaveText('5');
    // avatar survived the re-login too
    await page.goto('/profile');
    await expect(page.locator('img.avatar')).toBeVisible();
  });
});
