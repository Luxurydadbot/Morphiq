import { useState, useEffect, useRef } from "react";
import { useApp, sb, Pill, Spinner, MicIcon, VoiceBtn, Layout, NavIcon, Icon,
         SUPABASE_URL, SUPABASE_ANON, SB_HEADERS, SB_GET, theme,
         WORKOUT_EXERCISES, localDateStr, AppContext, buildPlan } from "./shared.jsx";

function SetDots({ total, current }) {
  const { gymBranding } = useApp();
  const a = gymBranding.accent;
  return (
    <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 10 }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: i < current ? a : i === current ? a : "#1A2332", boxShadow: i === current ? `0 0 0 3px rgba(0,212,177,0.2)` : "none", transition: "all .3s" }} />
      ))}
    </div>
  );
}

function RestRing({ secondsLeft, totalSeconds, accent, size = 100 }) {
  const r = size * 0.38;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - secondsLeft / totalSeconds);
  const isLow = secondsLeft <= 15;
  const color = isLow ? "#F59E0B" : accent;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1A2332" strokeWidth="8" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset} className="mq-ring-fill" style={{ transition: "stroke-dashoffset 1s linear, stroke .3s" }} />
    </svg>
  );
}

function AINudgeCard({ exercise, oldWeight, newWeight, onAccept, onKeep }) {
  const { gymBranding } = useApp();
  const a = gymBranding.accent;
  return (
    <div className="mq-fade" style={{ background: "#0A1628", border: `1px solid rgba(0,212,177,0.2)`, borderRadius: 14, padding: "14px 16px", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#003D35", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: a }}><Icon name="check" size={14} /></div>
        <div style={{ fontSize: 15, color: a, fontWeight: 700 }}>Your trainer noticed something</div>
      </div>
      <div style={{ fontSize: 14, color: "#9BB3C8", lineHeight: 1.6, marginBottom: 12 }}>
        You exceeded target reps both sets. Nudging weight to{" "}
        <span style={{ color: "#E8EDF2", fontWeight: 700 }}>{newWeight} lbs</span> for this set.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onKeep} style={{ flex: 1, background: "transparent", border: `1px solid rgba(255,255,255,0.12)`, borderRadius: 10, padding: "10px 4px", fontSize: 13, color: "#6B7A8D", cursor: "pointer", fontFamily: "inherit" }}>Keep {oldWeight} lbs</button>
        <button onClick={onAccept} style={{ flex: 2, background: a, border: "none", borderRadius: 10, padding: "10px 4px", fontSize: 14, color: "#003D35", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>Use {newWeight} lbs <Icon name="sparkle" size={12} /></button>
      </div>
    </div>
  );
}

// ─── SWAP ALTERNATIVES ────────────────────────────────────────────────────────
// Keyed by muscle group string — must match the muscle field in WORKOUT_EXERCISES.
// Each entry is 3 alternatives. Weight is a sensible starting default.
// ── EQUIPMENT-AWARE SWAP TABLE ─────────────────────────────────────────────
// Organized by movement pattern (squat/hinge/push/pull/accessory) then equipment.
// This ensures a barbell lifter swapping bench press never sees push-ups.
// Each entry: { name, muscle, sets, targetReps, weight }
const SWAP_BY_PATTERN = {
  squat: {
    barbell: [
      { name: "Barbell Front Squat",        muscle: "Quads / Glutes", sets: 3, targetReps: 8,  weight: 95  },
      { name: "Barbell Box Squat",           muscle: "Quads / Glutes", sets: 3, targetReps: 6,  weight: 115 },
      { name: "Barbell Pause Squat",         muscle: "Quads / Glutes", sets: 3, targetReps: 5,  weight: 110 },
      { name: "Barbell Hack Squat",          muscle: "Quads / Glutes", sets: 3, targetReps: 8,  weight: 95  },
    ],
    dumbbell: [
      { name: "Goblet Squat",               muscle: "Quads / Glutes", sets: 3, targetReps: 12, weight: 40  },
      { name: "Bulgarian Split Squat",      muscle: "Quads / Glutes", sets: 3, targetReps: 10, weight: 30  },
      { name: "Dumbbell Step-Up",           muscle: "Quads / Glutes", sets: 3, targetReps: 12, weight: 25  },
      { name: "Dumbbell Reverse Lunge",     muscle: "Quads / Glutes", sets: 3, targetReps: 10, weight: 25  },
    ],
    machine: [
      { name: "Leg Press",                  muscle: "Quads / Glutes", sets: 3, targetReps: 12, weight: 180 },
      { name: "Hack Squat Machine",         muscle: "Quads / Glutes", sets: 3, targetReps: 10, weight: 135 },
      { name: "Smith Machine Squat",        muscle: "Quads / Glutes", sets: 3, targetReps: 10, weight: 115 },
      { name: "Leg Extension",              muscle: "Quads",          sets: 3, targetReps: 15, weight: 70  },
    ],
    kettlebell: [
      { name: "Kettlebell Goblet Squat",    muscle: "Quads / Glutes", sets: 3, targetReps: 12, weight: 35  },
      { name: "Kettlebell Front Squat",     muscle: "Quads / Glutes", sets: 3, targetReps: 10, weight: 35  },
      { name: "Single-Leg Box Squat",       muscle: "Quads / Glutes", sets: 3, targetReps: 8,  weight: 0   },
    ],
    bodyweight: [
      { name: "Bulgarian Split Squat",      muscle: "Quads / Glutes", sets: 3, targetReps: 12, weight: 0   },
      { name: "Pistol Squat",               muscle: "Quads / Glutes", sets: 3, targetReps: 8,  weight: 0   },
      { name: "Step-Up",                    muscle: "Quads / Glutes", sets: 3, targetReps: 12, weight: 0   },
    ],
  },
  hinge: {
    barbell: [
      { name: "Barbell Romanian Deadlift",  muscle: "Hamstrings / Glutes", sets: 3, targetReps: 8,  weight: 135 },
      { name: "Barbell Sumo Deadlift",      muscle: "Hamstrings / Glutes", sets: 3, targetReps: 5,  weight: 185 },
      { name: "Barbell Good Morning",       muscle: "Hamstrings / Glutes", sets: 3, targetReps: 8,  weight: 65  },
      { name: "Trap Bar Deadlift",          muscle: "Hamstrings / Glutes", sets: 3, targetReps: 6,  weight: 185 },
    ],
    dumbbell: [
      { name: "Dumbbell Romanian Deadlift", muscle: "Hamstrings / Glutes", sets: 3, targetReps: 10, weight: 50  },
      { name: "Single-Leg Dumbbell RDL",    muscle: "Hamstrings / Glutes", sets: 3, targetReps: 10, weight: 35  },
      { name: "Dumbbell Hip Thrust",        muscle: "Glutes / Hamstrings", sets: 3, targetReps: 12, weight: 40  },
      { name: "Dumbbell Good Morning",      muscle: "Hamstrings",          sets: 3, targetReps: 12, weight: 25  },
    ],
    machine: [
      { name: "Cable Pull-Through",         muscle: "Hamstrings / Glutes", sets: 3, targetReps: 12, weight: 50  },
      { name: "Lying Leg Curl",             muscle: "Hamstrings",          sets: 3, targetReps: 12, weight: 55  },
      { name: "Seated Leg Curl",            muscle: "Hamstrings",          sets: 3, targetReps: 12, weight: 55  },
      { name: "Hip Thrust Machine",         muscle: "Glutes",              sets: 3, targetReps: 12, weight: 90  },
    ],
    kettlebell: [
      { name: "Kettlebell Deadlift",        muscle: "Hamstrings / Glutes", sets: 3, targetReps: 10, weight: 53  },
      { name: "Kettlebell Swing",           muscle: "Hamstrings / Glutes", sets: 3, targetReps: 15, weight: 35  },
      { name: "Single-Leg Kettlebell RDL",  muscle: "Hamstrings / Glutes", sets: 3, targetReps: 10, weight: 35  },
    ],
    bodyweight: [
      { name: "Single-Leg Hip Thrust",      muscle: "Glutes",              sets: 3, targetReps: 12, weight: 0   },
      { name: "Nordic Curl",                muscle: "Hamstrings",          sets: 3, targetReps: 6,  weight: 0   },
      { name: "Glute Bridge",               muscle: "Glutes",              sets: 3, targetReps: 15, weight: 0   },
    ],
  },
  push: {
    barbell: [
      { name: "Barbell Incline Bench Press",muscle: "Chest / Shoulders", sets: 3, targetReps: 8,  weight: 115 },
      { name: "Barbell Close-Grip Bench",   muscle: "Chest / Triceps",   sets: 3, targetReps: 8,  weight: 105 },
      { name: "Barbell Overhead Press",     muscle: "Shoulders",          sets: 3, targetReps: 8,  weight: 75  },
      { name: "Barbell Floor Press",        muscle: "Chest / Triceps",   sets: 3, targetReps: 8,  weight: 105 },
    ],
    dumbbell: [
      { name: "Dumbbell Bench Press",       muscle: "Chest",              sets: 3, targetReps: 10, weight: 45  },
      { name: "Dumbbell Incline Press",     muscle: "Chest / Shoulders",  sets: 3, targetReps: 10, weight: 35  },
      { name: "Dumbbell Shoulder Press",    muscle: "Shoulders",          sets: 3, targetReps: 10, weight: 30  },
      { name: "Dumbbell Floor Press",       muscle: "Chest / Triceps",   sets: 3, targetReps: 12, weight: 40  },
    ],
    machine: [
      { name: "Chest Press Machine",        muscle: "Chest",              sets: 3, targetReps: 12, weight: 90  },
      { name: "Cable Chest Press",          muscle: "Chest",              sets: 3, targetReps: 12, weight: 40  },
      { name: "Pec Deck",                   muscle: "Chest",              sets: 3, targetReps: 15, weight: 80  },
      { name: "Seated Shoulder Press Machine", muscle: "Shoulders",       sets: 3, targetReps: 12, weight: 70  },
    ],
    kettlebell: [
      { name: "Kettlebell Floor Press",     muscle: "Chest / Triceps",   sets: 3, targetReps: 10, weight: 35  },
      { name: "Kettlebell Overhead Press",  muscle: "Shoulders",          sets: 3, targetReps: 10, weight: 26  },
      { name: "Push-Up",                    muscle: "Chest",              sets: 3, targetReps: 15, weight: 0   },
    ],
    bodyweight: [
      { name: "Push-Up",                    muscle: "Chest",              sets: 3, targetReps: 15, weight: 0   },
      { name: "Pike Push-Up",               muscle: "Shoulders",          sets: 3, targetReps: 12, weight: 0   },
      { name: "Diamond Push-Up",            muscle: "Chest / Triceps",   sets: 3, targetReps: 12, weight: 0   },
    ],
  },
  pull: {
    barbell: [
      { name: "Barbell Pendlay Row",        muscle: "Back",               sets: 3, targetReps: 8,  weight: 115 },
      { name: "Barbell Yates Row",          muscle: "Back",               sets: 3, targetReps: 8,  weight: 135 },
      { name: "Barbell Meadows Row",        muscle: "Back",               sets: 3, targetReps: 10, weight: 65  },
      { name: "Barbell Chest-Supported Row",muscle: "Back",               sets: 3, targetReps: 8,  weight: 95  },
    ],
    dumbbell: [
      { name: "Single-Arm Dumbbell Row",    muscle: "Back",               sets: 3, targetReps: 10, weight: 50  },
      { name: "Dumbbell Seal Row",          muscle: "Back",               sets: 3, targetReps: 10, weight: 40  },
      { name: "Dumbbell Renegade Row",      muscle: "Back / Core",        sets: 3, targetReps: 8,  weight: 30  },
      { name: "Incline Dumbbell Row",       muscle: "Back",               sets: 3, targetReps: 10, weight: 35  },
    ],
    machine: [
      { name: "Seated Cable Row",           muscle: "Back",               sets: 3, targetReps: 10, weight: 70  },
      { name: "Lat Pulldown",               muscle: "Back / Biceps",      sets: 3, targetReps: 10, weight: 80  },
      { name: "Machine Row",                muscle: "Back",               sets: 3, targetReps: 12, weight: 90  },
      { name: "Assisted Pull-Up Machine",   muscle: "Back / Biceps",      sets: 3, targetReps: 10, weight: 60  },
    ],
    kettlebell: [
      { name: "Kettlebell Single-Arm Row",  muscle: "Back",               sets: 3, targetReps: 10, weight: 35  },
      { name: "Kettlebell Renegade Row",    muscle: "Back / Core",        sets: 3, targetReps: 8,  weight: 26  },
      { name: "Inverted Row",               muscle: "Back",               sets: 3, targetReps: 12, weight: 0   },
    ],
    bodyweight: [
      { name: "Pull-Up",                    muscle: "Back / Biceps",      sets: 3, targetReps: 8,  weight: 0   },
      { name: "Inverted Row",               muscle: "Back",               sets: 3, targetReps: 12, weight: 0   },
      { name: "Chin-Up",                    muscle: "Back / Biceps",      sets: 3, targetReps: 8,  weight: 0   },
    ],
  },
  accessory: {
    // Accessories are equipment-agnostic — we just show muscle-appropriate options
    biceps:    [
      { name: "Barbell Curl",    muscle: "Biceps", sets: 3, targetReps: 12, weight: 35 },
      { name: "Hammer Curl",     muscle: "Biceps", sets: 3, targetReps: 12, weight: 25 },
      { name: "Incline Curl",    muscle: "Biceps", sets: 3, targetReps: 10, weight: 20 },
    ],
    triceps:   [
      { name: "Tricep Pushdown", muscle: "Triceps", sets: 3, targetReps: 15, weight: 40 },
      { name: "Skull Crusher",   muscle: "Triceps", sets: 3, targetReps: 10, weight: 35 },
      { name: "Overhead Tricep Extension", muscle: "Triceps", sets: 3, targetReps: 12, weight: 30 },
    ],
    shoulders: [
      { name: "Lateral Raise",   muscle: "Shoulders", sets: 3, targetReps: 15, weight: 12 },
      { name: "Face Pull",       muscle: "Rear Delt",  sets: 3, targetReps: 15, weight: 30 },
      { name: "Arnold Press",    muscle: "Shoulders", sets: 3, targetReps: 10, weight: 25 },
    ],
    core:      [
      { name: "Ab Wheel Rollout",      muscle: "Core", sets: 3, targetReps: 10, weight: 0 },
      { name: "Hanging Leg Raise",     muscle: "Core", sets: 3, targetReps: 12, weight: 0 },
      { name: "Cable Crunch",          muscle: "Core", sets: 3, targetReps: 15, weight: 40 },
    ],
  },
};

// ── HELPER: get the right swap list for a given exercise ────────────────────
// Uses pattern field first (most reliable), then infers from muscle group name.
// Always respects the member's equipment setting — never recommends wrong gear.
function getSwapOptions(ex, equipment) {
  const equip = (equipment || "dumbbell").toLowerCase();
  const pattern = (ex.pattern || "").toLowerCase();
  const muscle  = (ex.muscle  || "").toLowerCase();

  // 1. Direct pattern match
  if (pattern && SWAP_BY_PATTERN[pattern]) {
    const byEquip = SWAP_BY_PATTERN[pattern][equip] || SWAP_BY_PATTERN[pattern]["dumbbell"] || [];
    // Exclude the exercise currently being swapped
    return byEquip.filter(a => a.name.toLowerCase() !== ex.name.toLowerCase());
  }

  // 2. Infer pattern from muscle group string
  const isSquat   = /quad|glute|squat|lunge|leg press/i.test(muscle);
  const isHinge   = /hamstring|hinge|deadlift|rdl|hip thrust|glute/i.test(muscle);
  const isPush    = /chest|pec|shoulder|delt|tricep|press/i.test(muscle);
  const isPull    = /back|lat|rhomboid|bicep|row|pull/i.test(muscle);

  let inferredPattern = null;
  if (isSquat)  inferredPattern = "squat";
  else if (isHinge) inferredPattern = "hinge";
  else if (isPush)  inferredPattern = "push";
  else if (isPull)  inferredPattern = "pull";

  if (inferredPattern) {
    const byEquip = SWAP_BY_PATTERN[inferredPattern][equip] || SWAP_BY_PATTERN[inferredPattern]["dumbbell"] || [];
    return byEquip.filter(a => a.name.toLowerCase() !== ex.name.toLowerCase());
  }

  // 3. Accessory fallback — check for specific small-muscle groups
  const isBicep    = /bicep|curl/i.test(muscle);
  const isTricep   = /tricep/i.test(muscle);
  const isShoulder = /shoulder|delt|lateral/i.test(muscle);
  if (isBicep)    return SWAP_BY_PATTERN.accessory.biceps;
  if (isTricep)   return SWAP_BY_PATTERN.accessory.triceps;
  if (isShoulder) return SWAP_BY_PATTERN.accessory.shoulders;

  // 4. Last resort — return general dumbbell compound options (never planks/core)
  return [
    ...(SWAP_BY_PATTERN.push.dumbbell || []),
    ...(SWAP_BY_PATTERN.pull.dumbbell || []),
  ].slice(0, 4);
}

function WorkoutScreen() {
  const { navigate, user, gymBranding, plan, supabaseUser, setWorkoutContext, pendingAISwap, setPendingAISwap, historicalData, loadHistoricalData } = useApp();
  const a = gymBranding.accent;

  // Use AI-generated exercises if available, else fall back to defaults.
  // For custom plans with multiple days, rotate by workouts-done-this-week so each
  // session shows the correct day (Day 1 → Day 2 → Day 3 → back to Day 1...).
  // Stored in state (not const) so swapping an exercise updates it live.
  const [exercises, setExercises] = useState(() => {
    // Determine which day index to use for custom multi-day plans
    let sourceExercises = plan?.exercises || WORKOUT_EXERCISES;
    if (plan?.isCustomPlan && Array.isArray(plan?.customDays) && plan.customDays.length > 1) {
      // How many workouts are done this week -- derived from real logged sets
      // (same source the home screen uses), not a local-only counter.
      try {
        const now = new Date();
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(now.getFullYear(), now.getMonth(), diff);
        const mondayStr = localDateStr(monday);
        const weeklyDone = new Set(
          (historicalData?.workoutLogs || [])
            .map((l) => l.workout_date)
            .filter((d) => d >= mondayStr)
        ).size;
        const dayIdx = weeklyDone % plan.customDays.length;
        const dayData = plan.customDays[dayIdx];
        if (dayData?.exercises?.length > 0) sourceExercises = dayData.exercises;
      } catch { /* fall back to plan.exercises */ }
    }
    return sourceExercises.map(e => ({
      name: e.name, muscle: e.muscle || "", sets: e.sets,
      targetReps: e.reps || e.targetReps, weight: e.weight,
      rpe: e.rpe || 8, alternative: e.alternative || null,
      restSeconds: e.restSeconds || null,
      warmupSets: Array.isArray(e.warmupSets) ? e.warmupSets : null, // keep ramp data; null lets the fallback compute it
    }));
  });

  // ── Mid-workout progress persistence ──────────────────────────────
  // Saves where the member is (phase, exercise, set, logged sets) to local
  // storage so closing/reopening the app resumes exactly where they left off.
  // Keyed by local date so a stale workout from a previous day is ignored and
  // they start fresh — matches what top-tier lifting apps do (silent same-day
  // auto-resume, no "resume?" modal in the common case).
  const progressKey = `morphiq_workout_progress_${supabaseUser?.id || "anon"}`;
  const savedProgress = (() => {
    try {
      const raw = localStorage.getItem(progressKey);
      if (!raw) return null;
      const p = JSON.parse(raw);
      // Only restore if it was saved TODAY (local date). Otherwise discard.
      if (p && p.date === localDateStr()) return p;
      // Stale (previous day) — clear it so it never silently reappears.
      localStorage.removeItem(progressKey);
      return null;
    } catch { return null; }
  })();

  // Workout phase: "warmup" | "active" | "cooldown"
  const warmupExercises = plan?.warmup || [];
  const cooldownExercises = plan?.cooldown || [];
  const [phase, setPhase] = useState(savedProgress?.phase ?? (warmupExercises.length > 0 ? "warmup" : "active"));
  const [warmupStep, setWarmupStep] = useState(savedProgress?.warmupStep ?? 0);
  const [cooldownStep, setCooldownStep] = useState(savedProgress?.cooldownStep ?? 0);

  const [exIdx, setExIdx] = useState(savedProgress?.exIdx ?? 0);
  const [setIdx, setSetIdx] = useState((savedProgress?.setIdx ?? 0) + (savedProgress?.state === "rest" ? 1 : 0));
  const [loggedSets, setLoggedSets] = useState(savedProgress?.loggedSets ?? []);
  const [state, setState] = useState("active");

  // Show a brief "picked up where you left off" banner ONLY when we actually
  // restored meaningful progress (not a saved-but-untouched start). This makes
  // resuming visible and intentional, so the "Start over" button can only be
  // read as its opposite. The banner fades on its own — no permanent clutter.
  const [showResumeBanner, setShowResumeBanner] = useState(
    !!(savedProgress && (savedProgress.exIdx > 0 || savedProgress.setIdx > 0 || (savedProgress.loggedSets || []).length > 0))
  );
  useEffect(() => {
    if (!showResumeBanner) return;
    const t = setTimeout(() => setShowResumeBanner(false), 4500);
    return () => clearTimeout(t);
  }, [showResumeBanner]);

  const [listening, setListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [repCount, setRepCount] = useState(null); // null = not set yet, number = user typed/adjusted

  const REST_SECS = plan?.restSeconds || 120;
  const [restSecs, setRestSecs] = useState(REST_SECS);
  const [activeRestSecs, setActiveRestSecs] = useState(REST_SECS);
  const timerRef = useRef(null);

  const [nudgedWeight, setNudgedWeight] = useState(null);
  const [showSwapSheet, setShowSwapSheet] = useState(false);  // controls the swap picker sheet
  const [swapConfirmName, setSwapConfirmName] = useState(null); // shows "Swapped in X ✓" briefly
  const [voiceSwapActive, setVoiceSwapActive] = useState(false); // mic open inside swap sheet
  const [voiceSwapHeard, setVoiceSwapHeard] = useState("");     // what the mic captured
  const [swapDbResults, setSwapDbResults] = useState(null);  // live Supabase swap alternatives (null = not loaded yet)
  const [swapDbLoading, setSwapDbLoading] = useState(false); // true while Supabase query is in flight
  const [lastLoggedReps, setLastLoggedReps] = useState(null);
  const [lastLoggedRowId, setLastLoggedRowId] = useState(null); // workout_logs row id — lets a later correction target the right row
  const [savingToCloud, setSavingToCloud] = useState(false);
  const [savedToCloud, setSavedToCloud] = useState(false);
  const [correctingReps, setCorrectingReps] = useState(false); // true while the in-app "fix it" number picker is open
  const [correctionValue, setCorrectionValue] = useState(null);
  const [correctionSaving, setCorrectionSaving] = useState(false);
  const [correctionSaved, setCorrectionSaved] = useState(false);
  const [isPR, setIsPR] = useState(false); // true when this set is a new personal record
  // "Last time" history — loaded from Supabase when exercise changes
  // null = loading, false = no history found, object = { weight, reps, date }
  const [lastSetHistory, setLastSetHistory] = useState(null);
  // TEMP DIAGNOSTIC (June 2026) — workouts stuck on "Saving..." with no visible
  // cause. Holds the specific failure reason from insertWorkoutLog so it can be
  // shown on screen instead of failing silently. Remove once the save bug is fixed.
  const [saveFailReason, setSaveFailReason] = useState(null);

  const ex = exercises[exIdx];
  const nextEx = exercises[exIdx + 1];

  // Persist progress whenever position changes, so reopening resumes here.
  // Fire-and-forget — a storage failure must never crash the workout.
  useEffect(() => {
    try {
      localStorage.setItem(progressKey, JSON.stringify({
        date: localDateStr(),
        phase, warmupStep, cooldownStep, exIdx, setIdx, loggedSets, state,
      }));
    } catch {}
  }, [phase, warmupStep, cooldownStep, exIdx, setIdx, loggedSets, state, progressKey]);

  // Clears saved progress — used when the workout finishes or the member
  // chooses to restart. Without this, a completed workout would try to resume.
  const clearProgress = () => { try { localStorage.removeItem(progressKey); } catch {} };

  // Restart: wipe saved progress and reset back to the very beginning.
  const restartWorkout = () => {
    clearProgress();
    setShowResumeBanner(false);
    setLoggedSets([]);
    setExIdx(0);
    setSetIdx(0);
    setWarmupStep(0);
    setCooldownStep(0);
    setNudgedWeight(null);
    nudgeAcceptedRef.current = false;
    setPhase(warmupExercises.length > 0 ? "warmup" : "active");
    setState("active");
  };

  // Fallback: older saved plans don't have warmupSets on each exercise.
  // Compute a ramp on the fly so existing members see warm-ups immediately,
  // without needing to regenerate their plan. Mirrors buildWarmups() in Morphiq.jsx.
  // Use stored warm-ups only if they're a non-empty array; otherwise compute
  // them on the fly (covers older saved plans and any that lost the field).
  const exWarmups = (Array.isArray(ex.warmupSets) && ex.warmupSets.length > 0)
    ? ex.warmupSets
    : (() => {
    const w = ex.weight;
    if (!w || w < 65) return [];
    const lower = /squat|deadlift|lunge|hip thrust|leg press|rdl|good morning/i.test(ex.name || "");
    const roundTo = lower ? 5 : 2.5;
    const round = (x) => Math.max(roundTo, Math.round(x / roundTo) * roundTo);
    return [0.5, 0.7, 0.85]
      .map((p, i) => ({ weight: round(w * p), reps: i === 0 ? 8 : i === 1 ? 5 : 3 }))
      .filter((s) => s.weight < w);
  })();

  // ── Combined set plan: warm-ups THEN working sets ─────────────────
  // setIdx now walks this whole list. Each entry is tagged kind:"warmup" or
  // "working" so logging, analytics, the rest timer and the UI can treat them
  // differently even though the member taps through them the same way.
  // Warm-ups are logged (so the flow is seamless) but tagged so progressive
  // overload, PBs and volume totals can exclude them.
  const workingCount = ex.sets;
  const setPlan = [
    ...exWarmups.map((ws, i) => ({
      kind: "warmup",
      weight: ws.weight,
      targetReps: ws.reps,
      label: `Warm-up ${i + 1}`,
    })),
    ...Array.from({ length: workingCount }).map((_, i) => ({
      kind: "working",
      weight: ex.weight,
      targetReps: ex.targetReps,
      label: `Working set ${i + 1}`,
    })),
  ];
  const totalSetsInPlan = setPlan.length;
  // Guard setIdx within range (older saved progress may exceed new plan length)
  const safeSetIdx = Math.min(setIdx, totalSetsInPlan - 1);
  const currentSpec = setPlan[safeSetIdx] || setPlan[setPlan.length - 1];
  const isWarmupSet = currentSpec?.kind === "warmup";
  // Working-set numbering for display (e.g. "Working set 2 of 4")
  const workingIdx = setPlan.slice(0, safeSetIdx + 1).filter(s => s.kind === "working").length;

  // Weight for the current set: warm-ups use their own weight; working sets use
  // the working weight, with any progressive-overload nudge applied.
  const currentWeight = isWarmupSet ? currentSpec.weight : (nudgedWeight ?? ex.weight);
  // Target reps for the current set (warm-up reps differ from working reps).
  const currentTargetReps = currentSpec?.targetReps ?? ex.targetReps;

  // Keep shared context updated so ChatScreen always knows exactly where we are
  useEffect(() => {
    setWorkoutContext({
      exercise: ex?.name || "Unknown exercise",
      setNumber: isWarmupSet ? `warm-up ${safeSetIdx + 1}` : workingIdx,
      totalSets: workingCount,
      targetReps: currentTargetReps,
      weight: currentWeight,
      isWarmup: isWarmupSet,
    });
    // Clear context when workout screen unmounts
    return () => setWorkoutContext(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exIdx, setIdx, currentWeight, isWarmupSet]);

  // Fetch last working set for the current exercise whenever exIdx changes.
  // This powers the "Last time: X lbs × Y reps" display below the weight card.
  // Runs silently — null while loading, false if no history, object if found.
  useEffect(() => {
    setLastSetHistory(null); // reset to loading state on exercise change
    if (!supabaseUser?.id || !ex?.name) return;
    sb.getLastSetForExercise(supabaseUser.id, ex.name)
      .then(result => setLastSetHistory(result || false))
      .catch(() => setLastSetHistory(false));
  }, [exIdx, ex?.name, supabaseUser?.id]);

  const restStartRef = useRef(null);
  const activeRestSecsRef = useRef(activeRestSecs);

  useEffect(() => {
    if (state === "rest") {
      // Record the exact wall-clock time rest started
      restStartRef.current = Date.now();
      // Warm-up sets get a short rest (they're not fatiguing); working sets use
      // the plan's full rest. isWarmupSet reflects the set just completed here.
      const newRestSecs = isWarmupSet ? 30 : (plan?.restSeconds || 120);
      setActiveRestSecs(newRestSecs);
      activeRestSecsRef.current = newRestSecs;
      setRestSecs(newRestSecs);
      // Poll every 500ms — uses real elapsed time so screen sleep doesn't break it
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - restStartRef.current) / 1000);
        const remaining = activeRestSecsRef.current - elapsed;
        if (remaining <= 0) {
          clearInterval(timerRef.current);
          setRestSecs(0);
          advanceSet();
        } else {
          setRestSecs(remaining);
        }
      }, 500);
    }
    return () => clearInterval(timerRef.current);
  }, [state]);

  function goToRestOrNudge() {
    const allLogs = loggedSetsRef.current;
    // Only WORKING sets count toward progressive overload — warm-ups are excluded.
    const workingSetsForEx = allLogs.filter(l => l.exIdx === exIdx && l.kind === "working");
    const exceededCount = workingSetsForEx.filter(l => l.reps > (ex.targetReps || 10)).length;
    // "Last set" = last entry in the whole plan (warm-ups + working)
    const isLastSet = safeSetIdx >= totalSetsInPlan - 1;
    const increment = plan?.progressionRule?.weightIncrementLbs || 5;
    // Never nudge on a warm-up. Trigger only when 2+ working sets beat target.
    if (!isWarmupSet && exceededCount >= 2 && !isLastSet && !nudgeAcceptedRef.current) {
      setNudgedWeight((nudgedWeight ?? ex.weight) + increment);
      setState("nudge");
    } else {
      // Seed the rest ring's numbers here, in the same tick as the state
      // change, so the very first frame of the rest screen already shows
      // the correct countdown. Previously these were only set in a useEffect
      // that ran a moment AFTER the rest screen first rendered, so the ring
      // would briefly flash whatever numbers were left over from the last
      // rest period before snapping to the right ones — that flash is what
      // made the ring look like it had no relationship to the real time.
      const newRestSecs = isWarmupSet ? 30 : (plan?.restSeconds || 120);
      restStartRef.current = Date.now();
      activeRestSecsRef.current = newRestSecs;
      setActiveRestSecs(newRestSecs);
      setRestSecs(newRestSecs);
      setState("rest");
    }
  }

  const loggedSetsRef = useRef(loggedSets);
  useEffect(() => { loggedSetsRef.current = loggedSets; }, [loggedSets]);
  // Tracks whether the overload nudge was accepted for this exercise — prevents double-nudging
  const nudgeAcceptedRef = useRef(false);

  function logSet(reps = currentTargetReps + 1) {
    setIsPR(false); // reset before each set — new PR check will re-set if needed
    setLastLoggedRowId(null); // reset until the new row's id comes back, so a correction can't accidentally target the previous set
    const entry = { exIdx, setIdx: safeSetIdx, reps, weight: currentWeight, kind: currentSpec.kind };
    const newLogs = [...loggedSets, entry];
    setLoggedSets(newLogs);
    loggedSetsRef.current = newLogs;
    setLastLoggedReps(reps);
    setVoiceTranscript("");
    setListening(false);

    // Persist to Supabase workout_logs (fire-and-forget).
    // Warm-ups are tagged in set_number as a negative-style marker so analytics
    // can exclude them: working sets keep their 1..N number, warm-ups send 0.
    if (supabaseUser?.id) {
      setSavingToCloud(true);
      setSavedToCloud(false);
      setSaveFailReason(null);
      sb.insertWorkoutLog(supabaseUser.id, {
        exerciseName: ex.name,
        setNumber: currentSpec.kind === "warmup" ? 0 : workingIdx,
        reps,
        weight: currentWeight,
      }).then(result => {
        setSavingToCloud(false);
        const ok = result?.ok === true;
        setSavedToCloud(ok);
        if (ok) {
          setLastLoggedRowId(result.id);
          setTimeout(() => setSavedToCloud(false), 3000);
        } else {
          setSaveFailReason(result?.reason || "UNKNOWN");
        }
        // PR check: only for working sets (not warm-ups) with a real weight value
        if (ok && currentSpec.kind !== "warmup" && currentWeight > 0) {
          sb.getPersonalRecord(supabaseUser.id, ex.name).then(prevBest => {
            // If no previous record exists OR current weight beats it → it's a PR
            if (prevBest === null || currentWeight > prevBest) setIsPR(true);
          }).catch(() => {});
        }
      }).catch((e) => { setSavingToCloud(false); setSaveFailReason("THROW:" + (e?.message || e)); });
    }

    // Go straight to rest — no separate confirmation screen (avoids a
    // double-countdown: this used to wait 3s here, then start the rest
    // timer on the next screen. Now rest starts immediately; the "fix it"
    // correction and PR banner live inside the rest screen instead.)
    goToRestOrNudge();
  }

  function advanceSet() {
    setRepCount(null);
    if (safeSetIdx < totalSetsInPlan - 1) {
      // Same exercise, next set in the plan (warm-up or working) — keep nudge
      setSetIdx(safeSetIdx + 1);
      setState("active");
    } else if (exIdx < exercises.length - 1) {
      // New exercise — clear nudge state, restart the plan at set 0
      setNudgedWeight(null);
      nudgeAcceptedRef.current = false;
      setExIdx(i => i + 1);
      setSetIdx(0);
      setState("active");
    } else {
      setState("done");
    }
  }

  function skipRest() {
    clearInterval(timerRef.current);
    advanceSet();
  }

    // Called once when the workout is fully complete (exercises done + cool-down done).
  // The weekly count now comes straight from logged sets in the database
  // (see historicalData.workoutLogs), not a local-only counter -- so just
  // refresh that data here so the home screen (and the day-picker above)
  // reflect this session right away, instead of waiting for the next
  // sign-in/resume to catch up.
  function recordWorkoutComplete() {
    try { if (supabaseUser?.id) loadHistoricalData(supabaseUser.id); } catch {}
    // Workout is finished — clear the in-progress save so it won't resume.
    clearProgress();
  }

  // Called when member picks an alternative from the swap sheet.
  // Replaces the current exercise in the exercises array and resets the set counter.
  function doSwap(alt) {
    setExercises(prev => {
      const next = [...prev];
      next[exIdx] = { ...alt };  // replace only this exercise; rest of workout unchanged
      return next;
    });
    setSetIdx(0);
    setNudgedWeight(null);
    setRepCount(null);
    setState("active");
    setShowSwapSheet(false);
    // Show a brief "Swapped in X ✓" confirmation banner for 2.5 seconds
    setSwapConfirmName(alt.name);
    setTimeout(() => setSwapConfirmName(null), 5000);
  }

  // Muscle groups that load each injury area.
  // Used by bulk swaps to identify which remaining exercises need replacing.
  const INJURY_MUSCLES = {
    back:     /back|lat|rhomboid|row|deadlift|rdl|hinge|spine|erector/i,
    knee:     /quad|glute|squat|lunge|leg press|step.up|hamstring/i,
    shoulder: /shoulder|delt|overhead|press|rotator|trap/i,
    wrist:    /wrist|curl|grip|barbell/i,
  };

  // Safe bodyweight replacements keyed by muscle pattern
  const BW_SWAP = {
    squat:  { name: "Bodyweight Squat",    muscle: "Quads / Glutes", sets: 3, targetReps: 15, weight: 0 },
    hinge:  { name: "Glute Bridge",        muscle: "Glutes / Hamstrings", sets: 3, targetReps: 15, weight: 0 },
    push:   { name: "Push-Up",             muscle: "Chest",          sets: 3, targetReps: 12, weight: 0 },
    pull:   { name: "Inverted Row",        muscle: "Back",           sets: 3, targetReps: 10, weight: 0 },
    core:   { name: "Plank",               muscle: "Core",           sets: 3, targetReps: 30, weight: 0 },
    legs:   { name: "Reverse Lunge",       muscle: "Quads / Glutes", sets: 3, targetReps: 12, weight: 0 },
  };

  function getBWSwap(ex) {
    const m = (ex.muscle || "").toLowerCase();
    const n = (ex.name || "").toLowerCase();
    if (/quad|glute|squat|lunge|leg press/i.test(m + n)) return { ...BW_SWAP.squat };
    if (/hamstring|hinge|deadlift|rdl|hip thrust/i.test(m + n)) return { ...BW_SWAP.hinge };
    if (/chest|pec|tricep|press/i.test(m + n)) return { ...BW_SWAP.push };
    if (/back|lat|row|bicep/i.test(m + n)) return { ...BW_SWAP.pull };
    if (/core|abs|plank/i.test(m + n)) return { ...BW_SWAP.core };
    return { ...BW_SWAP.core }; // safe fallback
  }

  // When the AI chat sends a swap action, pendingAISwap is set in AppContext.
  // Single swap: apply to current exercise only.
  // Bulk swap: apply to current + all remaining exercises that match the criteria.
  useEffect(() => {
    if (!pendingAISwap) return;

    if (!pendingAISwap._bulk) {
      // Simple single-exercise swap — existing behaviour unchanged
      doSwap(pendingAISwap);
      setPendingAISwap(null);
      return;
    }

    // ── BULK SWAP ─────────────────────────────────────────────────────────
    const { _type, area, minutes } = pendingAISwap;

    setExercises(prev => {
      const next = [...prev];

      if (_type === "injury" && area && INJURY_MUSCLES[area]) {
        // Replace every exercise from current position onward that loads the injured area
        for (let i = exIdx; i < next.length; i++) {
          const muscle = (next[i].muscle || "").toLowerCase();
          const name   = (next[i].name   || "").toLowerCase();
          if (INJURY_MUSCLES[area].test(muscle + " " + name)) {
            // Use the safest swap from getSwapOptions — first result that
            // avoids the injury area. Fall back to plank if nothing found.
            const opts = getSwapOptions(next[i], user?.equipment)
              .filter(o => !INJURY_MUSCLES[area].test((o.muscle || "").toLowerCase() + " " + (o.name || "").toLowerCase()));
            const replacement = opts[0] || { name: "Plank", muscle: "Core", sets: next[i].sets, targetReps: 30, weight: 0 };
            next[i] = { ...replacement, sets: next[i].sets, rpe: 6, alternative: null, warmupSets: null };
          }
        }
      } else if (_type === "bodyweight") {
        // Replace every remaining exercise with its bodyweight equivalent
        for (let i = exIdx; i < next.length; i++) {
          const bw = getBWSwap(next[i]);
          next[i] = { ...bw, sets: next[i].sets, rpe: 7, alternative: null, warmupSets: null };
        }
      } else if (_type === "trim" && minutes) {
        // Remove enough exercises from the end to fit within the time budget.
        // Rough estimate: each exercise takes ~5 minutes (3 sets × 45s work + 90s rest).
        const minsPerEx = 5;
        const canFit = Math.max(1, Math.floor(minutes / minsPerEx));
        // Only cut exercises AFTER the current one — never remove what's in progress
        const remaining = next.length - exIdx;
        if (remaining > canFit) {
          next.splice(exIdx + canFit); // remove from end
        }
      }

      return next;
    });

    // Reset set counter — the exercise at exIdx may have changed
    setSetIdx(0);
    setNudgedWeight(null);
    setRepCount(null);
    setPendingAISwap(null);
    // Show confirmation banner so member knows the AI swap happened
    const swapLabel = _type === "injury" ? `${area} exercises swapped out`
      : _type === "bodyweight" ? "Switched to bodyweight"
      : _type === "trim" ? `Workout trimmed to ~${minutes} min`
      : "Exercises updated";
    setSwapConfirmName(swapLabel);
    setTimeout(() => setSwapConfirmName(null), 5000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAISwap]);

  // ── Fetch swap alternatives from Supabase when the swap sheet opens ────────
  // Queries exercises table for same pattern + equipment, excludes current exercise.
  // Falls back to hardcoded getSwapOptions() if Supabase returns nothing.
  useEffect(() => {
    if (!showSwapSheet) { setSwapDbResults(null); return; }
    const pattern = (ex?.pattern || "").toLowerCase();
    const equip   = (user?.equipment || "dumbbell").toLowerCase();
    if (!pattern || pattern === "custom") {
      // Custom exercises have no pattern in the DB — skip the query, use fallback
      setSwapDbResults(null);
      return;
    }
    setSwapDbLoading(true);
    const encoded = encodeURIComponent(ex.name);
    const url = `${SUPABASE_URL}/rest/v1/exercises?select=name,muscle_group,pattern,equipment,difficulty`
      + `&is_active=eq.true`
      + `&pattern=eq.${encodeURIComponent(pattern)}`
      + `&name=neq.${encoded}`
      + `&limit=6`;
    fetch(url, { headers: SB_HEADERS })
      .then(r => r.json())
      .then(rows => {
        if (!Array.isArray(rows) || rows.length === 0) {
          setSwapDbResults(null); // trigger fallback
          return;
        }
        // Filter to matching equipment first; if that leaves fewer than 2, include all
        const equipMatches = rows.filter(r =>
          (r.equipment || "").toLowerCase() === equip
        );
        const finalRows = equipMatches.length >= 2 ? equipMatches : rows;
        // Shape into the same format doSwap() expects
        setSwapDbResults(finalRows.map(r => ({
          name:       r.name,
          muscle:     r.muscle_group,
          pattern:    r.pattern,
          sets:       ex.sets,
          targetReps: ex.targetReps,
          weight:     ex.weight,  // keep current weight — member has context
          rpe:        ex.rpe,
          alternative: null,
        })));
      })
      .catch(() => setSwapDbResults(null)) // silent fallback on network error
      .finally(() => setSwapDbLoading(false));
  }, [showSwapSheet]);

  function simulateListen() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      const typed = window.prompt("Voice not supported. How many reps did you do?");
      const n = parseInt(typed);
      if (n > 0 && n < 100) { setVoiceTranscript('"' + n + ' reps"'); setTimeout(() => logSet(n), 600); }
      return;
    }
    setListening(true);
    setVoiceTranscript("");
    const rec = new SpeechRecognition();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 3;
    rec.onresult = (e) => {
      let reps = null;
      for (let i = 0; i < e.results[0].length; i++) {
        const text = e.results[0][i].transcript.toLowerCase().trim();
        const words = {one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20};
        const numMatch = text.match(/\d+/);
        if (numMatch) { reps = parseInt(numMatch[0]); break; }
        for (const [word, val] of Object.entries(words)) {
          if (text.includes(word)) { reps = val; break; }
        }
        if (reps) break;
      }
      if (reps && reps > 0 && reps < 100) {
        setVoiceTranscript('"' + reps + ' reps"');
        setRepCount(reps);
        setListening(false);
        setTimeout(() => logSet(reps), 600);
      } else {
        const heard = e.results[0][0].transcript;
        setVoiceTranscript('Heard: "' + heard + '" — tap Log ✓ for ' + ex.targetReps + ' reps');
        setListening(false);
      }
    };
    rec.onerror = () => { setListening(false); setVoiceTranscript("Didn't catch that — tap Log ✓ to log your reps"); };
    rec.onend = () => setListening(false);
    rec.start();
  }

  // Voice swap — captures a free-form exercise name instead of a rep count.
  // Member says anything: "cable flyes", "Smith machine squat", "there's a free leg press".
  // We clean up the transcript and use whatever real exercise name we can extract.
  function listenForSwap() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      // Fallback: plain text prompt for browsers without mic support
      const typed = window.prompt("Type the exercise name:");
      if (typed && typed.trim().length > 1) {
        const name = typed.trim();
        setVoiceSwapHeard(name);
        doSwap({ name, muscle: ex.muscle, pattern: ex.pattern, sets: ex.sets, targetReps: ex.targetReps, weight: ex.weight, rpe: ex.rpe, alternative: null });
        setShowSwapSheet(false);
        setVoiceSwapActive(false);
        setVoiceSwapHeard("");
      }
      return;
    }
    setVoiceSwapActive(true);
    setVoiceSwapHeard("");
    const rec = new SpeechRecognition();
    rec.lang = "en-US";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => {
      const raw = e.results[0][0].transcript.trim();
      // Strip filler phrases so "I'll do cable flyes" → "cable flyes"
      const cleaned = raw
        .replace(/^(I('ll| will| want to| want)?( do| try| use)?|let('s| me)( do| try)?|switch to|swap to|how about|can I do|I'm going to do)\s+/i, "")
        .replace(/\s*(instead|please|now|next)\s*$/i, "")
        .trim();
      const name = cleaned.length > 1 ? cleaned : raw;
      // Capitalize first letter of each word for clean display
      const titleCase = name.replace(/\b\w/g, c => c.toUpperCase());
      setVoiceSwapHeard(titleCase);
    };
    rec.onerror = () => {
      setVoiceSwapActive(false);
      setVoiceSwapHeard("");
    };
    rec.onend = () => {
      // onresult fires before onend, so voiceSwapHeard is already set
      // We don't auto-confirm — we show what was heard and let them tap Confirm
      setVoiceSwapActive(false);
    };
    rec.start();
  }

  const card = { background: "#1A2332", borderRadius: 12, padding: "10px 12px", marginBottom: 8 };
  const totalCompleted = loggedSets.filter(l => l.exIdx === exIdx && l.kind !== "warmup").length;

  // ── WARM-UP PHASE ──────────────────────────────────────────────────────────
  if (phase === "warmup") {
    const currentWarmup = warmupExercises[warmupStep];
    const isLastWarmup = warmupStep >= warmupExercises.length - 1;

    return (
      <Layout activeNav="workout" chatTarget="chat_workout">
        <div className="mq-fade" style={{ padding: "1.5rem 1.25rem 0", display: "flex", flexDirection: "column", flex: 1 }}>

          {/* Header */}
          <div style={{ textAlign: "center", marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: a, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 4 }}>Warm-up · {warmupStep + 1} of {warmupExercises.length}</div>
            <div style={{ fontSize: 13, color: theme.textDim }}>A few minutes before your workout</div>
          </div>

          {/* Progress bar */}
          <div style={{ height: 4, background: "#1A2332", borderRadius: 2, marginBottom: 24 }}>
            <div style={{ height: 4, borderRadius: 2, background: a, width: `${Math.round(((warmupStep + 1) / warmupExercises.length) * 100)}%`, transition: "width .4s" }} />
          </div>

          {/* Exercise name + duration */}
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "center", color: a }}><Icon name="flame" size={42} /></div>
            <div style={{ fontSize: 34, fontWeight: 700, color: theme.text, lineHeight: 1.2, marginTop: 10 }}>{currentWarmup?.name}</div>
            <div style={{ fontSize: 22, color: a, fontWeight: 600, marginTop: 8 }}>{currentWarmup?.duration}</div>
          </div>

          {/* How to do it — plain language description from the plan */}
          {currentWarmup?.description && (
            <div style={{ background: "#0A1628", border: "1px solid rgba(0,212,177,0.2)", borderRadius: 14, padding: "1.1rem 1.25rem", marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 8, fontWeight: 600 }}>How to do it</div>
              <div style={{ fontSize: 16, color: "#D8E4E0", lineHeight: 1.7 }}>{currentWarmup.description}</div>
            </div>
          )}

          {/* Why it matters — always visible */}
          <div style={{ background: "#111827", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, padding: "1rem 1.25rem", marginBottom: 14 }}>
            <div style={{ fontSize: 15, color: "#8A9EAD", lineHeight: 1.65 }}>
              Take your time. A proper warm-up <span style={{ color: a, fontWeight: 600 }}>reduces your injury risk</span> and <span style={{ color: a, fontWeight: 600 }}>makes every working set feel better</span>.
            </div>
          </div>

          {/* Buttons */}
          <div style={{ marginTop: "auto", paddingBottom: "1rem", display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => {
              if (isLastWarmup) { setPhase("active"); }
              else { setWarmupStep(s => s + 1); }
            }} style={{ width: "100%", background: a, color: "#003D35", border: "none", borderRadius: 14, padding: "1rem", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {isLastWarmup ? <>Start workout <Icon name="arrow-right" size={15} style={{ verticalAlign: "-2px", marginLeft: 3 }} /></> : <>Done — next <Icon name="arrow-right" size={15} style={{ verticalAlign: "-2px", marginLeft: 3 }} /></>}
            </button>
            <button onClick={() => setPhase("active")} style={{ width: "100%", background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "10px", fontSize: 13, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>
              Skip warm-up
            </button>
          </div>

        </div>
      </Layout>
    );
  }

  // ── COOL-DOWN PHASE ─────────────────────────────────────────────────────────
  if (phase === "cooldown") {
    const currentCooldown = cooldownExercises[cooldownStep];
    const isLastCooldown = cooldownStep >= cooldownExercises.length - 1;
    const totalSets = loggedSets.length;
    const totalVol = loggedSets.reduce((acc, l) => acc + l.reps * l.weight, 0);
    return (
      <Layout activeNav="workout" chatTarget="chat_workout">
        <div className="mq-fade" style={{ padding: "1.5rem 1.25rem 0", display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ textAlign: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: a, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 4 }}>Cool-down · {cooldownStep + 1} of {cooldownExercises.length}</div>
            <div style={{ fontSize: 13, color: theme.textDim }}>5 minutes to recover properly</div>
          </div>
          <div style={{ background: "#1A2332", borderRadius: 12, padding: "10px 14px", marginBottom: 14, display: "flex", justifyContent: "space-around" }}>
            <div style={{ textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 700, color: a }}>{totalSets}</div><div style={{ fontSize: 11, color: theme.textDim }}>Sets done</div></div>
            <div style={{ textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 700, color: a }}>{totalVol.toLocaleString()}</div><div style={{ fontSize: 11, color: theme.textDim }}>lbs volume</div></div>
          </div>
          <div style={{ height: 4, background: "#1A2332", borderRadius: 2, marginBottom: 16 }}>
            <div style={{ height: 4, borderRadius: 2, background: a, width: `${Math.round(((cooldownStep + 1) / cooldownExercises.length) * 100)}%`, transition: "width .4s" }} />
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "center", color: a }}><Icon name="meditate" size={40} /></div>
            <div style={{ fontSize: 32, fontWeight: 700, color: theme.text, lineHeight: 1.2 }}>{currentCooldown?.name}</div>
            <div style={{ fontSize: 18, color: a, fontWeight: 500 }}>{currentCooldown?.duration}</div>
          </div>
          <div style={{ paddingBottom: "1rem", display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => {
              if (isLastCooldown) { setPhase("complete"); setState("done"); }
              else { setCooldownStep(s => s + 1); }
            }} style={{ width: "100%", background: a, color: "#003D35", border: "none", borderRadius: 14, padding: "1rem", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {isLastCooldown ? <>Finish workout <Icon name="check" size={15} style={{ verticalAlign: "-2px", marginLeft: 3 }} /></> : <>Done — next <Icon name="arrow-right" size={15} style={{ verticalAlign: "-2px", marginLeft: 3 }} /></>}
            </button>
            <button onClick={() => setState("done")} style={{ width: "100%", background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: "10px", fontSize: 13, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>
              Skip cool-down
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  if (state === "done") {
    // If cool-down exercises exist and we have not done them yet, go there first.
    // This replaces the old setTimeout hack — clean phase transition, no flicker.
    // Only redirect to cooldown if we haven't done it yet (phase is still 'active')
    // If phase is 'complete' or 'cooldown', fall through to the completion screen
    if (cooldownExercises.length > 0 && phase === "active") {
      setPhase("cooldown");
      return null; // render nothing for one tick while phase updates
    }

    // Workout is truly complete (exercises done + cool-down done or skipped).
    // Record to localStorage so home screen streak updates immediately.
    const totalSets = loggedSets.length;
    const totalVol = loggedSets.reduce((acc, l) => acc + l.reps * l.weight, 0);
    const overloadApplied = nudgeAcceptedRef.current;

    return (
      <Layout activeNav="workout" chatTarget="chat_workout">
        <div className="mq-fade" style={{ padding: "2rem 1.25rem 0", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ marginBottom: 12, color: "#F59E0B" }}><Icon name="trophy" size={36} /></div>
          <div style={{ fontSize: 22, fontWeight: 700, color: theme.text, marginBottom: 4 }}>Workout complete!</div>
          <div style={{ fontSize: 14, color: theme.textDim, marginBottom: "1.5rem" }}>Great work, {user.name || "champ"}. Recovery starts now.</div>
          {/* Big stats grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%", marginBottom: 12 }}>
            {[
              ["Sets completed", totalSets],
              ["Total volume", `${totalVol.toLocaleString()} lbs`],
              ["Exercises", exercises.length],
              ["Sets per exercise", totalSets > 0 && exercises.length > 0 ? (totalSets / exercises.length).toFixed(1) : "—"],
            ].map(([l, v]) => (
              <div key={l} style={{ background: theme.surface, border: `0.5px solid ${theme.border}`, borderRadius: 12, padding: ".85rem .75rem" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: a }}>{v}</div>
                <div style={{ fontSize: 11, color: theme.textDim, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>

          {/* Per-exercise breakdown */}
          <div style={{ width: "100%", background: "#0D1623", borderRadius: 12, padding: "10px 14px", marginBottom: overloadApplied ? 10 : "1.5rem" }}>
            <div style={{ fontSize: 9, color: theme.textDim, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>Exercise breakdown</div>
            {exercises.map((ex, i) => {
              const exSets = loggedSets.filter(l => l.exerciseName === ex.name);
              const bestReps = exSets.length > 0 ? Math.max(...exSets.map(l => l.reps)) : 0;
              const totalExVol = exSets.reduce((acc, l) => acc + l.reps * l.weight, 0);
              return (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: 6, marginBottom: 6, borderBottom: i < exercises.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: theme.text }}>{ex.name}</div>
                    <div style={{ fontSize: 10, color: theme.textDim, marginTop: 1 }}>{exSets.length} sets · best {bestReps} reps</div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: a }}>{totalExVol > 0 ? `${totalExVol.toLocaleString()} lbs` : "—"}</div>
                </div>
              );
            })}
          </div>
          {overloadApplied && (
            <div style={{ width: "100%", background: "#1A1200", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 12, padding: "10px 14px", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ color: "#F59E0B" }}><Icon name="bolt" size={20} /></div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#F59E0B" }}>Progressive overload applied</div>
                <div style={{ fontSize: 11, color: theme.textDim, marginTop: 1 }}>Hypergentiq nudged your weight up this session — you're getting stronger.</div>
              </div>
            </div>
          )}
          <button onClick={() => { recordWorkoutComplete(); navigate("home"); }} style={{ width: "100%", background: a, color: "#003D35", border: "none", borderRadius: 14, padding: "1rem", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>Back to dashboard <Icon name="arrow-right" size={15} /></button>
        </div>
      </Layout>
    );
  }

  if (state === "rest") {
    const RING_SIZE = 220;
    const wasSkipped = lastLoggedReps === 0;
    return (
      <Layout activeNav="workout" chatTarget="chat_workout">
        <div className="mq-fade" style={{ padding: "1rem 1.25rem 0", display: "flex", flexDirection: "column", flex: 1 }}>

          {/* Status label */}
          <div style={{ textAlign: "center", fontSize: 10, color: theme.textDim, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 4 }}>Rest</div>

          {/* Logged confirmation strip */}
          <div style={{ background: wasSkipped ? "#1A1A0A" : "#003D35", borderRadius: 8, padding: "6px 10px", fontSize: 12, color: wasSkipped ? theme.amber : a, textAlign: "center", marginBottom: 4 }}>
            {wasSkipped
              ? <><Icon name="arrow-right" size={12} style={{ verticalAlign: "-1px", marginRight: 3 }} /> Set skipped</>
              : <><Icon name="check" size={12} style={{ verticalAlign: "-1px", marginRight: 3 }} /> Logged — {loggedSets[loggedSets.length - 1]?.reps} reps at {loggedSets[loggedSets.length - 1]?.weight} lbs</>}
          </div>

          {/* Cloud save status — merged in from the old separate confirm
              screen so there's only one countdown (this rest timer), not a
              3-second one followed by the real one. Only shows text while
              something is actually happening or just finished — previously
              this fell back to a permanent "Saving..." message even long
              after the save had already succeeded, which looked like it was
              stuck. */}
          {!wasSkipped && (savingToCloud || savedToCloud || saveFailReason) && (
            <div style={{ textAlign: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: savingToCloud ? theme.textDim : a }}>
                <Icon name="cloud" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} /> {savingToCloud ? "Saving to account..." : "Saved to account"}{!savingToCloud && <Icon name="check" size={10} style={{ verticalAlign: "-1px", marginLeft: 3 }} />}
              </div>
              {saveFailReason && (
                <div style={{ fontSize: 10, color: theme.amber || "#F59E0B", marginTop: 2 }}>
                  <Icon name="cloud" size={10} style={{ verticalAlign: "-1px", marginRight: 3 }} /> Save failed: {saveFailReason}
                </div>
              )}
            </div>
          )}

          {/* PR celebration banner — compact, sits above the rest ring */}
          {isPR && !wasSkipped && (
            <div className="mq-fade" style={{ background: "linear-gradient(135deg, #2D1A00 0%, #1A1200 100%)", border: "2px solid #F59E0B", borderRadius: 14, padding: "10px 16px", width: "100%", textAlign: "center", boxShadow: "0 0 30px rgba(245,158,11,0.2)", marginBottom: 12 }}>
              <span style={{ marginRight: 6, color: "#F59E0B", verticalAlign: "-3px", display: "inline-block" }}><Icon name="trophy" size={18} /></span>
              <span style={{ fontSize: 14, fontWeight: 700, color: "#F59E0B" }}>New personal record!</span>
              <span style={{ fontSize: 13, color: "#E8C97A", marginLeft: 6 }}>{currentWeight} lbs on {ex.name}</span>
            </div>
          )}

          {/* Big ring + countdown number */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16, position: "relative" }}>
            <RestRing secondsLeft={restSecs} totalSeconds={activeRestSecs} accent={a} size={RING_SIZE} />
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
              <div style={{ fontSize: 80, fontWeight: 700, color: restSecs <= 15 ? theme.amber : theme.text, lineHeight: 1, transition: "color 0.3s" }}>{restSecs}</div>
              <div style={{ fontSize: 13, color: theme.textDim, marginTop: 2 }}>seconds</div>
            </div>
          </div>

          {/* Wrong number? Fix it — full-size button, sits right above the
              "Up next" exercise card so it's easy to spot during rest.
              Uses an in-app number picker instead of the browser's native
              prompt() popup — that popup was unreliable (it can hang or
              fail to appear at all in some mobile/home-screen-app contexts)
              and the corrected number used to only change what's on screen
              without ever saving to the account. Now it does both properly. */}
          {!wasSkipped && (
            correctingReps ? (
              <div style={{ background: "#1A2332", border: `1px solid rgba(0,212,177,0.3)`, borderRadius: 14, padding: "16px", marginBottom: 12 }}>
                <div style={{ fontSize: 13, color: theme.textDim, textAlign: "center", marginBottom: 10 }}>How many reps did you actually do?</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20, marginBottom: 14 }}>
                  <button onClick={() => setCorrectionValue(v => Math.max(0, (v ?? 0) - 1))}
                    style={{ width: 44, height: 44, borderRadius: "50%", background: "#0F1922", border: "1px solid rgba(255,255,255,0.1)", color: theme.text, fontSize: 20, cursor: "pointer", fontFamily: "inherit" }}>−</button>
                  <div style={{ fontSize: 40, fontWeight: 700, color: a, minWidth: 56, textAlign: "center" }}>{correctionValue}</div>
                  <button onClick={() => setCorrectionValue(v => Math.min(99, (v ?? 0) + 1))}
                    style={{ width: 44, height: 44, borderRadius: "50%", background: "#0F1922", border: "1px solid rgba(255,255,255,0.1)", color: theme.text, fontSize: 20, cursor: "pointer", fontFamily: "inherit" }}>+</button>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => setCorrectingReps(false)}
                    style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "12px", fontSize: 14, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                  <button onClick={() => {
                    const n = correctionValue;
                    setCorrectingReps(false);
                    if (n == null || n < 0 || n >= 100) return;
                    const updated = [...loggedSets];
                    updated[updated.length - 1] = { ...updated[updated.length - 1], reps: n };
                    setLoggedSets(updated);
                    loggedSetsRef.current = updated;
                    setLastLoggedReps(n);
                    if (lastLoggedRowId) {
                      setCorrectionSaving(true);
                      setCorrectionSaved(false);
                      sb.updateWorkoutLogReps(lastLoggedRowId, n).then(ok => {
                        setCorrectionSaving(false);
                        setCorrectionSaved(ok === true);
                        if (ok === true) setTimeout(() => setCorrectionSaved(false), 3000);
                      }).catch(() => setCorrectionSaving(false));
                    }
                  }} style={{ flex: 2, background: a, border: "none", borderRadius: 10, padding: "12px", fontSize: 14, color: "#003D35", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Save correction</button>
                </div>
              </div>
            ) : (
              <>
                <button onClick={() => { setCorrectionValue(lastLoggedReps); setCorrectingReps(true); }}
                  style={{ width: "100%", background: "#1A2332", border: `1px solid rgba(0,212,177,0.3)`, borderRadius: 14, padding: "16px", fontSize: 18, color: a, cursor: "pointer", fontFamily: "inherit", marginBottom: correctionSaving || correctionSaved ? 4 : 12 }}>
                  <Icon name="pencil" size={15} style={{ verticalAlign: "-3px", marginRight: 5 }} /> Wrong number? Fix it
                </button>
                {(correctionSaving || correctionSaved) && (
                  <div style={{ fontSize: 11, color: correctionSaving ? theme.textDim : a, textAlign: "center", marginBottom: 12 }}>
                    <Icon name="cloud" size={11} style={{ verticalAlign: "-1px", marginRight: 3 }} /> {correctionSaving ? "Saving correction..." : "Correction saved"}{!correctionSaving && <Icon name="check" size={10} style={{ verticalAlign: "-1px", marginLeft: 3 }} />}
                  </div>
                )}
              </>
            )
          )}

          {/* Up next — large and prominent */}
          <div style={{ background: "#0A1A14", border: `1px solid rgba(0,212,177,0.25)`, borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: "#003D35", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: a }}><Icon name="arrow-right" size={20} /></div>
            <div>
              <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 2 }}>Up next</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: theme.text, lineHeight: 1.1 }}>{ex.name}</div>
              {(() => {
                const next = setPlan[safeSetIdx + 1];
                if (!next) return <div style={{ fontSize: 13, color: theme.textDim, marginTop: 3 }}>Last set done — nice work</div>;
                const w = next.kind === "warmup" ? next.weight : (nudgedWeight ?? ex.weight);
                return <div style={{ fontSize: 13, color: theme.textDim, marginTop: 3 }}>{next.label} · {w} lbs · {next.targetReps} reps</div>;
              })()}
            </div>
          </div>

          {/* After that — smaller, secondary */}
          {nextEx && (
            <div style={{ background: "#0F1922", border: `1px solid rgba(255,255,255,0.05)`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "#1A2332", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 14, color: theme.textDim }}>⏱</div>
              <div>
                <div style={{ fontSize: 10, color: theme.textDim, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 1 }}>After that</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: theme.textDim }}>{nextEx.name}</div>
                <div style={{ fontSize: 11, color: theme.textFaint }}>{nextEx.sets} sets · {nextEx.targetReps} reps</div>
              </div>
            </div>
          )}

          {/* Quick-tap rest duration buttons */}
          <div style={{ marginTop: "auto", marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: theme.textDim, textAlign: "center", marginBottom: 6 }}>Change rest length</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[[60, "1 min"], [120, "2 min"], [180, "3 min"]].map(([secs, label]) => (
                <button key={secs} onClick={() => { setActiveRestSecs(secs); setRestSecs(secs); activeRestSecsRef.current = secs; }}
                  style={{ flex: 1, background: activeRestSecs === secs ? "#003D35" : "#1A2332", border: `1.5px solid ${activeRestSecs === secs ? a : "rgba(255,255,255,0.08)"}`, borderRadius: 10, padding: "8px 4px", fontSize: 12, fontWeight: activeRestSecs === secs ? 700 : 400, color: activeRestSecs === secs ? a : theme.textDim, cursor: "pointer", fontFamily: "inherit", transition: "all .15s" }}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <button onClick={skipRest} style={{ width: "100%", background: "transparent", border: `1px solid rgba(0,212,177,0.3)`, borderRadius: 12, padding: "13px", fontSize: 14, color: a, cursor: "pointer", fontFamily: "inherit", marginBottom: 4 }}>
            Skip rest — I'm ready
          </button>

        </div>
      </Layout>
    );
  }

  const isLastSet = safeSetIdx === totalSetsInPlan - 1;
  const displayReps = repCount !== null ? repCount : currentTargetReps;

  return (
    <Layout activeNav="workout" chatTarget="chat_workout">
      <div className="mq-fade" style={{ padding: "1rem 1.25rem 0", display: "flex", flexDirection: "column", flex: 1 }}>

        {/* Resume banner — appears briefly when we restored an in-progress
            workout, then fades. Makes auto-resume visible and intentional. */}
        {showResumeBanner && (
          <div className="mq-fade" style={{ background: "#0A1A14", border: `1px solid rgba(0,212,177,0.3)`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#003D35", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: a }}><Icon name="refresh" size={13} /></div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: a }}>Picked up where you left off</div>
              <div style={{ fontSize: 11, color: "#9BB3C8" }}>Exercise {exIdx + 1}, {currentSpec?.label || `Set ${safeSetIdx + 1}`} · your logged sets are saved</div>
            </div>
          </div>
        )}

        {/* Header — exercise name front and center */}
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: isWarmupSet ? "#F59E0B" : theme.textDim, letterSpacing: "2px", textTransform: "uppercase", marginBottom: 6 }}>
            {isWarmupSet ? `${currentSpec.label} · not a working set` : `Working set ${workingIdx} of ${workingCount}`}
          </div>
          <div style={{ fontSize: 42, fontWeight: 700, color: theme.text, lineHeight: 1.1, marginBottom: 6 }}>{ex.name}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, color: theme.textDim }}>{ex.muscle}</div>
            {isWarmupSet ? (
              <Pill variant="amber">Warm-up · {currentTargetReps} reps</Pill>
            ) : (
              <Pill variant={isLastSet ? "amber" : "teal"}>{isLastSet ? "Final set" : `Target: ${currentTargetReps} reps`}</Pill>
            )}
            {!isWarmupSet && ex.rpe && <div style={{ background: "#1A2332", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 20, padding: "2px 8px", fontSize: 10, color: "#A78BFA" }}>RPE {ex.rpe}</div>}
          </div>
        </div>

        <SetDots total={totalSetsInPlan} current={safeSetIdx} />

        {state === "nudge" && nudgedWeight && (
          <AINudgeCard
            exercise={ex}
            oldWeight={ex.weight}
            newWeight={nudgedWeight}
            onAccept={() => { nudgeAcceptedRef.current = true; setState("rest"); }}
            onKeep={() => { setNudgedWeight(ex.weight); nudgeAcceptedRef.current = true; setState("rest"); }}
          />
        )}

        {/* Weight + target reps display */}
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1, background: "#1A2332", borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: theme.textDim, marginBottom: 2 }}>Weight this set</div>
            <div style={{ fontSize: 40, fontWeight: 700, color: isWarmupSet ? "#F59E0B" : a, lineHeight: 1 }}>{currentWeight} <span style={{ fontSize: 15, color: theme.textDim }}>lbs</span></div>
            {isWarmupSet ? (
              <div style={{ fontSize: 10, color: "#F59E0B", marginTop: 4 }}>Warm-up weight · ramping to {ex.weight} lbs</div>
            ) : nudgeAcceptedRef.current ? (
              <div style={{ fontSize: 10, color: "#F59E0B", marginTop: 4 }}><Icon name="bolt" size={10} style={{ verticalAlign: "-1px", marginRight: 2 }} /> Progressive overload applied</div>
            ) : (
              <div style={{ fontSize: 10, color: theme.textDim, marginTop: 4 }}>{currentWeight === ex.weight ? "Today's target" : `+${currentWeight - ex.weight} lbs from plan`}</div>
            )}
          </div>
          <div style={{ flex: 1, background: "#1A2332", borderRadius: 12, padding: "10px 12px", textAlign: "center" }}>
            <div style={{ fontSize: 10, color: theme.textDim, marginBottom: 2 }}>Target reps</div>
            <div style={{ fontSize: 40, fontWeight: 700, color: isWarmupSet ? "#F59E0B" : a, lineHeight: 1 }}>{currentTargetReps} <span style={{ fontSize: 15, color: theme.textDim }}>reps</span></div>
          </div>
        </div>
        {/* ── LAST TIME display — shown when we have history for this exercise ── */}
        {!isWarmupSet && lastSetHistory && (
          <div style={{ background: "#0A1A14", border: "1px solid rgba(0,212,177,0.15)", borderRadius: 10, padding: "8px 14px", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 11, color: "#6B7A8D" }}>Last time on this exercise</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#E8EDF2" }}>{lastSetHistory.weight} lbs × {lastSetHistory.reps} reps</span>
              {currentWeight > lastSetHistory.weight && (
                <span style={{ fontSize: 10, color: a, background: "#003D35", borderRadius: 6, padding: "2px 6px" }}><Icon name="arrow-up" size={9} style={{ verticalAlign: "-1px", marginRight: 2 }} /> PR pace</span>
              )}
            </div>
          </div>
        )}
        {!isWarmupSet && lastSetHistory === null && supabaseUser?.id && (
          <div style={{ height: 34, marginBottom: 10 }} /> 
        )}

        {/* Warm-up callout — shown on every warm-up set so it's unmistakable
            this is NOT a working set and shouldn't be taken hard. */}
        {isWarmupSet && (
          <div style={{ background: "#1A1206", border: "1px solid rgba(245,158,11,0.4)", borderRadius: 10, padding: "10px 12px", marginBottom: 10, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <div style={{ flexShrink: 0, color: "#F59E0B" }}><Icon name="flame" size={16} /></div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#F59E0B", marginBottom: 2 }}>This is a warm-up set — take it easy</div>
              <div style={{ fontSize: 11, color: "#9BB3C8", lineHeight: 1.45 }}>
                Move smooth and controlled to prime your muscles. Don't push hard or chase reps — save your energy for the working sets at {ex.weight} lbs.
              </div>
            </div>
          </div>
        )}

        {/* Sets logged this exercise — shows after first set is done */}
        {loggedSets.filter(l => l.exerciseName === ex.name).length > 0 && (
          <div style={{ background: "#0D1623", borderRadius: 10, padding: "8px 12px", marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: theme.textDim, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>This exercise</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {loggedSets.filter(l => l.exerciseName === ex.name).map((l, i) => (
                <div key={i} style={{ background: "#1A2332", borderRadius: 8, padding: "5px 9px", textAlign: "center" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: l.reps > 0 ? a : theme.textFaint }}>
                    {l.reps > 0 ? `${l.reps} reps` : "skipped"}
                  </div>
                  <div style={{ fontSize: 9, color: theme.textDim, marginTop: 1 }}>{l.weight} lbs</div>
                </div>
              ))}
              {/* Ghost card for current set */}
              <div style={{ background: "#1A2332", border: `1px dashed rgba(0,212,177,0.3)`, borderRadius: 8, padding: "5px 9px", textAlign: "center", opacity: 0.5 }}>
                <div style={{ fontSize: 11, color: a }}>Set {loggedSets.filter(l => l.exerciseName === ex.name).length + 1}</div>
                <div style={{ fontSize: 9, color: theme.textDim, marginTop: 1 }}>current</div>
              </div>
            </div>
          </div>
        )}

        {/* ── REP COUNTER — the focal point ── */}
        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: theme.textDim, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 10 }}>Reps</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 20 }}>
            {/* Minus button */}
            <button onClick={() => setRepCount(Math.max(1, displayReps - 1))}
              style={{ width: 52, height: 52, borderRadius: "50%", background: "#1A2332", border: `1px solid rgba(255,255,255,0.1)`, fontSize: 26, color: theme.textDim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", flexShrink: 0 }}>−</button>

            {/* Big rep number */}
            <div style={{ fontSize: 80, fontWeight: 700, color: repCount !== null ? a : theme.textDim, lineHeight: 1, minWidth: 100, textAlign: "center", transition: "color 0.2s" }}>
              {displayReps}
            </div>

            {/* Plus button */}
            <button onClick={() => setRepCount(displayReps + 1)}
              style={{ width: 52, height: 52, borderRadius: "50%", background: "#1A2332", border: `1px solid rgba(255,255,255,0.1)`, fontSize: 26, color: theme.textDim, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit", flexShrink: 0 }}>+</button>
          </div>
          <div style={{ fontSize: 11, color: theme.textDim, marginTop: 4 }}>
            {repCount !== null ? <>Tap mic or Log <Icon name="check" size={11} style={{ verticalAlign: "-1px" }} /> to save</> : "Tap − / + to adjust, or speak your reps"}
          </div>
        </div>

        {/* ── MICROPHONE — large and central ── */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, marginBottom: 10 }}>
          {listening ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 3, height: 28 }} className="mq-wave">
              {[1,2,3,4,5,6].map(i => <span key={i} />)}
            </div>
          ) : voiceTranscript ? (
            <div style={{ background: "#0A1628", border: "1px solid rgba(0,212,177,0.15)", borderRadius: 10, padding: "6px 12px", fontSize: 11, color: "#9BB3C8", fontStyle: "italic" }}>
              {voiceTranscript}
            </div>
          ) : null}
          <VoiceBtn listening={listening && !voiceTranscript} onPress={simulateListen} size={90} />
          <div style={{ fontSize: 11, color: listening ? a : theme.textDim }}>
            {listening ? "Listening..." : "Tap to speak your reps"}
          </div>
        </div>

        {/* Bottom actions */}
        <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
          <button onClick={() => { logSet(0); }}
            style={{ flex: 1, background: "transparent", border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 10, padding: "9px 6px", fontSize: 10, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>Skip set</button>
          <button onClick={() => setShowSwapSheet(true)}
            style={{ flex: 1, background: "rgba(0,212,177,0.06)", border: `1px solid rgba(0,212,177,0.3)`, borderRadius: 10, padding: "9px 6px", fontSize: 10, color: a, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}><Icon name="swap" size={11} /> Swap</button>
          <button onClick={() => logSet(displayReps)}
            style={{ flex: 2, background: a, border: "none", borderRadius: 10, padding: "9px 6px", fontSize: 12, color: "#003D35", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>Log {displayReps} reps <Icon name="check" size={13} /></button>
        </div>

        <div style={{ marginTop: 8, display: "flex", justifyContent: "center", gap: 16, alignItems: "center" }}>
          <div style={{ fontSize: 12, color: theme.textDim, fontWeight: 500 }}>
            Exercise <span style={{ color: theme.text, fontWeight: 700 }}>{exIdx + 1}</span> of {exercises.length}
          </div>
          <div style={{ width: 3, height: 3, borderRadius: "50%", background: theme.textFaint }} />
          <div style={{ fontSize: 12, color: theme.textDim, fontWeight: 500 }}>
            <span style={{ color: theme.text, fontWeight: 700 }}>{totalCompleted}</span> sets logged
          </div>
        </div>

        {/* Restart — escape hatch. Only appears once the member has made some
            progress, so a fresh workout stays uncluttered. Confirms first so
            nobody wipes a session by accident. */}
        {(exIdx > 0 || setIdx > 0 || loggedSets.length > 0) && (
          <div style={{ textAlign: "center", marginTop: 10 }}>
            <button onClick={() => {
              if (window.confirm("Start over from the beginning? This clears every set you've logged in this session and sends you back to the first exercise. (This is NOT resume — you'll lose this session's progress.)")) {
                restartWorkout();
              }
            }} style={{ background: "transparent", border: "none", fontSize: 11, color: theme.textFaint, cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>
              Start over from set 1
            </button>
          </div>
        )}
      </div>

      {/* ── Swap confirmation banner ── */}
      {swapConfirmName && (
        <div className="mq-fade" style={{ position: "absolute", top: 60, left: 16, right: 16, background: "#0A1628", border: `1px solid rgba(0,212,177,0.3)`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, zIndex: 20 }}>
          <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#003D35", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: a }}><Icon name="check" size={13} /></div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: a }}>Swapped in {swapConfirmName}</div>
            <div style={{ fontSize: 11, color: "#9BB3C8" }}>Sets reset to 1 — same muscle group</div>
          </div>
        </div>
      )}

      {/* ── Swap picker sheet — slides up from bottom ── */}
      {showSwapSheet && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 30, display: "flex", flexDirection: "column", justifyContent: "flex-end", borderRadius: 20 }}>
          <div className="mq-fade" style={{ background: "#111827", borderRadius: "20px 20px 20px 20px", padding: "20px 16px 24px" }}>
            {/* Sheet header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#E8EDF2" }}>Swap exercise</div>
                <div style={{ fontSize: 12, color: "#9BB3C8", marginTop: 2 }}>
                  Replacing <span style={{ color: a }}>{ex.name}</span> — same muscle group
                </div>
              </div>
              <button onClick={() => setShowSwapSheet(false)}
                style={{ background: "#1A2332", border: "none", borderRadius: 8, width: 30, height: 30, color: "#6B7A8D", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="x" size={15} /></button>
            </div>
            {/* Muscle group label */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#0A1628", border: `1px solid rgba(0,212,177,0.15)`, borderRadius: 20, padding: "3px 10px", marginBottom: 14 }}>
              <Icon name="flex" size={12} style={{ color: a }} />
              <span style={{ fontSize: 11, color: "#9BB3C8" }}>{ex.muscle}</span>
            </div>
            {/* Alternatives list — plan's AI-suggested alternative shown first */}
            {ex.alternative && (
              <button key={ex.alternative} onClick={() => doSwap({ name: ex.alternative, muscle: ex.muscle, pattern: ex.pattern, sets: ex.sets, targetReps: ex.targetReps, weight: Math.round(ex.weight * 0.9), rpe: ex.rpe, alternative: null })}
                style={{ width: "100%", background: "#0A1A14", border: `1px solid rgba(0,212,177,0.3)`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontFamily: "inherit" }}>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#E8EDF2" }}>{ex.alternative}</div>
                  <div style={{ fontSize: 11, color: a, marginTop: 2 }}><Icon name="sparkle" size={10} style={{ verticalAlign: "-1px", marginRight: 3 }} /> AI recommended — same movement pattern</div>
                </div>
                <div style={{ background: "#003D35", border: `1px solid rgba(0,212,177,0.25)`, borderRadius: 8, padding: "5px 10px", fontSize: 11, color: a, fontWeight: 600, flexShrink: 0, marginLeft: 10, display: "flex", alignItems: "center", gap: 3 }}>Swap <Icon name="arrow-right" size={11} /></div>
              </button>
            )}
            {/* Loading indicator while Supabase query is in flight */}
            {swapDbLoading && (
              <div style={{ textAlign: "center", padding: "12px 0", fontSize: 12, color: "#6B7A8D" }}>
                Loading alternatives...
              </div>
            )}
            {/* Supabase results when loaded, otherwise hardcoded fallback */}
            {!swapDbLoading && (swapDbResults || getSwapOptions(ex, user?.equipment)).map((alt) => (
              <button key={alt.name} onClick={() => doSwap({ ...alt, sets: ex.sets, targetReps: ex.targetReps, rpe: ex.rpe })}
                style={{ width: "100%", background: "#1A2332", border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontFamily: "inherit" }}>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#E8EDF2" }}>{alt.name}</div>
                  <div style={{ fontSize: 11, color: "#6B7A8D", marginTop: 2 }}>{alt.muscle} · {ex.targetReps} reps · {ex.sets} sets</div>
                </div>
                <div style={{ background: "#003D35", border: `1px solid rgba(0,212,177,0.25)`, borderRadius: 8, padding: "5px 10px", fontSize: 11, color: a, fontWeight: 600, flexShrink: 0, marginLeft: 10, display: "flex", alignItems: "center", gap: 3 }}>Swap <Icon name="arrow-right" size={11} /></div>
              </button>
            ))}
            {/* ── Voice swap option ── */}
            {!voiceSwapActive && !voiceSwapHeard && (
              <button onClick={listenForSwap}
                style={{ width: "100%", background: "#0A1628", border: `1px solid rgba(0,212,177,0.2)`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", alignItems: "center", gap: 10, cursor: "pointer", fontFamily: "inherit" }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: a, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <rect x="8" y="2" width="8" height="12" rx="4" fill="#003D35"/>
                    <path d="M5 12c0 3.866 3.134 7 7 7s7-3.134 7-7" stroke="#003D35" strokeWidth="2" strokeLinecap="round"/>
                    <line x1="12" y1="19" x2="12" y2="22" stroke="#003D35" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#E8EDF2" }}>Say an exercise</div>
                  <div style={{ fontSize: 11, color: "#6B7A8D", marginTop: 2 }}>Speak any exercise name freely</div>
                </div>
              </button>
            )}
            {/* Listening state */}
            {voiceSwapActive && (
              <div style={{ background: "#0A1628", border: `1px solid rgba(0,212,177,0.25)`, borderRadius: 12, padding: "14px", marginBottom: 8, textAlign: "center" }}>
                <div style={{ fontSize: 11, color: "#9BB3C8", marginBottom: 6 }}>Listening — say any exercise name</div>
                <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 3, height: 28, marginBottom: 6 }}>
                  {[5,12,20,12,7,16,10].map((h,i) => (
                    <div key={i} style={{ width: 3, height: h, borderRadius: 2, background: a, animation: `wv 0.9s ${i*0.1}s infinite ease-in-out` }}/>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: a }}>Speak now...</div>
              </div>
            )}
            {/* Heard — confirm or retry */}
            {!voiceSwapActive && voiceSwapHeard && (
              <div style={{ background: "#0A1A14", border: `1px solid rgba(0,212,177,0.3)`, borderRadius: 12, padding: "14px", marginBottom: 8 }}>
                <div style={{ fontSize: 10, color: "#6B7A8D", marginBottom: 5 }}>Heard:</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#E8EDF2", marginBottom: 12 }}>"{voiceSwapHeard}"</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={() => { setVoiceSwapHeard(""); setVoiceSwapActive(false); }}
                    style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "9px", fontSize: 12, color: "#6B7A8D", cursor: "pointer", fontFamily: "inherit" }}>
                    Try again
                  </button>
                  <button onClick={() => {
                      doSwap({ name: voiceSwapHeard, muscle: ex.muscle, pattern: ex.pattern, sets: ex.sets, targetReps: ex.targetReps, weight: ex.weight, rpe: ex.rpe, alternative: null });
                      setShowSwapSheet(false);
                      setVoiceSwapActive(false);
                      setVoiceSwapHeard("");
                    }}
                    style={{ flex: 2, background: a, border: "none", borderRadius: 10, padding: "9px", fontSize: 13, fontWeight: 700, color: "#003D35", cursor: "pointer", fontFamily: "inherit" }}>
                    <Icon name="check" size={13} style={{ verticalAlign: "-2px", marginRight: 3 }} /> Use {voiceSwapHeard}
                  </button>
                </div>
              </div>
            )}
            <button onClick={() => { setShowSwapSheet(false); setVoiceSwapActive(false); setVoiceSwapHeard(""); }}
              style={{ width: "100%", background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px", fontSize: 13, color: "#6B7A8D", cursor: "pointer", fontFamily: "inherit", marginTop: 2 }}>
              Cancel — keep {ex.name}
            </button>
          </div>
        </div>
      )}

    </Layout>
  );
}

const EXERCISES_DISPLAY = [{name:"Goblet squat",weight:"35 lbs",reps:"10 reps",sets:"3 sets"},{name:"Dumbbell bench press",weight:"30 lbs",reps:"10 reps",sets:"3 sets"},{name:"Seated cable row",weight:"85 lbs",reps:"12 reps",sets:"3 sets"},{name:"Dumbbell shoulder press",weight:"25 lbs",reps:"10 reps",sets:"3 sets"},{name:"Romanian deadlift",weight:"65 lbs",reps:"10 reps",sets:"3 sets"}];

const WEEK = [{name:"Mon",type:"Full body",isWorkout:true},{name:"Tue",type:"Rest",isWorkout:false},{name:"Wed",type:"Full body",isWorkout:true},{name:"Thu",type:"Rest",isWorkout:false},{name:"Fri",type:"Full body",isWorkout:true},{name:"Sat",type:"Rest",isWorkout:false},{name:"Sun",type:"Rest",isWorkout:false}];


// ═══════════════════════════════════════════════════════════════════
// CUSTOM PLAN SCREEN
// For members who already have their own routine.
// Flow: goal → days/week → exercises per day (name + sets + reps + weight) → review → save
// Uses same plan shape as buildPlan() so all progression logic works identically.
// ═══════════════════════════════════════════════════════════════════

// Exercise search now pulls from Supabase exercises table (91 exercises, all equipment types).
// Hardcoded list removed June 2026 — database is the single source of truth.

// Goal options for the custom plan — drives rep ranges and progression rate
const CUSTOM_GOALS = [
  { id: "lose_fat",      label: "Lose fat",         sub: "Higher reps, shorter rest, steady progression",  icon: <Icon name="flame" size={22} /> },
  { id: "build_muscle",  label: "Build muscle",      sub: "Moderate reps, progressive overload focus",      icon: <Icon name="flex" size={22} /> },
  { id: "build_strength",label: "Build strength",    sub: "Lower reps, heavier weight, longer rest",        icon: <Icon name="dumbbell" size={22} /> },
  { id: "general_fitness",label: "General fitness",  sub: "Balanced — energy, health, and consistency",     icon: <Icon name="bolt" size={22} /> },
];

// Rep range presets per goal — shown as default suggestion, member can override per exercise
const GOAL_REP_RANGES = {
  lose_fat:       { reps: 15, sets: 3, rest: 60  },
  build_muscle:   { reps: 10, sets: 3, rest: 120 },
  build_strength: { reps: 5,  sets: 4, rest: 180 },
  general_fitness:{ reps: 12, sets: 3, rest: 90  },
};

function CustomPlanScreen() {
  const { navigate, setUser, setPlan, user, gymBranding, supabaseUser, supabaseUserIdRef } = useApp();
  const a = gymBranding.accent || "#00D4B1";
  const ob = theme.ob;

  const [step, setStep]         = useState(0); // 0=goal, 1=days, 2=exercises, 3=review
  const [goal, setGoal]         = useState(null);
  const [daysPerWeek, setDays]  = useState(3);
  const [currentDay, setCurrentDay] = useState(0); // which day we're adding exercises for
  const [dayExercises, setDayExercises] = useState([]); // exercises for the current day being built
  const [allDays, setAllDays]   = useState([]); // [{dayLabel, exercises:[{name,sets,reps,weight}]}]
  const [query, setQuery]       = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein]   = useState("");
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState("");
  const [dbSuggestions, setDbSuggestions] = useState([]); // live results from Supabase exercises table

  // Pending exercise being configured before adding to the day
  const [pending, setPending]   = useState(null); // {name, sets, reps, weight}

  const defaults = GOAL_REP_RANGES[goal] || GOAL_REP_RANGES.general_fitness;

  // Live exercise search — queries Supabase exercises table as member types.
  // Debounced 200ms so we don't fire on every keystroke.
  // Falls back to empty list silently if the fetch fails — never crashes the UI.
  const searchRef = useRef(null);
  useEffect(() => {
    if (query.length < 2) { setDbSuggestions([]); return; }
    clearTimeout(searchRef.current);
    searchRef.current = setTimeout(async () => {
      try {
        const encoded = encodeURIComponent(query);
        // Filter by equipment if we know it, otherwise search all
        const equipFilter = user?.equipment && user.equipment !== "any"
          ? `&equipment=in.(${encodeURIComponent(user.equipment)},any)`
          : "";
        const url = `${SUPABASE_URL}/rest/v1/exercises?name=ilike.*${encoded}*${equipFilter}&is_active=eq.true&order=difficulty.asc,name.asc&limit=6&select=name,muscle_group,difficulty`;
        const res = await fetch(url, { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } });
        if (!res.ok) return;
        const data = await res.json();
        const addedNames = dayExercises.map(e => e.name.toLowerCase());
        setDbSuggestions((data || []).filter(ex => !addedNames.includes(ex.name.toLowerCase())));
      } catch { setDbSuggestions([]); }
    }, 200);
    return () => clearTimeout(searchRef.current);
  }, [query, dayExercises, user?.equipment]);

  // Filtered suggestions — use live DB results, fall back to empty
  const addedNames = dayExercises.map(e => e.name.toLowerCase());
  const suggestions = dbSuggestions;

  function selectExercise(name) {
    setPending({ name, sets: defaults.sets, reps: defaults.reps, weight: "" });
    setQuery("");
  }

  function addPending() {
    if (!pending || !pending.weight) return;
    setDayExercises(prev => [...prev, { ...pending, weight: parseFloat(pending.weight) || 20 }]);
    setPending(null);
  }

  function finishDay() {
    if (dayExercises.length === 0) return;
    const dayLabel = `Day ${currentDay + 1}`;
    const newAll = [...allDays, { dayLabel, exercises: dayExercises }];
    setAllDays(newAll);
    setDayExercises([]);
    setPending(null);
    setQuery("");
    if (currentDay + 1 < daysPerWeek) {
      setCurrentDay(currentDay + 1);
    } else {
      setStep(3); // all days done — go to review/macros
    }
  }

  async function savePlan() {
    setSaving(true); setSaveError("");
    // Build plan object in the same shape as buildPlan() so WorkoutScreen works unchanged
    const repDefaults = GOAL_REP_RANGES[goal] || GOAL_REP_RANGES.general_fitness;
    // Use exercises from day 1 as the active exercise list (same as AI plan — rotates by day)
    const exercises = (allDays[0]?.exercises || []).map(e => ({
      name: e.name, sets: e.sets, reps: e.reps, repMin: e.reps, repMax: e.reps + 2,
      weight: e.weight, warmupSets: [], muscle: "", pattern: "custom",
      rpe: 7, restSeconds: repDefaults.rest, weightIncrement: 2.5, usePyramid: false,
    }));
    const plan = {
      calories: parseInt(calories) || null,
      protein:  parseInt(protein)  || null,
      carbs: null, fat: null,
      weekNumber: 1, weekStartDate: new Date().toISOString().split("T")[0],
      daysPerWeek, workoutType: "Custom", workoutDuration: 45,
      restSeconds: repDefaults.rest,
      customDays: allDays, // store all days for future rotation
      isCustomPlan: true,  // flag so app knows this wasn't AI-generated
      weeklyFocus: "Your plan, your rules. Keep showing up and the results will follow.",
      tip: "Track every set. The data is what lets us push your weights forward each week.",
      progressionRule: "Hit the top of your rep range two sessions in a row → add weight next session.",
      warmup: [], cooldown: [], exercises,
    };
    const userData = { ...user, goal, daysPerWeek, isCustomPlan: true };
    const uid = supabaseUserIdRef?.current || supabaseUser?.id;
    if (uid) {
      try { localStorage.setItem("mq_cached_plan_" + uid, JSON.stringify({ plan, user: userData })); } catch {}
      const ok = await sb.upsertProfile(uid, userData, plan);
      if (!ok) { setSaveError("Couldn't save — check your connection and try again."); setSaving(false); return; }
    }
    setUser(userData);
    setPlan(plan);
    navigate("plan");
  }

  const s = {
    root: { background: ob.bg, minHeight: "100dvh", display: "flex", flexDirection: "column", fontFamily: ob.font, color: ob.white },
    inner: { flex: 1, padding: "12px 16px", display: "flex", flexDirection: "column" },
    hdr: { fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 4 },
    title: { fontSize: 18, fontWeight: 700, color: ob.white, marginBottom: 4 },
    sub: { fontSize: 12, color: ob.muted, marginBottom: 20 },
    card: { background: ob.card, borderRadius: 12, padding: "10px 12px", marginBottom: 8 },
    tealBtn: (dis) => ({ width: "100%", background: dis ? ob.card : a, color: dis ? ob.muted : ob.tealDk, border: "none", borderRadius: 10, padding: 11, fontSize: 13, fontWeight: 600, cursor: dis ? "default" : "pointer", fontFamily: ob.font, marginTop: 8 }),
    input: { background: ob.card, border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 8, padding: "8px 10px", fontSize: 13, color: ob.white, outline: "none", fontFamily: ob.font, width: "100%" },
    smallInput: { background: "#0F1922", border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 8, padding: "7px 8px", fontSize: 13, color: ob.white, outline: "none", fontFamily: ob.font, width: "100%", textAlign: "center" },
  };

  return (
    <div style={s.root}>
      {/* Header */}
      <div style={{ padding: "14px 16px 0", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <button onClick={() => step > 0 ? setStep(step - 1) : navigate("onboarding")}
          style={{ background: "transparent", border: "none", color: ob.muted, cursor: "pointer", lineHeight: 1, padding: 0, display: "flex", alignItems: "center" }}><Icon name="arrow-left" size={20} /></button>
        <span style={{ fontSize: 13, fontWeight: 600, color: ob.white }}>Build your own plan</span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: ob.muted }}>{step + 1} of 4</span>
      </div>
      {/* Progress bar */}
      <div style={{ height: 3, background: ob.card, margin: "10px 16px 0", borderRadius: 2, flexShrink: 0 }}>
        <div style={{ height: 3, background: a, borderRadius: 2, width: `${((step + 1) / 4) * 100}%`, transition: "width .4s ease" }} />
      </div>

      <div style={s.inner}>

        {/* ── STEP 0: Goal ── */}
        {step === 0 && <div className="mq-fade">
          <div style={s.hdr}>Your goal</div>
          <div style={s.title}>What are you training for?</div>
          <div style={s.sub}>This sets your rep ranges and how aggressively we progress your weights.</div>
          {CUSTOM_GOALS.map(g => (
            <button key={g.id} onClick={() => { setGoal(g.id); setTimeout(() => setStep(1), 180); }}
              style={{ background: goal === g.id ? ob.tealDk : ob.card, border: `1.5px solid ${goal === g.id ? a : "rgba(255,255,255,0.07)"}`, borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", marginBottom: 8, width: "100%" }}>
              <span style={{ color: goal === g.id ? a : ob.muted, display: "flex" }}>{g.icon}</span>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: goal === g.id ? a : ob.white }}>{g.label}</div>
                <div style={{ fontSize: 10, color: ob.muted, marginTop: 2 }}>{g.sub}</div>
              </div>
              {goal === g.id && <div style={{ marginLeft: "auto", width: 18, height: 18, borderRadius: "50%", background: a, display: "flex", alignItems: "center", justifyContent: "center", color: ob.tealDk, flexShrink: 0 }}><Icon name="check" size={11} /></div>}
            </button>
          ))}
        </div>}

        {/* ── STEP 1: Days per week ── */}
        {step === 1 && <div className="mq-fade">
          <div style={s.hdr}>Your schedule</div>
          <div style={s.title}>How many days per week?</div>
          <div style={s.sub}>You'll enter exercises for each training day.</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
            {[2,3,4,5,6].map(d => (
              <button key={d} onClick={() => setDays(d)}
                style={{ width: 52, height: 52, borderRadius: 12, background: daysPerWeek === d ? ob.tealDk : ob.card, border: `1.5px solid ${daysPerWeek === d ? a : "rgba(255,255,255,0.07)"}`, color: daysPerWeek === d ? a : ob.white, fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: ob.font }}>
                {d}
              </button>
            ))}
          </div>
          <div style={{ background: ob.card, borderRadius: 10, padding: "10px 12px", marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: ob.muted, lineHeight: 1.6 }}>
              You'll enter your exercises for each of your <span style={{ color: ob.white, fontWeight: 600 }}>{daysPerWeek} training days</span> next. Takes about 2 minutes.
            </div>
          </div>
          <button onClick={() => { setCurrentDay(0); setDayExercises([]); setAllDays([]); setStep(2); }} style={s.tealBtn(false)}>
            Next — add exercises <Icon name="arrow-right" size={14} style={{ verticalAlign: "-2px", marginLeft: 3 }} />
          </button>
        </div>}

        {/* ── STEP 2: Exercises per day ── */}
        {step === 2 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={s.hdr}>Day {currentDay + 1} of {daysPerWeek}</div>
          <div style={s.title}>Add your exercises</div>
          <div style={{ fontSize: 11, color: ob.muted, marginBottom: 12 }}>
            Default: <span style={{ color: ob.white }}>{defaults.sets} sets × {defaults.reps} reps</span> based on your goal. Edit each exercise as needed.
          </div>

          {/* Already-added exercises for this day */}
          {dayExercises.map((ex, i) => (
            <div key={i} style={{ ...s.card, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: ob.white }}>{ex.name}</div>
                <div style={{ fontSize: 10, color: ob.muted, marginTop: 2 }}>{ex.sets} sets × {ex.reps} reps · {ex.weight} lbs</div>
              </div>
              <button onClick={() => setDayExercises(prev => prev.filter((_,j) => j !== i))}
                style={{ background: "transparent", border: "none", color: ob.muted, cursor: "pointer" }}><Icon name="x" size={15} /></button>
            </div>
          ))}

          {/* Pending exercise — configure before adding */}
          {pending ? (
            <div style={{ background: "#0A1A14", border: `1px solid rgba(0,212,177,0.25)`, borderRadius: 12, padding: "12px", marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: a, marginBottom: 10 }}>{pending.name}</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                {[["Sets", "sets"], ["Reps", "reps"], ["Weight (lbs)", "weight"]].map(([lbl, key]) => (
                  <div key={key}>
                    <div style={{ fontSize: 9, color: ob.muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.8px" }}>{lbl}</div>
                    <input type="number" value={pending[key]} onChange={e => setPending(p => ({ ...p, [key]: e.target.value }))}
                      style={s.smallInput} placeholder={key === "weight" ? "e.g. 45" : ""} />
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 9, color: ob.muted, marginBottom: 8 }}>
                We'll adjust this automatically as you progress each week.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setPending(null)}
                  style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: 8, fontSize: 12, color: ob.muted, cursor: "pointer", fontFamily: ob.font }}>
                  Cancel
                </button>
                <button onClick={addPending} disabled={!pending.weight}
                  style={{ flex: 2, background: pending.weight ? a : ob.card, color: pending.weight ? ob.tealDk : ob.muted, border: "none", borderRadius: 8, padding: 8, fontSize: 12, fontWeight: 600, cursor: pending.weight ? "pointer" : "default", fontFamily: ob.font }}>
                  Add exercise <Icon name="check" size={14} style={{ verticalAlign: "-2px", marginLeft: 3 }} />
                </button>
              </div>
            </div>
          ) : (
            /* Search box */
            <div style={{ marginBottom: 8 }}>
              <input value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Search exercise name..." style={{ ...s.input, marginBottom: 4 }} autoComplete="off" />
              {query.length >= 2 && suggestions.length === 0 && (
                <div style={{ fontSize: 11, color: ob.muted, padding: "6px 4px" }}>Searching...</div>
              )}
              {suggestions.map(ex => (
                <button key={ex.name} onClick={() => selectExercise(ex.name)}
                  style={{ width: "100%", background: ob.card, border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, padding: "8px 12px", textAlign: "left", cursor: "pointer", fontFamily: ob.font, marginBottom: 3 }}>
                  <div style={{ fontSize: 12, color: ob.white, fontWeight: 500 }}>{ex.name}</div>
                  <div style={{ fontSize: 10, color: ob.muted, marginTop: 2 }}>{ex.muscle_group}</div>
                </button>
              ))}
              {/* Allow typing a custom name not in the list */}
              {query.length >= 3 && suggestions.length === 0 && (
                <button onClick={() => selectExercise(query.trim())}
                  style={{ width: "100%", background: ob.tealDk, border: `1px solid rgba(0,212,177,0.2)`, borderRadius: 8, padding: "8px 12px", textAlign: "left", fontSize: 12, color: a, cursor: "pointer", fontFamily: ob.font }}>
                  Add "{query.trim()}" as a custom exercise
                </button>
              )}
            </div>
          )}

          <div style={{ marginTop: "auto" }}>
            {dayExercises.length > 0 && !pending && (
              <button onClick={finishDay} style={s.tealBtn(false)}>
                {currentDay + 1 < daysPerWeek
                  ? <>Done with Day {currentDay + 1} <Icon name="arrow-right" size={14} style={{ verticalAlign: "-2px", margin: "0 3px" }} /> add Day {currentDay + 2}</>
                  : <>Review plan <Icon name="arrow-right" size={14} style={{ verticalAlign: "-2px", marginLeft: 3 }} /></>}
              </button>
            )}
            {dayExercises.length === 0 && (
              <div style={{ fontSize: 11, color: ob.muted, textAlign: "center", padding: 8 }}>
                Search for an exercise above to get started
              </div>
            )}
          </div>
        </div>}

        {/* ── STEP 3: Macros + review ── */}
        {step === 3 && <div className="mq-fade" style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={s.hdr}>Almost done</div>
          <div style={s.title}>Daily targets (optional)</div>
          <div style={{ fontSize: 11, color: ob.muted, marginBottom: 14 }}>
            If you track nutrition, add your targets. Skip if you don't — you can add them later in Profile.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
            {[["Daily calories", calories, setCalories, "e.g. 2200"], ["Protein (g/day)", protein, setProtein, "e.g. 160"]].map(([lbl, val, set, ph]) => (
              <div key={lbl}>
                <div style={{ fontSize: 10, color: ob.muted, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.8px" }}>{lbl}</div>
                <input type="number" value={val} onChange={e => set(e.target.value)} placeholder={ph} style={s.input} />
              </div>
            ))}
          </div>

          {/* Plan summary */}
          <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>Your plan</div>
          {allDays.map((day, di) => (
            <div key={di} style={s.card}>
              <div style={{ fontSize: 11, fontWeight: 600, color: ob.white, marginBottom: 6 }}>{day.dayLabel}</div>
              {day.exercises.map((ex, ei) => (
                <div key={ei} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", borderTop: ei > 0 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <span style={{ fontSize: 11, color: ob.body }}>{ex.name}</span>
                  <span style={{ fontSize: 10, color: ob.muted }}>{ex.sets}×{ex.reps} · {ex.weight} lbs</span>
                </div>
              ))}
            </div>
          ))}

          {saveError && <div style={{ fontSize: 11, color: "#F87171", marginBottom: 8, textAlign: "center" }}>{saveError}</div>}
          <button onClick={savePlan} disabled={saving} style={{ ...s.tealBtn(saving), marginTop: "auto" }}>
            {saving ? "Saving..." : <>Save my plan <Icon name="arrow-right" size={14} style={{ verticalAlign: "-2px", marginLeft: 3 }} /></>}
          </button>
        </div>}

      </div>
    </div>
  );
}

export { WorkoutScreen, CustomPlanScreen };


