export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: "No API key" }); return; }

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { res.status(400).json({ error: "Invalid JSON" }); return; }

  const { text = "" } = body;
  if (!text) { res.status(400).json({ error: "No text provided" }); return; }

  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 200,
        system: "You are a nutrition parser. Return ONLY valid JSON with no markdown, no explanation, no extra text. Format: {"name":"meal name","cal":number,"protein":number,"carbs":number,"fat":number}. Use realistic average nutrition values for the food described. All numbers must be plain integers.",
        messages: [{ role: "user", content: `What are the nutrition values for: ${text}` }],
      }),
    });

    if (!claudeRes.ok) { res.status(502).json({ error: "Claude error" }); return; }

    const data = await claudeRes.json();
    const raw = (data.content?.[0]?.text || "").replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(raw);
    res.status(200).json(parsed);
  } catch { res.status(500).json({ error: "Parse failed" }); }
}
