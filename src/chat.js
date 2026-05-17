// api/chat.js — Vercel Serverless Function
// Morphiq AI Trainer Chat endpoint
// Deploy this file at: /api/chat.js in your Vercel project root
//
// Required environment variable in Vercel dashboard:
//   ANTHROPIC_API_KEY  →  your key from console.anthropic.com
//
// Request body:  { messages, user, context }
// Response body: { text, chips, action }

export default async function handler(req, res) {
  // ── CORS headers (allows the React app to call this from any origin) ─────
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "ANTHROPIC_API_KEY not configured in Vercel env vars." });
    return;
  }

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }

  const { messages = [], user = {}, context = "home" } = body;

  // ── Build system prompt with full member context ──────────────────────────
  const systemPrompt = buildSystemPrompt(user, context);

  // ── Convert Morphiq message format → Anthropic format ────────────────────
  // Morphiq: [{ role: "ai"|"user", text: "..." }]
  // Anthropic: [{ role: "assistant"|"user", content: "..." }]
  const anthropicMessages = messages
    .filter(m => m.role === "ai" || m.role === "user")
    .map(m => ({ role: m.role === "ai" ? "assistant" : "user", content: m.text }));

  // Ensure the conversation starts with a user message (Anthropic requirement)
  if (anthropicMessages.length === 0 || anthropicMessages[0].role !== "user") {
    res.status(400).json({ error: "Conversation must start with a user message" });
    return;
  }

  try {
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 400,
        system: systemPrompt,
        messages: anthropicMessages,
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error("[Morphiq /api/chat] Claude API error:", claudeRes.status, errText);
      res.status(502).json({ error: `Claude API returned ${claudeRes.status}` });
      return;
    }

    const data = await claudeRes.json();
    const rawText = data.content?.[0]?.text || "I'm here — what do you need?";

    // ── Parse optional structured response from Claude ─────────────────────
    // Claude is instructed to optionally include a JSON block at the end:
    // <!--ACTION:{"type":"swap_exercise","from":"Goblet Squat","to":"Leg Press"}-->
    // <!--CHIPS:["How many sets left?","Swap another","Take it easy today"]-->
    let text = rawText;
    let action = null;
    let chips = [];

    const actionMatch = rawText.match(/<!--ACTION:(.*?)-->/s);
    if (actionMatch) {
      try { action = JSON.parse(actionMatch[1]); } catch { /* ignore malformed */ }
      text = text.replace(/<!--ACTION:.*?-->/s, "").trim();
    }

    const chipsMatch = rawText.match(/<!--CHIPS:(.*?)-->/s);
    if (chipsMatch) {
      try {
        const parsed = JSON.parse(chipsMatch[1]);
        if (Array.isArray(parsed)) chips = parsed.slice(0, 3);
      } catch { /* ignore */ }
      text = text.replace(/<!--CHIPS:.*?-->/s, "").trim();
    }

    res.status(200).json({ text, action, chips });

  } catch (err) {
    console.error("[Morphiq /api/chat] Network error:", err);
    res.status(500).json({ error: "Failed to reach Claude API" });
  }
}

// ── System prompt builder ─────────────────────────────────────────────────────
function buildSystemPrompt(user, context) {
  const ctxLabel = {
    home: "the home dashboard",
    workout: "mid-workout",
    meals: "the meal plan screen",
    chat: "the home dashboard",
  }[context] || "the app";

  const planSummary = user.plan
    ? `- Workout days: ${(user.plan.workoutDays || []).join(", ")}
- Workout type: ${user.plan.workoutType || "Full body"}
- Daily calories: ${user.plan.calories || "—"}
- Daily protein target: ${user.plan.protein || "—"}g
- Current exercises: ${(user.plan.exercises || []).map(e => e.name).join(", ")}`
    : "- No plan generated yet";

  return `You are the Morphiq AI personal trainer — a warm, direct, knowledgeable coach embedded inside the ${user.gymName || "gym"} fitness app.

MEMBER PROFILE:
- Name: ${user.name || "Member"}
- Goal: ${user.goal || "get fit"}
- Sex: ${user.sex || "—"}, Age: ${user.age || "—"}, Weight: ${user.weight || "—"}, Height: ${user.height || "—"}
- Days per week: ${user.daysPerWeek || 3}
- Injuries / limitations: ${user.injuries || "none"}

CURRENT PLAN:
${planSummary}

CURRENT CONTEXT: Member is viewing ${ctxLabel}.

YOUR RULES:
1. Responses are SHORT — 1 to 3 sentences maximum. Never write paragraphs.
2. Always use the member's first name at least once per reply.
3. Never use guilt language. Missed a workout? "No problem, let's pick up from here."
4. You can take REAL actions — swap exercises, adjust weights, modify meals. When you do, say what you changed.
5. Respond in a conversational, coach tone — confident but human. No bullet points.
6. If you swap an exercise, include this invisible marker at the end of your response (the app will parse it and update the plan silently):
   <!--ACTION:{"type":"swap_exercise","from":"ORIGINAL_NAME","to":"NEW_NAME"}-->
7. After EVERY response, include 2–3 follow-up chips the member might want to tap, like this:
   <!--CHIPS:["Question 1","Question 2","Question 3"]-->
   Make chips short (4–6 words). Base them on what the member would logically ask next.

PERSONALITY: You're like the best personal trainer the member has ever had — you remember everything, you adapt to them, and you make fitness feel achievable, not overwhelming.`;
}
