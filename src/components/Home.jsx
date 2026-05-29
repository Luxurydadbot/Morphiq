import { useState, useEffect, useRef } from "react";
import { useApp } from "../utils/context";
import { theme } from "../utils/theme";
import { Layout, Pill } from "./Shared";
import sb from "../utils/supabase";


// ─── HOME DASHBOARD ────────────────────────────────────────────────────────────
export default function HomeDashboardScreen() {
  const { navigate, user, gymBranding, historicalData } = useApp();
  const a = gymBranding.accent;
  const [done, setDone] = useState(0);
  const [cals, setCals] = useState(1100);
  const [logged, setLogged] = useState(false);
  const calGoal = 1840;
  const h = new Date().getHours();
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const sL = { fontSize: 11, color: theme.textDim, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: ".65rem" };

  // Real historical values — fall back to placeholders until data loads
  const streak = historicalData?.streak ?? "—";
  const totalWorkouts = historicalData?.totalWorkouts ?? "—";
  const weightChange = historicalData?.weightChange;
  const lastSession = historicalData?.lastSession;
  const weightChangeLabel = weightChange !== null && weightChange !== undefined
    ? (parseFloat(weightChange) <= 0 ? `${weightChange} lbs` : `+${weightChange} lbs`)
    : "—";

  // AI coach message — personalised when we have history
  const coachMsg = lastSession
    ? `${greeting}, ${user.name || "there"}. Last workout: ${new Date(lastSession + "T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}. ${streak > 1 ? `You're on a ${streak}-day streak — keep it up!` : "Ready to train today?"}`
    : `${greeting}, ${user.name || "there"}. Your plan is ready — let's get your first session in today.`;

  return (
    <Layout activeNav="home">
      <div style={{ margin: "1.5rem 1.25rem 0", background: theme.surface, border: `0.5px solid ${theme.border}`, borderRadius: 16, padding: "1rem 1.25rem", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#1A2E2B", border: `1.5px solid ${a}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🤖</div>
        <div>
          <div style={{ fontSize: 12, color: a, fontWeight: 500, marginBottom: 4 }}>Your coach</div>
          <div style={{ fontSize: 14, color: "#C0C0C0", lineHeight: 1.55 }}>{coachMsg}</div>
        </div>
      </div>
      <div style={{ padding: "1.25rem 1.25rem 0" }}>
        <div style={sL}>Today's workout</div>
        <div style={{ background: theme.surface, border: `0.5px solid ${theme.border}`, borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "1.1rem 1.25rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div><div style={{ fontSize: 18, fontWeight: 500, color: "#F0F0F0" }}>Full body A</div><div style={{ fontSize: 13, color: theme.textDim, marginTop: 4 }}>5 exercises · ~40 min</div></div>
            <div style={{ background: "rgba(0,212,177,0.1)", border: "0.5px solid rgba(0,212,177,0.25)", borderRadius: 8, padding: "4px 10px", fontSize: 12, color: a, fontWeight: 500 }}>Full body</div>
          </div>
          <div style={{ padding: "0 1.25rem .9rem", display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["3 sets each", "Beginner", "Week 2"].map(t => <div key={t} style={{ background: "#1E1E1E", borderRadius: 8, padding: "5px 10px", fontSize: 12, color: theme.textMuted, display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 5, height: 5, borderRadius: "50%", background: a }} />{t}</div>)}
          </div>
          <div style={{ margin: "0 1.25rem .5rem", height: 3, background: "#1A1A1A", borderRadius: 2 }}>
            <div style={{ height: 3, borderRadius: 2, background: done === 5 ? theme.success : a, width: `${Math.round((done / 5) * 100)}%`, transition: "width .5s" }} />
          </div>
          <div style={{ padding: "0 1.25rem .5rem", fontSize: 12, color: done === 5 ? theme.success : theme.textDim }}>{done === 5 ? "Workout complete! ✓" : `${done} of 5 exercises done`}</div>
          <div style={{ padding: "0 1.25rem 1.25rem" }}>
            <button onClick={() => navigate("workout")} style={{ width: "100%", background: done === 5 ? theme.success : a, color: done === 5 ? "#E1F5EE" : "#0A1F1D", border: "none", borderRadius: 12, padding: ".85rem", fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
              {done === 0 ? "Start workout" : done === 5 ? "View summary →" : "Continue workout →"}
            </button>
          </div>
        </div>
      </div>
      <div style={{ padding: "1.25rem 1.25rem 0" }}>
        <div style={sL}>Your progress</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
          {[
            [`${streak > 0 ? "🔥 " : ""}${streak}`, "Day streak", streak > 0 ? "#E8874A" : null],
            [`${totalWorkouts}`, "Total workouts", null],
            [weightChangeLabel, "Since you started", parseFloat(weightChange) <= 0 ? a : "#F87171"],
          ].map(([v, l, c]) => (
            <div key={l} style={{ background: theme.surface, border: `0.5px solid ${theme.borderSubtle}`, borderRadius: 12, padding: ".85rem .75rem" }}>
              <div style={{ fontSize: 18, fontWeight: 500, color: c || "#F0F0F0" }}>{v}</div>
              <div style={{ fontSize: 12, color: theme.textDim, marginTop: 4 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: "1.25rem 1.25rem 0" }}>
        <div style={sL}>Nutrition today</div>
        <div style={{ background: theme.surface, border: `0.5px solid ${theme.border}`, borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: ".9rem 1.25rem", borderBottom: `0.5px solid ${theme.borderSubtle}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: "#F0F0F0" }}>Calories</div>
            <div style={{ fontSize: 13, color: a, fontWeight: 500 }}>{calGoal - cals} remaining</div>
          </div>
          <div style={{ padding: ".75rem 1.25rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: theme.textDim, marginBottom: 6 }}>
              <span>{cals.toLocaleString()} eaten</span><span>{calGoal.toLocaleString()} goal</span>
            </div>
            <div style={{ height: 6, background: "#1E1E1E", borderRadius: 3 }}>
              <div style={{ height: 6, borderRadius: 3, background: a, width: `${Math.round((cals / calGoal) * 100)}%`, transition: "width .5s" }} />
            </div>
          </div>
          <div style={{ padding: ".75rem 1.25rem", borderTop: `0.5px solid ${theme.borderSubtle}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 2 }}>Next suggested meal</div>
              <div style={{ fontSize: 14, color: "#D0D0D0", fontWeight: 500 }}>Grilled chicken + rice</div>
              <div style={{ fontSize: 12, color: theme.textDim }}>~480 cal · 42g protein</div>
            </div>
            <button onClick={() => { if (!logged) { setCals(1580); setLogged(true); } }} style={{ background: "transparent", border: `0.5px solid ${logged ? a : "#2A2A2A"}`, borderRadius: 8, padding: "5px 12px", fontSize: 12, color: logged ? a : theme.textMuted, cursor: "pointer", fontFamily: "inherit" }}>
              {logged ? "Logged ✓" : "Log meal"}
            </button>
          </div>
        </div>
      </div>
      <div style={{ padding: "1.25rem 1.25rem 0" }}>
        <button onClick={() => navigate("meals")} style={{ width: "100%", background: "transparent", border: `0.5px solid ${theme.border}`, borderRadius: 12, padding: ".85rem", fontSize: 14, color: a, cursor: "pointer", fontFamily: "inherit" }}>
          View full meal plan →
        </button>
      </div>
      <div style={{ padding: ".75rem 1.25rem 0" }}>
        <button onClick={() => navigate("owner")} style={{ width: "100%", background: "transparent", border: `0.5px solid rgba(167,139,250,0.3)`, borderRadius: 12, padding: ".75rem", fontSize: 12, color: "#A78BFA", cursor: "pointer", fontFamily: "inherit" }}>
          ⚙️ Gym owner dashboard →
        </button>
      </div>
    </Layout>
  );
}

