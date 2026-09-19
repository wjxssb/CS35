import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { ErrorBanner, SuccessBanner, Spinner } from '../components/ui.jsx';
import { DAY_OPTIONS } from '../util.js';

export default function ScheduleUpload() {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [review, setReview] = useState(null); // { uploadId, candidates, lowConfidence }
  const [saving, setSaving] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  const reset = () => {
    setFile(null);
    setPreviewUrl(null);
    setReview(null);
    setError('');
    setNotice('');
  };

  const pickFile = (f) => {
    setError('');
    setNotice('');
    setReview(null);
    if (!f) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
      setError('Please choose a JPG, PNG or WebP image.');
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('Image is too large (max 10 MB).');
      return;
    }
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true);
    setError('');
    setNotice('');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const data = await api('/api/schedule/upload', { method: 'POST', formData: fd });
      setReview({
        uploadId: data.uploadId,
        lowConfidence: data.lowConfidence,
        candidates: data.candidates.map((c) => ({
          id: c.id,
          include: true,
          course_code: c.course_code || '',
          course_name: c.course_name || '',
          instructor: c.instructor || '',
          section: c.section || '',
          location: c.location || '',
          term: '',
          days: c.days ? c.days.split(',').filter(Boolean) : [],
          start_time: c.start_time || '',
          end_time: c.end_time || '',
        })),
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const patchCandidate = (idx, patch) => {
    setReview((r) => ({
      ...r,
      candidates: r.candidates.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    }));
  };

  const toggleDay = (idx, day) => {
    setReview((r) => ({
      ...r,
      candidates: r.candidates.map((c, i) =>
        i === idx
          ? { ...c, days: c.days.includes(day) ? c.days.filter((d) => d !== day) : [...c.days, day] }
          : c
      ),
    }));
  };

  const confirm = async () => {
    setSaving(true);
    setError('');
    try {
      const courses = review.candidates
        .filter((c) => c.include)
        .map(({ include, ...c }) => c);
      const data = await api('/api/schedule/confirm', {
        method: 'POST',
        body: { uploadId: review.uploadId, courses },
      });
      const parts = [];
      parts.push(`Saved ${data.saved} course${data.saved === 1 ? '' : 's'}.`);
      if (data.skipped > 0) parts.push(`Skipped ${data.skipped} duplicate${data.skipped === 1 ? '' : 's'} you already have.`);
      navigate('/courses', { state: { notice: parts.join(' ') } });
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  const includedCount = review ? review.candidates.filter((c) => c.include).length : 0;

  return (
    <div className="container">
      <div className="page-head">
        <div>
          <h1>Upload schedule image</h1>
          <p>Take a screenshot of your course schedule (portal, app, web page) and we'll extract the courses.</p>
        </div>
      </div>

      <ErrorBanner message={error} />
      <SuccessBanner message={notice} />

      {!review && (
        <>
          <div
            className="card"
            style={{
              border: dragOver ? '2px dashed var(--primary)' : '2px dashed var(--border)',
              textAlign: 'center',
              padding: 40,
              cursor: 'pointer',
            }}
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              pickFile(e.dataTransfer.files?.[0]);
            }}
            data-testid="dropzone"
          >
            <div style={{ fontSize: '2rem', marginBottom: 8 }}>🖼️</div>
            <h3>{file ? file.name : 'Click to choose an image, or drop it here'}</h3>
            <p style={{ color: 'var(--text-soft)' }}>JPG, PNG or WebP · up to 10 MB</p>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              style={{ display: 'none' }}
              data-testid="file-input"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
          </div>

          {file && (
            <div className="card" style={{ marginTop: 14 }}>
              <div className="row between">
                <img src={previewUrl} alt="schedule preview" style={{ maxHeight: 220, borderRadius: 8 }} data-testid="preview" />
                <div className="row">
                  <button className="btn secondary" onClick={reset} disabled={uploading}>Choose another</button>
                  <button className="btn" onClick={upload} disabled={uploading} data-testid="parse-btn">
                    {uploading ? 'Reading schedule…' : 'Extract courses'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <p style={{ color: 'var(--text-soft)', marginTop: 14 }}>
            Prefer typing? <Link to="/courses">Add courses manually</Link> instead.
          </p>
        </>
      )}

      {uploading && <Spinner />}

      {review && (
        <>
          <div className="banner info" style={{ marginBottom: 14 }} data-testid="review-note">
            Please review the detected courses below. OCR makes mistakes — edit anything that looks wrong,
            untick rows you don't want, then save.
          </div>
          {review.lowConfidence && (
            <div className="banner warn" style={{ marginBottom: 14 }}>
              We're not fully confident about this image. Double-check the details below.
            </div>
          )}

          <div className="stack">
            {review.candidates.map((c, idx) => (
              <div className="review-item" key={c.id || idx} data-testid={`candidate-${idx}`}>
                <div className="head">
                  <label className="row" style={{ gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={c.include}
                      onChange={(e) => patchCandidate(idx, { include: e.target.checked })}
                      data-testid={`include-${idx}`}
                    />
                    <strong>{c.course_code || '(no course code)'}</strong>
                  </label>
                  <button
                    className="btn small danger"
                    onClick={() => setReview((r) => ({ ...r, candidates: r.candidates.filter((_, i) => i !== idx) }))}
                  >
                    Remove
                  </button>
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor={`c-${idx}-code`}>Course code *</label>
                    <input id={`c-${idx}-code`} data-testid={`c-${idx}-code`} value={c.course_code} onChange={(e) => patchCandidate(idx, { course_code: e.target.value })} maxLength={40} />
                  </div>
                  <div className="field">
                    <label htmlFor={`c-${idx}-name`}>Course name</label>
                    <input id={`c-${idx}-name`} value={c.course_name} onChange={(e) => patchCandidate(idx, { course_name: e.target.value })} maxLength={120} />
                  </div>
                  <div className="field">
                    <label htmlFor={`c-${idx}-ins`}>Instructor</label>
                    <input id={`c-${idx}-ins`} data-testid={`c-${idx}-ins`} value={c.instructor} onChange={(e) => patchCandidate(idx, { instructor: e.target.value })} maxLength={120} />
                  </div>
                  <div className="field">
                    <label htmlFor={`c-${idx}-loc`}>Location</label>
                    <input id={`c-${idx}-loc`} value={c.location} onChange={(e) => patchCandidate(idx, { location: e.target.value })} maxLength={80} />
                  </div>
                </div>
                <div className="row" style={{ marginBottom: 8 }}>
                  {DAY_OPTIONS.map((d) => (
                    <button
                      type="button"
                      key={d.value}
                      className={`day-toggle ${c.days.includes(d.value) ? 'on' : ''}`}
                      onClick={() => toggleDay(idx, d.value)}
                      data-testid={`c-${idx}-day-${d.value}`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <div className="row">
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor={`c-${idx}-start`}>Start</label>
                    <input id={`c-${idx}-start`} type="time" value={c.start_time} onChange={(e) => patchCandidate(idx, { start_time: e.target.value })} />
                  </div>
                  <div className="field" style={{ marginBottom: 0 }}>
                    <label htmlFor={`c-${idx}-end`}>End</label>
                    <input id={`c-${idx}-end`} type="time" value={c.end_time} onChange={(e) => patchCandidate(idx, { end_time: e.target.value })} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="row between" style={{ marginTop: 16 }}>
            <button className="btn secondary" onClick={reset}>Discard & start over</button>
            <button className="btn" onClick={confirm} disabled={saving || includedCount === 0} data-testid="confirm-save">
              {saving ? 'Saving…' : `Save ${includedCount} course${includedCount === 1 ? '' : 's'}`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
