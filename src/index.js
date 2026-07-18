import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import Morphiq from './Morphiq';

// Sentry catches crashes in the live app and emails an alert instead of the
// error just disappearing. REACT_APP_SENTRY_DSN is set in Vercel's
// environment variables (same idea as the Supabase key, just for Sentry).
Sentry.init({
  dsn: process.env.REACT_APP_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  sendDefaultPii: false,
});

// Shown instead of a blank white screen if the app crashes completely.
function ErrorFallback() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0F0F0F',
      color: '#FFFFFF',
      fontFamily: 'DM Sans, sans-serif',
      padding: 24,
      textAlign: 'center',
    }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
      <p style={{ color: '#9CA3AF', marginBottom: 20 }}>
        We've been notified and are looking into it.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: '#00D4B1',
          color: '#0F0F0F',
          border: 'none',
          borderRadius: 10,
          padding: '10px 20px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Reload
      </button>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
    <Morphiq />
  </Sentry.ErrorBoundary>
);
