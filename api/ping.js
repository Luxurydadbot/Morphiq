export default function handler(req, res) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  res.status(200).json({
    ok: true,
    timestamp: new Date().toISOString(),
    hasApiKey: !!apiKey,
    apiKeyPrefix: apiKey ? apiKey.slice(0, 10) + "..." : "MISSING",
    nodeVersion: process.version,
  });
}
