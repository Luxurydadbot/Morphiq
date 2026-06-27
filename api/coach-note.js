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

  const { name, goal, weeklyDone, weeklyTarget, streak, totalWorkouts, weightChange, lastSession, weekNumber, allDone } = body;

  // Build a rich context string for Claude to personalise from
  const lastSessionStr = lastSession
    ? new Date(lastSession + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
    : null;

  const weightNote = weightChange !== null && weightChange !== undefined
    ? parseFloat(weightChange) < 0
      ? `They've lost ${Math.abs(parseFloat(weightChange))} lbs since starting.`
      : parseFloat(weightChange) > 0
      ? `Their weight is up ${parseFloat(weightChange)} lbs — they may be building muscle.`
      : "Their weight is holding steady."
    : "";

  const prompt = `You are a supportive, encouraging fitness coach inside a mobile app called Morphiq. Write a single short personalized message (1-2 sentences max, no more than 30 words) for this member's home screen. Be warm, specific, and motivating. Never use guilt. Always forward-looking. No emojis unless one feels very natural. No greetings like "Good morning" — get straight to the point.

Member context:
- Name: ${name || "there"}
- Goal: ${goal || "get fit"}
- Week ${weekNumber || 1} of their program
- This week: ${weeklyDone} of ${weeklyTarget} workouts done${allDone ? " (ALL DONE — perfect week!)" : ""}
- Current workout streak: ${streak || 0} days
- Total workouts completed: ${totalWorkouts || 0}
- Last session: ${lastSessionStr || "not yet — this is their first week"}
- ${weightNote}

Write only the message text. No quotes, no labels, no preamble.`;

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
        max_tokens: 80,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    const note = data?.content?.[0]?.text?.trim() || null;

    if (!note) {
      res.status(500).json({ error: "Empty response from Claude" });
      return;
    }

    res.status(200).json({ note });
  } catch (err) {
    res.status(500).json({ error: err.message || "Unknown error" });
  }
}
