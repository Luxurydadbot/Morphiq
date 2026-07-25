import { withSentry } from './_sentry.js';

async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: "ANTHROPIC_API_KEY not set" }); return; }

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { res.status(400).json({ error: "Invalid JSON" }); return; }

  const text = (body.text || "").trim();
  if (!text) { res.status(400).json({ error: "NO_TEXT" }); return; }

  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
        messages: [{
          role: "user",
          content: "A gym member just described a cardio session in their own words: \"" + text + "\"\n" +
            "Reply with exactly 3 lines:\n" +
            "TYPE: one of Running, Walking, Cycling, Swimming, Elliptical, Rowing, Stair climber, HIIT, Other\n" +
            "MINUTES: whole number of minutes (make a reasonable estimate if not stated, e.g. \"a run\" = 30)\n" +
            "CALORIES: your best estimate of calories burned for an average adult doing this activity for that long"
        }],
      }),
    });
    const data = await claudeRes.json();
    if (!claudeRes.ok) {
      res.status(502).json({ error: "CLAUDE_ERROR", detail: data?.error?.message });
      return;
    }
    const reply = data.content?.[0]?.text || "";
    const typeMatch = reply.match(/TYPE[:\s]+(.+)/i);
    const get = (label) => {
      const m = reply.match(new RegExp(label + "[:\\s]+([\\d.]+)", "i"));
      return m ? Math.round(parseFloat(m[1])) : 0;
    };
    res.status(200).json({
      activityType: typeMatch ? typeMatch[1].trim() : "Cardio",
      durationMinutes: get("MINUTES"),
      calories: get("CALORIES"),
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "Unknown error" });
  }
}

export default withSentry(handler);
