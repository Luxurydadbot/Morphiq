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

  const {
    name, goal, weeklyDone, weeklyTarget, streak, totalWorkouts,
    weightChange, lastSession, weekNumber, allDone, seed,
    lastSessionExercises, nextWorkoutType, nextWorkoutExercises,
    weightTrend, nutritionAdherence,
  } = body;

  const firstName = (name || "there").split(" ")[0];

  const lastSessionStr = lastSession
    ? new Date(lastSession + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
    : null;

  // Build what we actually know about their last workout
  let lastWorkoutDetail = "";
  if (lastSessionExercises && lastSessionExercises.length > 0) {
    lastWorkoutDetail = `Last session (${lastSessionStr}): ${lastSessionExercises.join(", ")}.`;
  } else if (lastSessionStr) {
    lastWorkoutDetail = `Last session was ${lastSessionStr} but no exercise detail available.`;
  } else {
    lastWorkoutDetail = "No workouts logged yet.";
  }

  const weightNote = weightChange !== null && weightChange !== undefined
    ? parseFloat(weightChange) < 0
      ? `Down ${Math.abs(parseFloat(weightChange))} lbs since starting.`
      : parseFloat(weightChange) > 0
      ? `Up ${parseFloat(weightChange)} lbs — likely muscle gain.`
      : "Weight holding steady."
    : "";

  // Weight-trend plateau + nutrition adherence -- computed client-side in
  // coachSignals.js (multi-window trend averages, not a single scale
  // reading -- see that file for the full method and why). Only turned
  // into a line here when there's actually something worth mentioning --
  // "trending"/"on_track"/"insufficient_data" add nothing, so the note
  // stays about whatever's most useful instead of getting padded with
  // non-news every single day.
  let trendNote = "";
  if (weightTrend?.status === "plateau_confirmed") {
    trendNote = `Weight trend has been flat for a few weeks despite consistent logging (recent avg ${weightTrend.recentAvgLbs} lbs) — worth a forward-looking suggestion, never a guilt-trip.`;
  } else if (weightTrend?.status === "plateau_possible") {
    trendNote = `Weight trend looks like it may be starting to flatten out — soft signal, only mention if it fits naturally.`;
  }

  let adherenceNote = "";
  if (nutritionAdherence?.status === "off_track") {
    const dir = nutritionAdherence.pctOff > 0 ? "above" : "below";
    adherenceNote = `7-day average calorie intake is ${Math.abs(nutritionAdherence.pctOff)}% ${dir} target (${nutritionAdherence.avgCalories} vs ${nutritionAdherence.targetCalories}) — if relevant, suggest adjusting the plan, never scold.`;
  }

  // Prefer naming the actual next exercises (now sourced correctly from
  // the member's real, day-specific upcoming list on the frontend — see
  // Morphiq.jsx). Fall back to just the day label if exercise names aren't
  // available. The note regenerates whenever the member picks a different
  // day, so this stays matched to whatever day is actually selected.
  const nextNote = nextWorkoutExercises
    ? `Next workout (${nextWorkoutType || "today"}): ${nextWorkoutExercises}.`
    : nextWorkoutType
    ? `Next workout is a ${nextWorkoutType} day.`
    : "";

  const prompt = `You are a real fitness coach. Write ONE practical coaching note for ${firstName}'s home screen — the kind of thing a good personal trainer would actually say, not a motivational quote.

WHAT YOU KNOW ABOUT THEM:
- Goal: ${goal || "get fit"}
- ${lastWorkoutDetail}
- ${nextNote}
- Week ${weekNumber || 1}, ${weeklyDone} of ${weeklyTarget} sessions done this week${allDone ? " — completed all sessions" : ""}
- Total sessions: ${totalWorkouts || 0}
- Streak: ${streak || 0} days
- ${weightNote}
- ${trendNote}
- ${adherenceNote}
- Seed: ${seed}

WRITE ONE SENTENCE, max 20 words. Examples of the RIGHT tone:
- "Your squat weight went up last session — go one more rep on the first set today."
- "Three sessions logged this week. One more and you've hit your target."
- "You haven't lifted since Tuesday — a short session today beats skipping entirely."
- "Goblet squat at 35lbs last time — try 40lbs on the first set and drop back if needed."

NEVER write:
- Motivational slogans or quotes
- Anything with "journey", "potential", "warrior", "beast", "grind", "hustle", "on the other side", "you've got this", "keep pushing", "every rep counts", "transformation", "results"
- Fortune cookie phrases
- Greetings or ${firstName}'s name
- Questions

If you have their last session data or the next workout's exercises — reference a specific exercise, weight, or rep count. That is always more useful than anything generic.

Write only the message. No quotes, no labels, no preamble.`;

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

export default withSentry(handler);
