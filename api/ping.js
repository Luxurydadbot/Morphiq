module.exports = function handler(req, res) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  res.setHeader('Content-Type', 'application/json');
  res.status(200).json({
    ok: true,
    hasApiKey: !!apiKey,
    apiKeyPrefix: apiKey ? apiKey.slice(0, 12) + '...' : 'MISSING',
    ts: new Date().toISOString()
  });
};
