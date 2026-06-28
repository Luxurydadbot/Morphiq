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

  const { name, goal, weeklyDone, weeklyTarget, streak, totalWorkouts, weightChange, lastSession, weekNumber, allDone, seed } = body;

  const lastSessionStr = lastSession
    ? new Date(lastSession + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
    : null;

  const weightNote = weightChange !== null && weightChange !== undefined
    ? parseFloat(weightChange) < 0
      ? `They have lost ${Math.abs(parseFloat(weightChange))} lbs since starting.`
      : parseFloat(weightChange) > 0
      ? `Their weight is up ${parseFloat(weightChange)} lbs — likely building muscle.`
      : "Their weight is holding steady."
    : "";

  // Build specific situation string so Claude has something real to comment on
  let situation = "";
  if (totalWorkouts === 0) {
    situation = "They haven't logged their first workout yet.";
  } else if (allDone) {
    situation = `Perfect week — they hit all ${weeklyTarget} workouts. Acknowledge that specifically.`;
  } else if (weeklyDone === 0) {
    situation = `Week ${weekNumber}, no workouts logged yet this week. Be encouraging without guilt.`;
  } else if (weeklyDone >= weeklyTarget - 1) {
    situation = `${weeklyDone} of ${weeklyTarget} workouts done this week — almost there.`;
  } else {
    situation = `${weeklyDone} of ${weeklyTarget} workouts done this week, ${weeklyTarget - weeklyDone} to go.`;
  }

  if (streak >= 7) situation += ` They're on a ${streak}-day streak — that's impressive.`;
  if (lastSessionStr) situation += ` Last session was ${lastSessionStr}.`;
  if (weightNote) situation += ` ${weightNote}`;

  const prompt = `You are a real, no-nonsense fitness coach writing a one-line message for ${name || "a member"}'s home screen. 

Their situation: ${situation}
Their goal: ${goal || "get fit"}
Week ${weekNumber || 1} of their program.
Seed for variety: ${seed || 1}

Write ONE sentence, maximum 20 words. 

RULES — follow all of these:
- Sound like a real person talking, not a motivational poster
- Be specific to their actual situation above — don't be generic
- Never use phrases like: "journey", "on the other side", "every rep counts", "one day at a time", "you've got this", "keep pushing", "stay consistent", "results", "transformation", "unleash", "potential", "champion", "warrior", "beast mode"
- No greetings, no name at the start, no emojis
- If they haven't worked out yet, give them a practical nudge — not a pep talk
- If they had a good week, say something specific about that
- If there's weight data, reference it if interesting
- Vary your style: sometimes practical ("Your next session is the most important one"), sometimes observational ("Three weeks in and still showing up — that's the hard part done"), sometimes direct ("Protein first, everything else second today")

Write only the message. No quotes, no labels.`;

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
        max_tokens: 60,
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
