import { createContext, useContext, useState, useEffect } from "react";
import sb from "./supabase";
import {
  DEFAULT_USER, MOCK_RETURNING_PLAN, SESSION_KEY,
  getCachedBranding, cacheBranding,
} from "./theme";

// ─── CONTEXT ──────────────────────────────────────────────────────────────────
export const AppContext = createContext(null);
export const useApp = () => useContext(AppContext);

// Auto-detect: localhost → skip to onboarding, Vercel/production → real auth.
const DEV_SKIP = (() => {
  try {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") return "member_new";
    return null;
  } catch { return null; }
})();

export function AppProvider({ children }) {
  const savedSession = (() => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
  })();

  const [screen, setScreen] = useState(
    DEV_SKIP === "owner"            ? "owner" :
    DEV_SKIP === "member_returning" ? "home"  :
    DEV_SKIP === "member_new"       ? "auth"  :
    savedSession                    ? "loading" : "auth"
  );

  const [user, setUser] = useState(
    DEV_SKIP === "member_returning"
      ? { name: "Alex", goal: "lose_fat", sex: "Male", height: "5′ 11″", weight: "183 lbs", age: "28", daysPerWeek: 3, injuries: "", unit: "imperial", restTimerSecs: 60 }
      : DEFAULT_USER
  );
  const [plan, setPlan]           = useState(DEV_SKIP === "member_returning" ? MOCK_RETURNING_PLAN : null);
  const [supabaseUser, setSupabaseUser] = useState(DEV_SKIP ? { email: "dev@morphiq.app", id: "dev-001" } : null);
  const [gymBranding, setGymBranding]  = useState(() => {
    const cached = getCachedBranding();
    return cached || { name: "IronForge Gym", accent: "#00D4B1", welcome: "Welcome to IronForge Gym. Your personal AI trainer is ready. Let's get to work.", units: "imperial" };
  });
  const [historicalData, setHistoricalData] = useState(null);

  // Load gym branding from Supabase on mount
  useEffect(() => {
    sb.getGymBranding("demo-gym").then(row => {
      if (row?.name) {
        const b = { name: row.name, accent: row.accent || "#00D4B1", welcome: row.welcome || "", units: "imperial" };
        setGymBranding(b);
        cacheBranding(b);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restore session from Supabase on mount
  useEffect(() => {
    if (DEV_SKIP || !savedSession?.uid) return;
    sb.getProfile(savedSession.uid).then(profile => {
      if (profile?.plan) {
        setSupabaseUser({ email: savedSession.email, id: savedSession.uid });
        setUser({ name: profile.name, goal: profile.goal, sex: profile.sex, height: profile.height, weight: profile.weight, age: profile.age, daysPerWeek: profile.days_per_week, injuries: profile.injuries || "", unit: "imperial", restTimerSecs: profile.rest_timer_secs || 60 });
        setPlan(profile.plan);
        loadHistoricalData(savedSession.uid);
        setScreen("home");
      } else {
        localStorage.removeItem(SESSION_KEY);
        setScreen("auth");
      }
    }).catch(() => { localStorage.removeItem(SESSION_KEY); setScreen("auth"); });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle magic link callback
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("access_token=")) return;
    const params = new URLSearchParams(hash.replace("#", "?"));
    const accessToken = params.get("access_token");
    if (!accessToken) return;
    try {
      const payload = JSON.parse(atob(accessToken.split(".")[1]));
      const email = payload.email || "";
      const uid   = payload.sub   || "";
      if (uid) signIn(email, "member", null, uid);
    } catch(e) { console.error("Magic link error:", e); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function signIn(email, role, hasPlan = null, realAuthUserId = null) {
    const uid = realAuthUserId || ("sim-" + Date.now());
    setSupabaseUser({ email, id: uid });
    if (role === "owner") { setScreen("owner"); return; }
    if (hasPlan === true)  { setUser({ name: "Alex", goal: "lose_fat", sex: "Male", height: "5′ 11″", weight: "183 lbs", age: "28", daysPerWeek: 3, injuries: "", unit: "imperial", restTimerSecs: 60 }); setPlan(MOCK_RETURNING_PLAN); setScreen("home"); return; }
    if (hasPlan === false) { setUser(DEFAULT_USER); setPlan(null); setScreen("onboarding"); return; }
    setScreen("loading");
    try {
      const profile = await sb.getProfile(uid);
      if (profile?.plan) {
        setUser({ name: profile.name, goal: profile.goal, sex: profile.sex, height: profile.height, weight: profile.weight, age: profile.age, daysPerWeek: profile.days_per_week, injuries: profile.injuries || "", unit: "imperial", restTimerSecs: profile.rest_timer_secs || 60 });
        setPlan(profile.plan);
        try { localStorage.setItem(SESSION_KEY, JSON.stringify({ uid, email })); } catch {}
        loadHistoricalData(uid);
        setScreen("home");
      } else {
        setUser(DEFAULT_USER); setPlan(null); setScreen("onboarding");
      }
    } catch { setUser(DEFAULT_USER); setPlan(null); setScreen("onboarding"); }
  }

  async function loadHistoricalData(uid) {
    if (!uid || uid.startsWith("sim-") || uid === "dev-001") return;
    try {
      const [wLogs, wtLogs] = await Promise.all([sb.getWorkoutLogs(uid, 60), sb.getWeightLogs(uid, 12)]);
      const workoutLogs = Array.isArray(wLogs)  ? wLogs  : [];
      const weightLogs  = Array.isArray(wtLogs) ? wtLogs : [];
      const dates = [...new Set(workoutLogs.map(r => r.workout_date))].sort((a,b) => b.localeCompare(a));
      let streak = 0;
      const today = new Date().toISOString().slice(0,10);
      const dateSet = new Set(dates);
      let cursor = new Date(today);
      if (!dateSet.has(today)) cursor.setDate(cursor.getDate() - 1);
      while (dateSet.has(cursor.toISOString().slice(0,10))) { streak++; cursor.setDate(cursor.getDate() - 1); }
      let weightChange = null;
      if (weightLogs.length >= 2) {
        const first = parseFloat(weightLogs[0].weight_lbs);
        const last  = parseFloat(weightLogs[weightLogs.length - 1].weight_lbs);
        weightChange = (last - first).toFixed(1);
      }
      setHistoricalData({ workoutLogs, weightLogs, streak, totalWorkouts: dates.length, lastSession: dates[0] || null, weightChange });
    } catch(e) { console.warn("[Morphiq] historicalData load failed:", e); }
  }

  function signOut() {
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    setSupabaseUser(null); setUser(DEFAULT_USER); setPlan(null); setHistoricalData(null); setScreen("auth");
  }

  return (
    <AppContext.Provider value={{ screen, navigate: setScreen, user, setUser, plan, setPlan, supabaseUser, gymBranding, setGymBranding, signIn, signOut, historicalData, loadHistoricalData }}>
      {children}
    </AppContext.Provider>
  );
}
