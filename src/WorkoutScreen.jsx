import { useState, useEffect, useRef } from "react";
import { useApp, sb, Pill, Spinner, MicIcon, VoiceBtn, Layout, NavIcon,
         SUPABASE_URL, SUPABASE_ANON, SB_HEADERS, SB_GET, theme,
         WORKOUT_EXERCISES } from "./Morphiq.jsx";

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
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#003D35", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 14, color: a }}>✓</div>
        <div style={{ fontSize: 15, color: a, fontWeight: 700 }}>Morphiq noticed something</div>
      </div>
      <div style={{ fontSize: 14, color: "#9BB3C8", lineHeight: 1.6, marginBottom: 12 }}>
        You exceeded target reps both sets. Nudging weight to{" "}
        <span style={{ color: "#E8EDF2", fontWeight: 700 }}>{newWeight} lbs</span> for this set.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onKeep} style={{ flex: 1, background: "transparent", border: `1px solid rgba(255,255,255,0.12)`, borderRadius: 10, padding: "10px 4px", fontSize: 13, color: "#6B7A8D", cursor: "pointer", fontFamily: "inherit" }}>Keep {oldWeight} lbs</button>
        <button onClick={onAccept} style={{ flex: 2, background: a, border: "none", borderRadius: 10, padding: "10px 4px", fontSize: 14, color: "#003D35", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Use {newWeight} lbs ✦</button>
      </div>
    </div>
  );
}

// ─── SWAP ALTERNATIVES ────────────────────────────────────────────────────────
// Keyed by muscle group string — must match the muscle field in WORKOUT_EXERCISES.
// Each entry is 3 alternatives. Weight is a sensible starting default.
const SWAP_ALTERNATIVES = {
  "Quads / Glutes": [
    { name: "Leg Press",        muscle: "Quads / Glutes", sets: 3, targetReps: 12, weight: 90 },
    { name: "Step-Ups",         muscle: "Quads / Glutes", sets: 3, targetReps: 12, weight: 20 },
    { name: "Split Squat",      muscle: "Quads / Glutes", sets: 3, targetReps: 10, weight: 20 },
  ],
  "Back / Biceps": [
    { name: "Lat Pulldown",     muscle: "Back / Biceps",  sets: 3, targetReps: 10, weight: 60 },
    { name: "Cable Row",        muscle: "Back / Biceps",  sets: 3, targetReps: 10, weight: 55 },
    { name: "Hammer Curl",      muscle: "Back / Biceps",  sets: 3, targetReps: 12, weight: 20 },
  ],
  "Chest / Shoulders": [
    { name: "Dumbbell Fly",     muscle: "Chest / Shoulders", sets: 3, targetReps: 12, weight: 20 },
    { name: "Push-Up",          muscle: "Chest / Shoulders", sets: 3, targetReps: 15, weight: 0  },
    { name: "Cable Chest Press",muscle: "Chest / Shoulders", sets: 3, targetReps: 10, weight: 30 },
  ],
  "Hamstrings": [
    { name: "Lying Leg Curl",   muscle: "Hamstrings",     sets: 3, targetReps: 12, weight: 50 },
    { name: "Good Morning",     muscle: "Hamstrings",     sets: 3, targetReps: 10, weight: 45 },
    { name: "Nordic Curl",      muscle: "Hamstrings",     sets: 3, targetReps: 8,  weight: 0  },
  ],
  "Shoulders": [
    { name: "Lateral Raise",    muscle: "Shoulders",      sets: 3, targetReps: 15, weight: 10 },
    { name: "Front Raise",      muscle: "Shoulders",      sets: 3, targetReps: 12, weight: 10 },
    { name: "Arnold Press",     muscle: "Shoulders",      sets: 3, targetReps: 10, weight: 20 },
  ],
};
// Fallback alternatives when muscle group isn't in the table
const SWAP_FALLBACK = [
  { name: "Plank",              muscle: "Core",           sets: 3, targetReps: 30, weight: 0 },
  { name: "Mountain Climber",   muscle: "Core",           sets: 3, targetReps: 20, weight: 0 },
  { name: "Dead Bug",           muscle: "Core",           sets: 3, targetReps: 12, weight: 0 },
];

function WorkoutScreen() {
  const { navigate, user, gymBranding, plan, supabaseUser, setWorkoutContext } = useApp();
  const a = gymBranding.accent;

  // Use AI-generated exercises if available, else fall back to defaults.
  // Stored in state (not const) so swapping an exercise updates it live.
  const [exercises, setExercises] = useState(() =>
    (plan?.exercises || WORKOUT_EXERCISES).map(e => ({
      name: e.name, muscle: e.muscle, sets: e.sets,
      targetReps: e.reps || e.targetReps, weight: e.weight,
      rpe: e.rpe || 8, alternative: e.alternative || null,
      restSeconds: e.restSeconds || null,
    }))
  );

  // Workout phase: "warmup" | "active" | "cooldown"
  const warmupExercises = plan?.warmup || [];
  const cooldownExercises = plan?.cooldown || [];
  const [phase, setPhase] = useState(warmupExercises.length > 0 ? "warmup" : "active");
  const [warmupStep, setWarmupStep] = useState(0);
  const [cooldownStep, setCooldownStep] = useState(0);

  const [exIdx, setExIdx] = useState(0);
  const [setIdx, setSetIdx] = useState(0);
  const [loggedSets, setLoggedSets] = useState([]);
  const [state, setState] = useState("active");

  const [listening, setListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [repCount, setRepCount] = useState(null); // null = not set yet, number = user typed/adjusted

  const REST_SECS = plan?.restSeconds || 120;
  const [restSecs, setRestSecs] = useState(REST_SECS);
  const [activeRestSecs, setActiveRestSecs] = useState(REST_SECS);
  const timerRef = useRef(null);
  const confirmTimerRef = useRef(null);

  const [nudgedWeight, setNudgedWeight] = useState(null);
  const [showSwapSheet, setShowSwapSheet] = useState(false);  // controls the swap picker sheet
  const [swapConfirmName, setSwapConfirmName] = useState(null); // shows "Swapped in X ✓" briefly
  const [lastLoggedReps, setLastLoggedReps] = useState(null);
  const [savingToCloud, setSavingToCloud] = useState(false);
  const [savedToCloud, setSavedToCloud] = useState(false);

  const ex = exercises[exIdx];
  const currentWeight = nudgedWeight ?? ex.weight;
  const nextEx = exercises[exIdx + 1];

  // Keep shared context updated so ChatScreen always knows exactly where we are
  useEffect(() => {
    setWorkoutContext({
      exercise: ex?.name || "Unknown exercise",
      setNumber: setIdx + 1,
      totalSets: ex?.sets || 3,
      targetReps: ex?.targetReps || 10,
      weight: currentWeight,
    });
    // Clear context when workout screen unmounts
    return () => setWorkoutContext(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exIdx, setIdx, currentWeight]);

  const restStartRef = useRef(null);
  const activeRestSecsRef = useRef(activeRestSecs);

  useEffect(() => {
    if (state === "rest") {
      // Record the exact wall-clock time rest started
      restStartRef.current = Date.now();
      const newRestSecs = plan?.restSeconds || 120;
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

  // 3-second confirmation window before rest timer starts
  useEffect(() => {
    if (state === "confirm") {
      confirmTimerRef.current = setTimeout(() => {
        goToRestOrNudge();
      }, 3000);
    }
    return () => clearTimeout(confirmTimerRef.current);
  }, [state]);

  function goToRestOrNudge() {
    const allLogs = loggedSetsRef.current;
    // All sets logged for this exercise so far (includes the one just logged)
    const setsForThisEx = allLogs.filter(l => l.exIdx === exIdx);
    // How many sets beat the target rep count
    const exceededCount = setsForThisEx.filter(l => l.reps > (ex.targetReps || 10)).length;
    const isLastSet = setIdx >= ex.sets - 1;
    const increment = plan?.progressionRule?.weightIncrementLbs || 5;
    // Trigger nudge: 2+ sets beat target, not on last set, and haven't nudged yet this exercise
    if (exceededCount >= 2 && !isLastSet && !nudgeAcceptedRef.current) {
      setNudgedWeight((nudgedWeight ?? ex.weight) + increment);
      setState("nudge");
    } else {
      setState("rest");
    }
  }

  const loggedSetsRef = useRef(loggedSets);
  useEffect(() => { loggedSetsRef.current = loggedSets; }, [loggedSets]);
  // Tracks whether the overload nudge was accepted for this exercise — prevents double-nudging
  const nudgeAcceptedRef = useRef(false);

  function logSet(reps = ex.targetReps + 1) {
    const entry = { exIdx, setIdx, reps, weight: currentWeight };
    const newLogs = [...loggedSets, entry];
    setLoggedSets(newLogs);
    loggedSetsRef.current = newLogs;
    setLastLoggedReps(reps);
    setVoiceTranscript("");
    setListening(false);

    // Persist to Supabase workout_logs (fire-and-forget)
    if (supabaseUser?.id) {
      setSavingToCloud(true);
      setSavedToCloud(false);
      sb.insertWorkoutLog(supabaseUser.id, {
        exerciseName: ex.name,
        setNumber: setIdx + 1,
        reps,
        weight: currentWeight,
      }).then(ok => {
        setSavingToCloud(false);
        setSavedToCloud(ok);
        if (ok) setTimeout(() => setSavedToCloud(false), 3000);
      }).catch(() => { setSavingToCloud(false); });
    }

    // Show 3-second confirmation window before starting rest timer
    setState("confirm");
  }

  function advanceSet() {
    setRepCount(null);
    if (setIdx < ex.sets - 1) {
      // Same exercise, next set — keep nudged weight so it persists
      setSetIdx(s => s + 1);
      setState("active");
    } else if (exIdx < exercises.length - 1) {
      // New exercise — clear nudge state
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
  // Increments the morphiq_week_YYYY-MM-DD key so the home screen streak and
  // weekly progress bar reflect the completed workout immediately.
  function recordWorkoutComplete() {
    try {
      const now = new Date();
      const day = now.getDay();
      const diff = now.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(now.setDate(diff));
      const weekKey = `morphiq_week_${monday.toISOString().slice(0, 10)}`;
      const current = parseInt(localStorage.getItem(weekKey) || "0", 10);
      localStorage.setItem(weekKey, String(current + 1));
    } catch {
      // localStorage unavailable — not a fatal error, streak just won't update
    }
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
    setTimeout(() => setSwapConfirmName(null), 2500);
  }

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

  const card = { background: "#1A2332", borderRadius: 12, padding: "10px 12px", marginBottom: 8 };
  const totalCompleted = loggedSets.filter(l => l.exIdx === exIdx).length;

  // ── WARM-UP PHASE ──────────────────────────────────────────────────────────
  if (phase === "warmup") {
    const currentWarmup = warmupExercises[warmupStep];
    const isLastWarmup = warmupStep >= warmupExercises.length - 1;
    return (
      <Layout activeNav="workout" chatTarget="chat_workout">
        <div className="mq-fade" style={{ padding: "1.5rem 1.25rem 0", display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ textAlign: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 10, color: a, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 4 }}>Warm-up · {warmupStep + 1} of {warmupExercises.length}</div>
            <div style={{ fontSize: 13, color: theme.textDim }}>5 minutes before your workout</div>
          </div>
          <div style={{ height: 4, background: "#1A2332", borderRadius: 2, marginBottom: 20 }}>
            <div style={{ height: 4, borderRadius: 2, background: a, width: `${Math.round(((warmupStep + 1) / warmupExercises.length) * 100)}%`, transition: "width .4s" }} />
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 12 }}>
            <div style={{ fontSize: 40 }}>🔥</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: theme.text, lineHeight: 1.2 }}>{currentWarmup?.name}</div>
            <div style={{ fontSize: 18, color: a, fontWeight: 500 }}>{currentWarmup?.duration}</div>
            <div style={{ fontSize: 13, color: theme.textDim, maxWidth: 240, lineHeight: 1.5 }}>Take your time — a proper warm-up reduces injury risk and improves performance.</div>
          </div>
          <div style={{ paddingBottom: "1rem", display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => {
              if (isLastWarmup) { setPhase("active"); }
              else { setWarmupStep(s => s + 1); }
            }} style={{ width: "100%", background: a, color: "#003D35", border: "none", borderRadius: 14, padding: "1rem", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {isLastWarmup ? "Start workout →" : "Done — next →"}
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
            <div style={{ fontSize: 40 }}>🧘</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: theme.text, lineHeight: 1.2 }}>{currentCooldown?.name}</div>
            <div style={{ fontSize: 18, color: a, fontWeight: 500 }}>{currentCooldown?.duration}</div>
          </div>
          <div style={{ paddingBottom: "1rem", display: "flex", flexDirection: "column", gap: 8 }}>
            <button onClick={() => {
              if (isLastCooldown) { setState("done"); }
              else { setCooldownStep(s => s + 1); }
            }} style={{ width: "100%", background: a, color: "#003D35", border: "none", borderRadius: 14, padding: "1rem", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
              {isLastCooldown ? "Finish workout ✓" : "Done — next →"}
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
          <div style={{ fontSize: 36, marginBottom: 12 }}>🏆</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: theme.text, marginBottom: 4 }}>Workout complete!</div>
          <div style={{ fontSize: 14, color: theme.textDim, marginBottom: "1.5rem" }}>Great work, {user.name || "champ"}. Recovery starts now.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%", marginBottom: overloadApplied ? 10 : "1.5rem" }}>
            {[["Sets done", totalSets], ["Total volume", `${totalVol.toLocaleString()} lbs`], ["Exercises", exercises.length], ["Personal bests", "2 🔥"]].map(([l, v]) => (
              <div key={l} style={{ background: theme.surface, border: `0.5px solid ${theme.border}`, borderRadius: 12, padding: ".85rem .75rem" }}>
                <div style={{ fontSize: 20, fontWeight: 600, color: a }}>{v}</div>
                <div style={{ fontSize: 12, color: theme.textDim, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>
          {overloadApplied && (
            <div style={{ width: "100%", background: "#1A1200", border: "1px solid rgba(245,158,11,0.3)", borderRadius: 12, padding: "10px 14px", marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontSize: 20 }}>⚡</div>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#F59E0B" }}>Progressive overload applied</div>
                <div style={{ fontSize: 11, color: theme.textDim, marginTop: 1 }}>Morphiq nudged your weight up this session — you're getting stronger.</div>
              </div>
            </div>
          )}
          <button onClick={() => { recordWorkoutComplete(); navigate("home"); }} style={{ width: "100%", background: a, color: "#003D35", border: "none", borderRadius: 14, padding: "1rem", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Back to dashboard →</button>
        </div>
      </Layout>
    );
  }

  if (state === "confirm") {
    const wasSkipped = lastLoggedReps === 0;
    return (
      <Layout activeNav="workout" chatTarget="chat_workout">
        <div className="mq-fade" style={{ padding: "1.5rem 1.25rem", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "space-between", flex: 1 }}>

          {/* Top — status label */}
          <div style={{ textAlign: "center", paddingTop: "1rem" }}>
            <div style={{ fontSize: 13, color: wasSkipped ? theme.amber : a, textTransform: "uppercase", letterSpacing: "3px", fontWeight: 600 }}>
              {wasSkipped ? "Set Skipped" : "Set Logged"}
            </div>
            {!wasSkipped && (
              <div style={{ fontSize: 11, color: savingToCloud ? theme.textDim : savedToCloud ? a : theme.textFaint, marginTop: 4 }}>
                {savingToCloud ? "☁ Saving to account..." : savedToCloud ? "☁ Saved to account ✓" : supabaseUser?.id ? "☁ Saving..." : ""}
              </div>
            )}
          </div>

          {/* Middle — the big info */}
          <div style={{ textAlign: "center", flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
            {/* Icon */}
            <div style={{ width: 110, height: 110, borderRadius: "50%", background: wasSkipped ? "#1A1A0A" : "#003D35", border: `3px solid ${wasSkipped ? theme.amber : a}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 58, boxShadow: `0 0 50px ${wasSkipped ? "rgba(245,158,11,0.2)" : "rgba(0,212,177,0.3)"}` }}>
              {wasSkipped ? "→" : "✓"}
            </div>

            {wasSkipped ? (
              <div style={{ fontSize: 28, fontWeight: 600, color: theme.textDim }}>Moving to next set</div>
            ) : (
              <>
                <div style={{ fontSize: 96, fontWeight: 700, color: a, lineHeight: 1 }}>{lastLoggedReps}</div>
                <div style={{ fontSize: 28, fontWeight: 500, color: theme.text }}>reps at {currentWeight} lbs</div>
              </>
            )}
          </div>

          {/* Bottom — correction button + countdown bar */}
          <div style={{ width: "100%", paddingBottom: "1rem" }}>
            {!wasSkipped && (
              <button onClick={() => {
                clearTimeout(confirmTimerRef.current);
                const typed = window.prompt("How many reps did you actually do?");
                const n = parseInt(typed);
                if (n > 0 && n < 100) {
                  const updated = [...loggedSets];
                  updated[updated.length - 1] = { ...updated[updated.length - 1], reps: n };
                  setLoggedSets(updated);
                  loggedSetsRef.current = updated;
                  setLastLoggedReps(n);
                }
                goToRestOrNudge();
              }} style={{ width: "100%", background: "#1A2332", border: `1px solid rgba(0,212,177,0.3)`, borderRadius: 14, padding: "16px", fontSize: 18, color: a, cursor: "pointer", fontFamily: "inherit", marginBottom: 16 }}>
                ✏️ Wrong number? Fix it
              </button>
            )}
            <div style={{ fontSize: 13, color: theme.textDim, textAlign: "center", marginBottom: 10 }}>
              {wasSkipped ? "Continuing in 3 seconds..." : "Rest timer starts in 3 seconds..."}
            </div>
            <div style={{ height: 6, background: "#1A2332", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", background: wasSkipped ? theme.amber : a, borderRadius: 4, animation: "confirmCountdown 3s linear forwards" }} />
            </div>
          </div>

        </div>
        <style>{`@keyframes confirmCountdown { from { width: 100%; } to { width: 0%; } }`}</style>
      </Layout>
    );
  }

  if (state === "rest") {
    const RING_SIZE = 220;
    return (
      <Layout activeNav="workout" chatTarget="chat_workout">
        <div className="mq-fade" style={{ padding: "1rem 1.25rem 0", display: "flex", flexDirection: "column", flex: 1 }}>

          {/* Status label */}
          <div style={{ textAlign: "center", fontSize: 10, color: theme.textDim, textTransform: "uppercase", letterSpacing: "2px", marginBottom: 4 }}>Rest</div>

          {/* Logged confirmation strip */}
          <div style={{ background: "#003D35", borderRadius: 8, padding: "6px 10px", fontSize: 12, color: a, textAlign: "center", marginBottom: 16 }}>
            ✓ Logged — {loggedSets[loggedSets.length - 1]?.reps} reps at {loggedSets[loggedSets.length - 1]?.weight} lbs
          </div>

          {/* Big ring + countdown number */}
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 16, position: "relative" }}>
            <RestRing secondsLeft={restSecs} totalSeconds={activeRestSecs} accent={a} size={RING_SIZE} />
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
              <div style={{ fontSize: 80, fontWeight: 700, color: restSecs <= 15 ? theme.amber : theme.text, lineHeight: 1, transition: "color 0.3s" }}>{restSecs}</div>
              <div style={{ fontSize: 13, color: theme.textDim, marginTop: 2 }}>seconds</div>
            </div>
          </div>

          {/* Up next — large and prominent */}
          <div style={{ background: "#0A1A14", border: `1px solid rgba(0,212,177,0.25)`, borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <div style={{ width: 42, height: 42, borderRadius: 10, background: "#003D35", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 20, color: a }}>→</div>
            <div>
              <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 2 }}>Up next</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: theme.text, lineHeight: 1.1 }}>{ex.name}</div>
              <div style={{ fontSize: 13, color: theme.textDim, marginTop: 3 }}>Set {setIdx + 2} · {currentWeight} lbs · {ex.targetReps} reps</div>
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

  const isLastSet = setIdx === ex.sets - 1;
  const displayReps = repCount !== null ? repCount : ex.targetReps;

  return (
    <Layout activeNav="workout" chatTarget="chat_workout">
      <div className="mq-fade" style={{ padding: "1rem 1.25rem 0", display: "flex", flexDirection: "column", flex: 1 }}>

        {/* Header — exercise name front and center */}
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 10, color: theme.textDim, letterSpacing: "2px", textTransform: "uppercase", marginBottom: 6 }}>Set {setIdx + 1} of {ex.sets}</div>
          <div style={{ fontSize: 42, fontWeight: 700, color: theme.text, lineHeight: 1.1, marginBottom: 6 }}>{ex.name}</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ fontSize: 13, color: theme.textDim }}>{ex.muscle}</div>
            <Pill variant={isLastSet ? "amber" : "teal"}>{isLastSet ? "Final set" : `Target: ${ex.targetReps} reps`}</Pill>
            {ex.rpe && <div style={{ background: "#1A2332", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 20, padding: "2px 8px", fontSize: 10, color: "#A78BFA" }}>RPE {ex.rpe}</div>}
          </div>
        </div>

        <SetDots total={ex.sets} current={setIdx} />

        {state === "nudge" && nudgedWeight && (
          <AINudgeCard
            exercise={ex}
            oldWeight={ex.weight}
            newWeight={nudgedWeight}
            onAccept={() => { nudgeAcceptedRef.current = true; setState("rest"); }}
            onKeep={() => { setNudgedWeight(ex.weight); nudgeAcceptedRef.current = true; setState("rest"); }}
          />
        )}

        {/* Weight display */}
        <div style={{ background: "#1A2332", borderRadius: 12, padding: "10px 12px", marginBottom: 10, textAlign: "center" }}>
          <div style={{ fontSize: 10, color: theme.textDim, marginBottom: 2 }}>Weight this set</div>
          <div style={{ fontSize: 52, fontWeight: 700, color: a, lineHeight: 1 }}>{currentWeight} <span style={{ fontSize: 18, color: theme.textDim }}>lbs</span></div>
          {nudgeAcceptedRef.current ? (
            <div style={{ fontSize: 10, color: "#F59E0B", marginTop: 4 }}>⚡ Progressive overload applied</div>
          ) : (
            <div style={{ fontSize: 10, color: theme.textDim, marginTop: 4 }}>{currentWeight === ex.weight ? "Today's target" : `+${currentWeight - ex.weight} lbs from plan`}</div>
          )}
        </div>

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
            {repCount !== null ? "Tap mic or Log ✓ to save" : "Tap − / + to adjust, or speak your reps"}
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
            style={{ flex: 1, background: "transparent", border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 10, padding: "9px 6px", fontSize: 10, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>Swap exercise</button>
          <button onClick={() => logSet(displayReps)}
            style={{ flex: 2, background: a, border: "none", borderRadius: 10, padding: "9px 6px", fontSize: 12, color: "#003D35", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Log {displayReps} reps ✓</button>
        </div>

        <div style={{ marginTop: 8, fontSize: 9, color: theme.textFaint, textAlign: "center" }}>
          Exercise {exIdx + 1} of {exercises.length} · {totalCompleted} sets logged
        </div>
      </div>

      {/* ── Swap confirmation banner ── */}
      {swapConfirmName && (
        <div className="mq-fade" style={{ position: "absolute", top: 60, left: 16, right: 16, background: "#0A1628", border: `1px solid rgba(0,212,177,0.3)`, borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, zIndex: 20 }}>
          <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#003D35", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>✓</div>
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
                style={{ background: "#1A2332", border: "none", borderRadius: 8, width: 30, height: 30, fontSize: 16, color: "#6B7A8D", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
            {/* Muscle group label */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#0A1628", border: `1px solid rgba(0,212,177,0.15)`, borderRadius: 20, padding: "3px 10px", marginBottom: 14 }}>
              <span style={{ fontSize: 10, color: a }}>💪</span>
              <span style={{ fontSize: 11, color: "#9BB3C8" }}>{ex.muscle}</span>
            </div>
            {/* Alternatives list — show plan's alternative first if available */}
            {ex.alternative && (
              <button key={ex.alternative} onClick={() => doSwap({ name: ex.alternative, muscle: ex.muscle, sets: ex.sets, targetReps: ex.targetReps, weight: Math.round(ex.weight * 0.85), rpe: ex.rpe, alternative: null })}
                style={{ width: "100%", background: "#0A1A14", border: `1px solid rgba(0,212,177,0.3)`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontFamily: "inherit" }}>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#E8EDF2" }}>{ex.alternative}</div>
                  <div style={{ fontSize: 11, color: a, marginTop: 2 }}>✦ Recommended — same muscle group</div>
                </div>
                <div style={{ background: "#003D35", border: `1px solid rgba(0,212,177,0.25)`, borderRadius: 8, padding: "5px 10px", fontSize: 11, color: a, fontWeight: 600, flexShrink: 0, marginLeft: 10 }}>Swap →</div>
              </button>
            )}
            {(SWAP_ALTERNATIVES[ex.muscle] || SWAP_FALLBACK).map((alt) => (
              <button key={alt.name} onClick={() => doSwap(alt)}
                style={{ width: "100%", background: "#1A2332", border: `1px solid rgba(255,255,255,0.06)`, borderRadius: 12, padding: "12px 14px", marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", fontFamily: "inherit" }}>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#E8EDF2" }}>{alt.name}</div>
                  <div style={{ fontSize: 11, color: "#6B7A8D", marginTop: 2 }}>{alt.muscle} · {alt.targetReps} reps · {alt.sets} sets</div>
                </div>
                <div style={{ background: "#003D35", border: `1px solid rgba(0,212,177,0.25)`, borderRadius: 8, padding: "5px 10px", fontSize: 11, color: a, fontWeight: 600, flexShrink: 0, marginLeft: 10 }}>Swap →</div>
              </button>
            ))}
            <button onClick={() => setShowSwapSheet(false)}
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

export { WorkoutScreen };
