import { useState, useEffect, useRef } from "react";
import {
  useApp, theme, sb,
  Layout, Icon, CardioQuickLog,
} from "./shared.jsx";

// ═══════════════════════════════════════════════════════════════════
// CardioScreen — live cardio-session logging, shared across every goal
// (lose_fat's scheduled cardio days route here, but so does anyone else who
// just wants to log cardio whenever they feel like it -- reachable from a
// persistent Home button regardless of what today's plan says. See
// DECISIONS.md, Aug 2026 entries, and HANDOFF.md session 32).
//
// Two modes:
//  - "live" (default): pick an activity, run a real start/stop timer, watch
//    a MET-based calorie estimate climb while it runs, log on stop.
//  - "manual": for a session already done -- reuses the existing
//    CardioQuickLog voice/text component (shared.jsx) rather than building a
//    second logging path that could drift from it.
// ═══════════════════════════════════════════════════════════════════

// MET (metabolic equivalent) values -- standard exercise-science constants,
// not app-specific tuning. calories = MET × body weight (kg) × hours.
const CARDIO_ACTIVITIES = [
  { id: "Treadmill",    met: 9.8, icon: "run" },
  { id: "Bike",         met: 7.5, icon: "bike" },
  { id: "Stepper",      met: 8.8, icon: "stepper" },
  { id: "Rower",        met: 7.0, icon: "rower" },
  { id: "Outdoor run",  met: 9.8, icon: "map-pin" },
  { id: "Other",        met: 6.0, icon: "dots" },
];

const EFFORT_LEVELS = [
  { label: "Easy",     mult: 0.85 },
  { label: "Moderate", mult: 1 },
  { label: "Hard",     mult: 1.25 },
];

// Small activity-specific icon set, local to this screen -- these are more
// decorative/niche than the general-purpose icons already in shared.jsx's
// Icon() component, so they live here instead of growing that switch.
function ActivityIcon({ name, size = 18, color = "currentColor" }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "run": return <svg {...common}><circle cx="13" cy="4" r="2" /><path d="M4 17l4-3 3 2 2-5 4 1-1 4 3 3" /></svg>;
    case "bike": return <svg {...common}><circle cx="6" cy="17" r="3" /><circle cx="18" cy="17" r="3" /><path d="M9 17h6l-3-9-4 5h7M6 17l4-9" /></svg>;
    case "stepper": return <svg {...common}><path d="M3 20h4v-4h4v-4h4v-4h4V4" /></svg>;
    case "rower": return <svg {...common}><path d="M3 12h18M6 8l3 4-3 4M18 8l-3 4 3 4" /></svg>;
    case "map-pin": return <svg {...common}><path d="M12 21s7-6.5 7-12a7 7 0 10-14 0c0 5.5 7 12 7 12z" /><circle cx="12" cy="9" r="2.5" /></svg>;
    default: return <svg {...common}><circle cx="6" cy="12" r="1.5" fill={color} stroke="none" /><circle cx="12" cy="12" r="1.5" fill={color} stroke="none" /><circle cx="18" cy="12" r="1.5" fill={color} stroke="none" /></svg>;
  }
}

function fmtTimer(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
}

function CardioScreen() {
  const { navigate, gymBranding, user, supabaseUser, loadHistoricalData } = useApp();
  const a = gymBranding.accent;
  const [mode, setMode] = useState("live"); // "live" | "manual"
  const [activity, setActivity] = useState(null);
  const [effortIdx, setEffortIdx] = useState(1); // default Moderate
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [lastLogged, setLastLogged] = useState(null); // { minutes, calories, activity } captured right before reset, so the post-save confirmation can show real numbers instead of just a checkmark
  const intervalRef = useRef(null);

  useEffect(() => () => clearInterval(intervalRef.current), []);

  // Body weight comes from the member's own profile (userData.weight is
  // stored as e.g. "175 lbs" -- see OnboardingScreen.jsx). Falls back to a
  // reasonable default if it's ever missing rather than dividing by zero.
  const bodyWeightLbs = parseFloat(user?.weight) || 175;
  const bodyWeightKg = bodyWeightLbs * 0.4536;
  const effort = EFFORT_LEVELS[effortIdx];
  const calories = activity ? Math.round(activity.met * effort.mult * bodyWeightKg * (elapsed / 3600)) : 0;

  function pickActivity(act) {
    clearInterval(intervalRef.current);
    setActivity(act);
    setElapsed(0);
    setRunning(false);
    setSaved(false);
  }

  function toggleTimer() {
    if (running) {
      clearInterval(intervalRef.current);
      setRunning(false);
    } else {
      intervalRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
      setRunning(true);
    }
  }

  async function stopAndLog() {
    clearInterval(intervalRef.current);
    setRunning(false);
    // Guard against an accidental tap logging a 0-second session -- same
    // spirit as the confirm-before-log pattern used elsewhere in the app.
    if (elapsed < 15) { setActivity(null); setElapsed(0); return; }
    setSaving(true);
    const durationMinutes = Math.max(1, Math.round(elapsed / 60));
    const ok = await sb.insertCardioLog(supabaseUser?.id, {
      activityType: activity.id,
      durationMinutes,
      calories,
    });
    setSaving(false);
    if (ok) {
      setLastLogged({ minutes: durationMinutes, calories, activity: activity.id });
      setSaved(true);
      loadHistoricalData?.(supabaseUser?.id);
      setTimeout(() => setSaved(false), 4000);
    }
    setActivity(null);
    setElapsed(0);
  }

  const sL = { ...theme.sL, fontSize: 10, letterSpacing: "1.2px", marginBottom: 10, fontWeight: 500 };

  return (
    <Layout activeNav="workout">
      <div style={{ padding: "1.25rem 1.25rem 0" }}>
        <div style={sL}>Cardio</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
          <button onClick={() => setMode("live")}
            style={{ flex: 1, background: mode === "live" ? a : theme.card, color: mode === "live" ? "#0B1E3D" : theme.textDim, border: "none", borderRadius: 10, padding: "9px 4px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
            Start now
          </button>
          <button onClick={() => setMode("manual")}
            style={{ flex: 1, background: mode === "manual" ? a : theme.card, color: mode === "manual" ? "#0B1E3D" : theme.textDim, border: "none", borderRadius: 10, padding: "9px 4px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
            Log a past session
          </button>
        </div>

        {mode === "manual" && (
          <CardioQuickLog accent={a} supabaseUserId={supabaseUser?.id} onLogged={() => navigate("home")} />
        )}

        {mode === "live" && !activity && (
          <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100dvh - 326px)" }}>
            {saved && lastLogged && (
              <div style={{ textAlign: "center", background: theme.accentDim, border: `2px solid ${a}`, borderRadius: 16, padding: "22px 18px", marginBottom: 20 }}>
                <div style={{ width: 46, height: 46, borderRadius: "50%", background: a, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                  <Icon name="check" size={24} color="#0B1E3D" />
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: theme.text, marginBottom: 8 }}>{lastLogged.activity} logged</div>
                <div style={{ fontSize: 30, fontWeight: 700, color: theme.text, lineHeight: 1.2 }}>
                  {lastLogged.minutes} min <span style={{ color: theme.textDim, fontWeight: 400 }}>&middot;</span> <span style={{ color: a }}>~{lastLogged.calories} cal</span>
                </div>
              </div>
            )}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: theme.text, marginBottom: 12 }}>What are you doing today?</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {CARDIO_ACTIVITIES.map(act => (
                  <button key={act.id} onClick={() => pickActivity(act)}
                    style={{ background: theme.card, border: `1.5px solid ${theme.border}`, borderRadius: 12, padding: "18px 10px", display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 10, cursor: "pointer", fontFamily: "inherit" }}>
                    <ActivityIcon name={act.icon} size={20} color={theme.textDim} />
                    <span style={{ fontSize: 13, fontWeight: 500, color: theme.text }}>{act.id}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {mode === "live" && activity && (
          <div style={{ display: "flex", flexDirection: "column", minHeight: "calc(100dvh - 326px)", paddingBottom: "1.5rem" }}>
            <button onClick={() => { clearInterval(intervalRef.current); setActivity(null); setElapsed(0); setRunning(false); }}
              style={{ background: "none", border: "none", color: theme.textDim, fontSize: 12, padding: "0 0 .8rem", display: "flex", alignItems: "center", gap: 4, cursor: "pointer", fontFamily: "inherit" }}>
              <Icon name="arrow-left" size={14} /> Change activity
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: 8, background: theme.card, borderRadius: 10, padding: "8px 12px", marginBottom: 16 }}>
              <ActivityIcon name={activity.icon} size={16} color={a} />
              <span style={{ fontSize: 13, fontWeight: 500, color: theme.text }}>{activity.id}</span>
            </div>

            <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
              <div style={{ background: "#0A1628", border: `1.5px solid ${theme.border}`, borderRadius: 18, padding: "1.75rem 0.5rem", display: "flex", alignItems: "stretch" }}>
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 54, fontWeight: 700, color: theme.text, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{fmtTimer(elapsed)}</div>
                  <div style={{ fontSize: 11, color: theme.textDim, marginTop: 8, textTransform: "uppercase", letterSpacing: "1px" }}>Time</div>
                </div>
                <div style={{ width: 1, background: theme.border, margin: "2px 0" }} />
                <div style={{ flex: 1, textAlign: "center" }}>
                  <div style={{ fontSize: 54, fontWeight: 700, color: a, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{calories}</div>
                  <div style={{ fontSize: 11, color: theme.textDim, marginTop: 8, textTransform: "uppercase", letterSpacing: "1px", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                    <Icon name="flame" size={11} color={theme.textDim} /> Calories
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, color: theme.textDim, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>Effort</div>
              <div style={{ display: "flex", gap: 6 }}>
                {EFFORT_LEVELS.map((lvl, idx) => (
                  <button key={lvl.label} onClick={() => setEffortIdx(idx)}
                    style={{ flex: 1, background: idx === effortIdx ? "#0B1E3D" : theme.card, border: `1.5px solid ${idx === effortIdx ? a : theme.border}`, borderRadius: 8, padding: "7px 0", color: idx === effortIdx ? a : theme.textMuted, fontSize: 12, fontWeight: idx === effortIdx ? 500 : 400, cursor: "pointer", fontFamily: "inherit" }}>
                    {lvl.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={toggleTimer} disabled={saving}
                style={{ flex: 2, background: a, color: "#0B1E3D", border: "none", borderRadius: 12, padding: "1rem", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, opacity: saving ? 0.6 : 1 }}>
                {running ? "Pause" : elapsed > 0 ? "Resume" : "Start"}
              </button>
              <button onClick={stopAndLog} disabled={saving}
                style={{ flex: 1, background: "transparent", color: theme.red, border: `1.5px solid rgba(248,113,113,0.35)`, borderRadius: 12, padding: "1rem", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.6 : 1 }}>
                Stop
              </button>
            </div>
            <div style={{ fontSize: 10, color: theme.textFaint, marginTop: 10, textAlign: "center", lineHeight: 1.5 }}>
              Estimate only, from your logged weight and effort -- not a wearable measurement.
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

export { CardioScreen };
