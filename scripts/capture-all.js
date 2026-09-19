import { createApp } from '../server/app.js';
import { getDb, getOrCreateConversation, insertMessage } from '../server/db.js';
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const SCREENSHOT_DIR = path.join(ROOT, 'docs', 'screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

async function prepareDemoMessages() {
  const db = getDb();
  const frank = db.prepare("SELECT id FROM users WHERE username = 'frank'").get();
  const bob = db.prepare("SELECT id FROM users WHERE username = 'bob'").get();
  const carol = db.prepare("SELECT id FROM users WHERE username = 'carol'").get();
  const dave = db.prepare("SELECT id FROM users WHERE username = 'dave'").get();

  if (!frank || !bob) return;

  // Insert chat with Bob
  const convBob = getOrCreateConversation(frank.id, bob.id);
  const countBob = db.prepare('SELECT COUNT(*) as c FROM messages WHERE conversation_id = ?').get(convBob.id);
  if (countBob.c === 0) {
    insertMessage(convBob.id, bob.id, "Hey Frank! Noticed we're both taking CS 35L with Prof. Eggert on Mon/Wed at 2:00 PM!");
    insertMessage(convBob.id, frank.id, "Hey Bob! Yes, 35L looks intense this quarter. Are you looking for a project partner?");
    insertMessage(convBob.id, bob.id, "Absolutely! Let's team up. Have you started on the Git and Python assignments yet?");
    insertMessage(convBob.id, frank.id, "Just finished the initial setup. Let's sync up after Wednesday's lecture!");
  }

  // Insert chat with Carol
  if (carol) {
    const convCarol = getOrCreateConversation(frank.id, carol.id);
    const countCarol = db.prepare('SELECT COUNT(*) as c FROM messages WHERE conversation_id = ?').get(convCarol.id);
    if (countCarol.c === 0) {
      insertMessage(convCarol.id, carol.id, "Hi Frank, do you have the notes for CS 111 with Christian Reiher?");
      insertMessage(convCarol.id, frank.id, "Hey Carol! Sure do, I have my flashcards and study notes ready. I can share them with you!");
    }
  }

  // Insert chat with Dave
  if (dave) {
    const convDave = getOrCreateConversation(frank.id, dave.id);
    const countDave = db.prepare('SELECT COUNT(*) as c FROM messages WHERE conversation_id = ?').get(convDave.id);
    if (countDave.c === 0) {
      insertMessage(convDave.id, dave.id, "Hey Frank! We share 3 classes together (CS 35L, CS 111, MATH 131A)! Small world!");
    }
  }
}

async function main() {
  await prepareDemoMessages();

  const PORT = 3388;
  const app = createApp();
  const server = await new Promise((resolve) => {
    const s = app.listen(PORT, () => resolve(s));
  });
  console.log(`[screenshot] Server running on http://localhost:${PORT}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1366, height: 860 },
    deviceScaleFactor: 2, // HiDPI Retina crisp screenshots
  });
  const page = await context.newPage();

  const BASE_URL = `http://localhost:${PORT}`;

  try {
    // 1. Login page
    await page.goto(`${BASE_URL}/login`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_login.png'), fullPage: false });
    console.log('✓ 01_login.png');

    // 2. Register page
    await page.goto(`${BASE_URL}/register`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_register.png'), fullPage: false });
    console.log('✓ 02_register.png');

    // Perform Login as frank
    await page.goto(`${BASE_URL}/login`);
    await page.fill('#login-id', 'frank');
    await page.fill('#login-pw', 'demo1234');
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL(`${BASE_URL}/`);
    await page.waitForLoadState('networkidle');

    // 3. Dashboard page
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_dashboard.png'), fullPage: false });
    console.log('✓ 03_dashboard.png');

    // 4. Discover page (Default Best Match)
    await page.goto(`${BASE_URL}/discover`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_discover_best_match.png'), fullPage: false });
    console.log('✓ 04_discover_best_match.png');

    // 5. Discover page with Filter applied
    // Filter by CS 35L
    const courseInput = page.locator('input[placeholder*="Course"], input[placeholder*="CS 35L"], input[type="search"]').first();
    if (await courseInput.count() > 0) {
      await courseInput.fill('CS 35L');
      await page.waitForTimeout(500);
    }
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_discover_filters.png'), fullPage: false });
    console.log('✓ 05_discover_filters.png');

    // 6. My Courses page
    await page.goto(`${BASE_URL}/courses`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_my_courses.png'), fullPage: false });
    console.log('✓ 06_my_courses.png');

    // 7. Course Add/Edit Modal
    const addBtn = page.getByTestId('add-course-btn');
    if (await addBtn.count() > 0) {
      await addBtn.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_course_form_modal.png'), fullPage: false });
      console.log('✓ 07_course_form_modal.png');
      // Cancel modal
      const cancelBtn = page.getByRole('button', { name: /cancel/i });
      if (await cancelBtn.count() > 0) await cancelBtn.click();
    }

    // 8. Schedule Upload Landing
    await page.goto(`${BASE_URL}/upload`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_schedule_upload_landing.png'), fullPage: false });
    console.log('✓ 08_schedule_upload_landing.png');

    // 9. Schedule Upload with OCR Result & Review
    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      const sampleImg = path.join(ROOT, 'samples', 'frank_schedule.png');
      await fileInput.setInputFiles(sampleImg);
      await page.waitForTimeout(600);
      const parseBtn = page.getByTestId('parse-btn');
      if (await parseBtn.count() > 0) {
        await parseBtn.click();
        // Wait for OCR candidates review to render
        await page.waitForSelector('[data-testid="review-note"]', { timeout: 25000 });
        await page.waitForTimeout(1000);
      }
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_schedule_ocr_candidates.png'), fullPage: false });
      console.log('✓ 09_schedule_ocr_candidates.png');
    }

    // 10. Messages Inbox
    await page.goto(`${BASE_URL}/messages`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_messages_inbox.png'), fullPage: false });
    console.log('✓ 10_messages_inbox.png');

    // 11. 1:1 Chat room
    // Click on Bob
    const bobLink = page.getByRole('link', { name: /Bob Martinez/i }).first();
    if (await bobLink.count() > 0) {
      await bobLink.click();
    } else {
      const anyConv = page.locator('.conversation-item, a[href^="/messages/"]').first();
      if (await anyConv.count() > 0) await anyConv.click();
    }
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_chat_room.png'), fullPage: false });
    console.log('✓ 11_chat_room.png');

    // 12. User Public Profile (Bob or Dave)
    const db = getDb();
    const bob = db.prepare("SELECT id FROM users WHERE username = 'bob'").get();
    if (bob) {
      await page.goto(`${BASE_URL}/profile/${bob.id}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_user_public_profile.png'), fullPage: false });
      console.log('✓ 12_user_public_profile.png');
    }

    // 13. My Profile
    await page.goto(`${BASE_URL}/profile`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '13_my_profile.png'), fullPage: false });
    console.log('✓ 13_my_profile.png');

  } catch (err) {
    console.error('Screenshot error:', err);
  } finally {
    await browser.close();
    server.close();
    console.log('Done capturing screenshots.');
  }
}

main();
