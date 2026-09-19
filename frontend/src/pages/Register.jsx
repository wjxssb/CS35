import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { ErrorBanner } from '../components/ui.jsx';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register(username, email, password);
      navigate('/profile');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>Create your account</h1>
        <p className="sub">Join and discover who shares your schedule.</p>
        <ErrorBanner message={error} />
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="reg-user">Username</label>
            <input id="reg-user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required minLength={3} maxLength={30} pattern="[A-Za-z0-9_]+" title="3-30 letters, numbers or underscore" />
          </div>
          <div className="field">
            <label htmlFor="reg-email">Email</label>
            <input id="reg-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </div>
          <div className="field">
            <label htmlFor="reg-pw">Password</label>
            <input id="reg-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required minLength={8} />
            <span style={{ fontSize: '0.78rem', color: 'var(--text-soft)' }}>At least 8 characters.</span>
          </div>
          <button className="btn block" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Sign up'}</button>
        </form>
        <p className="auth-alt">
          Already have an account? <Link to="/login">Log in</Link>
        </p>
      </div>
    </div>
  );
}
