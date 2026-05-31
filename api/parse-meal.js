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
        max_tokens: 150,
        messages: [{
          role: "user",
          content: `Give me the nutrition for "${text}". Reply with ONLY these 5 lines, nothing else:
NAME: <meal name>
CAL: <calories as integer>
PROTEIN: <grams as integer>
CARBS: <grams as integer>
FAT: <grams as integer>`
        }],
      }),
    });

    if (!claudeRes.ok) {
      const err = await claudeRes.text();
      res.status(502).json({ error: "Claude error", detail: err }); return;
    }

    const data = await claudeRes.json();
    const text2 = data.content?.[0]?.text || "";

    // Parse the 5-line format
    const get = (label) => {
      const match = text2.match(new RegExp(label + ":\s*(.+)", "i"));
      return match ? match[1].trim() : null;
    };

    const name = get("NAME");
    const cal = parseInt(get("CAL"));
    const protein = parseInt(get("PROTEIN"));
    const carbs = parseInt(get("CARBS"));
    const fat = parseInt(get("FAT"));

    if (!name || isNaN(cal)) {
      res.status(500).json({ error: "Could not parse response", raw: text2 }); return;
    }

    res.status(200).json({ name, cal, protein: protein||0, carbs: carbs||0, fat: fat||0 });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
