import { useState, useEffect, useRef } from "react";
import { useApp } from "../utils/context";
import { theme } from "../utils/theme";
import { Layout, Pill, VoiceBtn, MicIcon } from "./Shared";
import sb from "../utils/supabase";


// ─── MEAL PLAN DATA ────────────────────────────────────────────────────────────
const MEAL_DATA = [
  {
    id: "breakfast", label: "Breakfast", time: "7–9 AM",
    suggested: { name: "Greek yogurt & berries", cal: 320, protein: 28, carbs: 36, fat: 6 },
    status: "done", logged: null,
  },
  {
    id: "lunch", label: "Lunch", time: "12–1 PM",
    suggested: { name: "Grilled chicken wrap", cal: 480, protein: 38, carbs: 44, fat: 12 },
    status: "upcoming",
    logged: null,
  },
  {
    id: "dinner", label: "Dinner", time: "6–7 PM",
    suggested: { name: "Light salmon salad", cal: 380, protein: 36, carbs: 22, fat: 16 },
    originalSuggested: { name: "Salmon & roasted veg", cal: 540, protein: 44 },
    status: "upcoming", logged: null,
  },
  {
    id: "snack", label: "Snack", time: "3–4 PM",
    suggested: { name: "Protein shake + banana", cal: 240, protein: 26, carbs: 28, fat: 3 },
    status: "upcoming", logged: null,
  },
];

const GROCERY_DATA = [
  { category: "Protein", emoji: "🥩", items: [
    { name: "Chicken breast", qty: "2 lbs", done: true },
    { name: "Greek yogurt", qty: "32 oz", done: false },
    { name: "Salmon fillets", qty: "4 pieces", done: false },
    { name: "Eggs", qty: "1 dozen", done: false },
  ]},
  { category: "Produce", emoji: "🥦", items: [
    { name: "Mixed berries", qty: "1 bag", done: true },
    { name: "Broccoli", qty: "1 head", done: false },
    { name: "Sweet potato", qty: "3 medium", done: false },
    { name: "Spinach", qty: "5 oz bag", done: false },
  ]},
  { category: "Pantry", emoji: "🫙", items: [
    { name: "Brown rice", qty: "2 lbs", done: true },
    { name: "Olive oil", qty: "1 bottle", done: false },
    { name: "Protein powder", qty: "1 tub", done: false },
  ]},
];

// ─── MACRO BAR ────────────────────────────────────────────────────────────────
function MacroBar({ label, current, goal, color }) {
  const pct = Math.min(100, Math.round((current / goal) * 100));
  return (
    <div style={{ flex: 1, background: "#1A2332", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color }}>{current}<span style={{ fontSize: 9, color: theme.textDim, fontWeight: 400 }}>/{goal}</span></div>
      <div style={{ fontSize: 9, color: theme.textDim, margin: "2px 0 4px" }}>{label}</div>
      <div style={{ height: 3, background: "#0F1922", borderRadius: 2 }}>
        <div style={{ height: 3, borderRadius: 2, background: color, width: `${pct}%`, transition: "width .6s" }} />
      </div>
    </div>
  );
}

// ─── MEAL SLOT (list view) ────────────────────────────────────────────────────
function MealSlot({ meal, onDone, onSkip, onOpenDetail }) {
  const { gymBranding } = useApp();
  const a = gymBranding.accent;
  const sc = {
    done:    { border: "rgba(0,212,177,0.2)",    bg: "rgba(0,212,177,0.04)" },
    swapped: { border: "rgba(245,158,11,0.25)", bg: "rgba(245,158,11,0.04)" },
    upcoming:{ border: "#1E2D42",               bg: "#1A2332" },
    skipped: { border: "#1E1E1E",               bg: "#161616" },
  }[meal.status] || { border: "#1E2D42", bg: "#1A2332" };

  return (
    <div className="mq-fade" style={{ borderRadius: 14, border: `1px solid ${sc.border}`, background: sc.bg, marginBottom: 10, overflow: "hidden" }}>
      {/* Header row */}
      <div style={{ padding: "8px 12px 6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 9, color: theme.textDim, textTransform: "uppercase", letterSpacing: "1px", fontWeight: 500 }}>{meal.label}</span>
          <span style={{ fontSize: 9, color: theme.textFaint }}>{meal.time}</span>
        </div>
        {{ done: <Pill variant="teal">✓ Logged</Pill>, swapped: <Pill variant="amber">⚡ Swapped</Pill>, upcoming: <Pill variant="gray">Up next</Pill>, skipped: <Pill variant="red">Skipped</Pill> }[meal.status]}
      </div>

      {/* Suggested */}
      <div style={{ padding: "0 12px 6px" }}>
        <div style={{ fontSize: 9, color: theme.textDim, marginBottom: 2 }}>
          {meal.status === "swapped" ? "Suggested" : meal.status === "done" ? "Eaten" : "Suggested"}
          {meal.id === "dinner" && meal.status === "upcoming" ? " · adjusted for lunch" : ""}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: meal.status === "swapped" ? theme.textFaint : "#D8E4E0", textDecoration: meal.status === "swapped" ? "line-through" : "none" }}>
          {meal.suggested.name}
        </div>
        {meal.status !== "swapped" && (
          <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
            <span style={{ fontSize: 10, color: theme.textDim }}>{meal.suggested.cal} cal</span>
            <span style={{ fontSize: 10, color: theme.textDim }}>·</span>
            <span style={{ fontSize: 10, color: theme.textDim }}>{meal.suggested.protein}g protein</span>
          </div>
        )}
      </div>

      {/* Swapped actual */}
      {meal.status === "swapped" && meal.logged && (
        <div style={{ margin: "0 12px 8px", background: "#1E1A0A", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 8, padding: "6px 10px" }}>
          <div style={{ fontSize: 9, color: theme.amber, marginBottom: 2 }}>Actually ate</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#EDD08A" }}>{meal.logged.name}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
            <span style={{ fontSize: 10, color: "#c08040" }}>{meal.logged.cal} cal</span>
            <span style={{ fontSize: 10, color: theme.textDim }}>·</span>
            <span style={{ fontSize: 10, color: theme.textDim }}>{meal.logged.protein}g protein</span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {meal.status === "upcoming" && (
        <div style={{ padding: "4px 12px 10px", display: "flex", gap: 6 }}>
          <button onClick={onOpenDetail} className="mq-meal-tap"
            style={{ flex: 2, background: "#0A1628", border: `1px solid rgba(0,212,177,0.2)`, borderRadius: 9, padding: "7px 6px", fontSize: 10, color: a, cursor: "pointer", fontFamily: "inherit" }}>
            🎤 I ate something else
          </button>
          <button onClick={onDone} className="mq-meal-tap"
            style={{ flex: 2, background: a, border: "none", borderRadius: 9, padding: "7px 6px", fontSize: 10, color: "#003D35", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            ✓ Mark done
          </button>
          <button onClick={onSkip} className="mq-meal-tap"
            style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 9, padding: "7px 4px", fontSize: 10, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>
            Skip
          </button>
        </div>
      )}
    </div>
  );
}

// ─── MEAL DETAIL SCREEN ──────────────────────────────────────────────────────
function MealDetailScreen({ meal, onBack, onConfirm, onSwap }) {
  const { gymBranding, user } = useApp();
  const a = gymBranding.accent;
  const [voicePhase, setVoicePhase] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [parsedMeal, setParsedMeal] = useState(null);
  const [textInput, setTextInput] = useState("");
  const recognitionRef = useRef(null);

  function startVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setVoicePhase("text_fallback"); return; }
    const rec = new SpeechRecognition();
    rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 1;
    recognitionRef.current = rec;
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setTranscript(text); setVoicePhase("processing"); parseWithAI(text);
    };
    rec.onerror = () => setVoicePhase("error");
    setVoicePhase("listening"); rec.start();
  }

  function cancelVoice() {
    recognitionRef.current?.abort();
    setVoicePhase("idle"); setTranscript(""); setParsedMeal(null); setTextInput("");
  }

  async function parseWithAI(text) {
    const prompt = `The user said they ate: "${text}"
Parse into a meal entry. Return ONLY valid JSON, no markdown:
{"name":"<clean meal name>","cal":<number>,"protein":<number>,"carbs":<number>,"fat":<number>}
Use realistic average nutrition. All numbers must be plain integers.`;
    try {
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: prompt, context: "meal_parser" }),
      });
      const data = await res.json();
      const raw = (data.reply || "").replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(raw);
      setParsedMeal(parsed); setVoicePhase("heard");
    } catch {
      setParsedMeal({ name: text, cal: 500, protein: 25, carbs: 50, fat: 20 });
      setVoicePhase("heard");
    }
  }

  function submitText() {
    if (!textInput.trim()) return;
    setTranscript(textInput); setVoicePhase("processing"); parseWithAI(textInput);
  }

  useEffect(() => () => recognitionRef.current?.abort(), []);

  // Dinner has an AI-adjusted original; other meals show the suggested as both sides
  const hasAdjustment = !!meal.originalSuggested;
  const originalMeal = meal.originalSuggested || meal.suggested;
  const confirmLabel = `✓ I'll have the ${meal.suggested.name.split(" ")[0].toLowerCase()}`;

  return (
    <Layout activeNav="meals" chatTarget="chat_meals">
      <div className="mq-fade" style={{ padding: "1rem 1.25rem 0", display: "flex", flexDirection: "column" }}>

        {/* Back + title */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: theme.textDim, cursor: "pointer", fontSize: 18, padding: 0, lineHeight: 1 }}>←</button>
          <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>{meal.label} — Up Next</div>
        </div>

        {/* AI note — only shown when meal was adjusted */}
        {hasAdjustment && (
          <div style={{ background: "#080E1A", borderLeft: "2px solid #00D4B1", borderRadius: "0 10px 10px 0", padding: "8px 12px", marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "#9BB3C8", lineHeight: 1.6 }}>
              You had a bigger lunch today — no problem. I've lightened dinner to keep you close to your daily target. You're only <span style={{ color: "#E8EDF2", fontWeight: 600 }}>280 calories</span> over.
            </div>
          </div>
        )}

        {/* Before / after — only shown when AI adjusted */}
        {hasAdjustment && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
            <div style={{ flex: 1, background: "#1A2332", borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontSize: 9, color: theme.textDim, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>Original</div>
              <div style={{ fontSize: 12, color: theme.textDim, textDecoration: "line-through", marginBottom: 3 }}>{originalMeal.name}</div>
              <div style={{ fontSize: 11, color: theme.textDim }}>{originalMeal.cal} cal · {originalMeal.protein}g protein</div>
            </div>
            <div style={{ fontSize: 16, color: theme.textDim, flexShrink: 0 }}>→</div>
            <div style={{ flex: 1, background: "#0A1A14", border: "1px solid rgba(0,212,177,0.2)", borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontSize: 9, color: a, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>New suggestion</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#E8EDF2", marginBottom: 3 }}>{meal.suggested.name}</div>
              <div style={{ fontSize: 11, color: a }}>{meal.suggested.cal} cal · {meal.suggested.protein}g protein</div>
            </div>
          </div>
        )}

        {/* Suggested meal summary — shown when no adjustment */}
        {!hasAdjustment && (
          <div style={{ background: "#1A2332", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
            <div style={{ fontSize: 9, color: theme.textDim, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>Suggested</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#E8EDF2", marginBottom: 4 }}>{meal.suggested.name}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <span style={{ fontSize: 12, color: a }}>{meal.suggested.cal} cal</span>
              <span style={{ fontSize: 12, color: theme.textDim }}>·</span>
              <span style={{ fontSize: 12, color: theme.textDim }}>{meal.suggested.protein}g protein</span>
            </div>
          </div>
        )}

        {/* Voice overlay */}
        <div style={{ background: "#0A1628", border: "1px solid rgba(0,212,177,0.2)", borderRadius: 14, padding: "14px 14px 12px", marginBottom: 14, textAlign: "center" }}>
          {voicePhase === "idle" && (
            <>
              <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 12 }}>Did you eat something different? Tap the mic and tell me.</div>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
                <VoiceBtn onPress={startVoice} size={54} />
              </div>
              <div style={{ fontSize: 10, color: theme.textDim, marginTop: 8 }}>Tap mic to log something else</div>
            </>
          )}
          {voicePhase === "listening" && (
            <>
              <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 6 }}>Tell me what you had instead</div>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 3, height: 28, marginBottom: 6 }} className="mq-wave">
                {[1,2,3,4,5,6].map(i => <span key={i} />)}
              </div>
              <div style={{ fontSize: 11, color: a, marginBottom: 10 }}>Listening...</div>
              <button onClick={cancelVoice} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "5px 16px", fontSize: 10, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            </>
          )}
          {voicePhase === "processing" && (
            <>
              <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 8, fontStyle: "italic" }}>"{transcript}"</div>
              <div style={{ width: 24, height: 24, border: `3px solid #1A2332`, borderTopColor: a, borderRadius: "50%", animation: "spin .9s linear infinite", margin: "0 auto 8px" }} />
              <div style={{ fontSize: 11, color: a }}>Looking up nutrition info…</div>
            </>
          )}
          {voicePhase === "heard" && parsedMeal && (
            <>
              <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 8 }}>Does this look right?</div>
              <div style={{ background: "#111827", borderRadius: 10, padding: "10px 12px", marginBottom: 10, textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#E8EDF2", marginBottom: 6 }}>{parsedMeal.name}</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <span style={{ fontSize: 11, color: a }}>{parsedMeal.cal} cal</span>
                  <span style={{ fontSize: 11, color: theme.textDim }}>·</span>
                  <span style={{ fontSize: 11, color: theme.textDim }}>{parsedMeal.protein}g protein</span>
                  <span style={{ fontSize: 11, color: theme.textDim }}>·</span>
                  <span style={{ fontSize: 11, color: theme.textDim }}>{parsedMeal.fat}g fat</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={cancelVoice} style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 9, padding: "7px 6px", fontSize: 11, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>Redo</button>
                <button onClick={() => onSwap(parsedMeal)} style={{ flex: 2, background: a, border: "none", borderRadius: 9, padding: "7px 6px", fontSize: 11, color: "#003D35", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Log this ✓</button>
              </div>
            </>
          )}
          {voicePhase === "text_fallback" && (
            <>
              <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 8 }}>Type what you ate instead</div>
              <input value={textInput} onChange={e => setTextInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submitText()}
                placeholder="e.g. burger and fries"
                style={{ width: "100%", background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#E8EDF2", outline: "none", fontFamily: "inherit", marginBottom: 8 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={cancelVoice} style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 9, padding: "7px 6px", fontSize: 11, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                <button onClick={submitText} disabled={!textInput.trim()} style={{ flex: 2, background: a, border: "none", borderRadius: 9, padding: "7px 6px", fontSize: 11, color: "#003D35", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: textInput.trim() ? 1 : 0.4 }}>Look up →</button>
              </div>
            </>
          )}
          {voicePhase === "error" && (
            <>
              <div style={{ fontSize: 11, color: "#F87171", marginBottom: 8 }}>Mic not available — type instead</div>
              <button onClick={() => setVoicePhase("text_fallback")} style={{ background: a, border: "none", borderRadius: 9, padding: "7px 16px", fontSize: 11, color: "#003D35", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Type it instead</button>
            </>
          )}
        </div>

        {/* Bottom CTAs */}
        <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
          <button onClick={startVoice} style={{ flex: 1, background: "transparent", border: `1px solid rgba(0,212,177,0.3)`, borderRadius: 12, padding: "11px 8px", fontSize: 12, color: a, cursor: "pointer", fontFamily: "inherit" }}>
            🎤 Something else
          </button>
          <button onClick={onConfirm} style={{ flex: 2, background: a, border: "none", borderRadius: 12, padding: "11px 8px", fontSize: 12, color: "#003D35", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            {confirmLabel}
          </button>
        </div>

      </div>
    </Layout>
  );
}

// ─── GROCERY LIST ─────────────────────────────────────────────────────────────
function GroceryList({ groceries, onToggle }) {
  const { gymBranding } = useApp();
  const a = gymBranding.accent;
  const total = groceries.flatMap(c => c.items).length;
  const done = groceries.flatMap(c => c.items).filter(i => i.done).length;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>Grocery List</div>
        <Pill variant="teal">{done} of {total} ✓</Pill>
      </div>
      {groceries.map(cat => (
        <div key={cat.category} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>{cat.emoji} {cat.category}</div>
          <div style={{ background: "#1A2332", borderRadius: 12, overflow: "hidden" }}>
            {cat.items.map((item, i) => (
              <button key={item.name} onClick={() => onToggle(cat.category, i)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "none", border: "none", borderBottom: i < cat.items.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${item.done ? a : "rgba(0,212,177,0.3)"}`, background: item.done ? "#003D35" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 9, color: a }}>
                  {item.done ? "✓" : ""}
                </div>
                <span style={{ flex: 1, fontSize: 13, color: item.done ? theme.textDim : theme.text, textDecoration: item.done ? "line-through" : "none" }}>{item.name}</span>
                <span style={{ fontSize: 11, color: theme.textFaint }}>{item.qty}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── MEAL PLAN SCREEN ─────────────────────────────────────────────────────────
export default function MealPlanScreen() {
  const { gymBranding, supabaseUser } = useApp();
  const a = gymBranding.accent;

  const [tab, setTab] = useState("today");
  const [meals, setMeals] = useState(MEAL_DATA);
  const [groceries, setGroceries] = useState(GROCERY_DATA);
  const [detailMeal, setDetailMeal] = useState(null); // null = list view, meal obj = detail view

  const CAL_GOAL = 1840, PROTEIN_GOAL = 140, CARBS_GOAL = 160, FAT_GOAL = 55;

  const calcMacros = (mealList) => mealList.reduce((acc, m) => {
    const src = (m.status === "done" || m.status === "swapped") ? (m.logged || m.suggested) : null;
    if (!src) return acc;
    return { cal: acc.cal + src.cal, protein: acc.protein + src.protein, carbs: acc.carbs + (src.carbs || 0), fat: acc.fat + (src.fat || 0) };
  }, { cal: 0, protein: 0, carbs: 0, fat: 0 });

  const macros = calcMacros(meals);

  function markDone(id) {
    const meal = meals.find(m => m.id === id);
    setMeals(prev => prev.map(m => m.id === id ? { ...m, status: "done" } : m));
    if (supabaseUser?.id && meal) {
      sb.insertMealLog(supabaseUser.id, {
        mealId: id, status: "done",
        loggedName: meal.suggested.name, loggedCal: meal.suggested.cal, loggedProtein: meal.suggested.protein,
      }).catch(() => {});
    }
  }
  function skipMeal(id) {
    setMeals(prev => prev.map(m => m.id === id ? { ...m, status: "skipped" } : m));
    if (supabaseUser?.id) {
      sb.insertMealLog(supabaseUser.id, { mealId: id, status: "skipped", loggedName: null, loggedCal: 0, loggedProtein: 0 }).catch(() => {});
    }
  }
  function confirmSalad(id) {
    const meal = meals.find(m => m.id === id);
    setMeals(prev => prev.map(m => m.id === id ? { ...m, status: "done" } : m));
    setDetailMeal(null);
    if (supabaseUser?.id && meal) {
      sb.insertMealLog(supabaseUser.id, {
        mealId: id, status: "done",
        loggedName: meal.suggested.name, loggedCal: meal.suggested.cal, loggedProtein: meal.suggested.protein,
      }).catch(() => {});
    }
  }
  function logSwap(id, parsedMeal) {
    const swapped = parsedMeal || { name: "Something else", cal: 500, protein: 25, carbs: 50, fat: 20 };
    setMeals(prev => prev.map(m => m.id === id ? { ...m, status: "swapped", logged: swapped } : m));
    setDetailMeal(null);
    if (supabaseUser?.id) {
      sb.insertMealLog(supabaseUser.id, {
        mealId: id, status: "swapped",
        loggedName: swapped.name, loggedCal: swapped.cal, loggedProtein: swapped.protein,
      }).catch(() => {});
    }
  }
  function toggleGrocery(category, idx) {
    setGroceries(prev => prev.map(cat => cat.category !== category ? cat : {
      ...cat, items: cat.items.map((item, i) => i !== idx ? item : { ...item, done: !item.done })
    }));
  }

  // Show dinner detail screen
  if (detailMeal) {
    return (
      <MealDetailScreen
        meal={detailMeal}
        onBack={() => setDetailMeal(null)}
        onConfirm={() => confirmSalad(detailMeal.id)}
        onSwap={(parsedMeal) => logSwap(detailMeal.id, parsedMeal)}
      />
    );
  }

  return (
    <Layout activeNav="meals" chatTarget="chat_meals">
      <div style={{ padding: "1.25rem 1.25rem 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, color: theme.text }}>Today's Meals</div>
            <div style={{ fontSize: 12, color: theme.textDim, marginTop: 2 }}>Monday · Fat loss plan</div>
          </div>
          <Pill variant={macros.cal > CAL_GOAL ? "amber" : "teal"}>{macros.cal} / {CAL_GOAL} cal</Pill>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          <MacroBar label="Calories" current={macros.cal} goal={CAL_GOAL} color={a} />
          <MacroBar label="Protein" current={macros.protein} goal={PROTEIN_GOAL} color="#F59E0B" />
          <MacroBar label="Carbs" current={macros.carbs} goal={CARBS_GOAL} color="#818cf8" />
          <MacroBar label="Fat" current={macros.fat} goal={FAT_GOAL} color="#f472b6" />
        </div>

        <div style={{ display: "flex", background: "#1A2332", borderRadius: 10, padding: 3, marginBottom: 16 }}>
          {[["today", "Meals"], ["grocery", "Grocery List"]].map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "7px 6px", background: tab === t ? a : "transparent", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 500, color: tab === t ? "#003D35" : theme.textDim, cursor: "pointer", fontFamily: "inherit", transition: "all .2s" }}>
              {label}
            </button>
          ))}
        </div>

        {tab === "today" && (
          <div className="mq-fade">
            {meals.map(meal => (
              <MealSlot
                key={meal.id}
                meal={meal}
                onDone={() => markDone(meal.id)}
                onSkip={() => skipMeal(meal.id)}
                onOpenDetail={() => setDetailMeal(meal)}
              />
            ))}
            <div style={{ background: "#0F1922", border: "1px solid rgba(0,212,177,0.1)", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: a, fontWeight: 500, marginBottom: 4 }}>Still hungry?</div>
              <div style={{ fontSize: 12, color: "#9BB3C8", lineHeight: 1.5 }}>
                You have <span style={{ color: "#E8EDF2", fontWeight: 600 }}>{Math.max(0, CAL_GOAL - macros.cal)} cal</span> and <span style={{ color: "#E8EDF2", fontWeight: 600 }}>{Math.max(0, PROTEIN_GOAL - macros.protein)}g protein</span> left today.
              </div>
            </div>
          </div>
        )}

        {tab === "grocery" && (
          <div className="mq-fade">
            <GroceryList groceries={groceries} onToggle={toggleGrocery} />
          </div>
        )}
      </div>
    </Layout>
  );
}

