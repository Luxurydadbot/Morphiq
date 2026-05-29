import { useState, useEffect, useRef } from "react";
import { useApp } from "../utils/context";
import { theme, GOAL_OPTIONS } from "../utils/theme";
import { Layout, Pill } from "./Shared";
import sb from "../utils/supabase";


// ─── PLAN OVERVIEW ─────────────────────────────────────────────────────────────
const EXERCISES_DISPLAY = [
  { name: "Goblet squat", weight: "35 lbs", reps: "10 reps", sets: "3 sets" },
  { name: "Dumbbell bench press", weight: "30 lbs", reps: "10 reps", sets: "3 sets" },
  { name: "Seated cable row", weight: "85 lbs", reps: "12 reps", sets: "3 sets" },
  { name: "Dumbbell shoulder press", weight: "25 lbs", reps: "10 reps", sets: "3 sets" },
  { name: "Romanian deadlift", weight: "65 lbs", reps: "10 reps", sets: "3 sets" },
];

const WEEK = [
  { name: "Mon", type: "Full body", isWorkout: true }, { name: "Tue", type: "Rest", isWorkout: false },
  { name: "Wed", type: "Full body", isWorkout: true }, { name: "Thu", type: "Rest", isWorkout: false },
  { name: "Fri", type: "Full body", isWorkout: true }, { name: "Sat", type: "Rest", isWorkout: false },
  { name: "Sun", type: "Rest", isWorkout: false },
];

export default function PlanOverviewScreen() {
  const { navigate, user, gymBranding } = useApp();
  const a = gymBranding.accent;
  const [activeDay, setActiveDay] = useState(0);
  const day = WEEK[activeDay];
  const sL = { fontSize: 11, color: theme.textDim, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: ".75rem" };
  const goalLabel = GOAL_OPTIONS.find(g => g.id === user.goal)?.label?.toLowerCase() || "fitness";

  return (
    <Layout activeNav="home">
      <div style={{ padding: "1.75rem 1.25rem 1.25rem", borderBottom: `0.5px solid ${theme.borderSubtle}` }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(0,212,177,0.1)", border: "0.5px solid rgba(0,212,177,0.25)", borderRadius: 20, padding: "4px 12px", fontSize: 12, color: a, fontWeight: 500, marginBottom: ".75rem" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: a }} />Plan ready
        </div>
        <div style={{ fontSize: 22, fontWeight: 500, color: "#F0F0F0", lineHeight: 1.3, marginBottom: ".4rem" }}>Your 4-week {goalLabel} program is live</div>
        <div style={{ fontSize: 14, color: theme.textDim }}>3 workouts per week · Full body · Beginner</div>
      </div>
      <div style={{ padding: "1.25rem 1.25rem 0" }}>
        <div style={sL}>Daily targets</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
          {[["1,840", "Calories", "100%", a], ["155g", "Protein", "72%", "#5DCAA5"], ["185g", "Carbs", "55%", "#1D9E75"]].map(([v, l, w, c]) => (
            <div key={l} style={{ background: theme.surface, border: `0.5px solid ${theme.border}`, borderRadius: 12, padding: ".85rem .75rem" }}>
              <div style={{ fontSize: 20, fontWeight: 500, color: "#F0F0F0" }}>{v}</div>
              <div style={{ fontSize: 12, color: theme.textDim, marginTop: 2 }}>{l}</div>
              <div style={{ height: 3, background: "#222", borderRadius: 2, marginTop: 6 }}><div style={{ height: 3, borderRadius: 2, background: c, width: w }} /></div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: "1.25rem 1.25rem 0" }}>
        <div style={sL}>This week</div>
        <div style={{ display: "flex", gap: 6 }}>
          {WEEK.map((d, i) => (
            <button key={i} onClick={() => setActiveDay(i)} style={{ flex: 1, background: i === activeDay ? "rgba(0,212,177,0.07)" : theme.surface, border: `0.5px solid ${i === activeDay ? a : theme.border}`, borderRadius: 10, padding: ".6rem .25rem", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer", opacity: !d.isWorkout ? 0.5 : 1, fontFamily: "inherit" }}>
              <span style={{ fontSize: 10, color: i === activeDay ? a : theme.textDim, textTransform: "uppercase", letterSpacing: ".06em" }}>{d.name}</span>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: i === activeDay ? a : d.isWorkout ? "#1A4A44" : "#2A2A2A" }} />
              <span style={{ fontSize: 9, color: i === activeDay ? "#5DCAA5" : "#444", textAlign: "center", lineHeight: 1.3 }}>{d.type}</span>
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: "1.25rem 1.25rem 0" }}>
        <div style={sL}>{activeDay === 0 ? "Today's workout" : `${day.name}'s workout`}</div>
        <div className="mq-fade" style={{ background: theme.surface, border: `0.5px solid ${theme.border}`, borderRadius: 16, overflow: "hidden" }}>
          {day.isWorkout ? <>
            <div style={{ padding: "1rem 1.25rem", borderBottom: `0.5px solid ${theme.borderSubtle}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><div style={{ fontSize: 15, fontWeight: 500, color: "#F0F0F0" }}>Full body A</div><div style={{ fontSize: 12, color: theme.textDim, marginTop: 2 }}>5 exercises · ~40 min</div></div>
              <div style={{ background: "#1E1E1E", borderRadius: 8, padding: "4px 10px", fontSize: 12, color: theme.textMuted }}>40 min</div>
            </div>
            {EXERCISES_DISPLAY.map((ex, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: ".8rem 1.25rem", borderBottom: i < 4 ? `0.5px solid #1A1A1A` : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: "#1E1E1E", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: theme.textDim, fontWeight: 500, flexShrink: 0 }}>{i + 1}</div>
                  <div><div style={{ fontSize: 14, color: "#D0D0D0" }}>{ex.name}</div><div style={{ fontSize: 12, color: theme.textDim, marginTop: 2 }}>{ex.weight} · {ex.reps}</div></div>
                </div>
                <div style={{ fontSize: 12, color: theme.textMuted, background: "#1A1A1A", borderRadius: 6, padding: "3px 8px" }}>{ex.sets}</div>
              </div>
            ))}
          </> : (
            <div style={{ padding: "2rem", display: "flex", flexDirection: "column", alignItems: "center", gap: ".75rem", textAlign: "center" }}>
              <div style={{ fontSize: 20 }}>💤</div><div style={{ fontSize: 15, fontWeight: 500, color: theme.textMuted }}>Recovery day</div>
            </div>
          )}
        </div>
      </div>
      <div style={{ padding: "1.25rem" }}>
        <button onClick={() => navigate("home")} style={{ width: "100%", background: a, color: "#0A1F1D", border: "none", borderRadius: 14, padding: "1rem", fontSize: 16, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Go to dashboard →</button>
      </div>
    </Layout>
  );
}

