import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { Avatar, Spinner, ErrorBanner, EmptyState } from '../components/ui.jsx';
import { DAY_OPTIONS } from '../util.js';

const SORTS = [
  { value: 'best', label: 'Best Match' },
  { value: 'course', label: 'Course' },
  { value: 'instructor', label: 'Instructor' },
  { value: 'time', label: 'Time' },
];

export default function Discover() {
  const [sort, setSort] = useState('best');
  const [courseFilter, setCourseFilter] = useState('');
  const [instructorFilter, setInstructorFilter] = useState('');
  const [dayFilter, setDayFilter] = useState([]);
  const [timeFilter, setTimeFilter] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      params.set('sort', sort);
      if (courseFilter.trim()) params.set('course', courseFilter.trim());
      if (instructorFilter.trim()) params.set('instructor', instructorFilter.trim());
      if (dayFilter.length) params.set('day', dayFilter.join(','));
      if (timeFilter.trim()) params.set('time', timeFilter.trim());
      const data = await api(`/api/discover?${params.toString()}`);
      setResults(data.results);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, courseFilter, instructorFilter, dayFilter.join(','), timeFilter]);

  const toggleDay = (d) =>
    setDayFilter((ds) => (ds.includes(d) ? ds.filter((x) => x !== d) : [...ds, d]));

  const hasFilters = courseFilter || instructorFilter || dayFilter.length || timeFilter;

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>Find People</h1>
          <p>Ranked by everything you share — courses, instructors and class times.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row between" style={{ marginBottom: 10 }}>
          <strong style={{ fontSize: '0.9rem' }}>Sort by</strong>
          <div className="tabs" role="tablist" data-testid="sort-tabs">
            {SORTS.map((s) => (
              <button
                key={s.value}
                role="tab"
                aria-selected={sort === s.value}
                className={`tab ${sort === s.value ? 'active' : ''}`}
                onClick={() => setSort(s.value)}
                data-testid={`sort-${s.value}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="form-grid" style={{ alignItems: 'end' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="f-course">Course</label>
            <input
              id="f-course"
              data-testid="filter-course"
              placeholder="e.g. CS 35, 131A or Python"
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="f-ins">Instructor</label>
            <input
              id="f-ins"
              data-testid="filter-instructor"
              placeholder="e.g. Eggert or Paul E"
              value={instructorFilter}
              onChange={(e) => setInstructorFilter(e.target.value)}
            />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="f-time">Time</label>
            <input
              id="f-time"
              data-testid="filter-time"
              placeholder="e.g. 14:00 or 2pm"
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value)}
            />
          </div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-soft)' }}>Day</span>
          {DAY_OPTIONS.map((d) => (
            <button
              key={d.value}
              className={`day-toggle ${dayFilter.includes(d.value) ? 'on' : ''}`}
              onClick={() => toggleDay(d.value)}
              data-testid={`filter-day-${d.value}`}
            >
              {d.label}
            </button>
          ))}
          {hasFilters && (
            <button
              className="btn small secondary"
              onClick={() => {
                setCourseFilter('');
                setInstructorFilter('');
                setDayFilter([]);
                setTimeFilter('');
              }}
            >
              Clear filters
            </button>
          )}
        </div>
        <p style={{ color: 'var(--text-soft)', fontSize: '0.8rem', margin: '8px 0 0' }}>
          Partial matches are fine — case, spacing and incomplete input all work (e.g. "CS 35" finds
          CS 35L, "egger" finds Eggert). Filters combine with AND between categories, OR within one.
        </p>
      </div>

      <ErrorBanner message={error} onRetry={load} />

      {loading && !results ? (
        <Spinner />
      ) : results && results.length === 0 ? (
        <EmptyState icon="🔍" title="No matching students found.">
          <p>Try changing your filters — or add more courses so we can find overlaps.</p>
          <Link to="/courses" className="btn" style={{ marginTop: 8 }}>Add courses</Link>
        </EmptyState>
      ) : results ? (
        <div className="grid" data-testid="results">
          {results.map(({ user, match }) => (
            <div className="card match-card" key={user.id} data-testid={`match-${user.username}`}>
              <div className="head">
                <Avatar src={user.avatar_url} name={user.display_name || user.username} size={52} />
                <div>
                  <div className="name">{user.display_name || user.username}</div>
                  <div className="meta">
                    {[user.major, user.year].filter(Boolean).join(' · ') || 'Classmate'}
                  </div>
                </div>
              </div>
              {user.bio && <div className="bio">“{user.bio}”</div>}
              <div className="match-stats">
                <span className="chip" data-testid={`stat-course-${user.username}`}>{match.courseOverlapCount} shared course{match.courseOverlapCount === 1 ? '' : 's'}</span>
                <span className="chip amber">{match.instructorOverlapCount} same instructor{match.instructorOverlapCount === 1 ? '' : 's'}</span>
                <span className="chip green">{match.timeOverlapCount} time overlap{match.timeOverlapCount === 1 ? '' : 's'}</span>
              </div>
              {match.matchedCourses.length > 0 && (
                <div className="match-section">
                  <div className="label">Shared courses</div>
                  <div className="chips">
                    {match.matchedCourses.slice(0, 6).map((c) => (
                      <span className="chip gray" key={c}>{c}</span>
                    ))}
                  </div>
                </div>
              )}
              {match.matchedInstructors.length > 0 && (
                <div className="match-section">
                  <div className="label">Same instructors</div>
                  <div className="chips">
                    {match.matchedInstructors.slice(0, 4).map((i) => (
                      <span className="chip amber" key={i}>{i}</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="row between" style={{ marginTop: 'auto', paddingTop: 6 }}>
                <Link className="btn small secondary" to={`/profile/${user.id}`} data-testid={`view-${user.username}`}>
                  View Profile
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
