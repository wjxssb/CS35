import { Router } from 'express';
import {
  getDb,
  getOrCreateConversation,
  conversationMessages,
  conversationsForUser,
  insertMessage,
  deleteConversationBetween,
} from '../db.js';
import { requireAuth } from '../auth.js';
import { textField } from '../validate.js';

const router = Router();
router.use(requireAuth);

const MAX_MESSAGE_LENGTH = 2000;

function peerProfile(userId) {
  const d = getDb();
  const user = d.prepare('SELECT id, username, email FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  const profile = d.prepare('SELECT display_name, bio, avatar_path FROM profiles WHERE user_id = ?').get(userId);
  return {
    id: user.id,
    username: user.username,
    display_name: profile?.display_name || '',
    avatar_url: profile?.avatar_path ? `/uploads/avatars/${profile.avatar_path.split('/').pop()}` : null,
  };
}

function messageView(row) {
  return { id: row.id, conversation_id: row.conversation_id, sender_id: row.sender_id, body: row.body, created_at: row.created_at };
}

/**
 * GET /api/messages — my conversations, newest activity first.
 * Each entry includes the peer's public profile, the last message and a count.
 */
router.get('/', (req, res) => {
  const rows = conversationsForUser(req.user.id);
  res.json({
    conversations: rows.map((c) => ({
      id: c.id,
      peer: peerProfile(c.peer_id),
      message_count: c.message_count,
      last_message: c.last_body
        ? { body: c.last_body, sender_id: c.last_sender_id, created_at: c.last_created_at }
        : null,
      created_at: c.created_at,
    })),
  });
});

/**
 * POST /api/messages — send a message to a classmate.
 * Body: { to: <userId>, body: <string> }. The conversation is created on
 * first message (one canonical row per pair, shared by both users).
 */
router.post('/', (req, res) => {
  const body = req.body || {};
  const to = typeof body.to === 'string' ? body.to.trim() : '';
  const { value: text, error } = textField(body.body, 'Message', MAX_MESSAGE_LENGTH, { required: true });
  if (error) return res.status(400).json({ error });
  if (!text) return res.status(400).json({ error: 'Message is required.' });

  if (!to) return res.status(400).json({ error: 'Missing recipient.' });
  if (to === req.user.id) return res.status(400).json({ error: 'You cannot message yourself.' });

  const target = getDb().prepare('SELECT id FROM users WHERE id = ?').get(to);
  if (!target) return res.status(404).json({ error: 'That user does not exist.' });

  const conversation = getOrCreateConversation(req.user.id, to);
  const message = insertMessage(conversation.id, req.user.id, text);
  res.status(201).json({ message: messageView(message), conversation_id: conversation.id });
});

/**
 * DELETE /api/messages/:userId — remove the whole conversation with a
 * classmate (every message, for both sides). Idempotent.
 */
router.delete('/:userId', (req, res) => {
  const { userId } = req.params;
  if (userId === req.user.id) return res.status(400).json({ error: 'You cannot delete your own conversation.' });

  const peer = peerProfile(userId);
  if (!peer) return res.status(404).json({ error: 'User not found.' });

  const deleted = deleteConversationBetween(req.user.id, userId);
  res.json({ ok: true, deleted });
});

/**
 * GET /api/messages/:userId — full history with a specific classmate,
 * oldest first, plus that classmate's public profile.
 */
router.get('/:userId', (req, res) => {
  const { userId } = req.params;
  if (userId === req.user.id) return res.status(400).json({ error: 'You cannot message yourself.' });

  const peer = peerProfile(userId);
  if (!peer) return res.status(404).json({ error: 'User not found.' });

  const conv = getDb()
    .prepare('SELECT id FROM conversations WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)')
    .get(userId, req.user.id, req.user.id, userId);

  const messages = conv ? conversationMessages(conv.id).map(messageView) : [];
  res.json({ user: peer, messages });
});

export default router;
