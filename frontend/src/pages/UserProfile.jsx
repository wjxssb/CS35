import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Avatar, Spinner, ErrorBanner, EmptyState } from '../components/ui.jsx';
import { meetingLabel } from '../util.js';

export default function UserProfile() {
  const { id } = useParams();
  const { user: me } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError('');
    api(`/api/users/${id}`)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading && !data) return <Spinner />;
  if (error) {
    return (
      <div className="container">
        <ErrorBanner message={error} />
      </div>
    );
  }
  if (!data) return null;
  const { user, match } = data;

  return (
    <div className="container">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="profile-head">
          <Avatar src={user.avatar_url} name={user.display_name || user.username} size={96} />
          <div className="info">
            <h1 data-testid="profile-name">{user.display_name || user.username}</h1>
            <p style={{ color: 'var(--text-soft)', margin: '0 0 6px' }}>@{user.username}</p>
            <p style={{ margin: 0 }}>
              {[user.major, user.year].filter(Boolean).join(' · ')}
            </p>
            {user.bio && <p style={{ marginTop: 8 }}>“{user.bio}”</p>}
            {me && me.id !== user.id && (
              <div style={{ marginTop: 12 }}>
                <Link className="btn" to={`/messages/${user.id}`} data-testid="message-user">
                  💬 Message {user.display_name || user.username}
                </Link>
              </div>
            )}
          </div>
        </div>

        {match && (
          <div className="match-section" style={{ marginTop: 14, borderTop: '1px dashed var(--border)', paddingTop: 12 }} data-testid="profile-match">
            <div className="row" style={{ marginBottom: 8 }}>
              <span className="chip" data-testid="profile-match-courses">{match.courseOverlapCount} shared course{match.courseOverlapCount === 1 ? '' : 's'}</span>
              <span className="chip amber">{match.instructorOverlapCount} same instructor{match.instructorOverlapCount === 1 ? '' : 's'}</span>
              <span className="chip green">{match.timeOverlapCount} time overlap{match.timeOverlapCount === 1 ? '' : 's'}</span>
            </div>
            {match.matchedCourses.length > 0 && (
              <>
                <div className="label" style={{ fontWeight: 700, fontSize: '0.86rem', marginBottom: 4 }}>You share:</div>
                <div className="chips">
                  {match.matchedCourses.map((c) => (
                    <span className="chip gray" key={c} data-testid={`shared-${c.replace(/\s+/g, '')}`}>{c}</span>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="card">
        <h2>Courses ({user.courses.length})</h2>
        {user.courses.length === 0 ? (
          <EmptyState icon="🗓️" title="No courses added yet.">
            This classmate hasn't added any courses.
          </EmptyState>
        ) : (
          <div>
            {user.courses.map((c) => (
              <div className="course-row" key={c.id} data-testid={`pub-course-${c.course_code.replace(/\s+/g, '')}`}>
                <div className="row between">
                  <div>
                    <h3 style={{ marginBottom: 2 }}>
                      {c.course_code}
                      {c.course_name ? <span style={{ color: 'var(--text-soft)', fontWeight: 500 }}> — {c.course_name}</span> : null}
                    </h3>
                    <p style={{ color: 'var(--text-soft)', margin: 0 }}>
                      {c.instructor || 'No instructor listed'}
                      {c.section ? ` · Section ${c.section}` : ''}
                      {c.term ? ` · ${c.term}` : ''}
                    </p>
                  </div>
                </div>
                {c.meetings.length > 0 && (
                  <div className="stack" style={{ gap: 6, marginTop: 8 }}>
                    {c.meetings.map((m) => (
                      <div className="meeting-item" key={m.id}>
                        <span>{meetingLabel(m)}</span>
                        {m.location && <span className="loc">{m.location}</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
