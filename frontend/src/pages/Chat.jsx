import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Avatar, Spinner, ErrorBanner, EmptyState } from '../components/ui.jsx';
import { formatLocalTime } from '../util.js';

const POLL_INTERVAL_MS = 3000;

export default function Chat() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [notFound, setNotFound] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [removing, setRemoving] = useState(false);
  const logRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const res = await api(`/api/messages/${userId}`);
      setNotFound(false);
      setData((prev) => {
        // Keep the log stable: only replace when the peer changed or message
        // count grew/changed, to avoid re-render churn from identical polling.
        if (!prev || prev.user?.id !== res.user?.id) return res;
        if (prev.messages.length === res.messages.length) {
          const prevLast = prev.messages[prev.messages.length - 1];
          const newLast = res.messages[res.messages.length - 1];
          if (prevLast && newLast && prevLast.id === newLast.id) return prev;
        }
        return res;
      });
    } catch (e) {
      if (e.status === 404) {
        setNotFound(true);
        return;
      }
      setError(e.message);
    }
  }, [userId]);

  // Reset view state when the peer changes.
  useEffect(() => {
    setData(null);
    setError('');
    setNotFound(false);
    setDraft('');
  }, [userId]);

  // Initial load + polling. Stops once the peer is gone (404).
  useEffect(() => {
    if (notFound) return;
    load();
    const timer = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [load, notFound]);

  // Auto-scroll to the newest message.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [data?.messages?.length, data?.user?.id]);

  const send = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError('');
    try {
      await api('/api/messages', { method: 'POST', body: { to: userId, body: text } });
      setDraft('');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSending(false);
    }
  };

  const peer = data?.user;
  const messages = data?.messages || [];

  const deleteConversation = async () => {
    const name = peer ? peer.display_name || peer.username : 'this classmate';
    if (!window.confirm(`Delete the conversation with ${name}? All messages will be removed for both of you.`)) return;
    setRemoving(true);
    setError('');
    try {
      await api(`/api/messages/${userId}`, { method: 'DELETE' });
      navigate('/messages');
    } catch (e) {
      setError(e.message);
      setRemoving(false);
    }
  };

  if (notFound) {
    return (
      <div className="container">
        <div className="page-head">
          <div>
            <h1>Conversation</h1>
            <p>We couldn't find this classmate.</p>
          </div>
          <Link to="/messages" className="btn secondary">← All messages</Link>
        </div>
        <EmptyState icon="🔍" title="User not found.">
          <p>This account may have been deleted, or the link is out of date.</p>
          <Link to="/messages" className="btn" style={{ marginTop: 8 }}>Back to messages</Link>
        </EmptyState>
      </div>
    );
  }

  if (!data && !error) return <Spinner />;

  return (
    <div className="container">
      <div className="page-head">
        <div className="row" style={{ gap: 12 }}>
          <Link to="/messages" className="btn small secondary">← All messages</Link>
          {peer && (
            <>
              <Avatar src={peer.avatar_url} name={peer.display_name || peer.username} size={40} />
              <div>
                <h1 style={{ marginBottom: 0 }} data-testid="chat-peer-name">{peer.display_name || peer.username}</h1>
                <p style={{ fontSize: '0.85rem', margin: 0 }}>
                  <Link to={`/profile/${peer.id}`}>View profile</Link>
                </p>
              </div>
            </>
          )}
        </div>
        <button
          className="btn small danger"
          onClick={deleteConversation}
          disabled={removing}
          data-testid="chat-delete"
        >
          {removing ? 'Deleting…' : 'Delete conversation'}
        </button>
      </div>

      <ErrorBanner message={error} onRetry={load} />

      <div className="card chat-card" data-testid="chat-card">
        <div className="chat-log" ref={logRef} data-testid="chat-log">
          {messages.length === 0 ? (
            <div className="chat-empty">
              <div className="big">👋</div>
              <p>Say hi to {peer ? (peer.display_name || peer.username) : 'your classmate'} — this is the start of your conversation.</p>
            </div>
          ) : (
            messages.map((m) => {
              const mine = m.sender_id === me?.id;
              return (
                <div
                  key={m.id}
                  className={`bubble ${mine ? 'mine' : 'theirs'}`}
                  data-testid={mine ? `msg-mine-${m.id.slice(0, 8)}` : `msg-theirs-${m.id.slice(0, 8)}`}
                >
                  <div className="bubble-text">{m.body}</div>
                  <span className="when">{formatLocalTime(m.created_at)}</span>
                </div>
              );
            })
          )}
        </div>

        <div className="chat-composer">
          <input
            data-testid="chat-input"
            value={draft}
            maxLength={2000}
            placeholder="Write a message…"
            aria-label="Message text"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <button className="btn" onClick={send} disabled={sending || !draft.trim()} data-testid="chat-send">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
