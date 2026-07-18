import { withSentry } from './_sentry.js';
function handler(req, res) {
  // TEMPORARY — controlled Sentry backend verification test (session 5, remove after confirming)
  if (req.query && req.query.testSentry) {
    throw new Error('Controlled Sentry backend test - session 5 (safe to ignore)');
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  res.status(200).json({
    ok: true,
    hasApiKey: !!apiKey,
    apiKeyPrefix: apiKey ? apiKey.slice(0, 12) + '...' : 'MISSING',
    ts: new Date().toISOString()
  });
}

export default withSentry(handler);
