import { useState, useEffect, useRef } from "react";
import { useApp, sb, Pill, Spinner, MicIcon, VoiceBtn, Layout, NavIcon,
         SUPABASE_URL, SUPABASE_ANON, SB_HEADERS, SB_GET, theme,
         MEAL_DATA, GROCERY_DATA, localDateStr } from "./Morphiq.jsx";

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
          <span style={{ fontSize: 14, color: "#E8EDF2", fontWeight: 700 }}>{meal.label}</span>
          <span style={{ fontSize: 11, color: theme.textDim }}>{meal.time}</span>
        </div>
        {{ done: <Pill variant="teal">✓ Logged</Pill>, swapped: <Pill variant="amber">⚡ Swapped</Pill>, upcoming: <Pill variant="gray">Up next</Pill>, skipped: <Pill variant="red">Skipped</Pill> }[meal.status]}
      </div>

      {/* Suggestion — soft, small, not a rule */}
      <div style={{ padding: "0 12px 8px" }}>
        {meal.status === "upcoming" && (
          <div style={{ fontSize: 10, color: theme.textDim, fontStyle: "italic" }}>
            maybe try: <span style={{ color: "#6B8A7A" }}>{meal.suggested.name}</span>
            {meal.originalSuggested && " · adjusted for today"}
          </div>
        )}
        {meal.status === "done" && (
          <button onClick={onOpenDetail} style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: 0, cursor: "pointer", fontFamily: "inherit" }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#D8E4E0" }}>{meal.suggested.name}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 3, alignItems: "center" }}>
              <span style={{ fontSize: 10, color: theme.textDim }}>{meal.suggested.cal} cal</span>
              <span style={{ fontSize: 10, color: theme.textDim }}>·</span>
              <span style={{ fontSize: 10, color: theme.textDim }}>{meal.suggested.protein}g protein</span>
              <span style={{ fontSize: 9, color: "#00D4B1", marginLeft: "auto" }}>Edit ✎</span>
            </div>
          </button>
        )}
        {meal.status === "swapped" && meal.logged && (
          <div>
            <div style={{ fontSize: 10, color: theme.textDim, fontStyle: "italic", textDecoration: "line-through", marginBottom: 4 }}>
              {meal.suggested.name}
            </div>
          </div>
        )}
      </div>

      {/* AI adjustment tap hint — shown when dinner was recalculated */}
      {meal.originalSuggested && meal.status === "upcoming" && (
        <button onClick={onOpenDetail} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 12px 8px", background: "#0A1A14", border: "1px solid rgba(0,212,177,0.2)", borderRadius: 8, padding: "6px 10px", cursor: "pointer", width: "calc(100% - 24px)", fontFamily: "inherit" }}>
          <span style={{ fontSize: 10, color: "#00D4B1" }}>✦ Hypergentiq adjusted this meal — tap to see why</span>
          <span style={{ fontSize: 12, color: "#00D4B1" }}>→</span>
        </button>
      )}

      {/* Swapped actual */}
      {meal.status === "swapped" && meal.logged && (
        <button onClick={onOpenDetail} style={{ display: "block", width: "calc(100% - 24px)", textAlign: "left", margin: "0 12px 8px", background: "#1E1A0A", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 8, padding: "6px 10px", cursor: "pointer", fontFamily: "inherit" }}>
          <div style={{ fontSize: 9, color: theme.amber, marginBottom: 2 }}>Actually ate</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#EDD08A" }}>{meal.logged.name}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 3, alignItems: "center" }}>
            <span style={{ fontSize: 10, color: "#c08040" }}>{meal.logged.cal} cal</span>
            <span style={{ fontSize: 10, color: theme.textDim }}>·</span>
            <span style={{ fontSize: 10, color: theme.textDim }}>{meal.logged.protein}g protein</span>
            <span style={{ fontSize: 9, color: "#00D4B1", marginLeft: "auto" }}>Edit ✎</span>
          </div>
        </button>
      )}

      {/* Action buttons — these are the focal point */}
      {meal.status === "upcoming" && (
        <div style={{ padding: "0 12px 12px", display: "flex", flexDirection: "column", gap: 7 }}>
          <button onClick={onOpenDetail} className="mq-meal-tap"
            style={{ width: "100%", background: a, border: "none", borderRadius: 10, padding: "11px 10px", fontSize: 13, color: "#003D35", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            🎤 Log what I ate
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

  // Edit mode: meal was already logged (done or swapped) — member is correcting it
  const isEdit = meal.status === "done" || meal.status === "swapped";
  const alreadyLogged = isEdit ? (meal.logged || meal.suggested) : null;

  return (
    <Layout activeNav="meals" chatTarget="chat_meals">
      <div className="mq-fade" style={{ padding: "1rem 1.25rem 0", display: "flex", flexDirection: "column" }}>

        {/* Back + title */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: theme.textDim, cursor: "pointer", fontSize: 18, padding: 0, lineHeight: 1 }}>←</button>
          <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>{isEdit ? `Change ${meal.label.toLowerCase()}` : meal.label}</div>
        </div>

        {/* AI note — only shown when meal was adjusted */}
        {hasAdjustment && (
          <div style={{ background: "#080E1A", borderLeft: "2px solid #00D4B1", borderRadius: "0 10px 10px 0", padding: "8px 12px", marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "#9BB3C8", lineHeight: 1.6 }}>
              You ate more than planned earlier today — no problem. I've lightened this meal to keep you as close to your daily target as possible.
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

        {/* Suggested meal summary — shown when no adjustment. In edit mode, shows what was logged instead. */}
        {!hasAdjustment && (
          <div style={{ background: "#1A2332", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
            {isEdit && <div style={{ fontSize: 9, color: theme.textDim, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 4 }}>Currently logged</div>}
            <div style={{ fontSize: 14, fontWeight: 600, color: "#E8EDF2", marginBottom: 4 }}>{isEdit ? alreadyLogged.name : meal.suggested.name}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <span style={{ fontSize: 12, color: a }}>{isEdit ? alreadyLogged.cal : meal.suggested.cal} cal</span>
              <span style={{ fontSize: 12, color: theme.textDim }}>·</span>
              <span style={{ fontSize: 12, color: theme.textDim }}>{isEdit ? alreadyLogged.protein : meal.suggested.protein}g protein</span>
            </div>
          </div>
        )}

        {/* Voice overlay */}
        <div style={{ background: "#0A1628", border: "1px solid rgba(0,212,177,0.2)", borderRadius: 14, padding: "14px 14px 12px", marginBottom: 14, textAlign: "center" }}>
          {voicePhase === "idle" && (
            <>
              <div style={{ fontSize: 13, color: theme.textDim, marginBottom: 12 }}>{isEdit ? "What did you actually have?" : "Did you eat something different?"}</div>
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
          {isEdit ? (
            <button onClick={() => onConfirm()} style={{ flex: 1, background: "transparent", border: `1px solid rgba(0,212,177,0.3)`, borderRadius: 12, padding: "11px 8px", fontSize: 12, color: a, cursor: "pointer", fontFamily: "inherit" }}>
              {meal._isExtra ? "Remove this meal" : `Reset to suggested: ${meal.suggested.name.split(" ")[0]}`}
            </button>
          ) : (
            <>
              <button onClick={startVoice} style={{ flex: 1, background: "transparent", border: `1px solid rgba(0,212,177,0.3)`, borderRadius: 12, padding: "11px 8px", fontSize: 12, color: a, cursor: "pointer", fontFamily: "inherit" }}>
                🎤 Something else
              </button>
              <button onClick={onConfirm} style={{ flex: 2, background: a, border: "none", borderRadius: 12, padding: "11px 8px", fontSize: 12, color: "#003D35", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                {confirmLabel}
              </button>
            </>
          )}
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>Grocery List</div>
        <Pill variant="teal">{done} of {total} ✓</Pill>
      </div>
      <div style={{ fontSize: 11, color: theme.textDim, fontStyle: "italic", marginBottom: 14, lineHeight: 1.5, background: "#0D1623", borderRadius: 8, padding: "8px 10px", borderLeft: "2px solid rgba(0,212,177,0.3)" }}>
        These are smart choices based on your goal — not a strict meal plan. Buy what works for you and your family.
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
// Generates a grocery list tailored to the member's goal and calorie/protein targets.
// Falls back to GROCERY_DATA if plan is missing.
function buildGroceryFromPlan(plan) {
  if (!plan?.calories) return null; // signal to use GROCERY_DATA fallback

  const goal = plan.goal || "lose_fat";
  const highProtein = (plan.protein || 140) >= 130;
  const isMuscleBuild = goal === "build_muscle";
  const isLoseFat = goal === "lose_fat";

  const protein = { category: "Protein", emoji: "🥩", items: [
    { name: "Chicken breast",   qty: "3 lbs",    done: false },
    { name: "Salmon fillets",   qty: "4 pieces", done: false },
    { name: "Eggs",             qty: "1 dozen",  done: false },
    { name: "Canned tuna",      qty: "4 cans",   done: false },
    ...(isMuscleBuild ? [{ name: "Ground turkey",  qty: "2 lbs",  done: false }] : []),
    ...(isMuscleBuild ? [{ name: "Cottage cheese", qty: "16 oz",  done: false }] : []),
    ...(highProtein   ? [{ name: "Protein powder", qty: "1 tub",  done: false }] : []),
  ]};

  const dairy = { category: "Dairy", emoji: "🧀", items: [
    { name: "Greek yogurt",     qty: "32 oz",    done: false },
    { name: "Low-fat milk",     qty: "½ gallon", done: false },
    ...(isMuscleBuild ? [{ name: "Shredded mozzarella", qty: "8 oz",   done: false }] : []),
    ...(isLoseFat     ? [{ name: "String cheese",       qty: "1 pack", done: false }] : []),
  ]};

  const produce = { category: "Produce", emoji: "🥦", items: [
    { name: "Spinach",          qty: "5 oz bag", done: false },
    { name: "Broccoli",         qty: "1 head",   done: false },
    { name: "Mixed berries",    qty: "1 bag",    done: false },
    { name: "Avocado",          qty: "3",        done: false },
    { name: "Cherry tomatoes",  qty: "1 pint",   done: false },
    { name: "Lemons",           qty: "3",        done: false },
    ...(isLoseFat     ? [{ name: "Zucchini",     qty: "2 medium", done: false }] : []),
    ...(isLoseFat     ? [{ name: "Cucumber",     qty: "2",        done: false }] : []),
    ...(isMuscleBuild ? [{ name: "Sweet potato", qty: "3 medium", done: false }] : []),
    ...(isMuscleBuild ? [{ name: "Banana",       qty: "1 bunch",  done: false }] : []),
  ]};

  const pantry = { category: "Pantry", emoji: "🫙", items: [
    { name: "Olive oil",        qty: "1 bottle", done: false },
    { name: "Almond butter",    qty: "1 jar",    done: false },
    { name: "Olive oil spray",  qty: "1 can",    done: false },
    { name: "Sea salt & pepper",qty: "if needed",done: false },
    ...(isLoseFat     ? [{ name: "Rice cakes",   qty: "1 bag",  done: false }] : []),
    ...(isMuscleBuild ? [{ name: "Brown rice",   qty: "2 lbs",  done: false }] : []),
    ...(isMuscleBuild ? [{ name: "Oats",         qty: "1 bag",  done: false }] : []),
  ]};

  const snacks = { category: "Snacks", emoji: "🍎", items: [
    { name: "Apples",           qty: "4",        done: false },
    { name: "Dark chocolate",   qty: "1 bar",    done: false },
    ...(isLoseFat     ? [{ name: "Baby carrots",  qty: "1 bag",  done: false }] : []),
    ...(isLoseFat     ? [{ name: "Rice cakes",    qty: "1 bag",  done: false }] : []),
    ...(isMuscleBuild ? [{ name: "Granola bars",  qty: "1 box",  done: false }] : []),
    ...(isMuscleBuild ? [{ name: "Mixed nuts",    qty: "1 bag",  done: false }] : []),
  ]};

  return [protein, dairy, produce, pantry, snacks];
}

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
  const today = localDateStr();
  return `morphiq_meals_${userId || "anon"}_${today}`;
}

function EndOfDaySummary({ meals, macros, calGoal, proteinGoal }) {
  const { gymBranding } = useApp();
  const a = gymBranding.accent;

  // Only show when all meals are resolved (no "upcoming" left)
  const allDone = meals.every(m => m.status !== "upcoming");
  if (!allDone) return null;

  const swapped = meals.filter(m => m.status === "swapped");
  const skipped = meals.filter(m => m.status === "skipped");
  const calPct   = Math.round((macros.cal / calGoal) * 100);
  const proShort = Math.max(0, proteinGoal - macros.protein);

  // Build a short personalized note based on what actually happened
  let note = "";
  if (calPct >= 90 && calPct <= 110 && proShort <= 15) {
    note = "Solid day. You hit your targets and stayed consistent — that's what progress looks like.";
  } else if (calPct > 110) {
    note = `You went over by about ${macros.cal - calGoal} calories today — no problem. Just pick up where you left off tomorrow.`;
  } else if (calPct < 75) {
    note = "You came in under today — good to know. Eating enough matters too, undereating can slow progress just like overeating.";
  } else if (proShort > 20) {
    note = `You were ${proShort}g short on protein today. Try to hit that target tomorrow — it makes a real difference for your goal.`;
  } else if (swapped.length > 0 && calPct <= 110) {
    note = "You swapped a meal today and still landed close to your target. That's exactly how this is supposed to work.";
  } else {
    note = "Day wrapped up. Every meal logged is data working for you — keep the habit going tomorrow.";
  }

  return (
    <div style={{ background: "#0A1628", border: "1px solid rgba(0,212,177,0.2)", borderRadius: 12, padding: "14px 16px", marginBottom: 10 }}>
      <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10, fontWeight: 600 }}>Day Wrapped Up</div>

      {/* Actual vs target */}
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        <div style={{ flex: 1, background: "#1A2332", borderRadius: 9, padding: "8px 10px", textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: calPct > 110 ? "#F59E0B" : a }}>{macros.cal}</div>
          <div style={{ fontSize: 9, color: "#6B7A8D", marginTop: 1 }}>of {calGoal} cal</div>
        </div>
        <div style={{ flex: 1, background: "#1A2332", borderRadius: 9, padding: "8px 10px", textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: proShort > 20 ? "#F59E0B" : a }}>{macros.protein}g</div>
          <div style={{ fontSize: 9, color: "#6B7A8D", marginTop: 1 }}>of {proteinGoal}g protein</div>
        </div>
        <div style={{ flex: 1, background: "#1A2332", borderRadius: 9, padding: "8px 10px", textAlign: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#E8EDF2" }}>{meals.filter(m => m.status === "done" || m.status === "swapped").length}/{meals.length}</div>
          <div style={{ fontSize: 9, color: "#6B7A8D", marginTop: 1 }}>meals logged</div>
        </div>
      </div>

      {/* Swapped meals summary */}
      {swapped.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          {swapped.map(m => (
            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: "#F59E0B" }}>⚡</span>
              <span style={{ fontSize: 11, color: "#9BB3C8" }}>
                {m.label}: <span style={{ textDecoration: "line-through", color: "#555" }}>{m.suggested.name}</span>
                {" → "}
                <span style={{ color: "#E8EDF2" }}>{m.logged?.name}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {/* AI note */}
      <div style={{ fontSize: 12, color: "#9BB3C8", lineHeight: 1.6, borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 10 }}>
        {note}
      </div>
    </div>
  );
}

function HungryButton({ calsLeft, proteinLeft, goal }) {
  const { gymBranding } = useApp();
  const a = gymBranding.accent;
  const [state, setState] = useState("idle"); // idle | loading | done
  const [suggestions, setSuggestions] = useState([]);

  const calledOut = calsLeft <= 0;

  async function getSuggestions() {
    if (calledOut) return;
    setState("loading");
    try {
      const prompt = `The user is hungry and has ${calsLeft} calories and ${proteinLeft}g protein left for today. Their goal is ${goal || "general fitness"}. Give exactly 3 quick meal or snack ideas that fit. For each one give: name, approximate calories, approximate protein in grams. Keep each suggestion to one line. No intro text, no explanation. Respond ONLY as JSON array like: [{"name":"...","cal":000,"protein":00},{"name":"...","cal":000,"protein":00},{"name":"...","cal":000,"protein":00}]`;
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          user: { goal },
          context: "meals",
        }),
      });
      const data = await res.json();
      const text = data.text || "";
      // Strip any markdown fences and parse JSON
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);
      setSuggestions(parsed);
      setState("done");
    } catch {
      // Fallback if AI call fails
      setSuggestions([
        { name: "Greek yogurt + berries", cal: Math.min(calsLeft, 220), protein: 18 },
        { name: "Protein shake + banana", cal: Math.min(calsLeft, 280), protein: 26 },
        { name: "2 boiled eggs + rice cakes", cal: Math.min(calsLeft, 190), protein: 14 },
      ]);
      setState("done");
    }
  }

  if (calledOut) {
    return (
      <div style={{ background: "#0F1922", border: "1px solid rgba(0,212,177,0.1)", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
        <div style={{ fontSize: 12, color: "#9BB3C8", lineHeight: 1.5 }}>
          You've hit your calorie goal today — great work. Stay hydrated and your body will take care of the rest. 💧
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#0F1922", border: "1px solid rgba(0,212,177,0.1)", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: state === "idle" ? 0 : 10 }}>
        <div>
          <div style={{ fontSize: 12, color: "#9BB3C8" }}>
            <span style={{ color: "#E8EDF2", fontWeight: 600 }}>{calsLeft} cal</span> and <span style={{ color: "#E8EDF2", fontWeight: 600 }}>{proteinLeft}g protein</span> left today
          </div>
        </div>
        {state === "idle" && (
          <button onClick={getSuggestions} style={{ background: a, border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 600, color: "#003D35", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            I'm Hungry
          </button>
        )}
        {state === "loading" && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: a }}>
            <Spinner size={12} /> Finding ideas...
          </div>
        )}
      </div>
      {state === "done" && suggestions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 10, color: "#6B7A8D", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 2 }}>Ideas that fit</div>
          {suggestions.map((s, i) => (
            <div key={i} style={{ background: "#1A2332", borderRadius: 9, padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "#E8EDF2", fontWeight: 500 }}>{s.name}</div>
              <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                <div style={{ fontSize: 11, color: a, fontWeight: 600 }}>{s.cal} cal</div>
                <div style={{ fontSize: 10, color: "#6B7A8D" }}>{s.protein}g protein</div>
              </div>
            </div>
          ))}
          <button onClick={() => { setState("idle"); setSuggestions([]); }} style={{ background: "transparent", border: "none", fontSize: 10, color: "#6B7A8D", cursor: "pointer", fontFamily: "inherit", textAlign: "left", padding: "2px 0", marginTop: 2 }}>
            ↺ Get different ideas
          </button>
        </div>
      )}
    </div>
  );
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
  // Load groceries from localStorage (week-scoped key so list resets each Monday).
  // Merges saved check-off state onto the base GROCERY_DATA list.
  const groceryWeekKey = (() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    return `morphiq_grocery_${supabaseUser?.id || "anon"}_${monday.toISOString().slice(0,10)}`;
  })();
  const [groceries, setGroceries] = useState(() => {
    // Use plan-tailored list if available, otherwise fall back to static GROCERY_DATA
    const baseGrocery = buildGroceryFromPlan(plan) || GROCERY_DATA;
    try {
      const saved = JSON.parse(localStorage.getItem(groceryWeekKey) || "null");
      if (!saved) return baseGrocery;
      // Merge saved done-state back onto base data (handles new items added to list)
      return baseGrocery.map(cat => ({
        ...cat,
        items: cat.items.map(item => {
          const savedCat = saved.find(c => c.category === cat.category);
          const savedItem = savedCat?.items.find(i => i.name === item.name);
          return savedItem ? { ...item, done: savedItem.done } : item;
        }),
      }));
    } catch { return GROCERY_DATA; }
  });
  const [detailMeal, setDetailMeal] = useState(null);
  const [extraMeals, setExtraMeals] = useState([]);

  // Add a new blank extra meal slot
  const addExtraMeal = () => {
    const id = `extra_${Date.now()}`;
    setExtraMeals(prev => [...prev, {
      id,
      label: `Extra meal`,
      time: "",
      status: "upcoming",
      suggested: { name: "", cal: 0, protein: 0 },
      logged: null,
    }]);
  };

  // Log an extra meal slot (called from MealSlot onDone)
  const markExtraDone = (id) => {
    setExtraMeals(prev => prev.map(m => m.id === id ? { ...m, status: "done", logged: m.suggested } : m));
  };

  // Skip an extra meal slot
  const skipExtra = (id) => {
    setExtraMeals(prev => prev.filter(m => m.id !== id));
  };

  // Log or edit an extra meal slot via voice/text (called from detail screen)
  const logSwapExtra = (id, parsedMeal) => {
    const logged = parsedMeal || { name: "Something else", cal: 500, protein: 25, carbs: 50, fat: 20 };
    setExtraMeals(prev => prev.map(m => m.id === id ? { ...m, status: "done", logged, suggested: logged } : m));
    setDetailMeal(null);
  };

  // Persist meals to localStorage whenever they change
  useEffect(() => {
    try {
      const toSave = meals.map(m => ({ id: m.id, status: m.status, logged: m.logged }));
      localStorage.setItem(todayMealKey(supabaseUser?.id), JSON.stringify(toSave));
    } catch {}
  }, [meals, supabaseUser?.id]);

  // On load, fetch today's meal logs from the database — this is the source of
  // truth across devices/sessions. localStorage (above) is only an instant-load
  // fallback for the same browser. Database wins if it has logs for today.
  useEffect(() => {
    if (!supabaseUser?.id) return;
    let cancelled = false;
    (async () => {
      const logs = await sb.getMealLogsForDate(supabaseUser.id);
      if (cancelled || !logs || Object.keys(logs).length === 0) return;
      setMeals(prev => prev.map(m => {
        const row = logs[m.id];
        if (!row) return m;
        if (row.status === "skipped") return { ...m, status: "skipped" };
        if (row.status === "swapped") {
          return { ...m, status: "swapped", logged: { name: row.logged_name, cal: row.logged_cal, protein: row.logged_protein, carbs: row.logged_carbs || 0, fat: row.logged_fat || 0 } };
        }
        if (row.status === "done") {
          // "done" means they confirmed the suggestion as-is, or reset back to it —
          // keep the existing suggested values, just mark it done.
          return { ...m, status: "done", logged: null };
        }
        return m;
      }));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseUser?.id]);

  // When ANY meal is swapped for something higher-calorie, recalculate
  // all remaining upcoming meals to fit the remaining daily budget.
  // This is the core AI adjustment behavior from the blueprint.
  useEffect(() => {
    const hasAnySwap = meals.some(m => m.status === "swapped" && m.logged);
    if (!hasAnySwap) return;

    const calGoal = plan?.calories || 1800;
    const proGoal = plan?.protein || 140;

    // Total logged so far across all logged meals
    const loggedSoFar = meals
      .filter(m => m.status === "done" || m.status === "swapped")
      .reduce((acc, m) => {
        const src = m.logged || m.suggested;
        return { cal: acc.cal + (src.cal || 0), protein: acc.protein + (src.protein || 0) };
      }, { cal: 0, protein: 0 });

    // How many upcoming meals still need calories allocated?
    const upcoming = meals.filter(m => m.status === "upcoming");
    if (upcoming.length === 0) return;

    // Budget remaining — always leave at least 150 cal per remaining meal
    const remainingCal = Math.max(calGoal - loggedSoFar.cal, upcoming.length * 150);
    const remainingPro = Math.max(proGoal - loggedSoFar.protein, upcoming.length * 10);

    // Was there a meaningful overage? (more than 50 cal over what was planned)
    const plannedSoFar = meals
      .filter(m => m.status === "done" || m.status === "swapped")
      .reduce((acc, m) => acc + (m.suggested?.cal || 0), 0);
    const overage = loggedSoFar.cal - plannedSoFar;
    if (overage <= 50) return; // no significant overage — don't adjust

    // Split remaining budget evenly across upcoming meals by their original proportions
    const upcomingOriginalTotal = upcoming.reduce((acc, m) => acc + (m.suggested?.cal || 0), 0);

    // Light meal name options — used when calories drop significantly
    const lightNames = [
      "Light salmon salad", "Grilled chicken & greens", "Tuna & cucumber salad",
      "Egg white omelette & spinach", "Greek yogurt & berries", "Shrimp & veggie stir-fry"
    ];

    setMeals(prev => prev.map(m => {
      if (m.status !== "upcoming") return m;
      if (m.originalSuggested) return m; // already adjusted, don't adjust twice
      const share = upcomingOriginalTotal > 0
        ? (m.suggested?.cal || 0) / upcomingOriginalTotal
        : 1 / upcoming.length;
      const proShare = upcomingOriginalTotal > 0
        ? (m.suggested?.protein || 0) / Math.max(upcoming.reduce((a, u) => a + (u.suggested?.protein || 0), 0), 1)
        : 1 / upcoming.length;

      // Enforce a sensible minimum — dinner should always be a real meal
      const newCal = Math.max(Math.round(remainingCal * share), 300);
      const newPro = Math.max(Math.round(remainingPro * proShare), 25);

      // If calories dropped by more than 20%, rename the meal so the before/after makes sense
      const originalCal = m.suggested?.cal || 0;
      const dropped = originalCal > 0 && newCal < originalCal * 0.8;
      const newName = dropped
        ? lightNames[Math.floor(Math.random() * lightNames.length)]
        : m.suggested.name;

      return {
        ...m,
        originalSuggested: { ...m.suggested },
        suggested: {
          ...m.suggested,
          cal:     newCal,
          protein: newPro,
          name:    newName,
        }
      };
    }));
  }, [meals, plan]);

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

  const macros = calcMacros([...meals, ...extraMeals]);

  function markDone(id) {
    const meal = meals.find(m => m.id === id);
    setMeals(prev => prev.map(m => m.id === id ? { ...m, status: "done" } : m));
    if (supabaseUser?.id && meal) {
      sb.insertMealLog(supabaseUser.id, {
        mealId: id, status: "done",
        loggedName: meal.suggested.name, loggedCal: meal.suggested.cal, loggedProtein: meal.suggested.protein,
        loggedCarbs: meal.suggested.carbs || 0, loggedFat: meal.suggested.fat || 0,
      }).catch(() => {});
    }
  }
  function skipMeal(id) {
    setMeals(prev => prev.map(m => m.id === id ? { ...m, status: "skipped" } : m));
    if (supabaseUser?.id) {
      sb.insertMealLog(supabaseUser.id, { mealId: id, status: "skipped", loggedName: null, loggedCal: 0, loggedProtein: 0, loggedCarbs: 0, loggedFat: 0 }).catch(() => {});
    }
  }
  function confirmSalad(id) {
    const meal = meals.find(m => m.id === id);
    setMeals(prev => prev.map(m => m.id === id ? { ...m, status: "done", logged: null } : m));
    setDetailMeal(null);
    if (supabaseUser?.id && meal) {
      sb.insertMealLog(supabaseUser.id, {
        mealId: id, status: "done",
        loggedName: meal.suggested.name, loggedCal: meal.suggested.cal, loggedProtein: meal.suggested.protein,
        loggedCarbs: meal.suggested.carbs || 0, loggedFat: meal.suggested.fat || 0,
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
        loggedCarbs: swapped.carbs || 0, loggedFat: swapped.fat || 0,
      }).catch(() => {});
    }
  }
  // Persist grocery check-off state whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(groceryWeekKey, JSON.stringify(groceries));
    } catch {}
  }, [groceries, groceryWeekKey]);

  function toggleGrocery(category, idx) {
    setGroceries(prev => prev.map(cat => cat.category !== category ? cat : {
      ...cat, items: cat.items.map((item, i) => i !== idx ? item : { ...item, done: !item.done })
    }));
  }

  // Show meal detail / voice logging screen
  if (detailMeal) {
    return (
      <MealDetailScreen
        meal={detailMeal}
        onBack={() => setDetailMeal(null)}
        onConfirm={() => detailMeal._isExtra ? skipExtra(detailMeal.id) : confirmSalad(detailMeal.id)}
        onSwap={(parsedMeal) => detailMeal._isExtra ? logSwapExtra(detailMeal.id, parsedMeal) : logSwap(detailMeal.id, parsedMeal)}
      />
    );
  }

  return (
    <Layout activeNav="meals" chatTarget="chat_meals">
      <div style={{ padding: "1.25rem 1.25rem 0" }}>
        {/* ── Big calorie display ── */}
        <div style={{ background: "#1A2332", borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: theme.textDim, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 3 }}>Today's Meals</div>
              <div style={{ fontSize: 12, color: theme.textDim }}>{dayName} · {goalLabel}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: macros.cal > CAL_GOAL * 1.05 ? "#F59E0B" : a, lineHeight: 1 }}>{macros.cal}</div>
              <div style={{ fontSize: 11, color: theme.textDim, marginTop: 2 }}>of {CAL_GOAL} cal</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <MacroBar label="Protein" current={macros.protein} goal={PROTEIN_GOAL} color="#F59E0B" />
            <MacroBar label="Carbs" current={macros.carbs} goal={CARBS_GOAL} color="#818cf8" />
            <MacroBar label="Fat" current={macros.fat} goal={FAT_GOAL} color="#f472b6" />
          </div>
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
            {extraMeals.map(meal => (
              <MealSlot
                key={meal.id}
                meal={meal}
                onDone={() => markExtraDone(meal.id)}
                onSkip={() => skipExtra(meal.id)}
                onOpenDetail={() => setDetailMeal({ ...meal, _isExtra: true })}
              />
            ))}
            <button
              onClick={addExtraMeal}
              style={{
                width: "100%", background: "transparent",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: 10, padding: "10px",
                fontSize: 12, color: "#6B7A8D",
                cursor: "pointer", fontFamily: "inherit",
                marginBottom: 8, display: "flex",
                alignItems: "center", justifyContent: "center", gap: 6
              }}>
              <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add meal
            </button>
            <EndOfDaySummary meals={[...meals, ...extraMeals]} macros={macros} calGoal={CAL_GOAL} proteinGoal={PROTEIN_GOAL} />
            <HungryButton calsLeft={CAL_GOAL - macros.cal} proteinLeft={Math.max(0, PROTEIN_GOAL - macros.protein)} goal={plan?.goal} />
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

