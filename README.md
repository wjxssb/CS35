# Classmate Discovery (35L Project)

A full-stack web app where university students add their course schedules and
discover classmates they share courses, instructors or class times with.

Built with **Node.js (ESM) + Express 4 + SQLite (`node:sqlite`)** on the back
end and **React 18 + Vite + React Router** on the front end. OCR import is
powered by the **tesseract** CLI behind a swappable `parseScheduleImage()`
interface.

## Features

- **Accounts** — register / log in / log out, scrypt-hashed passwords (never
  stored or logged in plaintext), HttpOnly session cookies (random token,
  SHA-256 stored), per-user data isolation.
- **Profiles** — display name, bio, major, year, avatar upload. Public profile
  pages never expose email or password material.
- **Courses** — structured courses (`course_code`, `course_name`, `instructor`,
  `section`, `location`, `term`) with multiple meetings per course (days +
  start/end time + room). Duplicate courses (same normalized code + same
  meeting window) are rejected on create/update and skipped on import.
- **Schedule image import** — upload a JPG/PNG/WebP screenshot of your
  schedule, OCR extracts course candidates, **you review and edit everything
  before anything is saved**. OCR output is never auto-saved; low-confidence
  results show an explicit review warning; failures return a friendly error.
- **Matching** — per classmate: `courseOverlapCount`, `instructorOverlapCount`,
  `timeOverlapCount`, overlap minutes and ratios (intersection/union), combined
  into a deterministic `totalScore` (weights in one module, unit-tested).
  Course codes are normalized (`CS 35L` ≡ `CS35L` ≡ `COM SCI 35L`) and
  instructor names too (`Paul R. Eggert` ≡ `Eggert, Paul` ≡ `paul eggert`).
  Time overlap uses `max(startA,startB) < min(endA,endB)` plus a day
  intersection — not string equality.
- **Discover** — sort by Best match / Course / Instructor / Time; filter by
  course, instructor, day and time (AND across categories, OR within a
  category). The UI explains *why* people match (shared course chips, counts) —
  no raw scores.
- **Messages** — 1:1 chat between any two classmates. One canonical
  conversation per pair (both users see the same thread), message inbox
  ordered by newest activity, live polling, entry points from Discover
  match cards and user profiles, and whole-conversation delete (removes
  every message for both sides).
- **Dashboard** — real stats from the data layer: how many people share 3+
  courses with you, how many share 2+, total classmates with any overlap.
- **Seed data** — 10 demo students with a deliberate overlap matrix (0/1/2/3
  shared courses, same instructor different course, same time different course,
  partial time overlaps, notation variants).

## Requirements

- Node.js ≥ 22.5 (uses the built-in `node:sqlite` module; tested on 22.16)
- [tesseract-ocr](https://github.com/tesseract-ocr/tesseract) on `PATH`
- A Chromium browser for E2E tests (`npx playwright install chromium`)

## Install & run

```bash
npm install
npx playwright install chromium   # only needed for E2E tests
npm run build                     # builds the frontend into frontend/dist
npm run seed                      # optional: demo data into data/app.db
npm start                         # http://localhost:3000
```

The Express server serves the built SPA from `frontend/dist` and the JSON API
under `/api/*`. For development you can also run `npx vite` (proxying `/api`
to port 3000).

Demo accounts created by `npm run seed` all use password **`demo1234`** with
usernames `frank`, `alice`, `bob`, `carol`, `dave`, `erin`, `felix`, `grace`,
`henry`, `ivy` (emails `*@35l.app`).

## Environment

Copy `.env.example` to `.env` (or export the variables) to override defaults:

| Variable         | Default                | Purpose                     |
| ---------------- | ---------------------- | --------------------------- |
| `PORT`           | `3000`                 | HTTP port                   |
| `DATA_DIR`       | `<project>/data`       | Root for DB + uploads       |
| `DATABASE_PATH`  | `<DATA_DIR>/app.db`    | SQLite database file        |
| `UPLOADS_DIR`    | `<DATA_DIR>/uploads`   | Uploaded files              |
| `SESSION_SECRET` | dev default            | Session cookie signing      |
| `TESSERACT_BIN`  | `tesseract`            | OCR binary path             |

## Tests

```bash
npm test        # unit + integration (93 tests)
npm run test:e2e  # Playwright: full 20-step real-user flow in Chromium
```

- **Unit** (`tests/unit/`) — time parsing/overlap math, course & instructor
  normalization, matching weights & all four sort orders, schedule parser
  (block layout, table layout, OCR artifacts).
- **Integration** (`tests/integration/`) — real Express app on an ephemeral
  port with a throwaway SQLite DB: auth (register/login/invalid/protected),
  course CRUD + ownership + duplicates, discover sort & filter matrix,
  schedule upload → OCR → review → confirm (including duplicate skipping and
  a real UCLA iCal calendar screenshot), 1:1 messaging (send, history, inbox,
  whole-conversation delete for both sides, auth + validation).
- **E2E** (`e2e/flow.spec.js`) — boots a fresh seeded server on port 3100 and
  drives a real browser: register, edit profile, upload avatar, add courses
  manually, import a schedule image, review & confirm, second user with a
  partially overlapping schedule, all four sort modes, filters, the other
  user's public profile, and persistence after re-login.

## API overview

| Method & path                | Purpose                                     |
| ---------------------------- | ------------------------------------------- |
| `POST /api/auth/register`    | Create account (sets session cookie)        |
| `POST /api/auth/login`       | Log in with email **or** username           |
| `POST /api/auth/logout`      | Destroy session                             |
| `GET/PATCH /api/me`          | My profile (email visible to owner only)    |
| `POST /api/me/avatar`        | Upload avatar image                         |
| `GET/POST /api/courses`      | List / create my courses                    |
| `PATCH/DELETE /api/courses/:id` | Update / delete my course                |
| `POST /api/schedule/upload`  | Upload image → OCR candidates (pending)     |
| `POST /api/schedule/confirm` | Save reviewed candidates (skips duplicates) |
| `GET /api/schedule/uploads`  | My pending uploads                          |
| `GET /api/discover`          | Ranked matches (`sort`, `course`, `instructor`, `day`, `time`) |
| `GET /api/users/:id`         | Public profile (no email, ever)             |
| `GET /api/dashboard`         | Real stats for my dashboard                 |
| `GET /api/messages`          | My conversations (peer, last message, count)|
| `POST /api/messages`         | Send a message (`{ to, body }`) — creates the conversation on first use |
| `GET /api/messages/:userId`  | Full message history with a classmate       |
| `DELETE /api/messages/:userId` | Delete the whole conversation with a classmate |

## Project layout

```
server/          Express app, routes, auth, validation, DB schema, seed
src/             Pure domain logic: time & course utilities, matching engine,
                 schedule parser (OCR pipeline) — all unit-tested
frontend/        React app (Vite root), built into frontend/dist
tests/unit/      Unit tests (node --test)
tests/integration/  HTTP-level tests against a throwaway DB
e2e/             Playwright end-to-end flow
samples/         Sample schedule images used by tests (incl. a real UCLA iCal screenshot)
scripts/         E2E server bootstrap
tools/           Sample image generators (Python/PIL, Node PNG writer)
```
