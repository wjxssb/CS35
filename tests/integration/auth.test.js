import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, registerUser } from './helpers.js';

let ctx;

before(async () => {
  ctx = await startServer();
});

after(async () => {
  ctx.server.close();
});

test('register creates user, profile and a session cookie', async () => {
  const { cookie, user } = await registerUser(ctx.base, { username: 'alice_t', email: 'alice@test.dev' });
  assert.ok(cookie.startsWith('session='));
  assert.ok(user.id);
  assert.equal(user.username, 'alice_t');
  // Never leak password material anywhere in the response.
  assert.equal(JSON.stringify(user).toLowerCase().includes('password'), false);
});

test('register validates input', async () => {
  const bad = async (body) =>
    fetch(`${ctx.base}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  assert.equal((await bad({ username: 'x', email: 'a@b.co', password: 'password123' })).status, 400);
  assert.equal((await bad({ username: 'okname', email: 'not-an-email', password: 'password123' })).status, 400);
  assert.equal((await bad({ username: 'okname2', email: 'a@b.co', password: 'short' })).status, 400);
  assert.equal((await bad({})).status, 400);
});

test('duplicate username or email is rejected', async () => {
  await registerUser(ctx.base, { username: 'dup_user', email: 'dup@test.dev' });
  const res = await fetch(`${ctx.base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'dup_user', email: 'other@test.dev', password: 'password123' }),
  });
  assert.equal(res.status, 409);
  const res2 = await fetch(`${ctx.base}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'other_name', email: 'dup@test.dev', password: 'password123' }),
  });
  assert.equal(res2.status, 409);
});

test('login works with email or username and rejects bad passwords', async () => {
  await registerUser(ctx.base, { username: 'bob_t', email: 'bob@test.dev', password: 'supersecret9' });

  const byUser = await fetch(`${ctx.base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'bob_t', password: 'supersecret9' }),
  });
  assert.equal(byUser.status, 200);
  assert.ok((byUser.headers.get('set-cookie') || '').includes('HttpOnly'));

  const byEmail = await fetch(`${ctx.base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'bob@test.dev', password: 'supersecret9' }),
  });
  assert.equal(byEmail.status, 200);

  const wrongPw = await fetch(`${ctx.base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'bob_t', password: 'wrongpassword' }),
  });
  assert.equal(wrongPw.status, 401);

  const noUser = await fetch(`${ctx.base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier: 'ghost', password: 'whatever123' }),
  });
  assert.equal(noUser.status, 401);
});

test('protected endpoint requires auth', async () => {
  const res = await fetch(`${ctx.base}/api/me`);
  assert.equal(res.status, 401);
  const res2 = await fetch(`${ctx.base}/api/courses`);
  assert.equal(res2.status, 401);
  const res3 = await fetch(`${ctx.base}/api/discover`);
  assert.equal(res3.status, 401);
});

test('/api/me returns the current user after login', async () => {
  const { cookie } = await registerUser(ctx.base, { username: 'me_t', email: 'me@test.dev' });
  const res = await fetch(`${ctx.base}/api/me`, { headers: { Cookie: cookie } });
  assert.equal(res.status, 200);
  const { user } = await res.json();
  assert.equal(user.username, 'me_t');
  assert.ok(Array.isArray(user.courses));
  // email is visible to the owner
  assert.equal(user.email, 'me@test.dev');
});

test('logout invalidates the session', async () => {
  const { cookie } = await registerUser(ctx.base, { username: 'out_t', email: 'out@test.dev' });
  const before = await fetch(`${ctx.base}/api/me`, { headers: { Cookie: cookie } });
  assert.equal(before.status, 200);
  await fetch(`${ctx.base}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookie } });
  const after = await fetch(`${ctx.base}/api/me`, { headers: { Cookie: cookie } });
  assert.equal(after.status, 401);
});

test('PATCH /api/me updates profile fields', async () => {
  const { cookie } = await registerUser(ctx.base, { username: 'patch_t', email: 'patch@test.dev' });
  const res = await fetch(`${ctx.base}/api/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ display_name: 'Patch Tester', bio: 'hello', major: 'CS', year: '2nd Year' }),
  });
  assert.equal(res.status, 200);
  const { user } = await res.json();
  assert.equal(user.display_name, 'Patch Tester');
  assert.equal(user.bio, 'hello');
  assert.equal(user.major, 'CS');
  assert.equal(user.year, '2nd Year');
});

test('passwords are stored hashed, never in plaintext', async () => {
  const { config } = ctx;
  const { getDb } = await import(`../../server/db.js?${Date.now()}`);
  const row = getDb().prepare('SELECT password_hash FROM users WHERE username = ?').get('patch_t');
  assert.ok(row.password_hash.startsWith('scrypt$'));
  assert.ok(!row.password_hash.includes('password123'));
  assert.ok(config.databasePath.length > 0);
});
