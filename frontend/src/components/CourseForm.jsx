import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { DAY_OPTIONS } from '../util.js';
import { ErrorBanner } from './ui.jsx';

const emptyMeeting = () => ({ days: [], start_time: '10:00', end_time: '11:50', location: '' });

/** Add / edit a course with its meetings. course prop null = create. */
export default function CourseForm({ course, onSaved, onCancel }) {
  const [code, setCode] = useState(course?.course_code || '');
  const [name, setName] = useState(course?.course_name || '');
  const [instructor, setInstructor] = useState(course?.instructor || '');
  const [section, setSection] = useState(course?.section || '');
  const [location, setLocation] = useState(course?.location || '');
  const [term, setTerm] = useState(course?.term || 'Fall 2026');
  const [meetings, setMeetings] = useState(
    course?.meetings?.length
      ? course.meetings.map((m) => ({ days: String(m.days).split(',').filter(Boolean), start_time: m.start_time || '10:00', end_time: m.end_time || '11:50', location: m.location || '' }))
      : [emptyMeeting()]
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (course) {
      setCode(course.course_code || '');
      setName(course.course_name || '');
      setInstructor(course.instructor || '');
      setSection(course.section || '');
      setLocation(course.location || '');
      setTerm(course.term || 'Fall 2026');
      setMeetings(
        course.meetings?.length
          ? course.meetings.map((m) => ({ days: String(m.days).split(',').filter(Boolean), start_time: m.start_time || '10:00', end_time: m.end_time || '11:50', location: m.location || '' }))
          : [emptyMeeting()]
      );
    }
  }, [course]);

  const toggleDay = (mi, day) => {
    setMeetings((ms) =>
      ms.map((m, i) =>
        i === mi
          ? { ...m, days: m.days.includes(day) ? m.days.filter((d) => d !== day) : [...m.days, day] }
          : m
      )
    );
  };

  const setMeeting = (mi, patch) => {
    setMeetings((ms) => ms.map((m, i) => (i === mi ? { ...m, ...patch } : m)));
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const body = {
        course_code: code,
        course_name: name,
        instructor,
        section,
        location,
        term,
        meetings: meetings.map((m) => ({ days: m.days, start_time: m.start_time, end_time: m.end_time, location: m.location })),
      };
      const data = course?.id
        ? await api(`/api/courses/${course.id}`, { method: 'PATCH', body })
        : await api('/api/courses', { method: 'POST', body });
      onSaved(data.course);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card" onSubmit={submit} data-testid="course-form">
      <h3>{course?.id ? 'Edit course' : 'Add a course'}</h3>
      <ErrorBanner message={error} />
      <div className="form-grid">
        <div className="field">
          <label htmlFor="cf-code">Course code *</label>
          <input id="cf-code" placeholder="e.g. CS 35L" value={code} onChange={(e) => setCode(e.target.value)} required maxLength={40} />
        </div>
        <div className="field">
          <label htmlFor="cf-name">Course name</label>
          <input id="cf-name" placeholder="e.g. Intro to Programming" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor="cf-ins">Instructor</label>
          <input id="cf-ins" placeholder="e.g. Paul Eggert" value={instructor} onChange={(e) => setInstructor(e.target.value)} maxLength={120} />
        </div>
        <div className="field">
          <label htmlFor="cf-sec">Section</label>
          <input id="cf-sec" placeholder="optional" value={section} onChange={(e) => setSection(e.target.value)} maxLength={20} />
        </div>
        <div className="field">
          <label htmlFor="cf-loc">Location</label>
          <input id="cf-loc" placeholder="e.g. ENG 1102" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={80} />
        </div>
        <div className="field">
          <label htmlFor="cf-term">Term</label>
          <input id="cf-term" value={term} onChange={(e) => setTerm(e.target.value)} maxLength={40} />
        </div>
      </div>

      {meetings.map((m, mi) => (
        <div className="review-item" key={mi} style={{ marginBottom: 10 }} data-testid={`meeting-${mi}`}>
          <div className="row" style={{ marginBottom: 8 }}>
            <strong style={{ fontSize: '0.86rem' }}>Meeting {mi + 1}</strong>
            <div className="row">
              {DAY_OPTIONS.map((d) => (
                <button
                  type="button"
                  key={d.value}
                  className={`day-toggle ${m.days.includes(d.value) ? 'on' : ''}`}
                  onClick={() => toggleDay(mi, d.value)}
                  aria-pressed={m.days.includes(d.value)}
                >
                  {d.label}
                </button>
              ))}
            </div>
            {meetings.length > 1 && (
              <button type="button" className="btn small danger" onClick={() => setMeetings((ms) => ms.filter((_, i) => i !== mi))}>
                Remove
              </button>
            )}
          </div>
          <div className="row">
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor={`m-${mi}-start`}>Start</label>
              <input id={`m-${mi}-start`} type="time" value={m.start_time} onChange={(e) => setMeeting(mi, { start_time: e.target.value })} required />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor={`m-${mi}-end`}>End</label>
              <input id={`m-${mi}-end`} type="time" value={m.end_time} onChange={(e) => setMeeting(mi, { end_time: e.target.value })} required />
            </div>
            <div className="field" style={{ marginBottom: 0, flex: 1, minWidth: 140 }}>
              <label htmlFor={`m-${mi}-loc`}>Room (optional)</label>
              <input id={`m-${mi}-loc`} value={m.location} onChange={(e) => setMeeting(mi, { location: e.target.value })} maxLength={80} />
            </div>
          </div>
        </div>
      ))}

      <div className="row between" style={{ marginTop: 12 }}>
        <button type="button" className="btn secondary" onClick={() => setMeetings((ms) => [...ms, emptyMeeting()])}>
          + Add meeting time
        </button>
        <div className="row">
          {onCancel && (
            <button type="button" className="btn secondary" onClick={onCancel}>Cancel</button>
          )}
          <button type="submit" className="btn" disabled={saving}>
            {saving ? 'Saving…' : course?.id ? 'Save changes' : 'Add course'}
          </button>
        </div>
      </div>
    </form>
  );
}
