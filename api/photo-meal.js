export default async function handler(req, res) {
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

  const { image, mediaType } = body;
  if (!image) { res.status(400).json({ error: "No image provided" }); return; }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 200,
        messages: [{
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType || "image/jpeg",
                data: image,
              },
            },
            {
              type: "text",
              text: "Estimate the nutrition for the food in this photo. Reply with exactly 5 lines:\nNAME: brief food description\nCAL: number\nPROTEIN: number\nCARBS: number\nFAT: number\n\nIf you cannot identify food in the image, reply with NAME: Unknown food and zeros for the rest. Be realistic with portion estimates based on what you see.",
            },
          ],
        }],
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      res.status(502).json({ error: "CLAUDE_ERROR", detail: data?.error?.message });
      return;
    }

    const reply = data.content?.[0]?.text || "";
    const get = (label) => {
      const m = reply.match(new RegExp(label + "[:\\s]+([\\d.]+)", "i"));
      return m ? Math.round(parseFloat(m[1])) : 0;
    };
    const nameMatch = reply.match(/NAME[:\s]+(.+)/i);

    res.status(200).json({
      name: nameMatch ? nameMatch[1].trim() : "Food from photo",
      cal: get("CAL"),
      protein: get("PROTEIN"),
      carbs: get("CARBS"),
      fat: get("FAT"),
      isPhotoEstimate: true,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unknown error" });
  }
}
