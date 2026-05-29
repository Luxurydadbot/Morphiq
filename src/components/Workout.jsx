import { useState, useEffect, useRef } from "react";
import { useApp } from "../utils/context";
import { theme } from "../utils/theme";
import { Layout, VoiceBtn, Pill } from "./Shared";
import sb from "../utils/supabase";


// ─── WORKOUT SCREEN ───────────────────────────────────────────────────────────
const WORKOUT_EXERCISES = [
  { name: "Goblet Squat", muscle: "Quads / Glutes", sets: 3, targetReps: 12, weight: 25 },
  { name: "Dumbbell Row", muscle: "Back / Biceps", sets: 3, targetReps: 10, weight: 30 },
  { name: "Incline Press", muscle: "Chest / Shoulders", sets: 3, targetReps: 10, weight: 35 },
  { name: "Romanian Deadlift", muscle: "Hamstrings", sets: 3, targetReps: 10, weight: 65 },
  { name: "Shoulder Press", muscle: "Shoulders", sets: 3, targetReps: 10, weight: 25 },
];

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

function RestRing({ secondsLeft, totalSeconds, accent }) {
  const r = 38;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - secondsLeft / totalSeconds);
  const isLow = secondsLeft <= 15;
  const color = isLow ? "#F59E0B" : accent;
  return (
    <svg width="100" height="100" viewBox="0 0 100 100" style={{ transform: "rotate(-90deg)" }}>
      <circle cx="50" cy="50" r={r} fill="none" stroke="#1A2332" strokeWidth="7" />
      <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={offset} className="mq-ring-fill" style={{ transition: "stroke-dashoffset 1s linear, stroke .3s" }} />
    </svg>
  );
}

function AINudgeCard({ exercise, oldWeight, newWeight, onAccept, onKeep }) {
  const { gymBranding } = useApp();
  const a = gymBranding.accent;
  return (
    <div className="mq-fade" style={{ background: "#0A1628", border: `1px solid rgba(0,212,177,0.2)`, borderRadius: 12, padding: "10px 12px", marginBottom: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        <div style={{ width: 20, height: 20, borderRadius: "50%", background: "#003D35", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 10, color: a }}>✓</div>
        <div style={{ fontSize: 10, color: a, fontWeight: 600 }}>Morphiq noticed something</div>
      </div>
      <div style={{ fontSize: 10, color: "#9BB3C8", lineHeight: 1.5, marginBottom: 8 }}>
        You exceeded target reps both sets. Nudging weight to{" "}
        <span style={{ color: "#E8EDF2", fontWeight: 600 }}>{newWeight} lbs</span> for this set.
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button onClick={onKeep} style={{ flex: 1, background: "transparent", border: `1px solid rgba(255,255,255,0.12)`, borderRadius: 8, padding: "6px 4px", fontSize: 10, color: "#6B7A8D", cursor: "pointer", fontFamily: "inherit" }}>Keep {oldWeight} lbs</button>
        <button onClick={onAccept} style={{ flex: 2, background: a, border: "none", borderRadius: 8, padding: "6px 4px", fontSize: 10, color: "#003D35", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Use {newWeight} lbs ✦</button>
      </div>
    </div>
  );
}

export default function WorkoutScreen() {
  const { navigate, user, gymBranding, plan, supabaseUser } = useApp();
  const a = gymBranding.accent;

  // Use AI-generated exercises if available, else fall back to defaults
  const exercises = (plan?.exercises || WORKOUT_EXERCISES).map(e => ({
    name: e.name, muscle: e.muscle, sets: e.sets,
    targetReps: e.reps || e.targetReps, weight: e.weight,
  }));

  const [exIdx, setExIdx] = useState(0);
  const [setIdx, setSetIdx] = useState(0);
  const [loggedSets, setLoggedSets] = useState([]);
  const [state, setState] = useState("active");

  const [listening, setListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");

  const REST_SECS = user?.restTimerSecs || 60;
  const [restSecs, setRestSecs] = useState(REST_SECS);
  const timerRef = useRef(null);

  const [nudgedWeight, setNudgedWeight] = useState(null);

  const ex = exercises[exIdx];
  const currentWeight = nudgedWeight ?? ex.weight;
  const nextEx = exercises[exIdx + 1];

  useEffect(() => {
    if (state === "rest") {
      setRestSecs(REST_SECS);
      timerRef.current = setInterval(() => {
        setRestSecs(s => {
          if (s <= 1) { clearInterval(timerRef.current); advanceSet(); return 0; }
          return s - 1;
        });
      }, 1000);
    }
    return () => clearInterval(timerRef.current);
  }, [state]);

  function logSet(reps = ex.targetReps + 1) {
    const entry = { exIdx, setIdx, reps, weight: currentWeight };
    const newLogs = [...loggedSets, entry];
    setLoggedSets(newLogs);
    setVoiceTranscript("");
    setListening(false);

    // Persist to Supabase workout_logs (fire-and-forget)
    if (supabaseUser?.id) {
      sb.insertWorkoutLog(supabaseUser.id, {
        exerciseName: ex.name,
        setNumber: setIdx + 1,
        reps,
        weight: currentWeight,
      }).catch(() => {});
    }

    const prevSets = newLogs.filter(l => l.exIdx === exIdx);
    const exceeded = prevSets.filter(l => l.reps > ex.targetReps).length;
    const isLastSet = setIdx === ex.sets - 1;

    if (exceeded >= 2 && !isLastSet) {
      setNudgedWeight(currentWeight + 5);
      setState("nudge");
    } else {
      setState("rest");
    }
  }

  function advanceSet() {
    setNudgedWeight(null);
    if (setIdx < ex.sets - 1) {
      setSetIdx(s => s + 1);
      setState("active");
    } else if (exIdx < exercises.length - 1) {
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

  function simulateListen() {
    setListening(true);
    setTimeout(() => {
      setVoiceTranscript(`"Did ${ex.targetReps + 1} reps"`);
      setTimeout(() => logSet(ex.targetReps + 1), 800);
    }, 1500);
  }

  const card = { background: "#1A2332", borderRadius: 12, padding: "10px 12px", marginBottom: 8 };
  const totalCompleted = loggedSets.filter(l => l.exIdx === exIdx).length;

  if (state === "done") {
    const totalSets = loggedSets.length;
    const totalVol = loggedSets.reduce((acc, l) => acc + l.reps * l.weight, 0);
    return (
      <Layout activeNav="workout" chatTarget="chat_workout">
        <div className="mq-fade" style={{ padding: "2rem 1.25rem 0", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <div style={{ fontSize: 22, fontWeight: 600, color: theme.text, marginBottom: 4 }}>Workout complete!</div>
          <div style={{ fontSize: 14, color: theme.textDim, marginBottom: "1.5rem" }}>Great work, {user.name || "champ"}. Recovery starts now.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, width: "100%", marginBottom: "1.5rem" }}>
            {[["Sets done", totalSets], ["Total volume", `${totalVol.toLocaleString()} lbs`], ["Exercises", WORKOUT_EXERCISES.length], ["Personal bests", "2 🔥"]].map(([l, v]) => (
              <div key={l} style={{ background: theme.surface, border: `0.5px solid ${theme.border}`, borderRadius: 12, padding: ".85rem .75rem" }}>
                <div style={{ fontSize: 20, fontWeight: 600, color: a }}>{v}</div>
                <div style={{ fontSize: 12, color: theme.textDim, marginTop: 2 }}>{l}</div>
              </div>
            ))}
          </div>
          <button onClick={() => navigate("home")} style={{ width: "100%", background: a, color: "#003D35", border: "none", borderRadius: 14, padding: "1rem", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Back to dashboard →</button>
        </div>
      </Layout>
    );
  }

  if (state === "rest") {
    return (
      <Layout activeNav="workout" chatTarget="chat_workout">
        <div className="mq-fade" style={{ padding: "1rem 1.25rem 0", display: "flex", flexDirection: "column" }}>
          <div style={{ textAlign: "center", fontSize: 9, color: theme.textDim, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 6 }}>Rest</div>
          <div style={{ background: "#003D35", borderRadius: 8, padding: "5px 10px", fontSize: 10, color: a, textAlign: "center", marginBottom: 10 }}>
            Logged — {loggedSets[loggedSets.length - 1]?.reps} reps at {loggedSets[loggedSets.length - 1]?.weight} lbs ✓
          </div>
          <div style={{ display: "flex", justifyContent: "center", marginBottom: 10, position: "relative" }}>
            <RestRing secondsLeft={restSecs} totalSeconds={REST_SECS} accent={a} />
            <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: theme.text, lineHeight: 1 }}>{restSecs}</div>
              <div style={{ fontSize: 9, color: theme.textDim }}>seconds</div>
            </div>
          </div>
          <div style={{ textAlign: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: theme.textDim }}>Rest up — next set coming</div>
            <div style={{ fontSize: 10, color: a, marginTop: 2 }}>Or tap below to start now</div>
          </div>
          <div style={{ background: "#0F1922", border: `1px solid rgba(0,212,177,0.12)`, borderRadius: 10, padding: "8px 10px", display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: "#003D35", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 12, color: a }}>→</div>
            <div>
              <div style={{ fontSize: 9, color: theme.textDim }}>Up next</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: theme.text }}>{ex.name} — Set {setIdx + 2}</div>
              <div style={{ fontSize: 9, color: theme.textDim }}>{currentWeight} lbs · {ex.targetReps} reps target</div>
            </div>
          </div>
          {nextEx && (
            <div style={{ background: "#0F1922", border: `1px solid rgba(255,255,255,0.04)`, borderRadius: 10, padding: "8px 10px", display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: "#1A2332", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 10, color: theme.textDim }}>⏱</div>
              <div>
                <div style={{ fontSize: 9, color: theme.textDim }}>After that</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: theme.text }}>{nextEx.name}</div>
                <div style={{ fontSize: 9, color: theme.textDim }}>{nextEx.sets} sets · {nextEx.targetReps} reps target</div>
              </div>
            </div>
          )}
          <button onClick={skipRest} style={{ width: "100%", background: "transparent", border: `1px solid rgba(0,212,177,0.3)`, borderRadius: 10, padding: "9px", fontSize: 11, color: a, cursor: "pointer", fontFamily: "inherit", marginTop: "auto" }}>Skip rest — I'm ready</button>
        </div>
      </Layout>
    );
  }

  const isLastSet = setIdx === ex.sets - 1;
  return (
    <Layout activeNav="workout" chatTarget="chat_workout">
      <div className="mq-fade" style={{ padding: "1rem 1.25rem 0", display: "flex", flexDirection: "column", flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 9, color: theme.textDim, letterSpacing: "1.5px", textTransform: "uppercase" }}>Set {setIdx + 1} of {ex.sets}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: theme.text }}>{ex.name}</div>
            <div style={{ fontSize: 11, color: theme.textDim }}>{ex.muscle}</div>
          </div>
          <Pill variant={isLastSet ? "amber" : "teal"}>{isLastSet ? "Final set" : `Target: ${ex.targetReps} reps`}</Pill>
        </div>

        <SetDots total={ex.sets} current={setIdx} />

        {state === "nudge" && nudgedWeight && (
          <AINudgeCard
            exercise={ex}
            oldWeight={ex.weight + setIdx * 5}
            newWeight={nudgedWeight}
            onAccept={() => { setState("active"); }}
            onKeep={() => { setNudgedWeight(ex.weight + setIdx * 5); setState("active"); }}
          />
        )}

        <div style={{ ...card, textAlign: "center" }}>
          <div style={{ fontSize: 10, color: theme.textDim, marginBottom: 2 }}>Weight this set</div>
          <div style={{ fontSize: 34, fontWeight: 700, color: a, lineHeight: 1 }}>{currentWeight} <span style={{ fontSize: 14, color: theme.textDim }}>lbs</span></div>
          {state === "nudge"
            ? <div style={{ fontSize: 9, color: theme.amber, marginTop: 3 }}>Progressive overload applied</div>
            : <div style={{ fontSize: 9, color: theme.textDim, marginTop: 3 }}>+5lb from last session</div>}
        </div>

        <div style={{ textAlign: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 10, color: theme.textDim, marginBottom: 10 }}>
            {listening ? "Listening..." : "Finish your set, then tap to log reps"}
          </div>
          {voiceTranscript ? (
            <div className="mq-fade" style={{ background: "#0A1628", border: `1px solid rgba(0,212,177,0.15)`, borderRadius: 10, padding: "8px 12px", fontSize: 10, color: "#9BB3C8", fontStyle: "italic", marginBottom: 8 }}>
              {voiceTranscript}
            </div>
          ) : listening ? (
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 3, height: 28, marginBottom: 8 }} className="mq-wave">
              {[1,2,3,4,5,6].map(i => <span key={i} />)}
            </div>
          ) : null}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <VoiceBtn listening={listening && !voiceTranscript} onPress={simulateListen} size={60} />
          </div>
          {listening && !voiceTranscript && <div style={{ fontSize: 9, color: a, marginTop: 6 }}>Listening...</div>}
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: "auto" }}>
          <button onClick={() => { logSet(ex.targetReps - 2); }} style={{ flex: 1, background: "transparent", border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 10, padding: "7px 6px", fontSize: 10, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>Skip set</button>
          <button onClick={() => { if (exIdx < WORKOUT_EXERCISES.length - 1) { setExIdx(i => i + 1); setSetIdx(0); setNudgedWeight(null); setState("active"); } }} style={{ flex: 1, background: "transparent", border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 10, padding: "7px 6px", fontSize: 10, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>Swap exercise</button>
          <button onClick={logSet} style={{ flex: 1, background: a, border: "none", borderRadius: 10, padding: "7px 6px", fontSize: 10, color: "#003D35", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Log ✓</button>
        </div>

        <div style={{ marginTop: 10, fontSize: 9, color: theme.textFaint, textAlign: "center" }}>
          Exercise {exIdx + 1} of {WORKOUT_EXERCISES.length} · {totalCompleted} sets logged
        </div>
      </div>
    </Layout>
  );
}

