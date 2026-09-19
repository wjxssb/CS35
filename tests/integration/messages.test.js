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

async function send(cookie, to, body) {
  const res = await fetch(`${ctx.base}/api/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ to, body }),
  });
  return res;
}

test('messages endpoints require auth', async () => {
  const list = await fetch(`${ctx.base}/api/messages`);
  assert.equal(list.status, 401);
  const history = await fetch(`${ctx.base}/api/messages/someone`);
  assert.equal(history.status, 401);
  const post = await fetch(`${ctx.base}/api/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: 'x', body: 'hi' }),
  });
  assert.equal(post.status, 401);
});

test('send validates input', async () => {
  const { cookie, user: a } = await registerUser(ctx.base, { username: 'msg_a1', email: 'msga1@test.dev' });

  // missing body
  assert.equal((await send(cookie, 'ghost-id', '')).status, 400);
  // blank body
  assert.equal((await send(cookie, 'ghost-id', '   ')).status, 400);
  // body too long (>2000)
  assert.equal((await send(cookie, 'ghost-id', 'x'.repeat(2001))).status, 400);
  // message to self
  assert.equal((await send(cookie, a.id, 'hello me')).status, 400);
  // missing recipient
  assert.equal((await send(cookie, '', 'hi there')).status, 400);
  // unknown recipient
  assert.equal((await send(cookie, 'does-not-exist', 'hi there')).status, 404);
});

test('two users can exchange messages in both directions', async () => {
  const { cookie: cookieA, user: a } = await registerUser(ctx.base, { username: 'msg_a2', email: 'msga2@test.dev', password: 'password123' });
  const { cookie: cookieB, user: b } = await registerUser(ctx.base, { username: 'msg_b2', email: 'msgb2@test.dev', password: 'password123' });

  // A -> B
  const first = await send(cookieA, b.id, 'Hey! We share CS 35L, right?');
  assert.equal(first.status, 201);
  const firstData = await first.json();
  assert.equal(firstData.message.body, 'Hey! We share CS 35L, right?');
  assert.equal(firstData.message.sender_id, a.id);
  assert.ok(firstData.conversation_id);

  // B sees the same message in the history with A
  const bHistory = await (await fetch(`${ctx.base}/api/messages/${a.id}`, { headers: { Cookie: cookieB } })).json();
  assert.equal(bHistory.messages.length, 1);
  assert.equal(bHistory.messages[0].body, 'Hey! We share CS 35L, right?');
  assert.equal(bHistory.messages[0].sender_id, a.id);
  // The history also includes A's public profile (never email)
  assert.equal(bHistory.user.username, 'msg_a2');
  assert.equal(bHistory.user.email, undefined);

  // B replies
  const reply = await send(cookieB, a.id, 'Yes, same section!');
  assert.equal(reply.status, 201);

  // Both histories now show both messages, oldest first
  const aHistory = await (await fetch(`${ctx.base}/api/messages/${b.id}`, { headers: { Cookie: cookieA } })).json();
  assert.deepEqual(aHistory.messages.map((m) => m.body), ['Hey! We share CS 35L, right?', 'Yes, same section!']);
  assert.deepEqual(aHistory.messages.map((m) => m.sender_id), [a.id, b.id]);
  const bHistory2 = await (await fetch(`${ctx.base}/api/messages/${a.id}`, { headers: { Cookie: cookieB } })).json();
  assert.deepEqual(bHistory2.messages.map((m) => m.body), ['Hey! We share CS 35L, right?', 'Yes, same section!']);

  // Both resolve the same conversation
  assert.equal(aHistory.user.id, b.id);
  assert.equal(bHistory2.user.id, a.id);
});

test('conversation list shows the peer, count and last message, newest first', async () => {
  const { cookie: cookieA, user: a } = await registerUser(ctx.base, { username: 'msg_a3', email: 'msga3@test.dev' });
  const { cookie: cookieB, user: b } = await registerUser(ctx.base, { username: 'msg_b3', email: 'msgb3@test.dev' });
  const { cookie: cookieC, user: c } = await registerUser(ctx.base, { username: 'msg_c3', email: 'msgc3@test.dev' });

  await send(cookieA, b.id, 'first');
  await send(cookieA, c.id, 'later');

  const listA = await (await fetch(`${ctx.base}/api/messages`, { headers: { Cookie: cookieA } })).json();
  assert.equal(listA.conversations.length, 2);
  // Newest activity first: the c-conversation was updated last.
  assert.equal(listA.conversations[0].peer.id, c.id);
  assert.equal(listA.conversations[1].peer.id, b.id);
  assert.equal(listA.conversations[0].last_message.body, 'later');
  assert.equal(listA.conversations[0].message_count, 1);
  assert.ok(listA.conversations[0].created_at);

  // The peer sees the same conversation (one canonical row per pair).
  const listB = await (await fetch(`${ctx.base}/api/messages`, { headers: { Cookie: cookieB } })).json();
  assert.equal(listB.conversations.length, 1);
  assert.equal(listB.conversations[0].peer.username, 'msg_a3');
  assert.equal(listB.conversations[0].last_message.body, 'first');
  assert.equal(listB.conversations[0].last_message.sender_id, a.id);
  assert.equal(listB.conversations[0].id, listA.conversations[1].id);

  // c never sees a conversation they are not part of
  const listC = await (await fetch(`${ctx.base}/api/messages`, { headers: { Cookie: cookieC } })).json();
  assert.equal(listC.conversations.length, 1);
  assert.equal(listC.conversations[0].peer.username, 'msg_a3');
});

test('GET history of an empty or missing conversation', async () => {
  const { cookie: cookieA, user: a } = await registerUser(ctx.base, { username: 'msg_a4', email: 'msga4@test.dev' });
  const { cookie: cookieB, user: b } = await registerUser(ctx.base, { username: 'msg_b4', email: 'msgb4@test.dev' });

  // No messages yet: empty list, still 200
  const empty = await fetch(`${ctx.base}/api/messages/${b.id}`, { headers: { Cookie: cookieA } });
  assert.equal(empty.status, 200);
  const emptyData = await empty.json();
  assert.deepEqual(emptyData.messages, []);
  assert.equal(emptyData.user.username, 'msg_b4');

  // Unknown user: 404
  const missing = await fetch(`${ctx.base}/api/messages/ghost-user-id`, { headers: { Cookie: cookieA } });
  assert.equal(missing.status, 404);

  // Self: 400
  const self = await fetch(`${ctx.base}/api/messages/${a.id}`, { headers: { Cookie: cookieA } });
  assert.equal(self.status, 400);
});

test('DELETE removes the whole conversation for both users', async () => {
  const { cookie: cookieA, user: a } = await registerUser(ctx.base, { username: 'msg_a6', email: 'msga6@test.dev' });
  const { cookie: cookieB, user: b } = await registerUser(ctx.base, { username: 'msg_b6', email: 'msgb6@test.dev' });

  await send(cookieA, b.id, 'one');
  await send(cookieB, a.id, 'two');

  // B deletes the conversation
  const del = await fetch(`${ctx.base}/api/messages/${b.id}`, { method: 'DELETE', headers: { Cookie: cookieA } });
  assert.equal(del.status, 200);
  assert.deepEqual(await del.json(), { ok: true, deleted: true });

  // Both sides: empty list and empty history
  const listA = await (await fetch(`${ctx.base}/api/messages`, { headers: { Cookie: cookieA } })).json();
  const listB = await (await fetch(`${ctx.base}/api/messages`, { headers: { Cookie: cookieB } })).json();
  assert.equal(listA.conversations.length, 0);
  assert.equal(listB.conversations.length, 0);
  const histA = await (await fetch(`${ctx.base}/api/messages/${b.id}`, { headers: { Cookie: cookieA } })).json();
  assert.deepEqual(histA.messages, []);

  // Deleting again is idempotent
  const del2 = await fetch(`${ctx.base}/api/messages/${b.id}`, { method: 'DELETE', headers: { Cookie: cookieA } });
  assert.equal(del2.status, 200);
  assert.deepEqual(await del2.json(), { ok: true, deleted: false });
});

test('DELETE validates the target', async () => {
  const { cookie: cookieA, user: a } = await registerUser(ctx.base, { username: 'msg_a7', email: 'msga7@test.dev' });

  // unauthenticated
  assert.equal((await fetch(`${ctx.base}/api/messages/${a.id}`, { method: 'DELETE' })).status, 401);
  // self
  assert.equal((await fetch(`${ctx.base}/api/messages/${a.id}`, { method: 'DELETE', headers: { Cookie: cookieA } })).status, 400);
  // unknown user
  assert.equal((await fetch(`${ctx.base}/api/messages/ghost-user`, { method: 'DELETE', headers: { Cookie: cookieA } })).status, 404);
});

test('deleting nothing: messages of a deleted user are gone (cascade)', async () => {
  const { cookie: cookieA, user: a } = await registerUser(ctx.base, { username: 'msg_a5', email: 'msga5@test.dev' });
  const { cookie: cookieB, user: b } = await registerUser(ctx.base, { username: 'msg_b5', email: 'msgb5@test.dev' });
  await send(cookieA, b.id, 'will vanish');

  // Directly remove B's user row (simulates account deletion) to check cascade.
  const { getDb } = await import(`../../server/db.js?${Date.now()}`);
  getDb().prepare('DELETE FROM users WHERE id = ?').run(b.id);

  const listA = await (await fetch(`${ctx.base}/api/messages`, { headers: { Cookie: cookieA } })).json();
  assert.equal(listA.conversations.length, 0);
});
