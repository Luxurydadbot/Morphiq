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
        system: 'Return ONLY a raw JSON object, no markdown, no explanation. Example: {"name":"2 eggs","cal":140,"protein":12,"carbs":1,"fat":10}. Use realistic nutrition values. All numbers must be plain integers.',
        messages: [{ role: "user", content: "Nutrition values for: " + text }],
      }),
    });

    if (!claudeRes.ok) { res.status(502).json({ error: "Claude error" }); return; }

    const data = await claudeRes.json();
    let raw = (data.content?.[0]?.text || "").trim();
    // Strip any markdown fences if present
    raw = raw.replace(/^```[a-z]*\n?/i, "").replace(/```$/,"").trim();
    // Extract just the JSON object in case there's surrounding text
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("No JSON found");
    const parsed = JSON.parse(match[0]);
    if (!parsed.name || parsed.cal === undefined) throw new Error("Missing fields");
    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: "Parse failed", detail: e.message });
  }
}
