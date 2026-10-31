import { useState, useEffect, useRef } from "react";
import { useApp, theme, sb, SUPABASE_URL, SB_GET, localDateStr, Layout, Icon, MicIcon } from "./shared.jsx";
import { saveTrainingPrefs } from "./TrainingStyle.jsx";

// ─── Log mode workout screen (Session 53) ──────────────────────────────────
// For members who picked "Log my own" (profiles.training_mode = 'log').
// Coach mode never reaches this file -- AppRouter in Morphiq.jsx only sends
// log-mode members here, so WorkoutScreen.jsx is untouched.
//
// What log mode does differently from coach mode:
//   - no rep targets, no automatic weight bumps
//   - "Last time" shown set by set, with its date
//   - weight + reps pre-filled from last time, so most sets are one tap
//   - rest timer only runs when the member taps it
//   - freestyle (pick exercises as you go) or saved routines
//   - "Welcome back" when an exercise hasn't been done in 2+ weeks; a
//     suggested lighter starting weight only if Light nudges is on
//
// Sets are saved with the SAME sb.insertWorkoutLog() coach mode uses, into
// the same workout_logs table -- so Progress charts, streaks, recap history
// and gym-owner stats all work for log-mode members with no extra code.

const SESSION_KEY_PREFIX = "mq_logsession_";
const REST_KEY = "mq_log_rest_secs";
const DAY_MS = 86400000;

function daysBetween(fromStr, toStr = localDateStr()) {
  const [y1, m1, d1] = fromStr.split("-").map(Number);
  const [y2, m2, d2] = toStr.split("-").map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DAY_MS);
}
function shortDate(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
// "6 weeks" (no "ago") -- for "It's been 6 weeks since…". Fix from live test:
// the card used to read "It's been 6 weeks ago since…".
function durationLabel(days) {
  if (days <= 1) return "a day";
  if (days < 14) return `${days} days`;
  if (days < 60) return `${Math.round(days / 7)} weeks`;
  return `${Math.round(days / 30)} months`;
}
function agoLabel(days) {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.round(days / 7)} weeks ago`;
  return `${Math.round(days / 30)} months ago`;
}

// Comeback easing (Session 53 design, tunable): under 2 weeks no change;
// 2–4 weeks off ~10% lighter; 4+ weeks off ~15% lighter. Rounded to 5 lbs.
const COMEBACK_MIN_DAYS = 14;
function comebackSuggestion(weight, gapDays) {
  if (!weight || gapDays < COMEBACK_MIN_DAYS) return null;
  const pct = gapDays >= 28 ? 0.15 : 0.10;
  const w = Math.max(5, Math.round((weight * (1 - pct)) / 5) * 5);
  return w < weight ? { weight: w, pct: Math.round(pct * 100) } : null;
}

// Every working set from the most recent PRIOR day this exercise was done
// (like sb.getLastSessionSetsForExercise() in shared.jsx, plus the date, for
// "Last time · Mon, Oct 27" and the comeback check) -- AND any sets already
// logged for it TODAY (an earlier workout, or coach mode), so a second visit
// the same day continues at the right set number instead of restarting at
// Set 1 with a stale "Welcome back" (found in live testing).
async function fetchLastSession(supabaseUserId, exerciseName) {
  try {
    const profileId = await sb.getProfileId(supabaseUserId);
    if (!profileId) return null;
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/workout_logs?user_id=eq.${profileId}&exercise_name=eq.${encodeURIComponent(exerciseName)}&set_number=gt.0&workout_date=lte.${localDateStr()}&order=workout_date.desc,set_number.asc&limit=40`,
      { headers: SB_GET() }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const today = localDateStr();
    const toSet = (r) => ({ weight: Number(r.weight) || 0, reps: Number(r.reps) || 0 });
    const todaySets = rows.filter(r => r.workout_date === today).map(toSet);
    const prior = rows.filter(r => r.workout_date !== today);
    if (prior.length === 0) return { date: null, sets: [], todaySets };
    const date = prior[0].workout_date;
    return { date, sets: prior.filter(r => r.workout_date === date).map(toSet), todaySets };
  } catch { return null; }
}

// Exercise names for the picker: the member's own recent exercises first,
// then the app's exercise list (91 active rows in the exercises table).
async function fetchExerciseNames(supabaseUserId) {
  const mine = [];
  const library = [];
  try {
    const profileId = await sb.getProfileId(supabaseUserId);
    if (profileId) {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/workout_logs?user_id=eq.${profileId}&set_number=gt.0&select=exercise_name&order=logged_at.desc&limit=400`, { headers: SB_GET() });
      const rows = res.ok ? await res.json() : [];
      (Array.isArray(rows) ? rows : []).forEach(r => { if (r.exercise_name && !mine.includes(r.exercise_name)) mine.push(r.exercise_name); });
    }
  } catch {}
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/exercises?select=name,muscle_group&is_active=eq.true&order=name.asc&limit=300`, { headers: SB_GET() });
    const rows = res.ok ? await res.json() : [];
    (Array.isArray(rows) ? rows : []).forEach(r => { if (r.name && !mine.includes(r.name)) library.push({ name: r.name, muscle: r.muscle_group || "" }); });
  } catch {}
  return { mine, library };
}

// "135 for 8", "135 by 8", "135 x 8", "8 reps", "135 pounds".
const NUM_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };
const TENS_WORDS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
function parseSpokenSet(raw) {
  let t = (raw || "").toLowerCase().replace(/,/g, " ").replace(/\b(pounds?|lbs?)\b/g, " ");
  // Speech-to-text often hears "for" as the digit 4 ("135 4 8"); drop it as a joiner first.
  t = t.replace(/\b(for|by|times|x)\b/g, " | ");
  // Tens words, including compounds: "thirty five" -> 35.
  Object.entries(TENS_WORDS).forEach(([w, n]) => {
    t = t.replace(new RegExp(`\\b${w}[\\s-]+(one|two|three|four|five|six|seven|eight|nine)\\b`, "g"), (_, u) => String(n + NUM_WORDS[u]));
    t = t.replace(new RegExp(`\\b${w}\\b`, "g"), String(n));
  });
  Object.entries(NUM_WORDS).forEach(([w, n]) => { t = t.replace(new RegExp(`\\b${w}\\b`, "g"), String(n)); });
  let nums = (t.match(/\d+(\.\d+)?/g) || []).map(Number);
  if (nums.length === 3 && nums[1] === 4) nums = [nums[0], nums[2]];
  // Weights said the gym way: "one thirty-five" -> 1, 35 -> 135; "two twenty-five" -> 225.
  if (nums.length >= 3 && nums[0] >= 1 && nums[0] <= 9 && nums[1] >= 10 && nums[1] <= 99) nums = [nums[0] * 100 + nums[1], ...nums.slice(2)];
  if (nums.length >= 2) return { weight: Math.round(nums[0]), reps: Math.round(nums[nums.length - 1]) };
  if (nums.length === 1) return /rep/.test(t) || nums[0] <= 30 ? { reps: Math.round(nums[0]) } : { weight: Math.round(nums[0]) };
  return null;
}

function newId() { return Math.random().toString(36).slice(2, 10); }

const S = {
  card: { background: "#212429", borderRadius: 14, padding: "14px 16px", marginBottom: 12 },
  label: { fontSize: 11, letterSpacing: "1.2px", fontWeight: 600, color: theme.textMuted, textTransform: "uppercase" },
  outlineBtn: { height: 44, borderRadius: 10, background: "transparent", border: "1px solid rgba(255,255,255,0.12)", color: theme.textMuted, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" },
  stepBtn: { width: 44, height: 44, borderRadius: 10, background: "#212429", border: "none", color: theme.text, fontSize: 20, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 },
  sheetWrap: { position: "fixed", inset: 0, background: "rgba(6,7,9,0.72)", zIndex: 30, display: "flex", alignItems: "flex-end", justifyContent: "center" },
  sheet: { width: "100%", maxWidth: 480, maxHeight: "85dvh", overflowY: "auto", background: "#1C1E23", borderRadius: "18px 18px 0 0", padding: "18px 16px 28px" },
};

// ── Start view: freestyle or a saved routine ─────────────────────────────
function StartView({ routines, onFreestyle, onStartRoutine, onNewRoutine, onEditRoutine, a }) {
  return (
    <div className="mq-fade" style={{ padding: "1.25rem 1.25rem 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: theme.text }}>Workout</div>
        <span style={{ fontSize: 11, fontWeight: 600, color: a, background: "#172338", borderRadius: 20, padding: "5px 10px" }}>Log mode</span>
      </div>
      <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 20 }}>Pick a routine, or just start lifting.</div>

      <button onClick={onFreestyle}
        style={{ width: "100%", background: a, color: "#0B1E3D", border: "none", borderRadius: 14, padding: 16, display: "flex", alignItems: "center", gap: 14, cursor: "pointer", textAlign: "left", marginBottom: 24, fontFamily: "inherit" }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(11,30,61,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Icon name="arrow-right" size={20} /></div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Freestyle</div>
          <div style={{ fontSize: 13, fontWeight: 500, opacity: 0.85 }}>Pick exercises as you go</div>
        </div>
      </button>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={S.label}>Your routines</div>
        <button onClick={onNewRoutine} style={{ background: "none", border: "none", color: a, fontSize: 13, fontWeight: 600, cursor: "pointer", padding: "10px 0", fontFamily: "inherit" }}>+ New routine</button>
      </div>
      {routines.length === 0 ? (
        <div style={{ ...S.card, fontSize: 13, color: theme.textMuted, lineHeight: 1.5 }}>No routines yet. Make one now, or finish a freestyle workout and save it as a routine with one tap.</div>
      ) : routines.map(r => {
        const gap = r.lastDone ? daysBetween(r.lastDone) : null;
        return (
          <div key={r.id} style={{ ...S.card, display: "flex", alignItems: "center", gap: 10, padding: "12px 12px 12px 16px", marginBottom: 8 }}>
            <button onClick={() => onEditRoutine(r)} style={{ flex: 1, background: "none", border: "none", padding: 0, textAlign: "left", cursor: "pointer", fontFamily: "inherit", minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 600, color: theme.text, marginBottom: 3 }}>{r.name}</div>
              <div style={{ fontSize: 12, color: theme.textMuted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.exercises.length} exercise{r.exercises.length === 1 ? "" : "s"} · {r.exercises.slice(0, 3).join(", ")}{r.exercises.length > 3 ? "…" : ""}</div>
              {r.lastDone && <div style={{ fontSize: 12, color: gap >= COMEBACK_MIN_DAYS ? "#F5B547" : theme.textMuted, marginTop: 2 }}>Last done {shortDate(r.lastDone)}{gap >= COMEBACK_MIN_DAYS ? ` · ${agoLabel(gap)}` : ""}</div>}
            </button>
            <button onClick={() => onStartRoutine(r)} disabled={r.exercises.length === 0}
              style={{ height: 44, padding: "0 18px", borderRadius: 10, border: "1px solid rgba(76,141,255,0.45)", background: "transparent", color: a, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>Start</button>
          </div>
        );
      })}
      {routines.length > 0 && <div style={{ fontSize: 12, color: theme.textMuted, padding: "4px 2px" }}>Tap a routine's name to edit it.</div>}
    </div>
  );
}

// ── Exercise picker sheet ────────────────────────────────────────────────
function ExercisePicker({ names, exclude = [], onPick, onClose, a }) {
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  const match = (n) => !ql || n.toLowerCase().includes(ql);
  const mine = (names?.mine || []).filter(n => match(n) && !exclude.includes(n)).slice(0, 12);
  const lib = (names?.library || []).filter(x => match(x.name) && !exclude.includes(x.name)).slice(0, 30);
  const exact = [...(names?.mine || []), ...(names?.library || []).map(x => x.name)].some(n => n.toLowerCase() === ql);
  const rowBtn = { width: "100%", minHeight: 48, background: "none", border: "none", borderBottom: "1px solid rgba(255,255,255,0.05)", textAlign: "left", padding: "10px 4px", cursor: "pointer", fontFamily: "inherit", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 };
  return (
    <div style={S.sheetWrap} onClick={onClose}>
      <div style={S.sheet} onClick={e => e.stopPropagation()} role="dialog" aria-label="Pick an exercise">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 18, fontWeight: 700, color: theme.text }}>Add an exercise</div>
          <button onClick={onClose} aria-label="Close" style={{ width: 44, height: 44, background: "none", border: "none", color: theme.textMuted, cursor: "pointer" }}><Icon name="x" size={20} /></button>
        </div>
        <label htmlFor="mq-ex-search" style={{ ...S.label, display: "block", marginBottom: 6 }}>Search or type a name</label>
        <input id="mq-ex-search" autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="e.g. Bench press"
          style={{ width: "100%", background: "#212429", border: `1.5px solid ${ql ? a : "rgba(255,255,255,0.08)"}`, borderRadius: 12, padding: "12px 14px", fontSize: 16, color: theme.text, outline: "none", fontFamily: "inherit", marginBottom: 12 }} />
        {ql && !exact && (
          <button onClick={() => onPick(q.trim().replace(/\s+/g, " ").replace(/^./, c => c.toUpperCase()))} style={{ ...rowBtn, color: a, fontSize: 15, fontWeight: 600 }}>
            <span>Add “{q.trim()}”</span><Icon name="arrow-right" size={15} />
          </button>
        )}
        {mine.length > 0 && <div style={{ ...S.label, margin: "10px 0 2px" }}>Your exercises</div>}
        {mine.map(n => <button key={n} onClick={() => onPick(n)} style={{ ...rowBtn, color: theme.text, fontSize: 15 }}><span>{n}</span></button>)}
        {lib.length > 0 && <div style={{ ...S.label, margin: "14px 0 2px" }}>All exercises</div>}
        {lib.map(x => (
          <button key={x.name} onClick={() => onPick(x.name)} style={{ ...rowBtn, color: theme.text, fontSize: 15 }}>
            <span>{x.name}</span><span style={{ fontSize: 12, color: theme.textMuted }}>{x.muscle}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Routine editor (new or existing) ─────────────────────────────────────
function RoutineEditor({ routine, names, onSave, onDelete, onCancel, a }) {
  const [name, setName] = useState(routine?.name || "");
  const [exercises, setExercises] = useState(routine?.exercises || []);
  const [picking, setPicking] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const valid = name.trim().length > 0 && exercises.length > 0;
  function move(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= exercises.length) return;
    const next = [...exercises];
    [next[i], next[j]] = [next[j], next[i]];
    setExercises(next);
  }
  return (
    <div className="mq-fade" style={{ padding: "1.25rem 1.25rem 0" }}>
      <button onClick={onCancel} style={{ background: "none", border: "none", color: theme.textMuted, fontSize: 13, cursor: "pointer", padding: "10px 0", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 6 }}><Icon name="arrow-left" size={14} />Back</button>
      <div style={{ fontSize: 22, fontWeight: 700, color: theme.text, margin: "4px 0 16px" }}>{routine ? "Edit routine" : "New routine"}</div>
      <label htmlFor="mq-routine-name" style={{ ...S.label, display: "block", marginBottom: 6 }}>Name</label>
      <input id="mq-routine-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Push Day" maxLength={40}
        style={{ width: "100%", background: "#212429", border: "1.5px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "12px 14px", fontSize: 16, color: theme.text, outline: "none", fontFamily: "inherit", marginBottom: 18 }} />
      <div style={{ ...S.label, marginBottom: 8 }}>Exercises, in order</div>
      {exercises.map((ex, i) => (
        <div key={ex + i} style={{ ...S.card, display: "flex", alignItems: "center", gap: 6, padding: "6px 6px 6px 14px", marginBottom: 6 }}>
          <div style={{ flex: 1, fontSize: 15, color: theme.text, minWidth: 0 }}>{i + 1}. {ex}</div>
          <button onClick={() => move(i, -1)} aria-label={`Move ${ex} up`} disabled={i === 0} style={{ ...S.stepBtn, background: "transparent", opacity: i === 0 ? 0.3 : 1 }}><Icon name="arrow-up" size={16} /></button>
          <button onClick={() => move(i, 1)} aria-label={`Move ${ex} down`} disabled={i === exercises.length - 1} style={{ ...S.stepBtn, background: "transparent", opacity: i === exercises.length - 1 ? 0.3 : 1 }}><Icon name="arrow-down" size={16} /></button>
          <button onClick={() => setExercises(exercises.filter((_, k) => k !== i))} aria-label={`Remove ${ex}`} style={{ ...S.stepBtn, background: "transparent", color: theme.textMuted }}><Icon name="x" size={16} /></button>
        </div>
      ))}
      <button onClick={() => setPicking(true)} style={{ ...S.outlineBtn, width: "100%", color: a, borderColor: "rgba(76,141,255,0.45)", marginBottom: 20 }}>+ Add exercise</button>
      <button onClick={() => valid && onSave({ id: routine?.id || newId(), name: name.trim(), exercises, lastDone: routine?.lastDone || null })} disabled={!valid}
        style={{ width: "100%", height: 52, borderRadius: 12, background: a, color: "#0B1E3D", border: "none", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: valid ? 1 : 0.4, marginBottom: 10 }}>Save routine</button>
      {routine && (!confirmDelete
        ? <button onClick={() => setConfirmDelete(true)} style={{ ...S.outlineBtn, width: "100%", color: theme.red, borderColor: "rgba(248,113,113,0.3)" }}>Delete routine</button>
        : <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setConfirmDelete(false)} style={{ ...S.outlineBtn, flex: 1 }}>Keep it</button>
            <button onClick={() => onDelete(routine)} style={{ ...S.outlineBtn, flex: 1, color: "#1A0000", background: theme.red, border: "none", fontWeight: 600 }}>Yes, delete</button>
          </div>)}
      <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 10, lineHeight: 1.5 }}>Deleting a routine never deletes the workouts you logged with it.</div>
      {picking && <ExercisePicker names={names} exclude={exercises} a={a} onClose={() => setPicking(false)} onPick={(n) => { setExercises([...exercises, n]); setPicking(false); }} />}
    </div>
  );
}

// ── Summary view after "Finish workout" ──────────────────────────────────
function SummaryView({ session, onSaveRoutine, onDone, a }) {
  // Only sets logged in THIS workout (not ones carried over from earlier today).
  const done = session.exercises.map(e => ({ ...e, sets: e.sets.filter(st => !st.earlier) })).filter(e => e.sets.length > 0);
  const totalSets = done.reduce((n, e) => n + e.sets.length, 0);
  const [routineName, setRoutineName] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <div className="mq-fade" style={{ padding: "1.25rem 1.25rem 0" }}>
      <div style={{ display: "flex", justifyContent: "center", color: a, margin: "12px 0 10px" }}><Icon name="trophy" size={36} /></div>
      <div style={{ fontSize: 22, fontWeight: 700, color: theme.text, textAlign: "center" }}>Workout logged</div>
      <div style={{ fontSize: 14, color: theme.textMuted, textAlign: "center", margin: "6px 0 20px" }}>{done.length} exercise{done.length === 1 ? "" : "s"} · {totalSets} set{totalSets === 1 ? "" : "s"}</div>
      {done.map(e => (
        <div key={e.name} style={{ ...S.card, padding: "12px 16px", marginBottom: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: theme.text, marginBottom: 4 }}>{e.name}</div>
          <div style={{ fontSize: 13, color: theme.textMuted }}>{e.sets.map(s => `${s.weight} × ${s.reps}`).join("  ·  ")}</div>
        </div>
      ))}
      {!session.routineId && done.length > 0 && !saved && (
        <div style={{ ...S.card, marginTop: 8 }}>
          <label htmlFor="mq-save-routine" style={{ fontSize: 15, fontWeight: 600, color: theme.text, display: "block", marginBottom: 8 }}>Save this as a routine?</label>
          <input id="mq-save-routine" value={routineName} onChange={e => setRoutineName(e.target.value)} placeholder="e.g. Push Day" maxLength={40}
            style={{ width: "100%", background: "#171920", border: "1.5px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "12px 14px", fontSize: 16, color: theme.text, outline: "none", fontFamily: "inherit", marginBottom: 10 }} />
          <button onClick={() => { if (routineName.trim()) { onSaveRoutine(routineName.trim(), done.map(e => e.name)); setSaved(true); } }} disabled={!routineName.trim()}
            style={{ ...S.outlineBtn, width: "100%", color: a, borderColor: "rgba(76,141,255,0.45)", opacity: routineName.trim() ? 1 : 0.5 }}>Save routine</button>
        </div>
      )}
      {saved && <div style={{ fontSize: 13, color: a, textAlign: "center", margin: "8px 0" }}><Icon name="check" size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />Saved to your routines</div>}
      <button onClick={onDone} style={{ width: "100%", height: 52, borderRadius: 12, background: a, color: "#0B1E3D", border: "none", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginTop: 8 }}>Done</button>
    </div>
  );
}

// ── Rest timer: only runs when tapped. Chime + vibration at the end. ─────
function useRestTimer() {
  const [endsAt, setEndsAt] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [length, setLength] = useState(() => { try { return parseInt(localStorage.getItem(REST_KEY)) || 90; } catch { return 90; } });
  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (n >= endsAt) {
        setEndsAt(null);
        try { navigator.vibrate?.([200, 100, 200]); } catch {}
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const o = ctx.createOscillator(); const g = ctx.createGain();
          o.frequency.value = 880; g.gain.value = 0.15; o.connect(g); g.connect(ctx.destination);
          o.start(); o.stop(ctx.currentTime + 0.35);
        } catch {}
      }
    }, 250);
    return () => clearInterval(t);
  }, [endsAt]);
  const remaining = endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;
  return {
    running: !!endsAt, remaining, length,
    start: () => { setNow(Date.now()); setEndsAt(Date.now() + length * 1000); },
    stop: () => setEndsAt(null),
    add: (secs) => {
      setEndsAt(e => (e ? e + secs * 1000 : e));
      const next = Math.max(30, Math.min(600, length + secs));
      setLength(next);
      try { localStorage.setItem(REST_KEY, String(next)); } catch {}
    },
  };
}

// ── Session view: logging sets for one exercise at a time ────────────────
function SessionView({ session, setSession, names, onFinish, onDiscard, a }) {
  const { user, supabaseUser } = useApp();
  const uid = supabaseUser?.id;
  const ex = session.exercises[session.idx];
  const [lastByName, setLastByName] = useState({});
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");
  const [picking, setPicking] = useState(session.exercises.length === 0);
  const [showList, setShowList] = useState(false);
  const [nudgeAnswered, setNudgeAnswered] = useState({});
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const setCardRef = useRef(null);
  const rest = useRestTimer();
  const loaded = ex ? lastByName[ex.name] : undefined; // undefined = still loading
  // null = never done before today. Today-only history behaves like "first time".
  const last = loaded === undefined ? undefined : (loaded && loaded.date ? loaded : null);

  // Load "last time" for the current exercise (cached per exercise name).
  useEffect(() => {
    if (!ex || !uid || lastByName[ex.name] !== undefined) return;
    let cancelled = false;
    fetchLastSession(uid, ex.name).then(r => { if (!cancelled) setLastByName(m => ({ ...m, [ex.name]: r })); });
    return () => { cancelled = true; };
  }, [ex?.name, uid]);

  // After each logged set, bring the next-set card to the middle of the screen,
  // clear of the floating chat button (it covered the reps "+" in live testing).
  useEffect(() => {
    if (!ex || ex.sets.length === 0) return;
    try { setCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {}
  }, [ex?.sets.length]);

  // Sets already logged for this exercise earlier TODAY count as today's sets,
  // so numbering continues (Set 4, not Set 1) and no "Welcome back" shows.
  useEffect(() => {
    if (!ex || ex.seeded || ex.sets.length > 0 || loaded === undefined) return;
    const earlier = loaded?.todaySets || [];
    updateExercise(e => ({ ...e, seeded: true, sets: e.sets.length ? e.sets : earlier.map(t => ({ ...t, status: "saved", earlier: true })) }));
  }, [ex?.name, loaded]);

  // Pre-fill weight + reps so most sets are a single tap on "Log set":
  //  - first set: last time's first set
  //  - later sets: if today's previous set MATCHED last time's same set, keep
  //    following last time (so a ramp like 130 -> 155 -> 185 carries on);
  //    otherwise (lighter comeback day, different weight) repeat today's
  //    previous set. Fix from live testing: it used to mix today's weight with
  //    last time's reps (e.g. 5 reps at a lighter weight) and ignore ramps.
  useEffect(() => {
    if (!ex) return;
    const i = ex.sets.length;
    const lastSets = last?.sets || [];
    const prevToday = ex.sets[i - 1];
    const prevLast = lastSets[i - 1];
    const lastSet = lastSets[i] || lastSets[lastSets.length - 1];
    const onTrack = prevToday && prevLast && prevToday.weight === prevLast.weight && prevToday.reps >= prevLast.reps;
    if (prevToday && onTrack && lastSets[i]) { setWeight(String(lastSets[i].weight)); setReps(String(lastSets[i].reps)); }
    else if (prevToday) { setWeight(String(prevToday.weight)); setReps(String(prevToday.reps)); }
    else if (lastSet) { setWeight(String(lastSet.weight)); setReps(String(lastSet.reps)); }
    else { setWeight(""); setReps(""); }
    setHeard("");
  }, [ex?.name, ex?.sets.length, last]);

  function updateExercise(fn) {
    setSession(s => ({ ...s, exercises: s.exercises.map((e, k) => (k === s.idx ? fn(e) : e)) }));
  }

  function saveSet(exName, setNumber, w, r) {
    return sb.insertWorkoutLog(uid, { exerciseName: exName, setNumber, reps: r, weight: w })
      .then(res => (res && res.ok ? "saved" : "failed"))
      .catch(() => "failed");
  }

  function logSet(wOverride, rOverride) {
    if (!ex || loaded === undefined) return;
    const w = Math.round(Number(wOverride ?? weight));
    const r = Math.round(Number(rOverride ?? reps));
    if (!(w >= 0) || !(r > 0)) return;
    const setNumber = ex.sets.length + 1;
    const exName = ex.name;
    updateExercise(e => ({ ...e, sets: [...e.sets, { weight: w, reps: r, status: "saving" }] }));
    try { navigator.vibrate?.(30); } catch {}
    saveSet(exName, setNumber, w, r).then(status => {
      setSession(s => ({ ...s, exercises: s.exercises.map(e => (e.name !== exName ? e : { ...e, sets: e.sets.map((st, k) => (k === setNumber - 1 ? { ...st, status } : st)) })) }));
    });
  }

  function retrySet(k) {
    const st = ex.sets[k];
    const exName = ex.name;
    updateExercise(e => ({ ...e, sets: e.sets.map((x, j) => (j === k ? { ...x, status: "saving" } : x)) }));
    saveSet(exName, k + 1, st.weight, st.reps).then(status => {
      setSession(s => ({ ...s, exercises: s.exercises.map(e => (e.name !== exName ? e : { ...e, sets: e.sets.map((x, j) => (j === k ? { ...x, status } : x)) })) }));
    });
  }

  function listen() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      const typed = window.prompt("Voice isn't supported here. Type your set, e.g. 135 for 8");
      const p = parseSpokenSet(typed);
      if (p) { if (p.weight != null) setWeight(String(p.weight)); if (p.reps != null) setReps(String(p.reps)); }
      return;
    }
    setListening(true); setHeard("");
    const rec = new SR();
    rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 3;
    rec.onresult = (e) => {
      let parsed = null; let text = "";
      for (let i = 0; i < e.results[0].length && !parsed; i++) { text = e.results[0][i].transcript; parsed = parseSpokenSet(text); }
      setListening(false);
      if (!parsed) { setHeard(`Heard “${e.results[0][0].transcript}” — try “135 for 8”, or tap Log set`); return; }
      const w = parsed.weight ?? weight;
      const r = parsed.reps ?? reps;
      if (parsed.weight != null) setWeight(String(parsed.weight));
      if (parsed.reps != null) setReps(String(parsed.reps));
      setHeard(`“${w} for ${r}”`);
      if (Number(r) > 0 && w !== "") setTimeout(() => logSet(w, r), 600);
    };
    rec.onerror = () => { setListening(false); setHeard("Didn't catch that — tap Log set instead"); };
    rec.onend = () => setListening(false);
    rec.start();
  }

  function addExercise(name) {
    setPicking(false);
    setShowList(false);
    setSession(s => {
      const existing = s.exercises.findIndex(e => e.name === name);
      if (existing >= 0) return { ...s, idx: existing };
      return { ...s, exercises: [...s.exercises, { name, sets: [] }], idx: s.exercises.length };
    });
  }

  const stepWeight = (d) => setWeight(w => String(Math.max(0, (Number(w) || 0) + d)));
  const stepReps = (d) => setReps(r => String(Math.max(1, (Number(r) || 0) + d)));
  const isLastExercise = session.idx >= session.exercises.length - 1;
  // Waits for this exercise's history (incl. today's earlier sets) to load, so
  // set numbers can't collide with sets logged earlier today.
  const canLog = Number(reps) > 0 && weight !== "" && loaded !== undefined;
  const newSetsThisSession = session.exercises.reduce((n, e) => n + e.sets.filter(st => !st.earlier).length, 0);

  // Comeback: this exercise hasn't been done in 2+ weeks.
  const gapDays = last?.date ? daysBetween(last.date) : 0;
  const isComeback = gapDays >= COMEBACK_MIN_DAYS;
  // One baseline everywhere in the nudge: last time's FIRST set (what the
  // weight field is pre-filled with). It used to say "back to 85" (heaviest
  // set) next to "Keep 80" (first set) -- found in live testing.
  const baseWeight = last?.sets?.[0]?.weight || 0;
  const suggestion = isComeback && user.nudgesEnabled && ex?.sets.length === 0 && !nudgeAnswered[ex?.name]
    ? comebackSuggestion(baseWeight, gapDays) : null;

  if (!ex) {
    return (
      <div className="mq-fade" style={{ padding: "1.25rem 1.25rem 0" }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: theme.text, marginBottom: 6 }}>{session.name}</div>
        <div style={{ fontSize: 14, color: theme.textMuted, marginBottom: 20 }}>Pick your first exercise to get started.</div>
        <button onClick={() => setPicking(true)} style={{ width: "100%", height: 52, borderRadius: 12, background: a, color: "#0B1E3D", border: "none", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Pick an exercise</button>
        {picking && <ExercisePicker names={names} a={a} onClose={() => setPicking(false)} onPick={addExercise} />}
      </div>
    );
  }

  return (
    <div className="mq-fade" style={{ padding: "1.25rem 1.25rem 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 12, color: theme.textMuted }}>{session.name} · Exercise {session.idx + 1} of {session.exercises.length}</div>
        <button onClick={() => setShowList(true)} style={{ background: "none", border: "none", color: a, fontSize: 13, fontWeight: 600, padding: "10px 0", cursor: "pointer", fontFamily: "inherit" }}>Today's list</button>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: theme.text, marginBottom: 14 }}>{ex.name}</div>

      {/* Welcome back -- shown in log mode whenever the gap is 2+ weeks */}
      {isComeback && ex.sets.length === 0 && (
        <div style={{ background: "#2A2112", borderRadius: 14, padding: "14px 16px", marginBottom: 12, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(245,181,71,0.16)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: "#F5B547" }}><Icon name="refresh" size={16} /></div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: theme.text, marginBottom: 3 }}>Welcome back!</div>
            <div style={{ fontSize: 13, color: "#D7CBB3", lineHeight: 1.45 }}>It's been {durationLabel(gapDays)} since your last {ex.name.toLowerCase()} session. Your numbers are right where you left them.</div>
          </div>
        </div>
      )}

      {/* Last time */}
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: last?.sets?.length ? 10 : 4 }}>
          <div style={S.label}>Last time</div>
          {last?.date && <div style={{ fontSize: 12, color: isComeback ? "#F5B547" : theme.textMuted, fontWeight: isComeback ? 600 : 400 }}>{shortDate(last.date)}{isComeback ? ` · ${agoLabel(gapDays)}` : ""}</div>}
        </div>
        {last === undefined && <div style={{ fontSize: 13, color: theme.textMuted }}>Loading…</div>}
        {last === null && <div style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.5 }}>First time logging this one — whatever you do today becomes your starting point.</div>}
        {last?.sets?.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(4, last.sets.length)}, minmax(0, 1fr))`, gap: 8 }}>
            {last.sets.map((s, k) => (
              <div key={k} style={{ background: "#171920", borderRadius: 10, padding: "8px 4px", textAlign: "center" }}>
                <div style={{ fontSize: 10, color: theme.textMuted, marginBottom: 2 }}>Set {k + 1}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>{s.weight} × {s.reps}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Light nudge -- only when the setting is on and before the first set */}
      {suggestion && (
        <div style={{ background: "#172338", border: "1px solid rgba(76,141,255,0.35)", borderRadius: 14, padding: "14px 16px", marginBottom: 12 }}>
          <div style={{ fontSize: 14, color: "#D7DAE0", lineHeight: 1.45, marginBottom: 12 }}>Want to ease in? Starting around <b style={{ color: theme.text }}>{suggestion.weight} lbs</b> (about {suggestion.pct}% lighter) usually gets you back to {baseWeight} within a couple of weeks.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setWeight(String(suggestion.weight)); setNudgeAnswered(m => ({ ...m, [ex.name]: true })); }}
              style={{ flex: 1, height: 44, borderRadius: 10, background: a, color: "#0B1E3D", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Use {suggestion.weight}</button>
            <button onClick={() => setNudgeAnswered(m => ({ ...m, [ex.name]: true }))}
              style={{ ...S.outlineBtn, flex: 1, color: "#D7DAE0", fontWeight: 600, fontSize: 14 }}>Keep {baseWeight}</button>
          </div>
        </div>
      )}

      {/* Today's sets so far */}
      {ex.sets.map((s, k) => {
        const ls = last?.sets?.[k];
        const beat = ls && (s.weight > ls.weight || (s.weight === ls.weight && s.reps > ls.reps));
        const matched = ls && s.weight === ls.weight && s.reps === ls.reps;
        const note = s.earlier ? "earlier today" : beat ? (s.weight > ls.weight ? `+${s.weight - ls.weight} lbs vs last time` : `+${s.reps - ls.reps} rep${s.reps - ls.reps === 1 ? "" : "s"} vs last time`) : matched ? "matched last time" : "";
        return (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 4px" }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#172338", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: a }}><Icon name="check" size={12} /></div>
            <div style={{ fontSize: 14, color: theme.textMuted }}>Set {k + 1} — <span style={{ color: theme.text, fontWeight: 600 }}>{s.weight} × {s.reps}</span></div>
            {s.status === "failed"
              ? <button onClick={() => retrySet(k)} style={{ marginLeft: "auto", background: "none", border: "none", color: theme.red, fontSize: 12, cursor: "pointer", fontFamily: "inherit", padding: "8px 0" }}>Not saved — retry</button>
              : <div style={{ marginLeft: "auto", fontSize: 12, color: beat ? a : theme.textMuted }}>{note}</div>}
          </div>
        );
      })}

      {/* Current set */}
      <div ref={setCardRef} style={{ background: "#171920", border: "1px solid rgba(76,141,255,0.35)", borderRadius: 14, padding: "14px 16px 16px", margin: "8px 0 14px" }}>
        <div style={{ ...S.label, color: a, marginBottom: 10 }}>Set {ex.sets.length + 1}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label htmlFor="mq-log-weight" style={{ fontSize: 12, color: theme.textMuted, display: "block", marginBottom: 6 }}>Weight (lbs)</label>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button onClick={() => stepWeight(-5)} aria-label="5 pounds less" style={S.stepBtn}>−</button>
              <input id="mq-log-weight" inputMode="decimal" value={weight} onChange={e => setWeight(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0"
                style={{ width: "100%", minWidth: 0, background: "transparent", border: "none", borderBottom: "1px dotted rgba(255,255,255,0.25)", color: theme.text, fontSize: 24, fontWeight: 700, textAlign: "center", outline: "none", fontFamily: "inherit", padding: "4px 0" }} />
              <button onClick={() => stepWeight(5)} aria-label="5 pounds more" style={S.stepBtn}>+</button>
            </div>
          </div>
          <div>
            <label htmlFor="mq-log-reps" style={{ fontSize: 12, color: theme.textMuted, display: "block", marginBottom: 6 }}>Reps</label>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button onClick={() => stepReps(-1)} aria-label="1 rep less" style={S.stepBtn}>−</button>
              <input id="mq-log-reps" inputMode="numeric" value={reps} onChange={e => setReps(e.target.value.replace(/\D/g, ""))} placeholder="0"
                style={{ width: "100%", minWidth: 0, background: "transparent", border: "none", borderBottom: "1px dotted rgba(255,255,255,0.25)", color: theme.text, fontSize: 24, fontWeight: 700, textAlign: "center", outline: "none", fontFamily: "inherit", padding: "4px 0" }} />
              <button onClick={() => stepReps(1)} aria-label="1 rep more" style={S.stepBtn}>+</button>
            </div>
          </div>
        </div>
        {last?.sets?.length > 0 && ex.sets.length === 0 && Number(weight) === baseWeight && <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 12 }}>Filled in from last time — change only what's different.</div>}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 6 }}>
        <button onClick={listen} aria-label="Log by voice" className={listening ? "mq-mic-pulse" : ""}
          style={{ width: 56, height: 56, borderRadius: "50%", background: a, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
          <MicIcon size={22} color="#0B1E3D" />
        </button>
        <button onClick={() => logSet()} disabled={!canLog}
          style={{ flex: 1, height: 56, borderRadius: 12, background: a, color: "#0B1E3D", border: "none", fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: canLog ? 1 : 0.4 }}>Log set</button>
      </div>
      <div style={{ fontSize: 12, color: heard ? a : theme.textMuted, textAlign: "center", marginBottom: 14, minHeight: 16 }}>{listening ? "Listening…" : heard || "Or tap the mic and say “135 for 8”"}</div>

      {/* Next/Add exercise stays visible while resting (it used to disappear --
          exactly when you'd want to move on; found in live testing). */}
      {rest.running && (
        <div style={{ ...S.card, display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: theme.textMuted }}>Rest</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: rest.remaining <= 15 ? "#F5B547" : theme.text }}>{Math.floor(rest.remaining / 60)}:{String(rest.remaining % 60).padStart(2, "0")}</div>
          </div>
          <button onClick={() => rest.add(30)} style={{ ...S.outlineBtn, padding: "0 12px" }}>+30s</button>
          <button onClick={rest.stop} style={{ ...S.outlineBtn, padding: "0 12px" }}>Skip</button>
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {!rest.running && <button onClick={rest.start} style={{ ...S.outlineBtn, flex: 1 }}>Start rest timer</button>}
        {isLastExercise
          ? <button onClick={() => setPicking(true)} style={{ ...S.outlineBtn, flex: 1 }}>+ Add exercise</button>
          : <button onClick={() => setSession(s => ({ ...s, idx: s.idx + 1 }))} style={{ ...S.outlineBtn, flex: 1 }}>Next exercise</button>}
      </div>
      {/* Finishing with nothing logged asks first instead of showing a trophy
          and "0 sets", and never marks a routine as done (live-test fix). */}
      {confirmEmpty ? (
        <div style={{ ...S.card, marginBottom: 8 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: theme.text, marginBottom: 4 }}>Nothing logged yet</div>
          <div style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.5, marginBottom: 12 }}>End this workout without saving anything?</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setConfirmEmpty(false)} style={{ ...S.outlineBtn, flex: 1 }}>Keep going</button>
            <button onClick={onDiscard} style={{ ...S.outlineBtn, flex: 1, color: a, borderColor: "rgba(76,141,255,0.45)", fontWeight: 600 }}>End workout</button>
          </div>
        </div>
      ) : (
        <button onClick={() => (newSetsThisSession > 0 ? onFinish() : setConfirmEmpty(true))} style={{ ...S.outlineBtn, width: "100%", color: a, borderColor: "rgba(76,141,255,0.45)", marginBottom: 8 }}>Finish workout</button>
      )}
      {/* Room to scroll the set card clear of the floating chat button. */}
      <div aria-hidden="true" style={{ height: 64 }} />

      {showList && (
        <div style={S.sheetWrap} onClick={() => setShowList(false)}>
          <div style={S.sheet} onClick={e => e.stopPropagation()} role="dialog" aria-label="Today's list">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: theme.text }}>Today's list</div>
              <button onClick={() => setShowList(false)} aria-label="Close" style={{ width: 44, height: 44, background: "none", border: "none", color: theme.textMuted, cursor: "pointer" }}><Icon name="x" size={20} /></button>
            </div>
            {session.exercises.map((e, k) => (
              <button key={e.name} onClick={() => { setSession(s => ({ ...s, idx: k })); setShowList(false); }}
                style={{ width: "100%", minHeight: 52, background: k === session.idx ? "#172338" : "none", border: "none", borderRadius: 10, padding: "10px 12px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontFamily: "inherit", marginBottom: 4 }}>
                <span style={{ fontSize: 15, color: k === session.idx ? a : theme.text, fontWeight: k === session.idx ? 600 : 400 }}>{e.name}</span>
                <span style={{ fontSize: 12, color: theme.textMuted }}>{e.sets.length ? `${e.sets.length} set${e.sets.length === 1 ? "" : "s"} done` : "not started"}</span>
              </button>
            ))}
            <button onClick={() => { setShowList(false); setPicking(true); }} style={{ ...S.outlineBtn, width: "100%", color: a, borderColor: "rgba(76,141,255,0.45)", marginTop: 8 }}>+ Add exercise</button>
          </div>
        </div>
      )}
      {picking && <ExercisePicker names={names} a={a} exclude={session.exercises.map(e => e.name)} onClose={() => setPicking(false)} onPick={addExercise} />}
    </div>
  );
}

// ── Main screen ──────────────────────────────────────────────────────────
function LogWorkoutScreen() {
  const { user, setUser, supabaseUser, gymBranding, navigate, loadHistoricalData } = useApp();
  const a = gymBranding.accent;
  const uid = supabaseUser?.id;
  const storeKey = SESSION_KEY_PREFIX + (uid || "anon");
  const routines = Array.isArray(user.routines) ? user.routines : [];

  // Resume today's in-progress session after a reload (gym wifi, app closed).
  const [session, setSession] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey));
      if (saved && saved.date === localDateStr() && !saved.finished) return saved;
    } catch {}
    return null;
  });
  const [view, setView] = useState(session ? "session" : "start");
  const [editing, setEditing] = useState(null); // routine being edited, or "new"
  const [names, setNames] = useState(null);

  useEffect(() => {
    try { if (session) localStorage.setItem(storeKey, JSON.stringify(session)); else localStorage.removeItem(storeKey); } catch {}
  }, [session]);
  useEffect(() => {
    if (!uid) return;
    fetchExerciseNames(uid).then(setNames).catch(() => {});
  }, [uid]);

  function saveRoutines(next) {
    setUser(prev => ({ ...prev, routines: next }));
    saveTrainingPrefs(uid, { routines: next }).catch(() => {});
  }

  function begin(routine) {
    setSession({
      date: localDateStr(),
      routineId: routine?.id || null,
      name: routine?.name || "Freestyle",
      exercises: (routine?.exercises || []).map(n => ({ name: n, sets: [] })),
      idx: 0,
    });
    setView("session");
  }

  function finish() {
    if (session?.routineId) saveRoutines(routines.map(r => (r.id === session.routineId ? { ...r, lastDone: localDateStr() } : r)));
    // Marked finished so a reload later today doesn't resume a done workout.
    setSession(s => (s ? { ...s, finished: true } : s));
    setView("summary");
  }

  function done() {
    setSession(null);
    setView("start");
    try { if (uid) loadHistoricalData?.(uid); } catch {}
    navigate("home");
  }

  let body;
  if (editing) {
    body = (
      <RoutineEditor routine={editing === "new" ? null : editing} names={names} a={a}
        onCancel={() => setEditing(null)}
        onSave={(r) => { saveRoutines(routines.some(x => x.id === r.id) ? routines.map(x => (x.id === r.id ? r : x)) : [...routines, r]); setEditing(null); }}
        onDelete={(r) => { saveRoutines(routines.filter(x => x.id !== r.id)); setEditing(null); }} />
    );
  } else if (view === "session" && session) {
    body = <SessionView session={session} setSession={setSession} names={names} onFinish={finish} a={a}
      onDiscard={() => { setSession(null); setView("start"); }} />;
  } else if (view === "summary" && session) {
    body = <SummaryView session={session} a={a} onDone={done}
      onSaveRoutine={(name, exercises) => saveRoutines([...routines, { id: newId(), name, exercises, lastDone: localDateStr() }])} />;
  } else {
    body = <StartView routines={routines} a={a} onFreestyle={() => begin(null)} onStartRoutine={begin}
      onNewRoutine={() => setEditing("new")} onEditRoutine={(r) => setEditing(r)} />;
  }

  return <Layout activeNav="workout">{body}</Layout>;
}

// Home screen card for log-mode members (replaces the coach-mode "Your next
// workout" plan card, which doesn't apply to someone running their own routine).
function LogModeHomeCard() {
  const { user, navigate, gymBranding, supabaseUser } = useApp();
  const a = gymBranding.accent;
  const routines = Array.isArray(user.routines) ? user.routines : [];
  let inProgress = false;
  try {
    const saved = JSON.parse(localStorage.getItem(SESSION_KEY_PREFIX + (supabaseUser?.id || "anon")));
    inProgress = !!(saved && saved.date === localDateStr() && !saved.finished);
  } catch {}
  return (
    <div style={{ padding: "1.25rem 1.25rem 0" }}>
      <div style={theme.sL}>Your workout</div>
      <div style={{ background: theme.surface, border: `0.5px solid ${theme.border}`, borderRadius: 16, padding: "1.1rem 1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ fontSize: 18, fontWeight: 500, color: theme.text }}>{inProgress ? "Workout in progress" : "Ready when you are"}</div>
          <span style={{ fontSize: 11, fontWeight: 600, color: a, background: "#172338", borderRadius: 20, padding: "4px 10px" }}>Log mode</span>
        </div>
        <div style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.5, marginBottom: 14 }}>
          {routines.length > 0 ? `Your routines: ${routines.slice(0, 3).map(r => r.name).join(", ")}${routines.length > 3 ? "…" : ""}` : "Freestyle or a saved routine — we'll remember what you lifted last time."}
        </div>
        <button onClick={() => navigate("workout")} style={{ width: "100%", background: a, color: "#0B1E3D", border: "none", borderRadius: 12, padding: ".85rem", fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
          {inProgress ? "Resume workout" : "Start workout"} <Icon name="arrow-right" size={15} style={{ verticalAlign: "-2px" }} />
        </button>
      </div>
    </div>
  );
}

export { LogWorkoutScreen, LogModeHomeCard, parseSpokenSet, comebackSuggestion };
