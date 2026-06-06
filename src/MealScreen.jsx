import { useState, useEffect, useRef } from "react";
import { useApp, sb, Pill, Spinner, MicIcon, VoiceBtn, Layout, NavIcon,
         SUPABASE_URL, SUPABASE_ANON, SB_HEADERS, SB_GET, theme,
         MEAL_DATA, GROCERY_DATA } from "./Morphiq.jsx";

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

function MealDetailScreen({ meal, onBack, onConfirm, onSwap }) {
  const { gymBranding, user } = useApp();
  const a = gymBranding.accent;
  const [voicePhase, setVoicePhase] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [parsedMeal, setParsedMeal] = useState(null);
  const [lookupError, setLookupError] = useState("");
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
    setVoicePhase("idle"); setTranscript(""); setParsedMeal(null); setTextInput(""); setLookupError("");
  }

  async function parseWithAI(text) {
    try {
      const res = await fetch("/api/parse-meal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const parsed = await res.json().catch(() => null);
      if (!res.ok || !parsed) {
        setLookupError(parsed?.error || "HTTP " + res.status + ": " + parsed?.detail || "Unknown error");
        setVoicePhase("error_lookup");
        return;
      }
      if (parsed.name) {
        setParsedMeal(parsed); setVoicePhase("heard");
      } else {
        setLookupError("No food name returned. Raw: " + JSON.stringify(parsed));
        setVoicePhase("error_lookup");
      }
    } catch (e) {
      setLookupError("Network error: " + e.message);
      setVoicePhase("error_lookup");
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
              <div style={{ fontSize: 13, color: theme.textDim, marginBottom: 12 }}>Did you eat something different?</div>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
                <VoiceBtn onPress={startVoice} size={54} />
              </div>
              <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 10 }}>— or type it below —</div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={textInput} onChange={e => setTextInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && submitText()}
                  placeholder="e.g. chips and salsa"
                  style={{ flex: 1, background: "#111827", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "9px 10px", fontSize: 13, color: "#E8EDF2", outline: "none", fontFamily: "inherit" }} />
                <button onClick={submitText} disabled={!textInput.trim()} style={{ background: a, border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 13, color: "#003D35", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: textInput.trim() ? 1 : 0.4 }}>→</button>
              </div>
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
              <Spinner size={24} color={a} />
              <div style={{ fontSize: 11, color: a }}>Looking up nutrition info…</div>
            </>
          )}
          {voicePhase === "heard" && parsedMeal && (
            <>
              <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 8 }}>Does this look right?</div>
              <div style={{ background: "#111827", borderRadius: 10, padding: "12px 14px", marginBottom: 10, textAlign: "left" }}>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#E8EDF2", marginBottom: 8 }}>{parsedMeal.name}</div>
                <div style={{ display: "flex", gap: 12 }}>
                  <span style={{ fontSize: 13, color: a }}>{parsedMeal.cal} cal</span>
                  <span style={{ fontSize: 13, color: theme.textDim }}>·</span>
                  <span style={{ fontSize: 13, color: theme.textDim }}>{parsedMeal.protein}g protein</span>
                  <span style={{ fontSize: 13, color: theme.textDim }}>·</span>
                  <span style={{ fontSize: 13, color: theme.textDim }}>{parsedMeal.fat}g fat</span>
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
          {voicePhase === "error_lookup" && (
            <>
              <div style={{ fontSize: 11, color: "#F87171", marginBottom: 4 }}>Nutrition lookup failed</div>
              {lookupError ? (
                <div style={{ fontSize: 10, color: "#F87171", background: "#1F0A0A", borderRadius: 8, padding: "6px 10px", marginBottom: 8, fontFamily: "monospace", wordBreak: "break-all" }}>{lookupError}</div>
              ) : (
                <div style={{ fontSize: 10, color: theme.textDim, marginBottom: 8 }}>Check your connection and try again</div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={cancelVoice} style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 9, padding: "7px 6px", fontSize: 11, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                <button onClick={() => { setVoicePhase("idle"); setTranscript(""); setLookupError(""); }} style={{ flex: 2, background: a, border: "none", borderRadius: 9, padding: "7px 6px", fontSize: 11, color: "#003D35", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Try again</button>
              </div>
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

// Builds a day's meal slots from the plan's calorie and macro targets.
// Distributes calories across 4 meals in a realistic split.
// Returns the same shape as MEAL_DATA so everything downstream works unchanged.
function buildMealsFromPlan(plan) {
  const cal   = plan?.calories  || 1800;
  const pro   = plan?.protein   || 140;
  const carbs = plan?.carbs     || 160;
  const fat   = plan?.fat       || 55;

  // Split: breakfast 22%, lunch 30%, snack 14%, dinner 34%
  const split = { breakfast: 0.22, lunch: 0.30, snack: 0.14, dinner: 0.34 };
  const r = (n) => Math.round(n);

  return [
    {
      id: "breakfast", label: "Breakfast", time: "7–9 AM",
      suggested: {
        name: "Greek yogurt, berries & granola",
        cal:     r(cal   * split.breakfast),
        protein: r(pro   * split.breakfast),
        carbs:   r(carbs * split.breakfast),
        fat:     r(fat   * split.breakfast),
      },
      status: "upcoming", logged: null,
    },
    {
      id: "lunch", label: "Lunch", time: "12–1 PM",
      suggested: {
        name: "Grilled chicken wrap with salad",
        cal:     r(cal   * split.lunch),
        protein: r(pro   * split.lunch),
        carbs:   r(carbs * split.lunch),
        fat:     r(fat   * split.lunch),
      },
      status: "upcoming", logged: null,
    },
    {
      id: "snack", label: "Snack", time: "3–4 PM",
      suggested: {
        name: "Protein shake + banana",
        cal:     r(cal   * split.snack),
        protein: r(pro   * split.snack),
        carbs:   r(carbs * split.snack),
        fat:     r(fat   * split.snack),
      },
      status: "upcoming", logged: null,
    },
    {
      id: "dinner", label: "Dinner", time: "6–7 PM",
      suggested: {
        name: "Salmon fillet with roasted veg",
        cal:     r(cal   * split.dinner),
        protein: r(pro   * split.dinner),
        carbs:   r(carbs * split.dinner),
        fat:     r(fat   * split.dinner),
      },
      status: "upcoming", logged: null,
    },
  ];
}

// Returns a localStorage key scoped to today's date so logs reset each day.
function todayMealKey(userId) {
  const today = new Date().toISOString().slice(0, 10);
  return `morphiq_meals_${userId || "anon"}_${today}`;
}

function MealPlanScreen() {
  const { gymBranding, supabaseUser, plan, user } = useApp();
  const a = gymBranding.accent;

  // Macro goals from real plan — fall back to sensible defaults
  const CAL_GOAL     = plan?.calories || 1800;
  const PROTEIN_GOAL = plan?.protein  || 140;
  const CARBS_GOAL   = plan?.carbs    || 160;
  const FAT_GOAL     = plan?.fat      || 55;

  // Build today's initial meals from the plan, then restore any logged state
  // from localStorage so a page refresh doesn't wipe the day's progress.
  const [tab, setTab] = useState("today");
  const [meals, setMeals] = useState(() => {
    const base = buildMealsFromPlan(plan);
    try {
      const saved = localStorage.getItem(todayMealKey(supabaseUser?.id));
      if (saved) {
        const savedMeals = JSON.parse(saved);
        // Merge saved status/logged back onto freshly-generated meals
        return base.map(m => {
          const s = savedMeals.find(sm => sm.id === m.id);
          return s ? { ...m, status: s.status, logged: s.logged } : m;
        });
      }
    } catch {}
    return base;
  });
  const [groceries, setGroceries] = useState(GROCERY_DATA);
  const [detailMeal, setDetailMeal] = useState(null);

  // Persist meals to localStorage whenever they change
  useEffect(() => {
    try {
      const toSave = meals.map(m => ({ id: m.id, status: m.status, logged: m.logged }));
      localStorage.setItem(todayMealKey(supabaseUser?.id), JSON.stringify(toSave));
    } catch {}
  }, [meals, supabaseUser?.id]);

  // Day label from real date; goal label from user's plan goal
  const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const goalLabel = user?.goal === "lose_fat" ? "Fat loss plan"
    : user?.goal === "build_muscle" ? "Muscle building plan"
    : "Fitness plan";

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
            <div style={{ fontSize: 12, color: theme.textDim, marginTop: 2 }}>{dayName} · {goalLabel}</div>
          </div>
          <Pill variant={macros.cal > CAL_GOAL * 1.05 ? "amber" : "teal"}>{macros.cal} / {CAL_GOAL} cal</Pill>
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

const CHAT_SUGGESTIONS = {
  idle:    ["What should I eat today?", "How was my last workout?", "I'm feeling tired"],
  workout: ["My knee hurts on squats", "Can I swap an exercise?", "How many sets left?"],
  meals:   ["What can I eat for dinner?", "I already had lunch", "I'm still hungry"],
};

const FALLBACK_REPLIES = {
  "my knee hurts on squats": "Stop squats for now — not worth the risk. I'm swapping in seated leg press instead, much easier on the knee. If it keeps bothering you, let me know and I'll adjust your whole program.",
  "can i swap an exercise": "Of course. Which exercise are you on? Tell me the name and I'll find a solid alternative that hits the same muscle group.",
  "how many sets left": "You've done 2 sets of this exercise. One more to go, then it's dumbbell rows — 3 sets of 10.",
  "what should i eat today": "Your meal plan is set — Greek yogurt breakfast, grilled chicken wrap for lunch, salmon salad for dinner. 1,840 calories total. Want me to swap anything?",
  "how was my last workout": "Monday was strong — you hit every exercise and beat your target reps on goblet squat. Weight is up 5 lbs from last week. Progressing well.",
  "i'm feeling tired": "That's normal mid-week. Hit your protein goal — it helps recovery. I can scale down today's intensity if needed.",
  "what can i eat for dinner": "You have about 460 calories and 36g protein left. Light salmon salad fits perfectly. Tell me if you want something different.",
  "i already had lunch": "Got it — what did you have? Tell me and I'll log it and adjust dinner to fit your remaining calories.",
  "i'm still hungry": "You have 460 calories left. Options: protein shake + banana (240 cal, 26g protein), Greek yogurt (280 cal), or 2 boiled eggs + rice cakes (190 cal). Want me to add one?",
};

export { MealPlanScreen, MacroBar, MealSlot, MealDetailScreen, GroceryList };
