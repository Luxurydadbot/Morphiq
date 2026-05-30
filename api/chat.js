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

  const { messages = [], user = {}, context = "home", workoutContext = null } = body;

  const anthropicMessages = messages
    .filter(m => m.role === "ai" || m.role === "user")
    .map(m => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text }));

  if (!anthropicMessages.length || anthropicMessages[0].role !== "user") {
    res.status(400).json({ error: "Must start with user message" }); return;
  }

  const ctxLabel = { home: "the home dashboard", workout: "mid-workout", meals: "the meal plan screen" }[context] || "the app";
  const planSummary = user.plan
    ? `Workout days: ${(user.plan.workoutDays||[]).join(", ")}, Calories: ${user.plan.calories}, Protein: ${user.plan.protein}g, Exercises: ${(user.plan.exercises||[]).map(e=>e.name).join(", ")}`
    : "No plan yet";

  // Build live workout detail line when the member is mid-exercise
  let workoutDetail = "";
  if (workoutContext && workoutContext.exercise) {
    const { exercise, setNumber, setsTotal, targetReps, weight } = workoutContext;
    workoutDetail = `\nLIVE WORKOUT: Member is on Set ${setNumber || "??"} of ${setsTotal || "??"} — ${exercise}, targeting ${targetReps || "??"} reps at ${weight ? weight + " lbs" : "bodyweight"}. Give specific advice about THIS exercise and set, not generic workout tips.`;
  }

  const system = `You are the Morphiq AI personal trainer inside ${user.gymName||"the gym"} app.
Member: ${user.name||"Member"}, Goal: ${user.goal||"get fit"}, Weight: ${user.weight||"—"}, Age: ${user.age||"—"}.
Plan: ${planSummary}.
Context: Member is viewing ${ctxLabel}.${workoutDetail}
Rules: Keep replies to 1-3 sentences. Use their first name. No guilt language. Be warm and direct. If live workout context is present, reference the specific exercise and set number in your reply.
After every reply add: <!--CHIPS:["short question 1","short question 2","short question 3"]-->`;

  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 400, system, messages: anthropicMessages }),
    });

    if (!claudeRes.ok) { res.status(502).json({ error: "Claude API error" }); return; }

    const data = await claudeRes.json();
    let text = data.content?.[0]?.text || "I'm here — what do you need?";
    let chips = [];

    const chipsMatch = text.match(/<!--CHIPS:(.*?)-->/s);
    if (chipsMatch) {
      try { const p = JSON.parse(chipsMatch[1]); if (Array.isArray(p)) chips = p.slice(0,3); } catch {}
      text = text.replace(/<!--CHIPS:.*?-->/s, "").trim();
    }

    res.status(200).json({ text, chips, action: null });
  } catch { res.status(500).json({ error: "Network error" }); }
}
