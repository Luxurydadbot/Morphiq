export default async function handler(req, res) {
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
        model: "claude-sonnet-4-20250514",
        max_tokens: 3000,
        system: `You are an elite certified strength and conditioning coach with expertise in evidence-based hypertrophy training, fat loss programming, and movement science. Your programming is based on current peer-reviewed research (Schoenfeld, Israetel, Helms, Krieger).

CRITICAL RULES — never violate these:
1. Return ONLY valid JSON. No markdown, no code fences, no explanation text before or after the JSON.
2. Every field in the requested JSON structure must be present. Never omit warmup, cooldown, rpe, or alternative fields.
3. Every exercise array must follow the EXACT movement pattern order specified in the PROGRAM section of the prompt.
4. If the program specifies a squat AND a hinge, BOTH must appear. Never replace a compound movement pattern with an isolation exercise.
5. Isolation exercises (curls, lateral raises, tricep work) are ACCESSORY movements — they may only appear in slots explicitly designated for accessories. Never use an isolation in a primary compound slot.
6. Weights in the exercises array must be realistic working set weights for the experience level described — not warmup weights, not theoretical maxes.
7. restSeconds in each exercise must match the program's rest prescription (120-180s for compounds, 60-90s for isolations).
8. rpe values must reflect the RPE targets given — never set compound working sets to RPE 5 or lower for experienced lifters.
9. The alternative field must contain a real exercise name that trains the same movement pattern with different equipment or loading.
10. All numeric values must be plain numbers, never strings.`,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(502).json({ error: "Claude error", detail: data?.error?.message || JSON.stringify(data) });
    }
    const text = (data.content || []).map(b => b.text || "").join("").trim();
    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: "Failed", detail: err.message });
  }
}
