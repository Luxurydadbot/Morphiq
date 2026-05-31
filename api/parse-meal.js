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
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 150,
        messages: [{
          role: "user",
          content: "Give me the nutrition for: " + text + ". Reply with ONLY these 5 lines:\nNAME: meal name\nCAL: calories\nPROTEIN: grams\nCARBS: grams\nFAT: grams"
        }]
      }),
    });

    const data = await claudeRes.json();

    if (!claudeRes.ok) {
      res.status(502).json({ error: "Claude error", detail: data?.error?.message || JSON.stringify(data) });
      return;
    }

    const reply = data.content?.[0]?.text || "";

    const get = (label) => {
      const match = reply.match(new RegExp(label + "[:\\s]+([\\d.]+)", "i"));
      return match ? Math.round(parseFloat(match[1])) : 0;
    };
    const nameMatch = reply.match(/NAME[:\s]+(.+)/i);
    const name = nameMatch ? nameMatch[1].trim() : text;
    const cal = get("CAL");
    const protein = get("PROTEIN");
    const carbs = get("CARBS");
    const fat = get("FAT");

    // Only fail if we couldn't parse a name — cal can legitimately be 0 for some foods
    if (!name) {
      res.status(500).json({ error: "Could not parse", raw: reply });
      return;
    }

    res.status(200).json({ name, cal, protein, carbs, fat });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
