import { useState, useEffect, useRef } from "react";
import { useApp, sb, Pill, Spinner, VoiceBtn, Layout, theme, GROCERY_DATA, localDateStr, Icon } from "./shared.jsx";

// ─── MacroBar ────────────────────────────────────────────────────────────────
function MacroBar({ label, current, goal, color }) {
  const pct = Math.min(100, Math.round((current / goal) * 100));
  return (
    <div style={{ flex: 1, background: "#212429", borderRadius: 12, padding: "12px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1, marginBottom: 2 }}>{current}</div>
      <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 8 }}>of {goal}g</div>
      <div style={{ height: 5, background: "#0F1922", borderRadius: 3 }}>
        <div style={{ height: 5, borderRadius: 3, background: color, width: `${pct}%`, transition: "width .6s" }} />
      </div>
      <div style={{ fontSize: 10, color: color, marginTop: 4, fontWeight: 600 }}>{pct}%</div>
    </div>
  );
}

// ─── GroceryList ─────────────────────────────────────────────────────────────
function GroceryList({ groceries, onToggle }) {
  const { gymBranding } = useApp();
  const a = gymBranding.accent;
  const total = groceries.flatMap(c => c.items).length;
  const done = groceries.flatMap(c => c.items).filter(i => i.done).length;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>Grocery List</div>
        <Pill variant="teal">{done} of {total} <Icon name="check" size={10} style={{ verticalAlign: "-1px" }} /></Pill>
      </div>
      <div style={{ fontSize: 11, color: theme.textDim, fontStyle: "italic", marginBottom: 14, lineHeight: 1.5, background: "#171920", borderRadius: 8, padding: "8px 10px", borderLeft: "2px solid rgba(76,141,255,0.3)" }}>
        These are smart choices based on your goal — not a strict meal plan. Buy what works for you and your family.
      </div>
      {groceries.map(cat => (
        <div key={cat.category} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>{cat.emoji} {cat.category}</div>
          <div style={{ background: "#212429", borderRadius: 12, overflow: "hidden" }}>
            {cat.items.map((item, i) => (
              <button key={item.name} onClick={() => onToggle(cat.category, i)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "none", border: "none", borderBottom: i < cat.items.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${item.done ? a : "rgba(76,141,255,0.3)"}`, background: item.done ? "#0B1E3D" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 9, color: a }}>
                  {item.done ? <Icon name="check" size={10} /> : ""}
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

// ─── buildGroceryFromPlan ─────────────────────────────────────────────────────
function buildGroceryFromPlan(plan) {
  if (!plan?.calories) return null;
  const goal = plan.goal || "lose_fat";
  const highProtein = (plan.protein || 140) >= 130;
  const isMuscleBuild = goal === "build_muscle";
  const isLoseFat = goal === "lose_fat";
  const protein = { category: "Protein", emoji: <Icon name="meat" size={13} style={{ verticalAlign: "-2px", marginRight: 3 }} />, items: [
    { name: "Chicken breast", qty: "3 lbs", done: false },
    { name: "Salmon fillets", qty: "4 pieces", done: false },
    { name: "Eggs", qty: "1 dozen", done: false },
    { name: "Canned tuna", qty: "4 cans", done: false },
    ...(isMuscleBuild ? [{ name: "Ground turkey", qty: "2 lbs", done: false }] : []),
    ...(isMuscleBuild ? [{ name: "Cottage cheese", qty: "16 oz", done: false }] : []),
    ...(highProtein ? [{ name: "Protein powder", qty: "1 tub", done: false }] : []),
  ]};
  const dairy = { category: "Dairy", emoji: <Icon name="cheese" size={13} style={{ verticalAlign: "-2px", marginRight: 3 }} />, items: [
    { name: "Greek yogurt", qty: "32 oz", done: false },
    { name: "Low-fat milk", qty: "½ gallon", done: false },
    ...(isMuscleBuild ? [{ name: "Shredded mozzarella", qty: "8 oz", done: false }] : []),
    ...(isLoseFat ? [{ name: "String cheese", qty: "1 pack", done: false }] : []),
  ]};
  const produce = { category: "Produce", emoji: <Icon name="broccoli" size={13} style={{ verticalAlign: "-2px", marginRight: 3 }} />, items: [
    { name: "Spinach", qty: "5 oz bag", done: false },
    { name: "Broccoli", qty: "1 head", done: false },
    { name: "Mixed berries", qty: "1 bag", done: false },
    { name: "Avocado", qty: "3", done: false },
    { name: "Cherry tomatoes", qty: "1 pint", done: false },
    { name: "Lemons", qty: "3", done: false },
    ...(isLoseFat ? [{ name: "Zucchini", qty: "2 medium", done: false }] : []),
    ...(isLoseFat ? [{ name: "Cucumber", qty: "2", done: false }] : []),
    ...(isMuscleBuild ? [{ name: "Sweet potato", qty: "3 medium", done: false }] : []),
    ...(isMuscleBuild ? [{ name: "Banana", qty: "1 bunch", done: false }] : []),
  ]};
  const pantry = { category: "Pantry", emoji: <Icon name="jar" size={13} style={{ verticalAlign: "-2px", marginRight: 3 }} />, items: [
    { name: "Olive oil", qty: "1 bottle", done: false },
    { name: "Almond butter", qty: "1 jar", done: false },
    { name: "Olive oil spray", qty: "1 can", done: false },
    { name: "Sea salt & pepper", qty: "if needed", done: false },
    ...(isLoseFat ? [{ name: "Rice cakes", qty: "1 bag", done: false }] : []),
    ...(isMuscleBuild ? [{ name: "Brown rice", qty: "2 lbs", done: false }] : []),
    ...(isMuscleBuild ? [{ name: "Oats", qty: "1 bag", done: false }] : []),
  ]};
  const snacks = { category: "Snacks", emoji: <Icon name="apple" size={13} style={{ verticalAlign: "-2px", marginRight: 3 }} />, items: [
    { name: "Apples", qty: "4", done: false },
    { name: "Dark chocolate", qty: "1 bar", done: false },
    ...(isLoseFat ? [{ name: "Baby carrots", qty: "1 bag", done: false }] : []),
    ...(isLoseFat ? [{ name: "Rice cakes", qty: "1 bag", done: false }] : []),
    ...(isMuscleBuild ? [{ name: "Granola bars", qty: "1 box", done: false }] : []),
    ...(isMuscleBuild ? [{ name: "Mixed nuts", qty: "1 bag", done: false }] : []),
  ]};
  return [protein, dairy, produce, pantry, snacks];
}

// ─── HungryButton ─────────────────────────────────────────────────────────────
function HungryButton({ calsLeft, proteinLeft, goal }) {
  const { gymBranding } = useApp();
  const a = gymBranding.accent;
  const [state, setState] = useState("idle");
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
        body: JSON.stringify({ messages: [{ role: "user", content: prompt }], user: { goal }, context: "meals" }),
      });
      const data = await res.json();
      const clean = (data.text || "").replace(/```json|```/g, "").trim();
      setSuggestions(JSON.parse(clean));
      setState("done");
    } catch {
      setSuggestions([
        { name: "Greek yogurt + berries", cal: Math.min(calsLeft, 220), protein: 18 },
        { name: "Protein shake + banana", cal: Math.min(calsLeft, 280), protein: 26 },
        { name: "2 boiled eggs + rice cakes", cal: Math.min(calsLeft, 190), protein: 14 },
      ]);
      setState("done");
    }
  }

  if (calledOut) return (
    <div style={{ background: "#0F1922", border: "1px solid rgba(76,141,255,0.1)", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
      <div style={{ fontSize: 12, color: "#9BA0AA", lineHeight: 1.5, display: "flex", alignItems: "center", gap: 5 }}>You've hit your calorie goal today — great work. Stay hydrated and your body will take care of the rest. <Icon name="droplet" size={12} color="#60A5FA" /></div>
    </div>
  );

  return (
    <div style={{ background: "#0F1922", border: "1px solid rgba(76,141,255,0.1)", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: state === "idle" ? 0 : 10 }}>
        <div>
          <div style={{ fontSize: 11, color: theme.textDim, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>Remaining today</div>
          <div style={{ display: "flex", gap: 12, alignItems: "baseline" }}>
            <div><span style={{ fontSize: 24, fontWeight: 700, color: "#EDEEF0" }}>{calsLeft}</span><span style={{ fontSize: 12, color: theme.textDim, marginLeft: 3 }}>cal</span></div>
            <div><span style={{ fontSize: 24, fontWeight: 700, color: "#F59E0B" }}>{proteinLeft}g</span><span style={{ fontSize: 12, color: theme.textDim, marginLeft: 3 }}>protein</span></div>
          </div>
        </div>
        {state === "idle" && (
          <button onClick={getSuggestions} style={{ background: a, border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 600, color: "#0B1E3D", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>I'm Hungry</button>
        )}
        {state === "loading" && <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: a }}><Spinner size={12} /> Finding ideas...</div>}
      </div>
      {state === "done" && suggestions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 10, color: "#6E7480", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 2 }}>Ideas that fit</div>
          {suggestions.map((s, i) => (
            <div key={i} style={{ background: "#212429", borderRadius: 9, padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 12, color: "#EDEEF0", fontWeight: 500 }}>{s.name}</div>
              <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                <div style={{ fontSize: 11, color: a, fontWeight: 600 }}>{s.cal} cal</div>
                <div style={{ fontSize: 10, color: "#6E7480" }}>{s.protein}g protein</div>
              </div>
            </div>
          ))}
          <button onClick={() => { setState("idle"); setSuggestions([]); }} style={{ background: "transparent", border: "none", fontSize: 10, color: "#6E7480", cursor: "pointer", fontFamily: "inherit", textAlign: "left", padding: "2px 0", marginTop: 2, display: "flex", alignItems: "center", gap: 3 }}><Icon name="refresh" size={10} /> Get different ideas</button>
        </div>
      )}
    </div>
  );
}

// ─── LogEntryRow ──────────────────────────────────────────────────────────────
function LogEntryRow({ entry, onDelete, accent }) {
  const time = new Date(entry.loggedAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      {entry.isPhotoEstimate && (
        <span style={{ flexShrink: 0, display: "flex" }}><Icon name="camera" size={14} /></span>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#EDEEF0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{entry.name}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
          <span style={{ fontSize: 10, color: accent, fontWeight: 600 }}>{entry.cal} cal</span>
          <span style={{ fontSize: 10, color: theme.textDim }}>{entry.protein}g pro</span>
          <span style={{ fontSize: 10, color: theme.textDim }}>{entry.carbs}g carbs</span>
          <span style={{ fontSize: 10, color: theme.textDim }}>{entry.fat}g fat</span>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: theme.textDim }}>{time}</span>
        <button onClick={() => onDelete(entry.id)} style={{ background: "none", border: "none", fontSize: 14, color: theme.textDim, cursor: "pointer", lineHeight: 1, padding: 0 }}>×</button>
      </div>
    </div>
  );
}

// ─── LogInput — voice + text + photo in one panel ────────────────────────────
function LogInput({ onLog, accent }) {
  const [phase, setPhase] = useState("idle"); // idle | listening | processing | confirming | error
  const [textVal, setTextVal] = useState("");
  const [parsed, setParsed] = useState(null);
  const [errMsg, setErrMsg] = useState("");
  const recognitionRef = useRef(null);
  const fileInputRef = useRef(null);

  function reset() {
    recognitionRef.current?.abort();
    setPhase("idle"); setTextVal(""); setParsed(null); setErrMsg("");
  }

  // ── Voice ──
  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setErrMsg("Microphone not available on this browser — type instead."); setPhase("error"); return; }
    const rec = new SR();
    rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 1;
    recognitionRef.current = rec;
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setTextVal(text);
      parseText(text);
    };
    rec.onerror = () => { setErrMsg("Microphone error — try typing instead."); setPhase("error"); };
    setPhase("listening");
    rec.start();
  }

  // ── Text ──
  function submitText() {
    if (!textVal.trim()) return;
    parseText(textVal.trim());
  }

  // ── Parse via /api/parse-meal ──
  async function parseText(text) {
    setPhase("processing");
    try {
      const res = await fetch("/api/parse-meal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok || !data?.name) { setErrMsg(data?.error || "Couldn't look that up — try again."); setPhase("error"); return; }
      setParsed(data);
      setPhase("confirming");
    } catch (e) {
      setErrMsg("Network error — check your connection."); setPhase("error");
    }
  }

  // ── Photo ──
  function openCamera() {
    fileInputRef.current?.click();
  }

  async function handlePhoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setPhase("processing");
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/photo-meal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64, mediaType: file.type }),
      });
      const data = await res.json();
      if (!res.ok || !data?.name) { setErrMsg(data?.error || "Couldn't read that photo — try again."); setPhase("error"); return; }
      setParsed(data);
      setPhase("confirming");
    } catch (e) {
      setErrMsg("Photo error — try again."); setPhase("error");
    }
  }

  function confirmLog() {
    if (!parsed) return;
    onLog({ ...parsed, loggedAt: new Date().toISOString(), id: `entry_${Date.now()}` });
    reset();
  }

  return (
    <div style={{ background: "#0A1628", border: "1px solid rgba(76,141,255,0.15)", borderRadius: 14, padding: "14px", marginBottom: 12 }}>

      {/* Hidden file input for camera */}
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment"
        onChange={handlePhoto} style={{ display: "none" }} />

      {/* IDLE — three input buttons + text field */}
      {phase === "idle" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {/* Voice */}
            <button onClick={startVoice}
              style={{ flex: 1, background: "#1B1D21", border: "1px solid rgba(76,141,255,0.25)", borderRadius: 12, padding: "14px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 7, cursor: "pointer", fontFamily: "inherit" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <rect x="8" y="2" width="8" height="12" rx="4" fill={accent} opacity="0.9"/>
                <path d="M5 11c0 3.866 3.134 7 7 7s7-3.134 7-7" stroke={accent} strokeWidth="2" strokeLinecap="round"/>
                <line x1="12" y1="18" x2="12" y2="22" stroke={accent} strokeWidth="2" strokeLinecap="round"/>
                <line x1="9" y1="22" x2="15" y2="22" stroke={accent} strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span style={{ fontSize: 12, color: accent, fontWeight: 600 }}>Voice</span>
            </button>
            {/* Photo */}
            <button onClick={openCamera}
              style={{ flex: 1, background: "#1B1D21", border: "1px solid rgba(76,141,255,0.25)", borderRadius: 12, padding: "14px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 7, cursor: "pointer", fontFamily: "inherit" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <circle cx="12" cy="13" r="4" stroke={accent} strokeWidth="2"/>
              </svg>
              <span style={{ fontSize: 12, color: accent, fontWeight: 600 }}>Photo</span>
            </button>
          </div>

          {/* Photo disclaimer */}
          <div style={{ fontSize: 10, color: theme.textDim, textAlign: "center", marginBottom: 10, fontStyle: "italic" }}>
            Photo estimates may vary — weigh food for precision
          </div>

          {/* Text input */}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={textVal}
              onChange={e => setTextVal(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submitText()}
              placeholder="Type what you ate…"
              style={{ flex: 1, background: "#1B1D21", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "9px 10px", fontSize: 13, color: "#EDEEF0", outline: "none", fontFamily: "inherit" }}
            />
            <button onClick={submitText} disabled={!textVal.trim()}
              style={{ background: accent, border: "none", borderRadius: 8, padding: "9px 14px", color: "#0B1E3D", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: textVal.trim() ? 1 : 0.4, display: "flex", alignItems: "center" }}><Icon name="arrow-right" size={14} /></button>
          </div>
        </>
      )}

      {/* LISTENING */}
      {phase === "listening" && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 8 }}>Tell me what you ate</div>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 3, height: 28, marginBottom: 8 }} className="mq-wave">
            {[1,2,3,4,5,6].map(i => <span key={i} />)}
          </div>
          <div style={{ fontSize: 11, color: accent, marginBottom: 12 }}>Listening...</div>
          <button onClick={reset} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "5px 16px", fontSize: 10, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        </div>
      )}

      {/* PROCESSING */}
      {phase === "processing" && (
        <div style={{ textAlign: "center", padding: "8px 0" }}>
          <Spinner size={24} color={accent} />
          <div style={{ fontSize: 11, color: accent, marginTop: 8 }}>Looking up nutrition info…</div>
        </div>
      )}

      {/* CONFIRMING */}
      {phase === "confirming" && parsed && (
        <>
          <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 8 }}>Does this look right?</div>
          <div style={{ background: "#1B1D21", borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#EDEEF0", marginBottom: 6 }}>
              {parsed.name}
              {parsed.isPhotoEstimate && <span style={{ fontSize: 10, color: theme.textDim, fontWeight: 400, marginLeft: 6, display: "inline-flex", alignItems: "center", gap: 3 }}><Icon name="camera" size={10} /> photo estimate</span>}
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span style={{ fontSize: 13, color: accent, fontWeight: 600 }}>{parsed.cal} cal</span>
              <span style={{ fontSize: 13, color: theme.textDim }}>{parsed.protein}g protein</span>
              <span style={{ fontSize: 13, color: theme.textDim }}>{parsed.carbs}g carbs</span>
              <span style={{ fontSize: 13, color: theme.textDim }}>{parsed.fat}g fat</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={reset} style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 9, padding: "8px", fontSize: 11, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>Redo</button>
            <button onClick={confirmLog} style={{ flex: 2, background: accent, border: "none", borderRadius: 9, padding: "8px", fontSize: 12, color: "#0B1E3D", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>Log this <Icon name="check" size={12} /></button>
          </div>
        </>
      )}

      {/* ERROR */}
      {phase === "error" && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#F87171", marginBottom: 8 }}>{errMsg}</div>
          <button onClick={reset} style={{ background: accent, border: "none", borderRadius: 9, padding: "7px 20px", fontSize: 11, color: "#0B1E3D", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Try again</button>
        </div>
      )}
    </div>
  );
}

// ─── todayMealKey ─────────────────────────────────────────────────────────────
function todayMealKey(userId) {
  return `morphiq_meals_v2_${userId || "anon"}_${localDateStr()}`;
}


// ─── WaterTracker ─────────────────────────────────────────────────────────────
function WaterTracker({ userId }) {
  const { gymBranding, plan } = useApp();
  const a = gymBranding.accent;
  const WATER_GOAL_OZ = 64; // 8 glasses = 64oz
  const QUICK_AMOUNTS = [8, 16, 24];
  const QUICK_LABELS  = ["1 Glass", "1 Bottle", "Large Bottle"];

  const waterKey = `morphiq_water_${userId || "anon"}_${localDateStr()}`;

  const [oz, setOz] = useState(() => {
    try { return parseInt(localStorage.getItem(waterKey) || "0", 10); } catch { return 0; }
  });
  const [customInput, setCustomInput] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [justAdded, setJustAdded] = useState(null); // brief "+Xoz" flash

  function addWater(amount) {
    const next = Math.min(oz + amount, 999);
    setOz(next);
    try { localStorage.setItem(waterKey, String(next)); } catch {}
    setJustAdded(`+${amount}oz`);
    setTimeout(() => setJustAdded(null), 1500);
  }

  function submitCustom() {
    const val = parseInt(customInput, 10);
    if (val > 0 && val < 200) {
      addWater(val);
      setCustomInput("");
      setShowCustom(false);
    }
  }

  function removeWater(amount) {
    const next = Math.max(0, oz - amount);
    setOz(next);
    try { localStorage.setItem(waterKey, String(next)); } catch {}
  }

  const pct = Math.min(100, Math.round((oz / WATER_GOAL_OZ) * 100));
  const glasses = Math.floor(oz / 8);
  const goalGlasses = WATER_GOAL_OZ / 8;
  const done = oz >= WATER_GOAL_OZ;

  return (
    <div style={{ background: "#0D1E35", border: `1px solid ${done ? "rgba(76,141,255,0.4)" : "rgba(96,165,250,0.25)"}`, borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C12 2 5 10 5 15a7 7 0 0 0 14 0c0-5-7-13-7-13z" fill="rgba(96,165,250,0.3)" stroke="#60A5FA" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#EDEEF0" }}>Water</div>
          {done && <div style={{ fontSize: 10, background: "rgba(76,141,255,0.15)", color: a, borderRadius: 6, padding: "2px 7px", fontWeight: 600, display: "flex", alignItems: "center", gap: 3 }}>Goal hit <Icon name="check" size={9} /></div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <span style={{ fontSize: 22, fontWeight: 700, color: done ? a : "#60A5FA" }}>{glasses}</span>
          <span style={{ fontSize: 12, color: "#6E7480" }}>/{goalGlasses} glasses</span>
          {justAdded && (
            <div style={{ fontSize: 11, color: a, fontWeight: 600, animation: "mqFadeOut 1.5s forwards" }}>{justAdded}</div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 6, background: "#0F1922", borderRadius: 3, marginBottom: 12 }}>
        <div style={{ height: 6, borderRadius: 3, background: done ? a : "#60A5FA", width: `${pct}%`, transition: "width .4s" }} />
      </div>

      {/* Quick add buttons */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {QUICK_AMOUNTS.map((amt, i) => (
          <button key={amt} onClick={() => addWater(amt)}
            style={{ flex: 1, background: "#1B1D21", border: "1px solid rgba(96,165,250,0.3)", borderRadius: 9, padding: "8px 4px", fontSize: 11, fontWeight: 600, color: "#60A5FA", cursor: "pointer", fontFamily: "inherit", lineHeight: 1.3 }}>
            {QUICK_LABELS[i]}<br/><span style={{ fontSize: 9, fontWeight: 400, color: "#6E7480" }}>{amt}oz</span>
          </button>
        ))}
        <button onClick={() => setShowCustom(!showCustom)}
          style={{ flex: 1, background: "#1B1D21", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 9, padding: "8px 4px", fontSize: 12, color: "#6E7480", cursor: "pointer", fontFamily: "inherit" }}>
          Custom
        </button>
        {oz > 0 && (
          <button onClick={() => removeWater(8)}
            style={{ background: "none", border: "none", color: "#6E7480", cursor: "pointer", padding: "4px 6px", lineHeight: 1, display: "flex", alignItems: "center" }} title="Remove 8oz">
            <Icon name="arrow-left" size={14} />
          </button>
        )}
      </div>

      {/* Custom input */}
      {showCustom && (
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <input
            value={customInput}
            onChange={e => setCustomInput(e.target.value.replace(/\D/g, ""))}
            onKeyDown={e => e.key === "Enter" && submitCustom()}
            placeholder="oz amount"
            type="number"
            style={{ flex: 1, background: "#1B1D21", border: "1px solid rgba(96,165,250,0.3)", borderRadius: 8, padding: "8px 10px", fontSize: 13, color: "#EDEEF0", outline: "none", fontFamily: "inherit" }}
          />
          <button onClick={submitCustom}
            style={{ background: "#60A5FA", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, color: "#0D1E35", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            Add
          </button>
        </div>
      )}
    </div>
  );
}

// ─── MealPlanScreen ───────────────────────────────────────────────────────────
function MealPlanScreen() {
  const { gymBranding, supabaseUser, plan, user } = useApp();
  const a = gymBranding.accent;

  const CAL_GOAL     = plan?.calories || 1800;
  const PROTEIN_GOAL = plan?.protein  || 140;
  const CARBS_GOAL   = plan?.carbs    || 160;
  const FAT_GOAL     = plan?.fat      || 55;

  const [tab, setTab] = useState("today");

  // ── Food log — flat array of logged items ──
  const [entries, setEntries] = useState(() => {
    try {
      const saved = localStorage.getItem(todayMealKey(supabaseUser?.id));
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Persist entries to localStorage whenever they change
  useEffect(() => {
    try { localStorage.setItem(todayMealKey(supabaseUser?.id), JSON.stringify(entries)); } catch {}
  }, [entries, supabaseUser?.id]);

  // ── Grocery list ──
  const groceryWeekKey = (() => {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    return `morphiq_grocery_${supabaseUser?.id || "anon"}_${monday.toISOString().slice(0,10)}`;
  })();
  const [groceries, setGroceries] = useState(() => {
    const base = buildGroceryFromPlan(plan) || GROCERY_DATA;
    try {
      const saved = JSON.parse(localStorage.getItem(groceryWeekKey) || "null");
      if (!saved) return base;
      return base.map(cat => ({
        ...cat,
        items: cat.items.map(item => {
          const sc = saved.find(c => c.category === cat.category);
          const si = sc?.items.find(i => i.name === item.name);
          return si ? { ...item, done: si.done } : item;
        }),
      }));
    } catch { return GROCERY_DATA; }
  });

  useEffect(() => {
    try { localStorage.setItem(groceryWeekKey, JSON.stringify(groceries)); } catch {}
  }, [groceries, groceryWeekKey]);

  function toggleGrocery(category, idx) {
    setGroceries(prev => prev.map(cat => cat.category !== category ? cat : {
      ...cat, items: cat.items.map((item, i) => i !== idx ? item : { ...item, done: !item.done })
    }));
  }

  // ── Derived totals ──
  const totals = entries.reduce((acc, e) => ({
    cal:     acc.cal     + (e.cal     || 0),
    protein: acc.protein + (e.protein || 0),
    carbs:   acc.carbs   + (e.carbs   || 0),
    fat:     acc.fat     + (e.fat     || 0),
  }), { cal: 0, protein: 0, carbs: 0, fat: 0 });

  function addEntry(entry) {
    setEntries(prev => [...prev, entry]);
    // Fire-and-forget save to Supabase
    if (supabaseUser?.id) {
      sb.insertMealLog(supabaseUser.id, {
        mealId: entry.id,
        status: "done",
        loggedName: entry.name,
        loggedCal: entry.cal,
        loggedProtein: entry.protein,
        loggedCarbs: entry.carbs || 0,
        loggedFat: entry.fat || 0,
      }).catch(() => {});
    }
  }

  function deleteEntry(id) {
    setEntries(prev => prev.filter(e => e.id !== id));
  }

  const dayName = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const goalLabel = user?.goal === "lose_fat" ? "Fat loss plan"
    : user?.goal === "build_muscle" ? "Muscle building plan"
    : "Fitness plan";

  return (
    <Layout activeNav="meals" chatTarget="chat_meals">
      <div style={{ padding: "1.25rem 1.25rem 0" }}>

        {/* ── Calorie header ── */}
        <div style={{ background: "#212429", borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
            <div>
              <div style={{ fontSize: 11, color: theme.textDim, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 3 }}>Today's Food</div>
              <div style={{ fontSize: 12, color: theme.textDim }}>{dayName} · {goalLabel}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: totals.cal > CAL_GOAL * 1.05 ? "#F59E0B" : a, lineHeight: 1 }}>{totals.cal}</div>
              <div style={{ fontSize: 11, color: theme.textDim, marginTop: 2 }}>of {CAL_GOAL} cal</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <MacroBar label="Protein" current={totals.protein} goal={PROTEIN_GOAL} color="#F59E0B" />
            <MacroBar label="Carbs"   current={totals.carbs}   goal={CARBS_GOAL}   color="#818cf8" />
            <MacroBar label="Fat"     current={totals.fat}     goal={FAT_GOAL}     color="#f472b6" />
          </div>
        </div>

        {/* ── Water tracker ── */}
        <WaterTracker userId={supabaseUser?.id} />

        {/* ── Tab bar ── */}
        <div style={{ display: "flex", background: "#212429", borderRadius: 10, padding: 3, marginBottom: 16 }}>
          {[["today", "Food Log"], ["grocery", "Grocery List"]].map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex: 1, padding: "7px 6px", background: tab === t ? a : "transparent", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 500, color: tab === t ? "#0B1E3D" : theme.textDim, cursor: "pointer", fontFamily: "inherit", transition: "all .2s" }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── Food Log tab ── */}
        {tab === "today" && (
          <div className="mq-fade">

            {/* Log input — voice / photo / text */}
            <LogInput onLog={addEntry} accent={a} />

            {/* Logged entries */}
            {entries.length > 0 ? (
              <div style={{ background: "#212429", borderRadius: 12, overflow: "hidden", marginBottom: 12 }}>
                <div style={{ padding: "8px 12px 6px", fontSize: 10, color: theme.textDim, textTransform: "uppercase", letterSpacing: "1px" }}>
                  {entries.length} item{entries.length !== 1 ? "s" : ""} logged today
                </div>
                {entries.map(entry => (
                  <LogEntryRow key={entry.id} entry={entry} onDelete={deleteEntry} accent={a} />
                ))}
              </div>
            ) : (
              <div style={{ textAlign: "center", padding: "24px 0 12px", color: theme.textDim, fontSize: 13 }}>
                Nothing logged yet — add your first meal above <Icon name="arrow-up" size={12} style={{ verticalAlign: "-1px" }} />
              </div>
            )}

            {/* Hungry button */}
            <HungryButton
              calsLeft={CAL_GOAL - totals.cal}
              proteinLeft={Math.max(0, PROTEIN_GOAL - totals.protein)}
              goal={plan?.goal}
            />
          </div>
        )}

        {/* ── Grocery tab ── */}
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
  "what should i eat today": "Your calorie target is set — log what you eat as you go and I'll track your macros in real time.",
  "how was my last workout": "Monday was strong — you hit every exercise and beat your target reps on goblet squat. Weight is up 5 lbs from last week. Progressing well.",
  "i'm feeling tired": "That's normal mid-week. Hit your protein goal — it helps recovery. I can scale down today's intensity if needed.",
  "what can i eat for dinner": "Check your remaining calories on the Meals tab — tap 'I'm Hungry' and I'll suggest a few ideas that fit.",
  "i already had lunch": "Got it — log it on the Meals tab and I'll update your running total automatically.",
  "i'm still hungry": "Tap 'I'm Hungry' on the Meals tab and I'll show you what fits your remaining calories.",
};

export { MealPlanScreen, MacroBar, CHAT_SUGGESTIONS, FALLBACK_REPLIES };
