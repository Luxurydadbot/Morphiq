import { useState, useEffect, useRef } from "react";
import { useApp } from "../utils/context";
import { theme } from "../utils/theme";
import { GOAL_OPTIONS } from "../utils/theme";
import { Layout, Pill } from "./Shared";
import sb from "../utils/supabase";


// ─── PROFILE SCREEN ───────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const { navigate, user, setUser, gymBranding, signOut, supabaseUser, plan } = useApp();
  const a = gymBranding.accent;
  const [editGoal, setEditGoal] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState(user.goal || "lose_fat");

  const goalLabel = GOAL_OPTIONS.find(g => g.id === selectedGoal)?.label || "Lose fat";
  const sL = { fontSize: 11, color: theme.textDim, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 10 };

  const StatRow = ({ label, value, sub }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <div>
        <div style={{ fontSize: 13, color: theme.text }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: theme.textDim, marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: a }}>{value}</div>
    </div>
  );

  return (
    <Layout activeNav="progress">
      <div style={{ padding: "1.25rem 1.25rem 0" }}>
        {/* Avatar + Name */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#003D35", border: `2px solid ${a}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: a, flexShrink: 0 }}>
            {(user.name || "?")[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: theme.text }}>{user.name || "Member"}</div>
            <div style={{ fontSize: 12, color: theme.textDim, marginTop: 2 }}>{gymBranding.name} · Member</div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#003D35", border: `1px solid rgba(0,212,177,0.25)`, borderRadius: 20, padding: "2px 8px", marginTop: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: a }} />
              <span style={{ fontSize: 10, color: a }}>Week 3 · Fat loss plan</span>
            </div>
          </div>
        </div>

        {/* Goal card */}
        <div style={sL}>Your Goal</div>
        <div style={{ background: "#1A2332", borderRadius: 14, padding: "12px 14px", marginBottom: 16 }}>
          {!editGoal ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: theme.text }}>{goalLabel}</div>
                <div style={{ fontSize: 12, color: theme.textDim, marginTop: 2 }}>3 workouts/week · Beginner</div>
              </div>
              <button onClick={() => setEditGoal(true)} style={{ background: "#003D35", border: `1px solid rgba(0,212,177,0.3)`, borderRadius: 8, padding: "5px 12px", fontSize: 11, color: a, cursor: "pointer", fontFamily: "inherit" }}>Change</button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 10 }}>Choose new goal:</div>
              {GOAL_OPTIONS.map(g => (
                <button key={g.id} onClick={() => setSelectedGoal(g.id)}
                  style={{ width: "100%", background: selectedGoal === g.id ? "#003D35" : "transparent", border: `1px solid ${selectedGoal === g.id ? a : "rgba(255,255,255,0.08)"}`, borderRadius: 10, padding: "8px 10px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 6, fontFamily: "inherit", textAlign: "left" }}>
                  <span style={{ fontSize: 14 }}>{g.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 500, color: selectedGoal === g.id ? a : theme.text }}>{g.label}</span>
                </button>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <button onClick={() => setEditGoal(false)} style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px", fontSize: 12, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                <button onClick={() => setEditGoal(false)} style={{ flex: 2, background: a, border: "none", borderRadius: 10, padding: "8px", fontSize: 12, fontWeight: 600, color: "#003D35", cursor: "pointer", fontFamily: "inherit" }}>Save goal</button>
              </div>
            </div>
          )}
        </div>

        {/* Body stats */}
        <div style={sL}>Body Stats</div>
        <div style={{ background: "#1A2332", borderRadius: 14, padding: "0 14px", marginBottom: 16 }}>
          <StatRow label="Height" value={user.height || "5′ 10″"} />
          <StatRow label="Weight" value={user.weight || "185 lbs"} sub="Starting weight" />
          <StatRow label="Age" value={user.age ? `${user.age} yrs` : "28 yrs"} />
          <div style={{ padding: "10px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, color: theme.text }}>Sex</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: a }}>{user.sex || "Male"}</div>
            </div>
          </div>
        </div>

        {/* Daily targets */}
        <div style={sL}>Daily Targets</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[["1,840", "Calories", a], ["140g", "Protein", "#F59E0B"], ["160g", "Carbs", "#818cf8"], ["55g", "Fat", "#f472b6"]].map(([v, l, c]) => (
            <div key={l} style={{ background: "#1A2332", borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div>
              <div style={{ fontSize: 11, color: theme.textDim, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>

        {/* Plan settings */}
        <div style={sL}>Plan Settings</div>
        <div style={{ background: "#1A2332", borderRadius: 14, padding: "0 14px", marginBottom: 16 }}>
          <StatRow label="Workout days" value="Mon, Wed, Fri" />
          <StatRow label="Session length" value="~40 min" />
          <StatRow label="Program level" value="Beginner" />
          <StatRow label="Injuries/notes" value={user.injuries || "None"} />
        </div>

        {/* Rest timer preference */}
        <div style={sL}>Rest Timer</div>
        <div style={{ background: "#1A2332", borderRadius: 14, padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: theme.text, marginBottom: 10 }}>Time between sets</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            {[["1 min", 60], ["2 min", 120], ["3 min", 180]].map(([label, secs]) => {
              const isActive = (user?.restTimerSecs || 60) === secs;
              return (
                <button key={secs}
                  onClick={async () => {
                    const updated = { ...user, restTimerSecs: secs };
                    setUser(updated);
                    if (supabaseUser?.id) {
                      sb.upsertProfile(supabaseUser.id, updated, plan).catch(() => {});
                    }
                  }}
                  style={{ flex: 1, background: isActive ? "#003D35" : "#0D1623", border: `1.5px solid ${isActive ? a : "rgba(255,255,255,0.08)"}`, borderRadius: 10, padding: "10px 6px", fontSize: 13, fontWeight: 600, color: isActive ? a : theme.textDim, cursor: "pointer", fontFamily: "inherit", transition: "all .2s" }}>
                  {label}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 11, color: theme.textDim, lineHeight: 1.5 }}>
            Timer auto-starts after each set. You can also skip it any time during a workout.
          </div>
        </div>

        {/* Danger zone */}
        <button onClick={() => navigate("onboarding")} style={{ width: "100%", background: "transparent", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 12, padding: "10px", fontSize: 13, color: "#F87171", cursor: "pointer", fontFamily: "inherit", marginBottom: 8 }}>
          Restart onboarding quiz
        </button>
        <button onClick={signOut} style={{ width: "100%", background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "10px", fontSize: 13, color: theme.textDim, cursor: "pointer", fontFamily: "inherit", marginBottom: 8 }}>
          Sign out
        </button>
      </div>
    </Layout>
  );
}

