import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Spinner, ErrorBanner, EmptyState } from '../components/ui.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await api('/api/dashboard'));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  if (loading && !data) return <Spinner />;

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1 data-testid="dash-hi">Hi {data?.user?.display_name || user.display_name || user.username} 👋</h1>
          <p>Let's find you some classmates.</p>
        </div>
        <Link to="/discover" className="btn" data-testid="dash-cta">Find classmates</Link>
      </div>

      <ErrorBanner message={error} onRetry={load} />

      {data && (
        <>
          <div className="stat-row" style={{ marginBottom: 18 }}>
            <div className="stat">
              <div className="num" data-testid="dash-course-count">{data.courseCount}</div>
              <div className="lbl">courses saved</div>
            </div>
            <div className="stat">
              <div className="num" data-testid="dash-3plus">{data.shared.threePlus}</div>
              <div className="lbl">people with 3+ shared courses</div>
            </div>
            <div className="stat">
              <div className="num" data-testid="dash-2plus">{data.shared.twoPlus}</div>
              <div className="lbl">people with 2+ shared courses</div>
            </div>
            <div className="stat">
              <div className="num">{data.shared.total}</div>
              <div className="lbl">classmates with any overlap</div>
            </div>
          </div>

          {data.courseCount === 0 ? (
            <EmptyState icon="🗓️" title="You haven't added any courses yet.">
              <p>Add courses to start finding classmates.</p>
              <div className="row" style={{ justifyContent: 'center', marginTop: 10 }}>
                <Link to="/courses" className="btn">Add courses manually</Link>
                <Link to="/upload" className="btn secondary">Upload a schedule image</Link>
              </div>
            </EmptyState>
          ) : (
            <div className="card">
              <h2>Your schedule is live</h2>
              <p style={{ color: 'var(--text-soft)' }}>
                We compare your full course list — courses, instructors and meeting times — against everyone else's.
              </p>
              <div className="row" style={{ marginTop: 8 }}>
                <Link to="/discover" className="btn">See your matches</Link>
                <Link to="/courses" className="btn secondary">Manage courses</Link>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
