import React from 'react';
import { initials } from '../util.js';

export function Spinner() {
  return (
    <div className="spinner-wrap" role="status" aria-label="Loading">
      <div className="spinner" />
    </div>
  );
}

export function ErrorBanner({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="banner error" role="alert">
      <div className="row between">
        <span>{message}</span>
        {onRetry && (
          <button className="btn small secondary" onClick={onRetry}>Retry</button>
        )}
      </div>
    </div>
  );
}

export function SuccessBanner({ message }) {
  if (!message) return null;
  return <div className="banner success" role="status">{message}</div>;
}

export function EmptyState({ icon = '📭', title, children }) {
  return (
    <div className="empty">
      <div className="big">{icon}</div>
      <h3>{title}</h3>
      <div>{children}</div>
    </div>
  );
}

export function Avatar({ src, name, size = 48 }) {
  const style = { width: size, height: size, fontSize: size * 0.36 };
  if (src) {
    return <img className="avatar" style={style} src={src} alt={name || 'avatar'} />;
  }
  return (
    <div className="avatar avatar-fallback" style={style} aria-label={name || 'avatar'}>
      {initials(name)}
    </div>
  );
}
