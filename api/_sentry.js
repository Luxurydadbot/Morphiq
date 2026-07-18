// api/_sentry.js — shared Sentry setup for every backend function in api/.
//
// Instead of pasting the same Sentry.init(...) code into all 11 files, each
// api file imports withSentry() from here and wraps its handler with it.
// If a function throws an error nobody caught, Sentry gets the details and
// emails an alert instead of the crash just disappearing into Vercel's logs.
const Sentry = require('@sentry/node');

if (!global.__sentryInitialized) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.VERCEL_ENV || 'development',
    tracesSampleRate: 0,
  });
  global.__sentryInitialized = true;
}

function withSentry(handler) {
  return async function sentryWrappedHandler(req, res) {
    try {
      return await handler(req, res);
    } catch (err) {
      Sentry.captureException(err);
      await Sentry.flush(2000);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Something went wrong. Our team has been notified.' });
      }
    }
  };
}

module.exports = { withSentry };
