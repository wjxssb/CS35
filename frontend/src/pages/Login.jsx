import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { ErrorBanner } from '../components/ui.jsx';

export default function Login() {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) {
    navigate('/', { replace: true });
    return null;
  }

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(identifier, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <h1>Welcome back</h1>
        <p className="sub">Log in to find classmates in your courses.</p>
        <ErrorBanner message={error} />
        <form onSubmit={submit}>
          <div className="field">
            <label htmlFor="login-id">Email or username</label>
            <input id="login-id" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
          </div>
          <div className="field">
            <label htmlFor="login-pw">Password</label>
            <input id="login-pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </div>
          <button className="btn block" type="submit" disabled={busy}>{busy ? 'Logging in…' : 'Log in'}</button>
        </form>
        <p className="auth-alt">
          New here? <Link to="/register">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
