import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Avatar, ErrorBanner, SuccessBanner, Spinner } from '../components/ui.jsx';

export default function MyProfile() {
  const { user, refresh } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [major, setMajor] = useState('');
  const [year, setYear] = useState('');
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    api('/api/me')
      .then(({ user }) => {
        setDisplayName(user.display_name || '');
        setBio(user.bio || '');
        setMajor(user.major || '');
        setYear(user.year || '');
        setAvatarUrl(user.avatar_url);
      })
      .catch((e) => setError(e.message));
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await api('/api/me', { method: 'PATCH', body: { display_name: displayName, bio, major, year } });
      await refresh();
      setSuccess('Profile saved.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const uploadAvatar = async (file) => {
    if (!file) return;
    setError('');
    setSuccess('');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      const { avatar_url } = await api('/api/me/avatar', { method: 'POST', formData: fd });
      setAvatarUrl(avatar_url);
      await refresh();
      setSuccess('Profile picture updated.');
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>Your profile</h1>
          <p>This is what other classmates see (your email stays private).</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 640 }}>
        <div className="profile-head" style={{ marginBottom: 16 }}>
          <Avatar src={avatarUrl} name={displayName || user.username} size={84} />
          <div>
            <h2 style={{ marginBottom: 2 }}>{displayName || user.username}</h2>
            <p style={{ color: 'var(--text-soft)', margin: 0 }}>@{user.username}</p>
            <p style={{ color: 'var(--text-soft)', margin: 0, fontSize: '0.85rem' }}>{user.email}</p>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn small secondary" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? 'Uploading…' : 'Upload photo'}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: 'none' }}
                onChange={(e) => uploadAvatar(e.target.files?.[0])}
              />
            </div>
          </div>
        </div>

        <ErrorBanner message={error} />
        <SuccessBanner message={success} />

        <form onSubmit={save} style={{ marginTop: 10 }}>
          <div className="form-grid">
            <div className="field full">
              <label htmlFor="pf-name">Display name</label>
              <input id="pf-name" data-testid="pf-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} required maxLength={60} />
            </div>
            <div className="field">
              <label htmlFor="pf-major">Major</label>
              <input id="pf-major" data-testid="pf-major" value={major} onChange={(e) => setMajor(e.target.value)} maxLength={80} placeholder="e.g. Computer Science" />
            </div>
            <div className="field">
              <label htmlFor="pf-year">Year</label>
              <select id="pf-year" data-testid="pf-year" value={year} onChange={(e) => setYear(e.target.value)}>
                <option value="">Not specified</option>
                <option value="1st Year">1st Year</option>
                <option value="2nd Year">2nd Year</option>
                <option value="3rd Year">3rd Year</option>
                <option value="4th Year">4th Year</option>
                <option value="5th Year">5th Year</option>
                <option value="Graduate">Graduate</option>
              </select>
            </div>
            <div className="field full">
              <label htmlFor="pf-bio">Bio</label>
              <textarea id="pf-bio" data-testid="pf-bio" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} maxLength={500} placeholder="Tell classmates a bit about yourself…" />
            </div>
          </div>
          <button className="btn" type="submit" disabled={saving} data-testid="pf-save">
            {saving ? 'Saving…' : 'Save profile'}
          </button>
        </form>
      </div>
    </div>
  );
}
