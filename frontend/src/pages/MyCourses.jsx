import React, { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../api.js';
import CourseForm from '../components/CourseForm.jsx';
import { Spinner, ErrorBanner, SuccessBanner, EmptyState } from '../components/ui.jsx';
import { meetingLabel } from '../util.js';

export default function MyCourses() {
  const location = useLocation();
  const [courses, setCourses] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(location.state?.notice || '');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // null | 'new' | course object
  const [deleting, setDeleting] = useState(null);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { courses } = await api('/api/courses');
      setCourses(courses);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const onSaved = (course) => {
    setEditing(null);
    setNotice(course ? 'Course saved.' : '');
    load();
  };

  const remove = async (id) => {
    setError('');
    try {
      await api(`/api/courses/${id}`, { method: 'DELETE' });
      setDeleting(null);
      setNotice('Course removed.');
      load();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>My courses</h1>
          <p>Everything here is compared against other students to find your classmates.</p>
        </div>
        {!editing && (
          <button className="btn" data-testid="add-course-btn" onClick={() => { setNotice(''); setEditing('new'); }}>
            + Add course
          </button>
        )}
      </div>

      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      {editing && (
        <div style={{ marginBottom: 16 }}>
          <CourseForm
            course={editing === 'new' ? null : editing}
            onSaved={onSaved}
            onCancel={() => setEditing(null)}
          />
        </div>
      )}

      {loading && !courses ? (
        <Spinner />
      ) : courses && courses.length === 0 ? (
        <EmptyState icon="🗓️" title="You haven't added any courses yet.">
          <p>Add courses to start finding classmates.</p>
          <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
            <button className="btn" onClick={() => setEditing('new')}>Add your first course</button>
            <Link to="/upload" className="btn secondary">Or upload a schedule image</Link>
          </div>
        </EmptyState>
      ) : courses ? (
        <div className="stack">
          {courses.map((c) => (
            <div className="card" key={c.id} data-testid={`course-${c.course_code.replace(/\s+/g, '')}`}>
              <div className="row between">
                <div>
                  <h3 style={{ marginBottom: 2 }}>
                    {c.course_code}
                    {c.course_name ? <span style={{ color: 'var(--text-soft)', fontWeight: 500 }}> — {c.course_name}</span> : null}
                  </h3>
                  <p style={{ color: 'var(--text-soft)', margin: 0 }}>
                    {c.instructor || 'No instructor listed'}
                    {c.section ? ` · Section ${c.section}` : ''}
                    {c.location ? ` · ${c.location}` : ''}
                    {c.term ? ` · ${c.term}` : ''}
                  </p>
                </div>
                <div className="row">
                  <button className="btn small secondary" onClick={() => { setNotice(''); setEditing(c); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                    Edit
                  </button>
                  <button className="btn small danger" onClick={() => setDeleting(c)}>Delete</button>
                </div>
              </div>
              {c.meetings.length > 0 && (
                <div className="stack" style={{ gap: 6, marginTop: 10 }}>
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
      ) : null}

      {deleting && (
        <div className="card" style={{ marginTop: 14, borderColor: '#fecaca' }} data-testid="delete-confirm">
          <p>Delete <strong>{deleting.course_code}</strong>? This cannot be undone.</p>
          <div className="row">
            <button className="btn danger" onClick={() => remove(deleting.id)}>Yes, delete</button>
            <button className="btn secondary" onClick={() => setDeleting(null)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
