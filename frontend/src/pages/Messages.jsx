import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Avatar, Spinner, ErrorBanner, EmptyState } from '../components/ui.jsx';
import { timeAgo } from '../util.js';

export default function Messages() {
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [removingId, setRemovingId] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api('/api/messages'));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const removeConversation = async (c) => {
    const name = c.peer.display_name || c.peer.username;
    if (!window.confirm(`Delete the conversation with ${name}? All messages will be removed for both of you.`)) return;
    setRemovingId(c.id);
    setError('');
    try {
      await api(`/api/messages/${c.peer.id}`, { method: 'DELETE' });
      setData((d) => (d ? { ...d, conversations: d.conversations.filter((x) => x.id !== c.id) } : d));
    } catch (e) {
      setError(e.message);
    } finally {
      setRemovingId(null);
    }
  };

  if (loading && !data) return <Spinner />;

  const conversations = data?.conversations || [];

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>Messages</h1>
          <p>Chat with the classmates you match with.</p>
        </div>
        <Link to="/discover" className="btn secondary">Find classmates</Link>
      </div>

      <ErrorBanner message={error} onRetry={load} />

      {!loading && conversations.length === 0 ? (
        <EmptyState icon="💬" title="No conversations yet.">
          <p>Find classmates you share courses with, then say hi.</p>
          <Link to="/discover" className="btn" style={{ marginTop: 8 }}>Find classmates</Link>
        </EmptyState>
      ) : (
        <div className="conv-list" data-testid="conversation-list">
          {conversations.map((c) => (
            <div
              className="conv-item"
              key={c.id}
              data-testid={`conversation-${c.peer.username}`}
              onClick={() => navigate(`/messages/${c.peer.id}`)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && navigate(`/messages/${c.peer.id}`)}
            >
              <Avatar src={c.peer.avatar_url} name={c.peer.display_name || c.peer.username} size={48} />
              <div className="conv-main">
                <div className="conv-name">{c.peer.display_name || c.peer.username}</div>
                <div className="conv-last">
                  {c.last_message
                    ? `${c.last_message.sender_id === me?.id ? 'You: ' : ''}${c.last_message.body}`
                    : 'New conversation'}
                </div>
              </div>
              <div className="conv-side">
                <span className="conv-time">{c.last_message ? timeAgo(c.last_message.created_at) : ''}</span>
                <div className="row" style={{ gap: 6 }}>
                  <Link className="btn small secondary" to={`/messages/${c.peer.id}`} data-testid={`open-${c.peer.username}`}>
                    Open
                  </Link>
                  <button
                    className="btn small danger"
                    disabled={removingId === c.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      removeConversation(c);
                    }}
                    data-testid={`delete-${c.peer.username}`}
                  >
                    {removingId === c.id ? '…' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
