export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ error: "Method not allowed" }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { res.status(500).json({ error: "ANTHROPIC_API_KEY not set" }); return; }

  const SUPABASE_URL = "https://uvnyjegmhsztdednjclb.supabase.co";
  const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2bnlqZWdtaHN6dGRlZG5qY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTgwMjcsImV4cCI6MjA5NDI5NDAyN30.-hMNwCO-GymvbiyAKer6Q5AjDbDZl6GhXmSTmr5bY04";
  const SB = { "apikey": SUPABASE_KEY, "Authorization": "Bearer " + SUPABASE_KEY, "Content-Type": "application/json" };

  let body;
  try { body = typeof req.body === "string" ? JSON.parse(req.body) : req.body; }
  catch { res.status(400).json({ error: "Invalid JSON" }); return; }

  const { messages = [], user = {}, context = "home", workoutContext = null } = body;

  // ── USAGE LIMIT CHECK ──────────────────────────────────────────────────────
  const MONTHLY_LIMIT = 50;
  const month = new Date().toISOString().slice(0, 7); // "2026-05"
  let usageCount = 0;

  if (user.profileId) {
    try {
      const usageRes = await fetch(
        `${SUPABASE_URL}/rest/v1/ai_usage?user_id=eq.${user.profileId}&month=eq.${month}&feature=eq.chat&select=id`,
        { headers: SB }
      );
      const usageRows = await usageRes.json();
      usageCount = Array.isArray(usageRows) ? usageRows.length : 0;
    } catch { /* non-blocking */ }

    if (usageCount >= MONTHLY_LIMIT) {
      res.status(200).json({
        text: "You've used all 50 AI messages for this month. Your limit resets on the 1st. In the meantime, your full workout plan and meal guide are still available.",
        chips: ["When does it reset?", "View my plan"],
        limitReached: true
      });
      return;
    }
  }

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

  let workoutDetail = "";
  if (workoutContext && workoutContext.exercise) {
    const { exercise, setNumber, setsTotal, targetReps, weight } = workoutContext;
    workoutDetail = `\nLIVE WORKOUT: Member is on Set ${setNumber||"??"} of ${setsTotal||"??"} — ${exercise}, targeting ${targetReps||"??"} reps at ${weight ? weight + " lbs" : "bodyweight"}. Reference this specifically in your reply.`;
  }

  const system = `You are the Morphiq AI personal trainer inside ${user.gymName||"the gym"} app.
Member: ${user.name||"Member"}, Goal: ${user.goal||"get fit"}, Weight: ${user.weight||"—"}, Age: ${user.age||"—"}.
Plan: ${planSummary}.
Context: Member is viewing ${ctxLabel}.${workoutDetail}

STRICT RULES:
1. You ONLY discuss fitness, workouts, nutrition, recovery, sleep as it relates to their training, and their Morphiq plan. Nothing else.
2. If asked about anything unrelated to fitness or their plan — politics, news, general knowledge, other topics — respond ONLY with: "I'm your fitness coach — I can only help with your training and nutrition. What can I help you with today?"
3. Keep replies to 1-3 sentences. Use their first name. No guilt language. Be warm and direct.
4. If live workout context is present, reference the specific exercise and set number.

After every reply add: <!--CHIPS:["short question 1","short question 2","short question 3"]-->`;

  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 400, system, messages: anthropicMessages }),
    });

    if (!claudeRes.ok) {
      const errData = await claudeRes.json().catch(() => ({}));
      const errMsg = errData?.error?.message || "API error";
      // Return graceful message instead of breaking the UI
      res.status(200).json({ text: "AI coaching is temporarily unavailable. Your plan is still fully accessible.", chips: [], error: errMsg });
      return;
    }

    const data = await claudeRes.json();
    let text = data.content?.[0]?.text || "I'm here — what do you need?";
    let chips = [];

    const chipsMatch = text.match(/<!--CHIPS:(.*?)-->/s);
    if (chipsMatch) {
      try { const p = JSON.parse(chipsMatch[1]); if (Array.isArray(p)) chips = p.slice(0,3); } catch {}
      text = text.replace(/<!--CHIPS:.*?-->/s, "").trim();
    }

    // ── LOG USAGE ────────────────────────────────────────────────────────────
    if (user.profileId) {
      const inputTokens = data.usage?.input_tokens || 0;
      const outputTokens = data.usage?.output_tokens || 0;
      fetch(`${SUPABASE_URL}/rest/v1/ai_usage`, {
        method: "POST",
        headers: SB,
        body: JSON.stringify({
          user_id: user.profileId,
          gym_id: user.gymId || "unknown",
          feature: "chat",
          tokens_used: inputTokens + outputTokens,
          month,
        }),
      }).catch(() => {});
    }

    res.status(200).json({ text, chips, action: null, usageCount: usageCount + 1, usageLimit: MONTHLY_LIMIT });
  } catch (e) {
    res.status(200).json({ text: "AI coaching is temporarily unavailable. Your plan is still fully accessible.", chips: [], error: e.message });
  }
}
