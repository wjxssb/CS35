// Seed demo data: Frank + 9 classmates with deliberately different overlap
// patterns so sorting/filtering can be verified by hand.
//
//   frank : CS 35L (Eggert, MW 14:00), CS 111 (Reiher, TR 10:00), MATH 131A (Lu, HW 13:00)
//   alice : 0 shared courses
//   bob   : 1 shared (CS 35L, same instructor, same time)
//   carol : 2 shared (CS 35L + CS 111)
//   dave  : 3 shared (everything, same times)
//   erin  : same instructor (Eggert) on a DIFFERENT course, different time
//   felix : same time as Frank's CS 35L but a different course
//   grace : partial time overlap (MW 15:00-16:50 vs Frank's 14:00-15:50)
//   henry : notational variants ("COM SCI 35L", "Eggert, Paul", "TTh")
//   ivy   : many courses, only 2 shared (tests count vs. ratio)
//
// Every seeded password is: demo1234

import crypto from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { getDb, closeDb } from './db.js';
import { hashPassword } from './auth.js';
import { config } from '../src/config.js';
import { avatarPng } from '../tools/png.js';

const PALETTE = [
  [76, 110, 245], [239, 68, 68], [16, 185, 129], [245, 158, 11],
  [139, 92, 246], [6, 182, 212], [236, 72, 153], [101, 118, 135],
  [5, 150, 105], [219, 39, 119],
];

function seedUser({
  username, email, displayName, bio, major, year, colorIndex, courses,
}) {
  const d = getDb();
  const existing = d.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    console.log(`  skip ${username} (exists)`);
    return null;
  }
  const id = crypto.randomUUID();
  d.prepare('INSERT INTO users (id, username, email, password_hash) VALUES (?, ?, ?, ?)').run(
    id, username, email, hashPassword('demo1234')
  );
  d.prepare('INSERT INTO profiles (user_id, display_name, bio, major, year) VALUES (?, ?, ?, ?, ?)').run(
    id, displayName, bio, major, year
  );

  // Avatar
  let avatarPath = '';
  const avatarRel = path.join('uploads', 'avatars', `${id}-${String(colorIndex).padStart(2, '0')}.png`);
  const avatarAbs = path.join(config.dataDir, avatarRel);
  if (!existsSync(avatarAbs)) {
    mkdirSync(path.dirname(avatarAbs), { recursive: true });
    writeFileSync(avatarAbs, avatarPng(PALETTE[colorIndex % PALETTE.length]));
  }
  avatarPath = avatarRel;
  d.prepare('UPDATE profiles SET avatar_path = ? WHERE user_id = ?').run(avatarPath, id);

  for (const c of courses) {
    const courseId = crypto.randomUUID();
    d.prepare(
      'INSERT INTO courses (id, user_id, course_code, course_name, instructor, section, location, term) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(courseId, id, c.code, c.name || '', c.instructor || '', c.section || '', c.location || '', 'Fall 2026');
    for (const m of c.meetings || []) {
      d.prepare('INSERT INTO meetings (id, course_id, days, start_time, end_time, location) VALUES (?, ?, ?, ?, ?, ?)').run(
        crypto.randomUUID(), courseId, m.days.join(','), m.start, m.end, m.location || ''
      );
    }
  }
  console.log(`  seeded ${username} (${displayName})`);
  return id;
}

function main() {
  console.log('[seed] populating demo data…');
  const frank = seedUser({
    username: 'frank',
    email: 'frank@35l.app',
    displayName: 'Frank Zhang',
    bio: 'Systems nerd, occasional basketball. Here to not be alone in lecture halls.',
    major: 'Computer Science',
    year: '2nd Year',
    colorIndex: 0,
    courses: [
      { code: 'CS 35L', name: 'Intro to Programming in Python', instructor: 'Paul R. Eggert', location: 'ENG 1102', meetings: [{ days: ['MON', 'WED'], start: '14:00', end: '15:50' }] },
      { code: 'CS 111', name: 'Data Science', instructor: 'Christian Reiher', location: 'HEO 1050', meetings: [{ days: ['TUE', 'THU'], start: '10:00', end: '11:50' }] },
      { code: 'MATH 131A', name: 'Linear Algebra', instructor: 'D. G. Lu', location: 'PEP 338', meetings: [{ days: ['MON', 'WED'], start: '13:00', end: '14:50' }] },
    ],
  });

  seedUser({
    username: 'alice',
    email: 'alice@35l.app',
    displayName: 'Alice Nguyen',
    bio: 'Art and bio, mostly. If you need a study buddy for ART 1A, ping me.',
    major: 'Art History',
    year: '1st Year',
    colorIndex: 1,
    courses: [
      { code: 'ART 1A', name: 'Introduction to Art', instructor: 'M. Delgado', location: 'HIT 121', meetings: [{ days: ['TUE'], start: '14:00', end: '16:50' }] },
      { code: 'BIO 41', name: 'Principles of Biology', instructor: 'R. Shah', location: 'MOO 166', meetings: [{ days: ['MON', 'WED', 'FRI'], start: '09:00', end: '09:50' }] },
    ],
  });

  seedUser({
    username: 'bob',
    email: 'bob@35l.app',
    displayName: 'Bob Martinez',
    bio: 'CS freshy, trying to survive 35L. Coffee-dependent.',
    major: 'Computer Science',
    year: '1st Year',
    colorIndex: 2,
    courses: [
      { code: 'CS 35L', name: 'Intro to Programming in Python', instructor: 'Paul R. Eggert', location: 'ENG 1102', meetings: [{ days: ['MON', 'WED'], start: '14:00', end: '15:50' }] },
      { code: 'ECE 20', name: 'Signals and Systems', instructor: 'A. Patel', location: 'ENG 2201', meetings: [{ days: ['MON', 'WED'], start: '11:00', end: '11:50' }] },
    ],
  });

  seedUser({
    username: 'carol',
    email: 'carol@35l.app',
    displayName: 'Carol Kim',
    bio: 'Second year CS. I write flashcards for every class, DM me if you want mine.',
    major: 'Computer Science',
    year: '2nd Year',
    colorIndex: 3,
    courses: [
      { code: 'CS 35L', name: 'Intro to Programming in Python', instructor: 'Paul R. Eggert', location: 'ENG 1102', meetings: [{ days: ['MON', 'WED'], start: '14:00', end: '15:50' }] },
      { code: 'CS 111', name: 'Data Science', instructor: 'Christian Reiher', location: 'HEO 1050', meetings: [{ days: ['TUE', 'THU'], start: '10:00', end: '11:50' }] },
      { code: 'PHYS 6A', name: 'Physics for Scientists', instructor: 'J. Okafor', location: 'BRI 250', meetings: [{ days: ['TUE', 'THU'], start: '13:00', end: '14:50' }] },
    ],
  });

  seedUser({
    username: 'dave',
    email: 'dave@35l.app',
    displayName: 'Dave Osei',
    bio: 'Exact same schedule as the people around me, apparently. Group project organizer.',
    major: 'Computer Science',
    year: '2nd Year',
    colorIndex: 4,
    courses: [
      { code: 'CS 35L', name: 'Intro to Programming in Python', instructor: 'Paul R. Eggert', location: 'ENG 1102', meetings: [{ days: ['MON', 'WED'], start: '14:00', end: '15:50' }] },
      { code: 'CS 111', name: 'Data Science', instructor: 'Christian Reiher', location: 'HEO 1050', meetings: [{ days: ['TUE', 'THU'], start: '10:00', end: '11:50' }] },
      { code: 'MATH 131A', name: 'Linear Algebra', instructor: 'D. G. Lu', location: 'PEP 338', meetings: [{ days: ['MON', 'WED'], start: '13:00', end: '14:50' }] },
    ],
  });

  seedUser({
    username: 'erin',
    email: 'erin@35l.app',
    displayName: 'Erin Walsh',
    bio: 'Taking Eggert again for CS 31 — he is a legend.',
    major: 'Electrical Engineering',
    year: '3rd Year',
    colorIndex: 5,
    courses: [
      { code: 'CS 31', name: 'Programming in Python', instructor: 'Paul R. Eggert', location: 'ENG 1202', meetings: [{ days: ['TUE'], start: '16:00', end: '17:50' }] },
      { code: 'ECE 45', name: 'Digital Systems', instructor: 'A. Patel', location: 'ENG 2201', meetings: [{ days: ['MON', 'WED'], start: '16:00', end: '17:50' }] },
    ],
  });

  seedUser({
    username: 'felix',
    email: 'felix@35l.app',
    displayName: 'Felix Braun',
    bio: 'Chem major. I sit in the same corner of ENG 1102 every afternoon.',
    major: 'Chemistry',
    year: '2nd Year',
    colorIndex: 6,
    courses: [
      { code: 'CHEM 14A', name: 'General Chemistry I', instructor: 'S. Nakamura', location: 'ENG 1102', meetings: [{ days: ['MON', 'WED'], start: '14:00', end: '15:50' }] },
      { code: 'CHEM 14AL', name: 'General Chemistry I Lab', instructor: 'S. Nakamura', location: 'CHEM LAB', meetings: [{ days: ['WED'], start: '16:00', end: '18:50' }] },
    ],
  });

  seedUser({
    username: 'grace',
    email: 'grace@35l.app',
    displayName: 'Grace Adeyemi',
    bio: 'Psych + philosophy. I am usually late to afternoon lectures, you will see me running.',
    major: 'Psychology',
    year: '3rd Year',
    colorIndex: 7,
    courses: [
      { code: 'PSYC 1', name: 'Introduction to Psychology', instructor: 'L. Moreau', location: 'HIT 200', meetings: [{ days: ['MON', 'WED'], start: '15:00', end: '16:50' }] },
      { code: 'PHIL 2', name: 'Logic and Reasoning', instructor: 'K. Weiss', location: 'HAP 215', meetings: [{ days: ['TUE', 'THU'], start: '09:00', end: '09:50' }] },
    ],
  });

  seedUser({
    username: 'henry',
    email: 'henry@35l.app',
    displayName: 'Henry Costa',
    bio: 'My schedule app exported weird text, hence the odd formatting here.',
    major: 'Computer Science',
    year: '1st Year',
    colorIndex: 8,
    courses: [
      { code: 'COM SCI 35L', name: 'Programming in Python', instructor: 'Eggert, Paul', location: 'ENG 1102', meetings: [{ days: ['MON', 'WED'], start: '14:00', end: '15:50' }] },
      { code: 'CS 111', name: 'Data Science', instructor: 'Christian Reiher', location: 'HEO 1050', meetings: [{ days: ['TUE', 'THU'], start: '10:00', end: '11:50' }] },
    ],
  });

  seedUser({
    username: 'ivy',
    email: 'ivy@35l.app',
    displayName: 'Ivan Petrov',
    bio: 'Six classes this quarter, no regret. If you share two or more with me we should meet.',
    major: 'Electrical Engineering',
    year: '4th Year',
    colorIndex: 9,
    courses: [
      { code: 'CS 35L', name: 'Intro to Programming in Python', instructor: 'Paul R. Eggert', location: 'ENG 1102', meetings: [{ days: ['MON', 'WED'], start: '14:00', end: '15:50' }] },
      { code: 'CS 111', name: 'Data Science', instructor: 'Christian Reiher', location: 'HEO 1050', meetings: [{ days: ['TUE', 'THU'], start: '10:00', end: '11:50' }] },
      { code: 'ECE 100', name: 'Intro to ECE', instructor: 'A. Patel', location: 'ENG 2201', meetings: [{ days: ['MON', 'WED'], start: '09:00', end: '09:50' }] },
      { code: 'MATH 131A', name: 'Linear Algebra', instructor: 'D. G. Lu', location: 'PEP 338', meetings: [{ days: ['MON', 'WED'], start: '13:00', end: '14:50' }] },
      { code: 'PHYS 6B', name: 'Electricity and Magnetism', instructor: 'J. Okafor', location: 'BRI 250', meetings: [{ days: ['TUE', 'THU'], start: '14:00', end: '15:50' }] },
    ],
  });

  console.log(`[seed] done. Frank id=${frank}`);
  console.log('[seed] all demo passwords: demo1234');
  closeDb();
}

main();
