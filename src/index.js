import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/react';
import Morphiq from './Morphiq';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';

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
      background: '#121316', // theme.bg — was the retired old-teal-era near-black
      color: '#EDEEF0', // theme.text
      fontFamily: 'DM Sans, sans-serif',
      padding: 24,
      textAlign: 'center',
    }}>
      <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
      {/* theme.textMuted */}
      <p style={{ color: '#9BA0AA', marginBottom: 20 }}>
        We've been notified and are looking into it.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          background: '#4C8DFF', // theme.accent — retired teal accent replaced
          color: '#0B1E3D', // dark navy, matches text-on-accent pattern used elsewhere
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

// Lets the app keep working (last screen shown) if a member loses signal --
// see src/serviceWorkerRegistration.js for the safety design. Production
// only, no effect on local development.
serviceWorkerRegistration.register();
