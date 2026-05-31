export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: "No API key configured" }); return; }

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { res.status(400).json({ error: "Invalid JSON" }); return; }

  const { text = "" } = body;
  if (!text.trim()) { res.status(400).json({ error: "No text provided" }); return; }

  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: `You are a nutrition database. The user ate: "${text}". Respond with ONLY these 5 lines, no extra text, no markdown:
NAME: (the food name, cleaned up)
CAL: (total calories as a number)
PROTEIN: (grams of protein as a number)
CARBS: (grams of carbs as a number)
FAT: (grams of fat as a number)`
        }]
      }),
    });

    const data = await claudeRes.json();

    if (!claudeRes.ok) {
      console.error("Claude API error:", JSON.stringify(data));
      res.status(502).json({ error: "Claude API error", detail: data?.error?.message || JSON.stringify(data) });
      return;
    }

    const reply = data.content?.[0]?.text || "";
    console.log("Claude raw reply:", reply);

    const get = (label) => {
      const match = reply.match(new RegExp(label + "[:\\s]+([\\d.]+)", "i"));
      return match ? Math.round(parseFloat(match[1])) : 0;
    };
    const nameMatch = reply.match(/NAME[:\s]+(.+)/i);
    const name = nameMatch ? nameMatch[1].trim() : text;
    const cal     = get("CAL");
    const protein = get("PROTEIN");
    const carbs   = get("CARBS");
    const fat     = get("FAT");

    // Return the result — use input text as fallback name if Claude didn't give one
    res.status(200).json({ name: name || text, cal, protein, carbs, fat });

  } catch (e) {
    console.error("parse-meal exception:", e.message);
    res.status(500).json({ error: e.message });
  }
}
