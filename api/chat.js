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

  // ── OFF-TOPIC GUARDRAIL ────────────────────────────────────────────────────
  const lastUserMsg = [...messages].reverse().find(m => m.role === "user");
  const msgText = (lastUserMsg?.text || "").toLowerCase().trim();

  const FITNESS_KEYWORDS = [
    "workout","exercise","rep","set","squat","deadlift","bench","press","curl","row","lunge","plank",
    "muscle","protein","calorie","macro","carb","fat","diet","meal","food","eat","nutrition","weight",
    "cardio","run","walk","jog","swim","bike","stretch","warm","cool","rest","recovery","sleep","water",
    "pain","sore","hurt","injury","shoulder","knee","back","hip","wrist","elbow","ankle",
    "goal","progress","plan","program","routine","schedule","streak","session","gym","lift",
    "motivation","tired","energy","supplement","creatine","whey","cut","bulk","maintain",
    "bmi","body","fat","lean","strong","fit","health","lose","gain","tone","build","swap","replace","alternative"
  ];

  const OFFTOPIC_PATTERNS = [
    /write (me )?(a |an )?(poem|story|essay|email|code|song|joke|letter)/i,
    /translate/i,
    /what (is|are|was|were) the (capital|population|president|prime minister|currency|history)/i,
    /who (is|was|are|were) (the )?(president|prime minister|ceo|founder|inventor|author|actor|singer|artist)/i,
    /how (do|does|did) .*(work|make|build|create|cook|bake|drive|play|install|download|hack)/i,
    /math|equation|calculate \d|solve for/i,
    /\b(weather|stock|crypto|bitcoin|news|sports score|movie|tv show|recipe for|book recommend)\b/i,
    /tell me (a |an )?(joke|fact|story|fun fact)/i,
    /what (time|day|date|year) is it/i,
  ];

  const hasFitnessWord = FITNESS_KEYWORDS.some(k => msgText.includes(k));
  const isObviouslyOffTopic = !hasFitnessWord && OFFTOPIC_PATTERNS.some(p => p.test(msgText));

  if (isObviouslyOffTopic) {
    const name = user.name ? user.name.split(" ")[0] : null;
    const greeting = name ? `${name}, ` : "";
    res.status(200).json({
      text: `${greeting}I'm your fitness coach — I can only help with your workouts, nutrition, and training plan. What can I help you with today?`,
      chips: ["How is my plan going?", "What should I eat today?", "Help me with my workout"],
      action: null,
      blocked: true
    });
    return;
  }

  // ── USAGE LIMIT CHECK ──────────────────────────────────────────────────────
  const MONTHLY_LIMIT = 50;
  const month = new Date().toISOString().slice(0, 7);
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

  // ── BUILD MEMBER CONTEXT ───────────────────────────────────────────────────
  // Full context passed to Claude so swap recommendations match the original plan rules.
  // Equipment, injuries, and experience must be respected — same logic as plan generator.
  const equipment = user.equipment || "dumbbell";
  const injuries = user.injuries || "none";
  const trainingHistory = user.trainingHistory || "some";
  const recentActivity = user.recentActivity || "consistent";
  const goal = user.goal || "general_fitness";

  // Equipment swap rules — mirrors the constraints in the plan generator exactly.
  // When recommending a swap, Claude must respect these or the member can't do the exercise.
  const equipmentSwapRules = equipment === "barbell"
    ? "EQUIPMENT: Member has a full barbell gym — rack, barbell, plates, dumbbells, cables. For any swap: use barbell movements as the primary replacement for compound slots. A squat must be replaced with another barbell squat variation (front squat, pause squat, box squat) or leg press only if barbell is unavailable. A hinge must be replaced with another barbell hinge (conventional deadlift, sumo deadlift, RDL). A press must be replaced with another barbell or dumbbell press. NEVER suggest goblet squat, bodyweight squat, or push-ups as a replacement for a barbell compound — these are not appropriate alternatives for a barbell gym member."
    : equipment === "dumbbell"
    ? "EQUIPMENT: Member has dumbbells, cables, and machines but NO barbell. For any swap: use dumbbell or cable alternatives. Squat replacements: goblet squat, dumbbell Bulgarian split squat, leg press. Hinge replacements: dumbbell Romanian deadlift, single-leg RDL, cable pull-through. Press replacements: dumbbell bench press, incline dumbbell press, cable chest press. Row replacements: single-arm dumbbell row, cable row, chest-supported row. NEVER suggest barbell movements."
    : equipment === "kettlebell"
    ? "EQUIPMENT: Member has kettlebells and bodyweight only — no barbell, no cables, no machines. For any swap: use kettlebell or bodyweight alternatives only. Squat replacements: kettlebell goblet squat, single-leg squat to box, step-up. Hinge replacements: kettlebell deadlift, single-leg RDL, good morning. Push replacements: push-up variations (standard, archer, elevated feet), kettlebell floor press. Pull replacements: inverted row, table row, ring row. NEVER suggest barbell or cable movements."
    : equipment === "machine"
    ? "EQUIPMENT: Member uses machines, cables, and dumbbells — no free barbell. For any swap: use machine or cable alternatives. Squat replacements: leg press, hack squat machine, Smith machine squat. Hinge replacements: Romanian deadlift machine, cable pull-through, 45-degree back extension. Press replacements: chest press machine, cable chest press, incline dumbbell press. Row replacements: seated cable row, machine row, chest-supported dumbbell row. NEVER suggest free barbell movements."
    : "EQUIPMENT: Member has dumbbells only — no barbell, no cables, no machines. Squat replacements: goblet squat, dumbbell split squat, step-up. Hinge replacements: dumbbell Romanian deadlift, single-leg RDL. Press replacements: dumbbell floor press, push-up. Row replacements: single-arm dumbbell row. Keep all suggestions to dumbbell or bodyweight only.";

  // Injury swap rules — never suggest movements that load the injured area
  const injurySwapRules = !injuries || injuries === "none" ? ""
    : injuries.toLowerCase().includes("knee")
    ? "INJURY — KNEE: Never suggest any squat variation, lunge, leg extension, or step-up. Safe replacements for lower body: leg press (limited depth), seated leg curl, hip thrust, or glute bridge. Upper body swaps are unrestricted."
    : injuries.toLowerCase().includes("back")
    ? "INJURY — LOWER BACK: Never suggest conventional deadlift, barbell bent over row, good morning, or any loaded spinal flexion. Safe hinge replacements: trap bar deadlift, cable pull-through, 45-degree back extension with bodyweight. Safe row replacements: chest-supported row, seated cable row, single-arm dumbbell row with bench support."
    : injuries.toLowerCase().includes("shoulder")
    ? "INJURY — SHOULDER: Never suggest overhead pressing of any kind (barbell OHP, dumbbell shoulder press, Arnold press, push press). Never suggest upright row. Safe press replacements: landmine press, neutral grip incline dumbbell press at 30 degrees, cable chest fly. Horizontal pressing is usually safe — keep it if pain-free."
    : injuries.toLowerCase().includes("wrist")
    ? "INJURY — WRIST: Avoid any exercise requiring wrist extension under load. Use neutral grip (palms facing each other) for all pressing. Dumbbell pressing neutral grip is preferred over barbell. Avoid barbell front squat."
    : `INJURY — ${injuries.toUpperCase()}: Avoid all movements that load or aggravate this area. Suggest machine or cable alternatives with pain-free range of motion.`;

  // Experience context — swap should match member's ability level
  const experienceContext = trainingHistory === "new"
    ? "EXPERIENCE: Beginner. Suggest simple, easy-to-learn alternatives. Prioritize movement safety and clear form cues over advanced variations."
    : trainingHistory === "some"
    ? "EXPERIENCE: Intermediate (6 months to 2 years). Can handle moderately technical movements. Standard alternatives are appropriate."
    : recentActivity === "returning"
    ? "EXPERIENCE: Returning experienced lifter, rebuilding after a break. Technically capable but conservative with load. Use slightly easier variations of advanced movements."
    : "EXPERIENCE: Advanced active lifter. Can handle technically demanding movements. Suggest true like-for-like compound replacements, not beginner regressions.";

  // Build message array for Claude
  const anthropicMessages = messages
    .filter(m => m.role === "ai" || m.role === "user")
    .map(m => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text || "" }));

  while (anthropicMessages.length && anthropicMessages[0].role === "assistant") {
    anthropicMessages.shift();
  }

  const dedupedMessages = [];
  for (const msg of anthropicMessages) {
    const last = dedupedMessages[dedupedMessages.length - 1];
    if (last && last.role === msg.role) {
      last.content += " " + msg.content;
    } else {
      dedupedMessages.push(msg);
    }
  }

  if (!dedupedMessages.length || dedupedMessages[0].role !== "user") {
    res.status(400).json({ error: "Must start with user message" }); return;
  }

  const ctxLabel = { home: "the home dashboard", workout: "mid-workout", meals: "the meal plan screen" }[context] || "the app";
  const planSummary = user.plan
    ? `Workout type: ${user.plan.workoutType||"Full Body"}, Calories: ${user.plan.calories}, Protein: ${user.plan.protein}g, Exercises: ${(user.plan.exercises||[]).map(e=>e.name).join(", ")}`
    : "No plan yet";

  let workoutDetail = "";
  if (workoutContext && workoutContext.exercise) {
    const { exercise, setNumber, setsTotal, targetReps, weight } = workoutContext;
    workoutDetail = `\nLIVE WORKOUT: Member is on Set ${setNumber||"??"} of ${setsTotal||"??"} — ${exercise}, targeting ${targetReps||"??"} reps at ${weight ? weight + " lbs" : "bodyweight"}. Reference this specifically in your reply.`;
  }

  // ── SYSTEM PROMPT ──────────────────────────────────────────────────────────
  // The swap rules below match exactly what the plan generator used when building
  // this member's plan. This ensures chat swaps are consistent with the original program.
  const system = `You are the Morphiq AI personal trainer inside ${user.gymName||"the gym"} app.
Member: ${user.name||"Member"}, Goal: ${goal}, Weight: ${user.weight||"—"}, Age: ${user.age||"—"}.
Plan: ${planSummary}.
Context: Member is viewing ${ctxLabel}.${workoutDetail}

${equipmentSwapRules}
${injurySwapRules ? injurySwapRules : "INJURIES: None reported."}
${experienceContext}

STRICT RULES:
1. You ONLY discuss fitness, workouts, nutrition, recovery, and sleep as it relates to training. Nothing else.
2. ALWAYS lead with a direct, practical answer first. Never open with a question.
3. For pain or soreness: immediately suggest whether to skip, modify, or substitute. Give one specific alternative by name that respects the equipment and injury rules above.
4. For nutrition questions: give a specific answer based on their goal and plan.
5. Only ask a follow-up question if you truly cannot answer without it — one question max, at the end.
6. Keep replies to 2-3 sentences max. Use their first name. No guilt language. Be warm and direct.
7. If live workout context is present, reference the specific exercise and set number.
8. EXERCISE SWAP RULE: When recommending a swap, the replacement MUST follow the equipment rules above — if the member has a barbell gym, give a barbell alternative. If they have dumbbells only, give a dumbbell alternative. NEVER suggest an exercise the member cannot perform with their available equipment. At the END of your reply include exactly this tag: <!--ACTION:swap_exercise:REPLACEMENT_EXERCISE_NAME--> replacing REPLACEMENT_EXERCISE_NAME with the actual exercise name (e.g. "Barbell Front Squat", "Leg Press", "Dumbbell Romanian Deadlift"). Only add this tag when recommending a swap.

After every reply add: <!--CHIPS:["short followup 1","short followup 2","short followup 3"]-->`;

  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 400, system, messages: dedupedMessages }),
    });

    if (!claudeRes.ok) {
      const errData = await claudeRes.json().catch(() => ({}));
      const errMsg = errData?.error?.message || "API error";
      res.status(200).json({ text: "Sorry, I hit a snag — try again in a moment.", chips: [], error: errMsg });
      return;
    }

    const data = await claudeRes.json();
    let text = data.content?.[0]?.text || "I'm here — what do you need?";
    let chips = [];
    let action = null;

    // Parse swap action tag from Claude's response
    const actionMatch = text.match(/<!--ACTION:swap_exercise:([^-]+?)-->/);
    if (actionMatch) {
      const exerciseName = actionMatch[1].trim();
      action = { type: "swap_exercise", to: exerciseName };
      text = text.replace(/<!--ACTION:swap_exercise:[^-]+?-->/g, "").trim();
    }

    const chipsMatch = text.match(/<!--CHIPS:(.*?)-->/s);
    if (chipsMatch) {
      try { const p = JSON.parse(chipsMatch[1]); if (Array.isArray(p)) chips = p.slice(0,3); } catch {}
      text = text.replace(/<!--CHIPS:.*?-->/s, "").trim();
    }

    // Log usage to Supabase — fire and forget, never blocks the response
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

    res.status(200).json({ text, chips, action, usageCount: usageCount + 1, usageLimit: MONTHLY_LIMIT });
  } catch (e) {
    res.status(200).json({ text: "Sorry, I hit a snag — try again in a moment.", chips: [], error: e.message });
  }
}
