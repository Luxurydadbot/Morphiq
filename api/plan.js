import { withSentry } from './_sentry.js';
// api/plan.js — onboarding conversational reveal only
// Workout plan generation is now handled locally by buildPlan() in Morphiq.jsx
// This endpoint is only called once per member: the "your plan is ready" reveal moment
async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const { prompt } = req.body || {};
  if (!prompt) return res.status(400).json({ error: "Missing prompt" });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "No API key" });
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: process.env.AI_MODEL || "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(502).json({ error: "Claude error", detail: data?.error?.message });
    const text = (data.content || []).map(b => b.text || "").join("").trim();
    if (!text) return res.status(502).json({ error: "Empty response" });
    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: "Failed", detail: err.message });
  }
}

export default withSentry(handler);
