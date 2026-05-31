import { createContext, useContext, useState, useEffect, useRef } from "react";
import { WorkoutScreen } from "./WorkoutScreen.jsx";
import { MealPlanScreen } from "./MealScreen.jsx";
import { GymOwnerDashboard, PricingScreen } from "./GymOwnerDashboard.jsx";

const SUPABASE_URL  = "https://uvnyjegmhsztdednjclb.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2bnlqZWdtaHN6dGRlZG5qY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTgwMjcsImV4cCI6MjA5NDI5NDAyN30.-hMNwCO-GymvbiyAKer6Q5AjDbDZl6GhXmSTmr5bY04";
const SB_HEADERS = { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${SUPABASE_ANON}`, "Content-Type": "application/json" };
const SB_GET = { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${SUPABASE_ANON}` };

const sb = {
  // ── AUTH ──────────────────────────────────────────────────────────────────
  // Sends a 6-digit OTP to email (works inside the PWA — no browser redirect)
  async sendOTP(email) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
      method: "POST",
      headers: { "apikey": SUPABASE_ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email, options: { shouldCreateUser: true } }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("[Morphiq] sendOTP error:", res.status, err);
      return { ok: false, error: err?.msg || err?.message || `HTTP ${res.status}` };
    }
    return { ok: true };
  },

  // Verifies the 6-digit code typed by the user; returns { uid, email } or null
  async verifyOTP(email, token) {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
        method: "POST",
        headers: { "apikey": SUPABASE_ANON, "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, type: "email" }),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const accessToken = data?.access_token;
      if (!accessToken) return null;
      const payload = JSON.parse(atob(accessToken.split(".")[1]));
      return { uid: payload.sub, email: payload.email || email };
    } catch { return null; }
  },

  // ── PROFILES ──────────────────────────────────────────────────────────────
  async getProfile(supabaseUserId) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?supabase_user_id=eq.${encodeURIComponent(supabaseUserId)}&limit=1`,
        { headers: SB_GET }
      );
      const rows = await res.json();
      return rows?.[0] || null;
    } catch { return null; }
  },

  async upsertProfile(supabaseUserId, userData, planData, gymId = "demo-gym") {
    try {
      const body = {
        supabase_user_id: supabaseUserId,
        gym_id: gymId,
        name: userData.name,
        goal: userData.goal,
        sex: userData.sex,
        height: userData.height,
        weight: userData.weight,
        age: userData.age,
        days_per_week: userData.daysPerWeek,
        injuries: userData.injuries || "",
        plan: planData,                         // full plan JSON stored in jsonb column
        updated_at: new Date().toISOString(),
      };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
        method: "POST",
        headers: { ...SB_HEADERS, "Prefer": "resolution=merge-duplicates" },
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch { return false; }
  },

  // ── HELPERS ───────────────────────────────────────────────────────────────
  // Resolves supabase_user_id → profiles.id (UUID used as FK in workout/meal logs)
  async getProfileId(supabaseUserId) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?supabase_user_id=eq.${encodeURIComponent(supabaseUserId)}&select=id&limit=1`,
        { headers: SB_GET }
      );
      const rows = await res.json();
      return rows?.[0]?.id || null;
    } catch { return null; }
  },

  // Creates a real profile row in Supabase for dev bypass testing so cloud save works
  async ensureDevProfile() {
    try {
      const body = {
        supabase_user_id: "dev-bypass-001",
        gym_id: "demo-gym",
        name: "Alex (Dev)",
        goal: "lose_fat",
        sex: "Male",
        height: "5\'11\"",
        weight: "183 lbs",
        age: "28",
        days_per_week: 3,
        injuries: "",
        plan: null,
        updated_at: new Date().toISOString(),
      };
      await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
        method: "POST",
        headers: { ...SB_HEADERS, "Prefer": "resolution=merge-duplicates" },
        body: JSON.stringify(body),
      });
    } catch { /* silent — dev only */ }
  },

  // ── WORKOUT LOGS ──────────────────────────────────────────────────────────
  async insertWorkoutLog(supabaseUserId, { exerciseName, setNumber, reps, weight }) {
    try {
      // Resolve to profiles.id so the FK constraint is satisfied
      let profileId = await this.getProfileId(supabaseUserId);
      // If dev bypass profile doesn't exist yet, create it now and retry
      if (!profileId && supabaseUserId === "dev-bypass-001") {
        await this.ensureDevProfile();
        profileId = await this.getProfileId(supabaseUserId);
      }
      if (!profileId) return false;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/workout_logs`, {
        method: "POST",
        headers: SB_HEADERS,
        body: JSON.stringify({
          user_id: profileId,
          exercise_name: exerciseName,
          set_number: setNumber,
          reps,
          weight,
          workout_date: new Date().toISOString().slice(0, 10),
        }),
      });
      return res.ok;
    } catch { return false; }
  },

  // Fetch recent workout logs for the progress screen
  async getWorkoutLogs(supabaseUserId, limit = 20) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return [];
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/workout_logs?user_id=eq.${profileId}&order=logged_at.desc&limit=${limit}`,
        { headers: SB_GET }
      );
      return await res.json();
    } catch { return []; }
  },

  // ── MEAL LOGS ─────────────────────────────────────────────────────────────
  async insertMealLog(supabaseUserId, { mealId, status, loggedName, loggedCal, loggedProtein }) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return false;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/meal_logs`, {
        method: "POST",
        headers: SB_HEADERS,
        body: JSON.stringify({
          user_id: profileId,
          meal_id: mealId,
          date: new Date().toISOString().slice(0, 10),
          status,
          logged_name: loggedName,
          logged_cal: loggedCal,
          logged_protein: loggedProtein,
        }),
      });
      return res.ok;
    } catch { return false; }
  },

  // ── GYM OWNER LOOKUP ─────────────────────────────────────────────────────
  async getGymByOwnerEmail(email) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/gyms?owner_email=eq.${encodeURIComponent(email.toLowerCase())}&limit=1`,
        { headers: SB_GET }
      );
      const rows = await res.json();
      return rows?.[0] || null;
    } catch { return null; }
  },

  // ── GYM BRANDING ─────────────────────────────────────────────────────────
  async getGymBranding(gymId = "demo-gym") {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/gyms?gym_id=eq.${encodeURIComponent(gymId)}&limit=1`,
        { headers: SB_GET }
      );
      const rows = await res.json();
      return rows?.[0] || null;
    } catch { return null; }
  },

  async saveGymBranding(gymId = "demo-gym", { name, accent, welcome }) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/gyms`, {
        method: "POST",
        headers: { ...SB_HEADERS, "Prefer": "resolution=merge-duplicates" },
        body: JSON.stringify({ gym_id: gymId, name, accent, welcome, updated_at: new Date().toISOString() }),
      });
      return res.ok;
    } catch { return false; }
  },

  // ── WEIGHT LOGS ───────────────────────────────────────────────────────────
  async insertWeightLog(supabaseUserId, weightLbs) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return false;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/weight_logs`, {
        method: "POST",
        headers: SB_HEADERS,
        body: JSON.stringify({
          user_id: profileId,
          weight_lbs: weightLbs,
          logged_date: new Date().toISOString().slice(0, 10),
          logged_at: new Date().toISOString(),
        }),
      });
      return res.ok;
    } catch { return false; }
  },

  async getWeightLogs(supabaseUserId, limit = 12) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return [];
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/weight_logs?user_id=eq.${profileId}&order=logged_date.asc&limit=${limit}`,
        { headers: SB_GET }
      );
      return await res.json();
    } catch { return []; }
  },

  // ── GYM OWNER DATA ────────────────────────────────────────────────────────
  // Fetch all profiles for a gym
  async getGymMembers(gymId = "demo-gym") {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?gym_id=eq.${encodeURIComponent(gymId)}&select=id,name,goal,weight,updated_at&order=updated_at.desc`,
        { headers: SB_GET }
      );
      const rows = await res.json();
      return Array.isArray(rows) ? rows : [];
    } catch { return []; }
  },

  // For each profile ID, count workout sessions this calendar month
  async getWorkoutCountsThisMonth(profileIds) {
    if (!profileIds.length) return {};
    const monthStart = new Date();
    monthStart.setDate(1);
    const startStr = monthStart.toISOString().slice(0, 10);
    try {
      const ids = profileIds.map(id => `"${id}"`).join(",");
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/workout_logs?user_id=in.(${ids})&workout_date=gte.${startStr}&select=user_id,workout_date`,
        { headers: SB_GET }
      );
      const rows = await res.json();
      if (!Array.isArray(rows)) return {};
      // Count unique workout dates per user
      const counts = {};
      const dates = {};
      rows.forEach(r => {
        if (!dates[r.user_id]) dates[r.user_id] = new Set();
        dates[r.user_id].add(r.workout_date);
      });
      Object.keys(dates).forEach(uid => { counts[uid] = dates[uid].size; });
      return counts;
    } catch { return {}; }
  },

  // For each profile ID, get last workout date
  async getLastWorkoutDates(profileIds) {
    if (!profileIds.length) return {};
    try {
      const ids = profileIds.map(id => `"${id}"`).join(",");
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/workout_logs?user_id=in.(${ids})&select=user_id,workout_date&order=workout_date.desc`,
        { headers: SB_GET }
      );
      const rows = await res.json();
      if (!Array.isArray(rows)) return {};
      const lastDates = {};
      rows.forEach(r => { if (!lastDates[r.user_id]) lastDates[r.user_id] = r.workout_date; });
      return lastDates;
    } catch { return {}; }
  },

  // First and last weight log per profile for delta calculation
  async getWeightDeltas(profileIds) {
    if (!profileIds.length) return {};
    try {
      const ids = profileIds.map(id => `"${id}"`).join(",");
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/weight_logs?user_id=in.(${ids})&select=user_id,weight_lbs,logged_date&order=logged_date.asc`,
        { headers: SB_GET }
      );
      const rows = await res.json();
      if (!Array.isArray(rows)) return {};
      // first and last per user
      const first = {}, last = {};
      rows.forEach(r => {
        if (!first[r.user_id]) first[r.user_id] = parseFloat(r.weight_lbs);
        last[r.user_id] = parseFloat(r.weight_lbs);
      });
      const deltas = {};
      Object.keys(first).forEach(uid => {
        deltas[uid] = (last[uid] - first[uid]).toFixed(1);
      });
      return deltas;
    } catch { return {}; }
  },
};

const theme = {
  accent: "#00D4B1", accentDim: "rgba(0,212,177,0.10)", accentBorder: "rgba(0,212,177,0.25)",
  bg: "#0F0F0F", surface: "#161616", border: "#242424", borderSubtle: "#1E1E1E",
  text: "#E8E8E8", textMuted: "#888", textDim: "#555", textFaint: "#333",
  success: "#1D9E75", amber: "#F59E0B", amberDim: "rgba(245,158,11,0.12)",
  red: "#F87171", card: "#1A2332", card2: "#0D1623",
  ob: {
    bg: "#080E1A", surface: "#111827", card: "#1A2332", card2: "#0D1623",
    teal: "#00D4B1", tealDk: "#003D35", border: "#1E2D42",
    white: "#E8EDF2", body: "#9BB3C8", muted: "#6B7A8D",
    font: "'DM Sans', system-ui, sans-serif",
  },
  sL: { fontSize: 11, color: "#888", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: ".65rem" },
};

// Set DEV_SKIP to "member_new", "member_new", "owner", or null for real auth.
const DEV_SKIP = null; // null = shows real auth screen

const AppContext = createContext(null);
const useApp = () => useContext(AppContext);

const DEFAULT_USER = { name: "", goal: null, sex: null, height: "", weight: "", age: "", unit: "imperial" };
const MOCK_RETURNING_PLAN = {
  calories: 1800, protein: 140, carbs: 160, fat: 55,
  workoutDays: ["Monday","Wednesday","Friday"], workoutType: "Full Body",
  workoutDuration: 40, weeklyFocus: "Build your movement foundation.",
  exercises: [
    { name: "Goblet Squat", sets: 3, reps: 12, weight: 25, muscle: "Quads / Glutes" },
    { name: "Dumbbell Row", sets: 3, reps: 10, weight: 30, muscle: "Back / Biceps" },
    { name: "Incline Press", sets: 3, reps: 10, weight: 35, muscle: "Chest / Shoulders" },
    { name: "Romanian Deadlift", sets: 3, reps: 10, weight: 65, muscle: "Hamstrings" },
    { name: "Shoulder Press", sets: 3, reps: 10, weight: 25, muscle: "Shoulders" },
  ],
  tip: "Consistency over perfection — show up, even on hard days.",
};

const SESSION_KEY = "morphiq_session";

function AppProvider({ children }) {
  // ── Restore session from localStorage on first load ──────────────────────
  const savedSession = (() => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
  })();

  const [screen, setScreen] = useState(
    DEV_SKIP === "owner" ? "owner" :
    DEV_SKIP === "member_returning" ? "home" :
    DEV_SKIP === "member_new" ? "onboarding" :
    savedSession ? "loading" : "auth"   // if saved session exists, start at loading while we verify
  );
  const [user, setUser] = useState(
    DEV_SKIP === "member_returning"
      ? { name: "Alex", goal: "lose_fat", sex: "Male", height: "5′ 11″", weight: "183 lbs", age: "28", daysPerWeek: 3, injuries: "", unit: "imperial" }
      : DEFAULT_USER
  );
  const [plan, setPlan] = useState(DEV_SKIP === "member_returning" ? MOCK_RETURNING_PLAN : null);
  const [supabaseUser, setSupabaseUser] = useState(DEV_SKIP ? { email: "dev@morphiq.app", id: "dev-001" } : null);
  const [gymBranding, setGymBranding] = useState({ name: "IronForge Gym", accent: "#00D4B1", welcome: "Welcome to IronForge Gym. Your personal AI trainer is ready. Let's get to work.", units: "imperial" });
  const [historicalData, setHistoricalData] = useState(null);
  // Tracks the current exercise + set while WorkoutScreen is active
  // so ChatScreen can pass exact context to Claude (e.g. "Set 2 of 3 · Goblet Squat")
  const [workoutContext, setWorkoutContext] = useState(null);

  // ── On mount: load gym branding from Supabase ────────────────────────────
  useEffect(() => {
    // Check if a gym ID was passed in the URL (from invite link)
    const urlParams = new URLSearchParams(window.location.search);
    const gymIdFromUrl = urlParams.get("gym");
    const gymToLoad = gymIdFromUrl || "demo-gym";

    sb.getGymBranding(gymToLoad).then(row => {
      if (row?.name) {
        setGymBranding({ name: row.name, accent: row.accent || "#00D4B1", welcome: row.welcome || "", units: "imperial" });
      }
    });
  }, []);

  // ── On mount: if we have a saved session, restore it from Supabase ────────
  useEffect(() => {
    if (DEV_SKIP || !savedSession?.uid) return;
    sb.getProfile(savedSession.uid).then(profile => {
      if (profile?.plan) {
        setSupabaseUser({ email: savedSession.email, id: savedSession.uid });
        setUser({ name: profile.name, goal: profile.goal, sex: profile.sex, height: profile.height, weight: profile.weight, age: profile.age, daysPerWeek: profile.days_per_week, injuries: profile.injuries || "", unit: "imperial" });
        setPlan(profile.plan);
        loadHistoricalData(savedSession.uid);
        setScreen("home");
      } else {
        localStorage.removeItem(SESSION_KEY);
        setScreen("auth");
      }
    }).catch(() => { localStorage.removeItem(SESSION_KEY); setScreen("auth"); });
  }, []);

  // Called after successful auth. role = "member" | "owner".
  // hasPlan=true|false = dev shortcut (bypasses DB). hasPlan=null = production path (reads DB).
  async function signIn(email, role, hasPlan = null, realAuthUserId = null) {
    // Dev bypass always uses a fixed ID so getProfileId finds a real Supabase row
    const uid = realAuthUserId || (hasPlan !== null ? "dev-bypass-001" : ("sim-" + Date.now()));
    setSupabaseUser({ email, id: uid });
    if (role === "owner") { setScreen("owner"); return; }

    if (hasPlan === true) {
      // Ensure dev profile row exists in Supabase so cloud save works during testing
      sb.ensureDevProfile().catch(() => {});
      setUser({ name: "Alex", goal: "lose_fat", sex: "Male", height: "5′ 11″", weight: "183 lbs", age: "28", daysPerWeek: 3, injuries: "", unit: "imperial" });
      setPlan(MOCK_RETURNING_PLAN);
      setScreen("home");
      return;
    }
    if (hasPlan === false) {
      // Ensure dev profile row exists in Supabase so cloud save works during testing
      sb.ensureDevProfile().catch(() => {});
      setUser(DEFAULT_USER); setPlan(null); setScreen("onboarding"); return;
    }

    // Production: query profile from Supabase using the real auth UID
    setScreen("loading");
    try {
      const profile = await sb.getProfile(uid);
      if (profile?.plan) {
        const u = { name: profile.name, goal: profile.goal, sex: profile.sex, height: profile.height, weight: profile.weight, age: profile.age, daysPerWeek: profile.days_per_week, injuries: profile.injuries || "", unit: "imperial" };
        setUser(u);
        setPlan(profile.plan);
        // Save session so next open skips login
        try { localStorage.setItem(SESSION_KEY, JSON.stringify({ uid, email })); } catch {}
        loadHistoricalData(uid);
        setScreen("home");
      } else {
        setUser(DEFAULT_USER); setPlan(null); setScreen("onboarding");
      }
    } catch { setUser(DEFAULT_USER); setPlan(null); setScreen("onboarding"); }
  }

  // ── REAL SUPABASE MAGIC-LINK CALLBACK ─────────────────────────────────────
  // When Supabase redirects back after clicking the magic link, the URL contains
  // #access_token=...&refresh_token=...  We detect this once on mount and sign in.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.includes("access_token=")) return;
    const params = new URLSearchParams(hash.replace("#", "?"));
    const accessToken = params.get("access_token");
    if (!accessToken) return;
    // Decode the JWT to get the user's Supabase UUID (sub claim)
    try {
      const payload = JSON.parse(atob(accessToken.split(".")[1]));
      const email = payload.email || "";
      const uid = payload.sub || "";
      if (uid) signIn(email, "member", null, uid);
    } catch(e) { console.error("Magic link error:", e); }
  }, []);

  // Load historical workout + weight data once we have a real user ID
  async function loadHistoricalData(uid) {
    if (!uid || uid.startsWith("sim-") || uid === "dev-001") return;
    try {
      const [wLogs, wtLogs] = await Promise.all([
        sb.getWorkoutLogs(uid, 60),
        sb.getWeightLogs(uid, 12),
      ]);
      const workoutLogs = Array.isArray(wLogs) ? wLogs : [];
      const weightLogs  = Array.isArray(wtLogs) ? wtLogs : [];

      // Unique workout dates sorted descending
      const dates = [...new Set(workoutLogs.map(r => r.workout_date))].sort((a,b) => b.localeCompare(a));
      const totalWorkouts = dates.length;

      // Streak — count consecutive days ending today or yesterday
      let streak = 0;
      const today = new Date().toISOString().slice(0,10);
      const dateSet = new Set(dates);
      let cursor = new Date(today);
      // allow today or yesterday as streak start
      if (!dateSet.has(today)) cursor.setDate(cursor.getDate() - 1);
      while (dateSet.has(cursor.toISOString().slice(0,10))) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      }

      // Last session date
      const lastSession = dates[0] || null;

      // Weight change
      let weightChange = null;
      if (weightLogs.length >= 2) {
        const first = parseFloat(weightLogs[0].weight_lbs);
        const last  = parseFloat(weightLogs[weightLogs.length - 1].weight_lbs);
        weightChange = (last - first).toFixed(1);
      }

      setHistoricalData({ workoutLogs, weightLogs, streak, totalWorkouts, lastSession, weightChange });
    } catch(e) { console.warn("[Morphiq] historicalData load failed:", e); }
  }

  function signOut() {
    try { localStorage.removeItem(SESSION_KEY); } catch {}
    setSupabaseUser(null);
    setUser(DEFAULT_USER);
    setPlan(null);
    setHistoricalData(null);
    setScreen("auth");
  }

  return (
    <AppContext.Provider value={{ screen, navigate: setScreen, user, setUser, plan, setPlan, supabaseUser, gymBranding, setGymBranding, signIn, signOut, historicalData, loadHistoricalData, workoutContext, setWorkoutContext }}>
      {children}
    </AppContext.Provider>
  );
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  .mq-fade{animation:mqFade .3s ease;}
  @keyframes mqFade{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
  .mq-pop{animation:mqPop .3s cubic-bezier(.2,1.4,.5,1);}
  @keyframes mqPop{from{transform:scale(0);}to{transform:scale(1);}}
  .mq-spin{animation:mqSpin .8s linear infinite;}
  @keyframes mqSpin{to{transform:rotate(360deg);}}
  .mq-pulse-ring{animation:mqPulse 2s ease-out infinite;pointer-events:none;}
  @keyframes mqPulse{0%{transform:scale(1);opacity:.5;}100%{transform:scale(1.7);opacity:0;}}
  .mq-mic-pulse{animation:micPulse 1.2s infinite;}
  @keyframes micPulse{0%{box-shadow:0 0 0 0 rgba(0,212,177,0.4);}70%{box-shadow:0 0 0 14px rgba(0,212,177,0);}100%{box-shadow:0 0 0 0 rgba(0,212,177,0);}}
  .mq-wave span{display:inline-block;width:3px;border-radius:2px;background:#00D4B1;animation:wv .9s infinite ease-in-out;}
  .mq-wave span:nth-child(1){height:5px;animation-delay:0s}
  .mq-wave span:nth-child(2){height:12px;animation-delay:.1s}
  .mq-wave span:nth-child(3){height:20px;animation-delay:.2s}
  .mq-wave span:nth-child(4){height:12px;animation-delay:.3s}
  .mq-wave span:nth-child(5){height:7px;animation-delay:.15s}
  .mq-wave span:nth-child(6){height:16px;animation-delay:.25s}
  @keyframes wv{0%,100%{transform:scaleY(0.5)}50%{transform:scaleY(1.2)}}
  @keyframes spin{to{transform:rotate(360deg);}}
  .mq-ring-fill{stroke-dasharray:220;transition:stroke-dashoffset 1s linear;}
  .mq-meal-tap:active{transform:scale(0.97);}
  .mq-shell{
    width:100%;
    height:100vh;
    height:100dvh;
    overflow:hidden;
    overflow-y:auto;
    background:#0a0a0a;
    position:relative;
  }
  .mq-shell > *{
    min-height:100vh;
    min-height:100dvh;
  }
`;

function MicIcon({ size = 22, color = "#003D35" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="8" y="2" width="8" height="12" rx="4" fill={color} />
      <path d="M5 12c0 3.866 3.134 7 7 7s7-3.134 7-7" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="19" x2="12" y2="22" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="9" y1="22" x2="15" y2="22" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function VoiceBtn({ listening = false, onPress, size = 56 }) {
  const { gymBranding } = useApp();
  const a = gymBranding.accent;
  return (
    <button onClick={onPress} className={listening ? "mq-mic-pulse" : ""}
      style={{ width: size, height: size, borderRadius: "50%", background: a, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
      <MicIcon size={Math.round(size * 0.4)} color="#003D35" />
    </button>
  );
}

function Pill({ children, variant = "teal" }) {
  const colors = {
    teal: { bg: "#003D35", color: "#00D4B1" },
    amber: { bg: "#2D1A00", color: "#F59E0B" },
    gray: { bg: "#1A2332", color: "#6B7A8D" },
    red: { bg: "#1F1010", color: "#F87171" },
  };
  const c = colors[variant] || colors.teal;
  return (
    <span style={{ background: c.bg, color: c.color, borderRadius: 20, padding: "2px 8px", fontSize: 10, fontWeight: 500 }}>
      {children}
    </span>
  );
}
function Spinner({ size = 28, color = "#00D4B1", trackColor = "#1A2332" }) {
  return <div style={{ width: size, height: size, border: `3px solid ${trackColor}`, borderTopColor: color, borderRadius: "50%", animation: "spin .9s linear infinite", flexShrink: 0 }} />;
}

function NavIcon({ id }) {
  if (id === "home") return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 9L9 2l7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><path d="M4 7v8h4v-4h2v4h4V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (id === "workout") return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="3" y="3" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" /><rect x="10" y="3" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" /><rect x="3" y="10" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" /><rect x="10" y="10" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" /></svg>;
  if (id === "meals") return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2v4M9 12v4M2 9h4M12 9h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.4" /></svg>;
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2a5 5 0 100 10A5 5 0 009 2zM3.5 15.5c0-2 2.5-3.5 5.5-3.5s5.5 1.5 5.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
}

function Layout({ children, activeNav = "home", chatTarget = "chat" }) {
  const { navigate, gymBranding, user } = useApp();
  const a = gymBranding.accent;
  return (
    <div style={{ background: theme.bg, borderRadius: 20, color: theme.text, paddingBottom: "5.5rem", position: "relative", minHeight: "100dvh", fontFamily: "system-ui,sans-serif", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1.25rem 1.25rem 0" }}>
        <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: ".1em", color: a, textTransform: "uppercase" }}>{gymBranding.name}</span>
        <button onClick={() => navigate("profile")} style={{ width: 34, height: 34, borderRadius: "50%", background: theme.accentDim, border: `1.5px solid ${a}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 500, color: a, cursor: "pointer" }}>{user.name ? user.name[0].toUpperCase() : "?"}</button>
      </div>
      {children}
      <div style={{ textAlign: "center", fontSize: 11, color: theme.textFaint, padding: ".6rem", marginBottom: "3.5rem" }}>Powered by Morphiq</div>
      <div className="mq-pulse-ring" style={{ position: "absolute", bottom: "4.8rem", right: "1.25rem", width: 52, height: 52, borderRadius: "50%", background: "rgba(0,212,177,0.18)" }} />
      <button onClick={() => navigate(chatTarget)} style={{ position: "absolute", bottom: "4.8rem", right: "1.25rem", width: 52, height: 52, borderRadius: "50%", background: a, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M11 2C6.03 2 2 5.8 2 10.5c0 1.8.55 3.5 1.5 4.9L2 20l4.8-1.4A9.2 9.2 0 0011 19c4.97 0 9-3.8 9-8.5S15.97 2 11 2z" fill="#0A1F1D" /><circle cx="7.5" cy="10.5" r="1.2" fill={a} /><circle cx="11" cy="10.5" r="1.2" fill={a} /><circle cx="14.5" cy="10.5" r="1.2" fill={a} /></svg>
      </button>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, background: "#111", borderTop: `0.5px solid ${theme.borderSubtle}`, borderRadius: "0 0 20px 20px", display: "flex" }}>
        {[["home", "Home"], ["workout", "Workout"], ["meals", "Meals"], ["progress", "Progress"]].map(([id, label]) => (
          <button key={id} onClick={() => navigate(id)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: ".75rem .5rem", background: "none", border: "none", cursor: "pointer", color: activeNav === id ? a : theme.textFaint, fontFamily: "inherit" }}>
            <NavIcon id={id} /><span style={{ fontSize: 10, letterSpacing: ".04em" }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}


// ── Shared exports for child screen files ───────────────────────────────────
export { useApp, sb, Pill, Spinner, MicIcon, VoiceBtn, Layout, NavIcon,
         SUPABASE_URL, SUPABASE_ANON, SB_HEADERS, SB_GET };

function AuthScreen() {
  const { signIn, gymBranding } = useApp();
  const a = gymBranding.accent;
  const ob = theme.ob;

  const [mode, setMode] = useState("member");
  const [email, setEmail] = useState("");
  // steps: idle → sending → code → verifying → done
  const [step, setStep] = useState("idle");
  const [code, setCode] = useState(["","","","","",""]);
  const [errorMsg, setErrorMsg] = useState("");
  const inputRefs = [useRef(),useRef(),useRef(),useRef(),useRef(),useRef()];

  const inp = { width: "100%", background: ob.card, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 12px", fontSize: 13, color: ob.white, outline: "none", fontFamily: ob.font, marginBottom: 10 };
  const btn = (dis) => ({ width: "100%", background: dis ? "#1A2332" : a, color: dis ? ob.muted : ob.tealDk, border: "none", borderRadius: 10, padding: "11px", fontSize: 13, fontWeight: 600, cursor: dis ? "default" : "pointer", fontFamily: ob.font, marginTop: 4 });

  async function handleSend() {
    if (!email.includes("@")) { setErrorMsg("Please enter a valid email."); return; }
    setStep("sending"); setErrorMsg("");
    const result = await sb.sendOTP(email);
    if (result?.ok) {
      setStep("code");
      setTimeout(() => inputRefs[0]?.current?.focus(), 100);
    } else {
      setStep("idle");
      setErrorMsg(result?.error ? `Error: ${result.error}` : "Couldn't send the code. Check your email and try again.");
    }
  }

  function handleDigit(i, val) {
    // Accept paste of full 6-digit code
    if (val.length === 6 && /^\d{6}$/.test(val)) {
      const digits = val.split("");
      setCode(digits);
      inputRefs[5]?.current?.focus();
      setTimeout(() => verifyCode(digits.join("")), 100);
      return;
    }
    const digit = val.replace(/\D/g,"").slice(-1);
    const next = [...code];
    next[i] = digit;
    setCode(next);
    if (digit && i < 5) inputRefs[i+1]?.current?.focus();
    if (next.every(d => d !== "")) setTimeout(() => verifyCode(next.join("")), 80);
  }

  function handleDigitKey(i, e) {
    if (e.key === "Backspace" && !code[i] && i > 0) {
      inputRefs[i-1]?.current?.focus();
    }
  }

  async function verifyCode(token) {
    setStep("verifying"); setErrorMsg("");
    const result = await sb.verifyOTP(email, token);
    if (result?.uid) {
      // Check if this email is a gym owner
      const gymRow = await sb.getGymByOwnerEmail(email);
      const role = gymRow ? "owner" : "member";
      signIn(result.email, role, null, result.uid);
    } else {
      setStep("code");
      setCode(["","","","","",""]);
      setErrorMsg("Incorrect code — check your email and try again.");
      setTimeout(() => inputRefs[0]?.current?.focus(), 100);
    }
  }

  function resetToEmail() { setStep("idle"); setCode(["","","","","",""]); setErrorMsg(""); }

  return (
    <div style={{ background: ob.bg, borderRadius: 20, minHeight: "100dvh", display: "flex", flexDirection: "column", fontFamily: ob.font, color: ob.white, overflow: "hidden" }}>
      {/* Logo */}
      <div style={{ padding: "36px 20px 24px", textAlign: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: ob.tealDk, border: `2px solid ${a}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", fontSize: 24, fontWeight: 700, color: a }}>M</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: ob.white }}>{gymBranding.name}</div>
        <div style={{ fontSize: 11, color: ob.muted, marginTop: 3 }}>Powered by Morphiq</div>
      </div>

      {/* Member / Owner toggle — only shown on idle step */}
      {step === "idle" && (
        <div style={{ display: "flex", margin: "0 20px 20px", background: ob.card, borderRadius: 10, padding: 3 }}>
          {[["member","I'm a Member"],["owner","Gym Owner"]].map(([id, label]) => (
            <button key={id} onClick={() => { setMode(id); setErrorMsg(""); }}
              style={{ flex: 1, padding: "8px", background: mode === id ? a : "transparent", color: mode === id ? ob.tealDk : ob.muted, border: "none", borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: ob.font, transition: "all .2s" }}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, padding: "0 20px 20px" }}>

        {/* ── STEP: Email entry ── */}
        {step === "idle" || step === "sending" ? (
          <div className="mq-fade">
            <div style={{ fontSize: 13, color: ob.body, marginBottom: 16, lineHeight: 1.6 }}>
              {mode === "member"
                ? "Enter your email and we'll text you a 6-digit code to sign in instantly."
                : "Enter your gym owner email to receive a sign-in code."}
            </div>
            <input
              type="email" value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSend()}
              placeholder="your@email.com"
              style={inp}
              autoCapitalize="none" autoCorrect="off"
            />
            {errorMsg && <div style={{ fontSize: 11, color: theme.red, marginBottom: 8 }}>{errorMsg}</div>}
            <button onClick={handleSend} style={btn(!email.includes("@") || step === "sending")}>
              {step === "sending" ? "Sending code…" : "Send code →"}
            </button>
          </div>
        ) : null}

        {/* ── STEP: Code entry ── */}
        {(step === "code" || step === "verifying") ? (
          <div className="mq-fade">
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>📱</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: ob.white, marginBottom: 6 }}>Enter your code</div>
              <div style={{ fontSize: 12, color: ob.body, lineHeight: 1.6 }}>
                We sent a 6-digit code to<br />
                <span style={{ color: a, fontWeight: 500 }}>{email}</span>
              </div>
            </div>

            {/* 6 digit boxes */}
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16 }}>
              {code.map((digit, i) => (
                <input
                  key={i}
                  ref={inputRefs[i]}
                  type="tel"
                  inputMode="numeric"
                  maxLength={6}
                  value={digit}
                  onChange={e => handleDigit(i, e.target.value)}
                  onKeyDown={e => handleDigitKey(i, e)}
                  style={{
                    width: 42, height: 52, textAlign: "center", fontSize: 22, fontWeight: 700,
                    background: digit ? ob.tealDk : ob.card,
                    border: `1.5px solid ${digit ? a : "rgba(255,255,255,0.12)"}`,
                    borderRadius: 10, color: digit ? a : ob.muted,
                    outline: "none", fontFamily: ob.font,
                    transition: "all .15s",
                  }}
                />
              ))}
            </div>

            {errorMsg && (
              <div style={{ fontSize: 12, color: theme.red, textAlign: "center", marginBottom: 12, background: "#1F1010", borderRadius: 8, padding: "8px 12px" }}>
                {errorMsg}
              </div>
            )}

            {step === "verifying" ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10, padding: "8px 0" }}>
                <Spinner size={28} color={a} trackColor={ob.card} />
                <div style={{ fontSize: 12, color: ob.body }}>Verifying…</div>
              </div>
            ) : (
              <button
                onClick={() => verifyCode(code.join(""))}
                style={btn(code.some(d => !d))}
              >
                Verify code →
              </button>
            )}

            <div style={{ textAlign: "center", marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <button onClick={handleSend} style={{ fontSize: 11, color: ob.muted, background: "none", border: "none", cursor: "pointer", fontFamily: ob.font }}>
                Resend code
              </button>
              <button onClick={resetToEmail} style={{ fontSize: 11, color: ob.muted, background: "none", border: "none", cursor: "pointer", fontFamily: ob.font }}>
                Use a different email
              </button>
            </div>
          </div>
        ) : null}

      </div>
      {/* ── DEV BYPASS ── always visible so you can test without hitting OTP rate limits */}
      <div style={{ margin: "0 20px 12px", border: "2px dashed #b45309", borderRadius: 12, padding: "12px 14px", background: "#1c1200" }}>
        <div style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, textAlign: "center" }}>🛠 Dev Bypass — Skip OTP</div>
        <div style={{ display: "flex", gap: 7 }}>
          <button
            onClick={() => signIn("dev@morphiq.app", "member", false)}
            style={{ flex: 1, background: "#1c1200", border: "1px solid #b45309", borderRadius: 8, padding: "8px 4px", fontSize: 11, color: "#fbbf24", cursor: "pointer", fontFamily: ob.font, fontWeight: 600 }}>
            🆕 New<br/>member
          </button>
          <button
            onClick={() => signIn("dev@morphiq.app", "member", true)}
            style={{ flex: 1, background: "#1c1200", border: "1px solid #b45309", borderRadius: 8, padding: "8px 4px", fontSize: 11, color: "#fbbf24", cursor: "pointer", fontFamily: ob.font, fontWeight: 600 }}>
            🏠 Returning<br/>member
          </button>
          <button
            onClick={() => signIn("dev@morphiq.app", "owner", null)}
            style={{ flex: 1, background: "#1c1200", border: "1px solid #b45309", borderRadius: 8, padding: "8px 4px", fontSize: 11, color: "#fbbf24", cursor: "pointer", fontFamily: ob.font, fontWeight: 600 }}>
            🏋️ Gym<br/>owner
          </button>
        </div>
      </div>

      <div style={{ textAlign: "center", fontSize: 9, color: "#333", letterSpacing: ".5px", padding: "4px 0 10px" }}>POWERED BY MORPHIQ</div>
    </div>
  );
}

const GOAL_ICONS = {
  lose_fat: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>),
  build_muscle: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 6.5h11M6.5 17.5h11M3 12h18M6 8.5v7M18 8.5v7"/></svg>),
  get_fit: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>),
  strength: (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4v16M18 4v16M3 8h3M15 8h6M3 16h3M15 16h6"/></svg>),
};
const GOAL_OPTIONS = [
  { id: "lose_fat", label: "Lose fat", sub: "Burn calories, drop weight" },
  { id: "build_muscle", label: "Build muscle", sub: "Get stronger, gain size" },
  { id: "get_fit", label: "Get fit & healthy", sub: "More energy, feel better" },
  { id: "strength", label: "Get stronger", sub: "Build power, hit PRs" },
];

function OnboardingScreen() {
  const { navigate, setUser, setPlan, plan, gymBranding, supabaseUser } = useApp();
  const ob = theme.ob;
  const a = gymBranding.accent || ob.teal;
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState(null);
  const [sex, setSex] = useState(null);
  const [unit] = useState("imperial");
  const [heightFt, setHeightFt] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [weight, setWeight] = useState("");
  const [age, setAge] = useState("");
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [injuries, setInjuries] = useState("");
  const [equipment, setEquipment] = useState(null);
  const [trainingHistory, setTrainingHistory] = useState(null);
  const [recentActivity, setRecentActivity] = useState(null);
  const [restPref, setRestPref] = useState(120);
  const [checklist, setChecklist] = useState([false, false, false, false]);

  useEffect(() => {
    if (step !== 12) return;
    let cancelled = false;
    [0,1,2,3].forEach(i => setTimeout(() => { if(!cancelled) setChecklist(c => c.map((v,idx) => idx<=i ? true : v)); }, i*550+300));

    async function generatePlan() {
      const historyMap = { new: "beginner with no training history", some: "intermediate, 6 months to 2 years experience", years: "experienced lifter, several years of training" };
      const activityMap = { returning: "returning after a long break (treat as rebuilding, use 60-70% of experienced weights)", consistent: "moderately active, some consistency recently", active: "currently training regularly" };
      const fitnessProfile = `${historyMap[trainingHistory] || "beginner"}, ${activityMap[recentActivity] || "just starting out"}`;
      const prompt = `You are a certified personal trainer. Return ONLY valid JSON (no markdown, no preamble). Member: name=${name}, goal=${goal}, sex=${sex}, height=${heightFt}ft${heightIn||0}in, weight=${weight}lbs, age=${age}, daysPerWeek=${daysPerWeek}, equipment=${equipment||"dumbbells"}, injuries=${injuries||"none"}, fitnessProfile="${fitnessProfile}", restPreference=${restPref}s.\nReturn this exact JSON shape: {"calories":<number>,"protein":<number>,"carbs":<number>,"fat":<number>,"workoutDays":[<${daysPerWeek} day names>],"workoutType":"<string>","workoutDuration":<minutes>,"restSeconds":${restPref},"weeklyFocus":"<1 sentence>","tip":"<1 sentence>","exercises":[{"name":"<string>","sets":<n>,"reps":<n>,"weight":<lbs>,"muscle":"<string>"}],"weeks":[{"week":1,"focus":"Foundation","exercises":[{"name":"<string>","sets":<n>,"reps":<n>,"weight":<lbs>,"muscle":"<string>"}]},{"week":2,"focus":"Progressive","exercises":[...]},{"week":3,"focus":"Intensity","exercises":[...]},{"week":4,"focus":"Peak","exercises":[...]}]}\nTop-level exercises = week 1 exercises. Each week has 5-6 exercises. Week 1: learn movements, moderate weights. Week 2: add 1 set or 2 reps. Week 3: increase weight 5-10%. Week 4: peak intensity, hardest variation. Goal: ${goal === "lose_fat" ? "fat loss - compound movements, keep rest short" : goal === "build_muscle" ? "muscle building - progressive overload, hypertrophy" : "general fitness - balanced full body"}. Fitness profile: ${fitnessProfile}. Do NOT use beginner weights for experienced members. All numeric fields must be plain numbers.`;
      try {
        const res = await fetch("/api/plan", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });
        const data = await res.json();
        const raw = (data.text || "").replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(raw);
        if (!cancelled) {
          const userData = { name, goal, sex, height: `${heightFt}′ ${heightIn || "0"}″`, weight: `${weight} lbs`, age, daysPerWeek, injuries, equipment, unit, trainingHistory, recentActivity, restPref, fitnessLevel: trainingHistory === "new" ? "Beginner" : trainingHistory === "some" ? "Intermediate" : recentActivity === "returning" ? "Rebuilding" : "Advanced" };
          setUser(userData);
          setPlan(parsed);
          // Persist to Supabase profiles table (fire-and-forget — UI doesn't block on this)
          if (supabaseUser?.id) {
            sb.upsertProfile(supabaseUser.id, userData, parsed).catch(() => {});
          }
          setTimeout(() => { if (!cancelled) setStep(13); }, 400);
        }
      } catch (_) {
        if (!cancelled) {
          const userData = { name, goal, sex, height: `${heightFt}′ ${heightIn || "0"}″`, weight: `${weight} lbs`, age, daysPerWeek, injuries, equipment, unit, trainingHistory, recentActivity, restPref, fitnessLevel: trainingHistory === "new" ? "Beginner" : trainingHistory === "some" ? "Intermediate" : recentActivity === "returning" ? "Rebuilding" : "Advanced" };
          const fallbackPlan = {
            calories: goal === "lose_fat" ? 1800 : goal === "build_muscle" ? 2800 : 2200,
            protein: 140, carbs: 160, fat: 55,
            workoutDays: ["Monday","Wednesday","Friday","Saturday","Tuesday","Thursday"].slice(0, daysPerWeek || 3),
            workoutType: "Full Body", workoutDuration: 40, restSeconds: restPref,
            weeklyFocus: "Build your movement foundation with compound lifts.",
            exercises: [
              { name: "Goblet Squat", sets: 3, reps: 12, weight: 25, muscle: "Quads / Glutes" },
              { name: "Dumbbell Row", sets: 3, reps: 10, weight: 30, muscle: "Back / Biceps" },
              { name: "Incline Press", sets: 3, reps: 10, weight: 35, muscle: "Chest / Shoulders" },
              { name: "Romanian Deadlift", sets: 3, reps: 10, weight: 65, muscle: "Hamstrings" },
              { name: "Shoulder Press", sets: 3, reps: 10, weight: 25, muscle: "Shoulders" },
            ],
            tip: "Consistency over perfection — show up, even on hard days.",
          };
          setUser(userData);
          setPlan(fallbackPlan);
          if (supabaseUser?.id) {
            sb.upsertProfile(supabaseUser.id, userData, fallbackPlan).catch(() => {});
          }
          setTimeout(() => { if (!cancelled) setStep(13); }, 400);
        }
      }
    }

    Promise.all([generatePlan(), new Promise(r => setTimeout(r, 2600))]);
    return () => { cancelled = true; };
  }, [step]);

  const bodyValid = heightFt && parseInt(heightFt) > 0 && parseInt(heightFt) < 9 && weight && parseFloat(weight) > 0;
  const ageValid = age && parseInt(age) >= 13 && parseInt(age) <= 100;
  const progressPct = [10, 18, 26, 34, 44, 54, 62, 70, 78, 86, 93, 100, 100][step] || 10;
  const goalLabel = GOAL_OPTIONS.find(g => g.id === goal)?.label || "";

  const s = {
    root: { background: ob.bg, borderRadius: 20, minHeight: "100dvh", display: "flex", flexDirection: "column", fontFamily: ob.font, color: ob.white, position: "relative", overflow: "hidden" },
    inner: { flex: 1, padding: "10px 14px 10px", display: "flex", flexDirection: "column" },
    aiBubble: { background: ob.card, borderRadius: "12px 12px 12px 4px", padding: "9px 11px", fontSize: 12, lineHeight: 1.55, color: ob.body, marginBottom: 8 },
    tealBtn: (disabled) => ({ width: "100%", background: a, color: ob.tealDk, border: "none", borderRadius: 10, padding: 9, fontSize: 11, fontWeight: 600, cursor: "pointer", marginTop: 8, fontFamily: ob.font, opacity: disabled ? 0.35 : 1 }),
    outlineBtn: { background: "transparent", border: `1px solid rgba(255,255,255,0.12)`, borderRadius: 10, padding: "7px 10px", fontSize: 10, color: ob.muted, cursor: "pointer", fontFamily: ob.font },
    numInput: { background: ob.card, border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 8, padding: "7px 10px", fontSize: 12, color: ob.white, outline: "none", fontFamily: ob.font, width: "100%" },
    goalCard: (sel) => ({ background: sel ? ob.tealDk : ob.card, border: `1.5px solid ${sel ? a : "rgba(255,255,255,0.08)"}`, borderRadius: 10, padding: "9px 10px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 6 }),
    label: { fontSize: 9, color: ob.muted, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 },
  };

  const AiAvatar = () => (
    <div style={{ width: 28, height: 28, borderRadius: "50%", background: ob.tealDk, border: `2px solid ${a}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 10, color: a, fontWeight: 700 }}>AI</div>
  );

  const EQUIP_LABELS = { barbell: "Barbells & racks", dumbbell: "Dumbbells & cables", kettlebell: "Kettlebells & bodyweight", machine: "Machines mostly" };
  const HISTORY_LABELS = { new: "New to working out", some: "Some experience (6m–2yr)", years: "Several years training" };
  const ACTIVITY_LABELS = { returning: "Getting back into it", consistent: "Pretty consistent", active: "Training regularly" };
  const REST_LABELS = { 60: "1 min", 120: "2 min", 180: "3 min" };
  const confirmRows = [
    ["Name", name], ["Goal", goalLabel], ["Sex", sex || "—"],
    ["Height", `${heightFt}′ ${heightIn || "0"}″`], ["Weight", `${weight} lbs`],
    ["Age", age ? `${age} yrs` : "—"], ["Experience", HISTORY_LABELS[trainingHistory] || "—"],
    ["Recent activity", ACTIVITY_LABELS[recentActivity] || "—"],
    ["Days/week", daysPerWeek ? `${daysPerWeek}×` : "—"],
    ["Rest between sets", REST_LABELS[restPref] || "2 min"],
    ["Equipment", EQUIP_LABELS[equipment] || "—"],
    ["Injuries", injuries.trim() || "None"],
  ];

  return (
    <div style={s.root}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 20, height: 20, borderRadius: "50%", background: ob.tealDk, border: `2px solid ${a}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: a }}>M</div>
          <span style={{ fontSize: 13, fontWeight: 600, color: a }}>{gymBranding.name}</span>
        </div>
        <span style={{ fontSize: 9, color: ob.muted }}>Powered by Morphiq</span>
      </div>
      {step < 10 && (
        <div style={{ padding: "8px 14px 0", flexShrink: 0 }}>
          <div style={{ height: 3, background: ob.card, borderRadius: 2 }}>
            <div style={{ height: 3, background: a, borderRadius: 2, width: `${progressPct}%`, transition: "width .5s ease" }} />
          </div>
        </div>
      )}
      <div style={s.inner}>
        {step === 0 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ textAlign: "center", margin: "16px 0 20px" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: ob.tealDk, border: `2px solid ${a}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px", fontSize: 22, fontWeight: 700, color: a }}>
              {gymBranding.name?.[0]?.toUpperCase() || "M"}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: ob.white }}>{gymBranding.name}</div>
            <div style={{ fontSize: 10, color: ob.muted, marginTop: 2 }}>Powered by Morphiq</div>
          </div>
          <div style={{ background: ob.card, borderRadius: "12px 12px 12px 4px", padding: "12px 14px", fontSize: 13, lineHeight: 1.6, color: ob.body, marginBottom: 20 }}>
            I'll build a training plan personal to you in about 2 minutes. Let's start with your name.
          </div>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && name.trim().length >= 2 && setStep(1)} placeholder="Your first name..." style={{ background: ob.card, border: `1.5px solid ${name.trim().length >= 2 ? a : "rgba(255,255,255,0.08)"}`, borderRadius: 12, padding: "12px 14px", fontSize: 16, color: ob.white, outline: "none", fontFamily: ob.font, width: "100%", transition: "border-color .2s" }} maxLength={30} />
          <button onClick={() => name.trim().length >= 2 && setStep(1)} disabled={name.trim().length < 2} style={{ ...s.tealBtn(name.trim().length < 2), marginTop: 12, padding: 12, fontSize: 13 }}>
            Let's go, {name.trim() || "..."} →
          </button>
        </div>}

        {step === 1 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 4 }}>Your goal</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: ob.white }}>What do you want to achieve?</div>
            <div style={{ fontSize: 11, color: ob.muted, marginTop: 3 }}>No judgment — pick the one that fits best</div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            {GOAL_OPTIONS.map(g => (
              <button key={g.id} onClick={() => { setGoal(g.id); setTimeout(() => setStep(2), 180); }}
                style={{ background: goal === g.id ? ob.tealDk : ob.card, border: `1.5px solid ${goal === g.id ? a : "rgba(255,255,255,0.07)"}`, borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", transition: "all .15s" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: goal === g.id ? `rgba(0,212,177,0.15)` : "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: goal === g.id ? a : ob.muted }}>
                  {GOAL_ICONS[g.id]}
                </div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: goal === g.id ? a : ob.white }}>{g.label}</div>
                  <div style={{ fontSize: 10, color: ob.muted, marginTop: 1 }}>{g.sub}</div>
                </div>
                {goal === g.id && <div style={{ marginLeft: "auto", width: 18, height: 18, borderRadius: "50%", background: a, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: ob.tealDk, fontWeight: 700, flexShrink: 0 }}>✓</div>}
              </button>
            ))}
          </div>
        </div>}

        
        {step === 2 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 4 }}>Your background</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: ob.white }}>How long have you been training?</div>
            <div style={{ fontSize: 11, color: ob.muted, marginTop: 3 }}>Helps us set the right starting point</div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { id: "new", label: "New to working out", sub: "Just getting started", icon: "🌱" },
              { id: "some", label: "Some experience", sub: "6 months to 2 years, on and off", icon: "📈" },
              { id: "years", label: "Several years of training", sub: "I know my way around a gym", icon: "🏋️" },
            ].map(opt => (
              <button key={opt.id} onClick={() => { setTrainingHistory(opt.id); setTimeout(() => setStep(3), 180); }}
                style={{ background: trainingHistory === opt.id ? ob.tealDk : ob.card, border: `1.5px solid ${trainingHistory === opt.id ? a : "rgba(255,255,255,0.07)"}`, borderRadius: 14, padding: "14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", transition: "all .15s" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: trainingHistory === opt.id ? "rgba(0,212,177,0.15)" : "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 20 }}>{opt.icon}</div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: trainingHistory === opt.id ? a : ob.white }}>{opt.label}</div>
                  <div style={{ fontSize: 10, color: ob.muted, marginTop: 1 }}>{opt.sub}</div>
                </div>
                {trainingHistory === opt.id && <div style={{ marginLeft: "auto", width: 18, height: 18, borderRadius: "50%", background: a, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: ob.tealDk, fontWeight: 700, flexShrink: 0 }}>✓</div>}
              </button>
            ))}
          </div>
        </div>}

        {step === 3 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 4 }}>Right now</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: ob.white }}>How active have you been lately?</div>
            <div style={{ fontSize: 11, color: ob.muted, marginTop: 3 }}>No judgment — this calibrates your starting weights</div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { id: "returning", label: "Just getting back into it", sub: "Been a while — starting fresh", icon: "🔄" },
              { id: "consistent", label: "Pretty consistent", sub: "Training here and there recently", icon: "⚡" },
              { id: "active", label: "Training regularly right now", sub: "Already in a routine", icon: "🔥" },
            ].map(opt => (
              <button key={opt.id} onClick={() => { setRecentActivity(opt.id); setTimeout(() => setStep(4), 180); }}
                style={{ background: recentActivity === opt.id ? ob.tealDk : ob.card, border: `1.5px solid ${recentActivity === opt.id ? a : "rgba(255,255,255,0.07)"}`, borderRadius: 14, padding: "14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", transition: "all .15s" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: recentActivity === opt.id ? "rgba(0,212,177,0.15)" : "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 20 }}>{opt.icon}</div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: recentActivity === opt.id ? a : ob.white }}>{opt.label}</div>
                  <div style={{ fontSize: 10, color: ob.muted, marginTop: 1 }}>{opt.sub}</div>
                </div>
                {recentActivity === opt.id && <div style={{ marginLeft: "auto", width: 18, height: 18, borderRadius: "50%", background: a, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: ob.tealDk, fontWeight: 700, flexShrink: 0 }}>✓</div>}
              </button>
            ))}
          </div>
        </div>}

        {step === 4 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 4 }}>About you</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: ob.white }}>Biological sex</div>
            <div style={{ fontSize: 11, color: ob.muted, marginTop: 3 }}>Used to calculate accurate calorie targets</div>
          </div>
          <div style={{ display: "flex", gap: 10, flex: 1, alignItems: "flex-start" }}>
            {[["Male", (<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10" cy="14" r="5"/><path d="M19 5l-5.5 5.5M19 5h-4M19 5v4"/></svg>)], ["Female", (<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="9" r="5"/><path d="M12 14v6M9 17h6"/></svg>)]].map(([label, icon]) => (
              <button key={label} onClick={() => { setSex(label); setTimeout(() => setStep(5), 180); }}
                style={{ flex: 1, background: sex === label ? ob.tealDk : ob.card, border: `1.5px solid ${sex === label ? a : "rgba(255,255,255,0.07)"}`, borderRadius: 16, padding: "24px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer", transition: "all .15s" }}>
                <div style={{ color: sex === label ? a : ob.muted }}>{icon}</div>
                <span style={{ fontSize: 14, fontWeight: 600, color: sex === label ? a : ob.white }}>{label}</span>
                {sex === label && <div style={{ width: 16, height: 16, borderRadius: "50%", background: a, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: ob.tealDk, fontWeight: 700 }}>✓</div>}
              </button>
            ))}
          </div>
        </div>}

        {step === 5 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 4 }}>Your stats</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: ob.white }}>Quick measurements</div>
            <div style={{ fontSize: 11, color: ob.muted, marginTop: 3 }}>Used to set accurate calorie and weight targets</div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={s.label}>Height</div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}><input value={heightFt} onChange={e => setHeightFt(e.target.value)} placeholder="ft" style={{ ...s.numInput }} type="number" min="3" max="8" /></div>
              <div style={{ flex: 1 }}><input value={heightIn} onChange={e => setHeightIn(e.target.value)} placeholder="in" style={{ ...s.numInput }} type="number" min="0" max="11" /></div>
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={s.label}>Weight (lbs)</div>
            <input value={weight} onChange={e => setWeight(e.target.value)} placeholder="e.g. 175" style={s.numInput} type="number" min="80" max="500" />
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={s.label}>Age</div>
            <input value={age} onChange={e => setAge(e.target.value)} placeholder="e.g. 32" style={s.numInput} type="number" min="13" max="100" />
          </div>
          <button onClick={() => setStep(4)} disabled={!bodyValid || !ageValid} style={{ ...s.tealBtn(!bodyValid || !ageValid), marginTop: "auto" }}>Continue →</button>
        </div>}

        {step === 6 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 4 }}>Training frequency</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: ob.white }}>How often can you train?</div>
            <div style={{ fontSize: 11, color: ob.muted, marginTop: 3 }}>3–4 days is ideal for most beginners</div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
            {/* Circular dial ring */}
            <div style={{ position: "relative", width: 140, height: 140 }}>
              <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="70" cy="70" r="58" fill="none" stroke={ob.card} strokeWidth="12"/>
                <circle cx="70" cy="70" r="58" fill="none" stroke={a} strokeWidth="12" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 58}
                  strokeDashoffset={2 * Math.PI * 58 * (1 - (daysPerWeek - 2) / 5)}
                  style={{ transition: "stroke-dashoffset .35s cubic-bezier(.4,0,.2,1)" }}
                />
              </svg>
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
                <div style={{ fontSize: 38, fontWeight: 700, color: ob.white, lineHeight: 1 }}>{daysPerWeek}</div>
                <div style={{ fontSize: 10, color: ob.muted, marginTop: 2 }}>days/week</div>
              </div>
            </div>
            {/* +/− buttons */}
            <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
              <button onClick={() => setDaysPerWeek(d => Math.max(2, d - 1))} style={{ width: 44, height: 44, borderRadius: "50%", background: ob.card, border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: ob.muted, cursor: "pointer", fontFamily: ob.font, lineHeight: 1 }}>−</button>
              <div style={{ fontSize: 11, color: ob.muted }}>adjust</div>
              <button onClick={() => setDaysPerWeek(d => Math.min(7, d + 1))} style={{ width: 44, height: 44, borderRadius: "50%", background: ob.tealDk, border: `1px solid rgba(0,212,177,0.3)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: a, cursor: "pointer", fontFamily: ob.font, lineHeight: 1 }}>+</button>
            </div>
            {/* Day dots */}
            <div style={{ display: "flex", gap: 6 }}>
              {["M","T","W","T","F","S","S"].map((d, i) => (
                <div key={i} style={{ width: 26, height: 26, borderRadius: "50%", background: i < daysPerWeek ? ob.tealDk : ob.card, border: `1px solid ${i < daysPerWeek ? a : "rgba(255,255,255,0.06)"}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 600, color: i < daysPerWeek ? a : ob.muted, transition: "all .2s" }}>{d}</div>
              ))}
            </div>
          </div>
          <button onClick={() => setStep(7)} style={{ ...s.tealBtn(false), marginTop: 8, padding: 12, fontSize: 13 }}>Continue →</button>
        </div>}

        
        {step === 7 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 4 }}>Rest preference</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: ob.white }}>How long to rest between sets?</div>
            <div style={{ fontSize: 11, color: ob.muted, marginTop: 3 }}>You can always change this mid-workout</div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }}>
            {[[60, "1 minute", "High intensity, keep the burn going", "🔥"], [120, "2 minutes", "Balanced — works for most people", "⚡"], [180, "3 minutes", "Full recovery, lift heavier", "💪"]].map(([secs, label, sub, icon]) => (
              <button key={secs} onClick={() => { setRestPref(secs); setTimeout(() => setStep(8), 180); }}
                style={{ background: restPref === secs ? ob.tealDk : ob.card, border: `2px solid ${restPref === secs ? a : "rgba(255,255,255,0.07)"}`, borderRadius: 16, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", transition: "all .15s" }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: restPref === secs ? "rgba(0,212,177,0.15)" : "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 24 }}>{icon}</div>
                <div style={{ textAlign: "left", flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: restPref === secs ? a : ob.white }}>{label}</div>
                  <div style={{ fontSize: 11, color: ob.muted, marginTop: 2 }}>{sub}</div>
                </div>
                {restPref === secs && <div style={{ width: 20, height: 20, borderRadius: "50%", background: a, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: ob.tealDk, fontWeight: 700, flexShrink: 0 }}>✓</div>}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: ob.muted, textAlign: "center", marginTop: 12 }}>This is your default — tap during rest to adjust on the fly</div>
        </div>}

        {step === 8 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 4 }}>Injuries & limits</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: ob.white }}>Anything to avoid?</div>
            <div style={{ fontSize: 11, color: ob.muted, marginTop: 3 }}>Tap all that apply — your plan will work around these</div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {["Lower back","Knees","Shoulders","Wrists","Neck","Hips","Ankles","Elbows"].map(area => {
              const sel = injuries.includes(area);
              return (
                <button key={area} onClick={() => setInjuries(prev => sel ? prev.replace(area, "").replace(/,\s*,/g,",").replace(/^,|,$/g,"").trim() : prev ? `${prev}, ${area}` : area)}
                  style={{ background: sel ? ob.tealDk : ob.card, border: `1.5px solid ${sel ? a : "rgba(255,255,255,0.08)"}`, borderRadius: 20, padding: "7px 14px", fontSize: 12, color: sel ? a : ob.body, cursor: "pointer", fontFamily: ob.font, transition: "all .15s" }}>
                  {area}
                </button>
              );
            })}
          </div>
          <textarea value={injuries} onChange={e => setInjuries(e.target.value)} placeholder="Or type anything else (e.g. no overhead pressing)..." style={{ ...s.numInput, minHeight: 64, resize: "none", lineHeight: 1.5, fontSize: 12 }} maxLength={200} />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => { setInjuries(""); setStep(9); }} style={{ ...s.outlineBtn, flex: 1 }}>None →</button>
            <button onClick={() => setStep(9)} style={{ ...s.tealBtn(false), flex: 2, marginTop: 0, padding: 10 }}>Continue →</button>
          </div>
        </div>}




        {step === 9 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 4 }}>Equipment</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: ob.white }}>What will you be training with?</div>
            <div style={{ fontSize: 11, color: ob.muted, marginTop: 3 }}>Your plan is built around your available equipment</div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { id: "barbell", label: "Barbells & racks", sub: "Powerlifting-style, free weights", icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 4v16M18 4v16M3 8h3M15 8h6M3 16h3M15 16h6M6 12h12"/></svg>) },
              { id: "dumbbell", label: "Dumbbells & cables", sub: "Most commercial gyms", icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 8v8M18 8v8M3 10h3M18 10h3M3 14h3M18 14h3M9 12h6"/></svg>) },
              { id: "kettlebell", label: "Kettlebells & bodyweight", sub: "Functional, explosive training", icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 3a3 3 0 0 1 3 3c0 1.5-1 2.5-2 3l2 9H9l2-9c-1-.5-2-1.5-2-3a3 3 0 0 1 3-3z"/><path d="M9 18h6"/></svg>) },
              { id: "machine", label: "Machines mostly", sub: "Guided equipment, great for beginners", icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="6" width="4" height="12" rx="1"/><rect x="17" y="6" width="4" height="12" rx="1"/><path d="M7 12h10"/></svg>) },
            ].map(eq => (
              <button key={eq.id} onClick={() => { setEquipment(eq.id); setTimeout(() => setStep(10), 180); }}
                style={{ background: equipment === eq.id ? ob.tealDk : ob.card, border: `1.5px solid ${equipment === eq.id ? a : "rgba(255,255,255,0.07)"}`, borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", transition: "all .15s" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: equipment === eq.id ? `rgba(0,212,177,0.15)` : "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: equipment === eq.id ? a : ob.muted }}>
                  {eq.icon}
                </div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: equipment === eq.id ? a : ob.white }}>{eq.label}</div>
                  <div style={{ fontSize: 10, color: ob.muted, marginTop: 1 }}>{eq.sub}</div>
                </div>
                {equipment === eq.id && <div style={{ marginLeft: "auto", width: 18, height: 18, borderRadius: "50%", background: a, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: ob.tealDk, fontWeight: 700, flexShrink: 0 }}>✓</div>}
              </button>
            ))}
          </div>
        </div>}

        {step === 10 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", gap: 7, marginBottom: 10 }}><AiAvatar /><div style={s.aiBubble}>Before I build your plan, please review the health disclaimer below. Your safety comes first.</div></div>
          <div style={{ background: ob.card, borderRadius: 12, padding: "12px 14px", marginBottom: 10, flex: 1, overflowY: "auto" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: ob.white, marginBottom: 6 }}>⚠️ Health & Fitness Disclaimer</div>
            <div style={{ fontSize: 11, color: ob.body, lineHeight: 1.65 }}>
              The fitness and nutrition plans provided by Morphiq are for <span style={{ color: ob.white, fontWeight: 600 }}>informational and educational purposes only</span> and do not constitute medical advice.<br /><br />
              Before starting any new exercise or nutrition program, consult a qualified healthcare provider — especially if you have a medical condition, injury, or concern.<br /><br />
              You agree to exercise within your own limits and accept responsibility for your health and safety during all workouts. Morphiq and its licensees are not liable for any injury, illness, or adverse outcome.<br /><br />
              By tapping "I agree", you confirm you are at least 13 years old and accept these terms.
            </div>
          </div>
          <button onClick={() => setStep(11)} style={{ ...s.tealBtn(false), marginTop: 6 }}>I agree — build my plan ✦</button>
          <div style={{ textAlign: "center", marginTop: 8 }}>
            <button onClick={() => navigate("auth")} style={{ fontSize: 10, color: ob.muted, background: "none", border: "none", cursor: "pointer", fontFamily: ob.font }}>Decline — go back</button>
          </div>
        </div>}

        {step === 11 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", gap: 7, marginBottom: 8 }}><AiAvatar /><div style={s.aiBubble}>Perfect, {name}. {goalLabel}, {daysPerWeek} days a week, {restPref === 60 ? "1-min" : restPref === 180 ? "3-min" : "2-min"} rest{injuries.trim() ? `, noting: ${injuries.trim()}` : ""}. Building your 4-week plan now.</div></div>
          <div style={{ background: ob.card, borderRadius: 10, padding: "6px 10px", marginBottom: 8 }}>
            {confirmRows.map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ color: ob.muted }}>{k}</span>
                <span style={{ color: ob.white, fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>
          <button onClick={() => { setChecklist([false, false, false, false]); setStep(12); }} style={{ ...s.tealBtn(false), marginTop: "auto" }}>Build my plan ✦</button>
          <button onClick={() => setStep(0)} style={{ ...s.outlineBtn, width: "100%", marginTop: 6 }}>Start over</button>
        </div>}

        {step === 12 && <div className="mq-fade" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <Spinner size={40} color={a} trackColor={ob.card} />
          <div style={{ fontSize: 12, fontWeight: 600, color: ob.white }}>Building your plan</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%", marginTop: 4 }}>
            {["Analyzing your goal", "Selecting best exercises", "Building your meal guide", "Personalizing week one..."].map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: checklist[i] ? a : ob.muted, padding: "3px 0" }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: checklist[i] ? a : ob.card, flexShrink: 0, transition: "background .3s" }} />{item}
              </div>
            ))}
          </div>
        </div>}

        {step === 13 && plan && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ textAlign: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: a, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Your plan is ready</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: ob.white }}>{name}&apos;s {goalLabel} Plan</div>
            <div style={{ fontSize: 9, color: ob.muted }}>Built by Morphiq AI · Week 1</div>
          </div>
          <div style={{ background: ob.card, borderRadius: 12, padding: "8px 12px", marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: ob.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Workouts — {plan.workoutType}</div>
            {(plan.workoutDays || []).map((day, i, arr) => (
              <div key={day} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                <span style={{ fontSize: 11, color: ob.white }}>{day}</span>
                <Pill>{plan.workoutType} · {plan.workoutDuration} min</Pill>
              </div>
            ))}
          </div>
          <div style={{ background: ob.card, borderRadius: 12, padding: "8px 12px", marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: ob.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Daily targets</div>
            {[["Calories", `${plan.calories?.toLocaleString()}/day`], ["Protein", `${plan.protein}g/day`], ["Carbs", `${plan.carbs}g/day`], ["Fat", `${plan.fat}g/day`]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                <span style={{ fontSize: 11, color: ob.white }}>{k}</span>
                <span style={{ fontSize: 11, color: a, fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
          {plan.tip && <div style={{ background: "#0A1628", borderLeft: `2px solid ${a}`, borderRadius: "0 8px 8px 0", padding: "7px 10px", marginBottom: 8, fontSize: 11, color: ob.body, lineHeight: 1.5 }}>{plan.tip}</div>}
          <button onClick={() => navigate("plan")} style={{ ...s.tealBtn(false), marginTop: "auto", padding: 10, fontSize: 12 }}>Start Day 1 →</button>
        </div>}
      </div>
      <div style={{ textAlign: "center", fontSize: 9, color: "#333", letterSpacing: "0.5px", padding: "4px 0 6px", flexShrink: 0 }}>POWERED BY MORPHIQ</div>
    </div>
  );
}

const WORKOUT_EXERCISES = [
  { name: "Goblet Squat", muscle: "Quads / Glutes", sets: 3, targetReps: 12, weight: 25 },
  { name: "Dumbbell Row", muscle: "Back / Biceps", sets: 3, targetReps: 10, weight: 30 },
  { name: "Incline Press", muscle: "Chest / Shoulders", sets: 3, targetReps: 10, weight: 35 },
  { name: "Romanian Deadlift", muscle: "Hamstrings", sets: 3, targetReps: 10, weight: 65 },
  { name: "Shoulder Press", muscle: "Shoulders", sets: 3, targetReps: 10, weight: 25 },
];

function PlanOverviewScreen() {
  const { navigate, user, gymBranding } = useApp();
  const a = gymBranding.accent;
  const [activeDay, setActiveDay] = useState(0);
  const day = WEEK[activeDay];
  const sL = theme.sL;
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

function HomeDashboardScreen() {
  const { navigate, user, gymBranding, historicalData } = useApp();
  const a = gymBranding.accent;
  const [done, setDone] = useState(0);
  const [cals, setCals] = useState(1100);
  const [logged, setLogged] = useState(false);
  const calGoal = 1840;
  const h = new Date().getHours();
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const sL = theme.sL;

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

const MEAL_DATA = [
  {
    id: "breakfast", label: "Breakfast", time: "7–9 AM",
    suggested: { name: "Greek yogurt & berries", cal: 320, protein: 28, carbs: 36, fat: 6 },
    status: "done", logged: null,
  },
  {
    id: "lunch", label: "Lunch", time: "12–1 PM",
    suggested: { name: "Grilled chicken wrap", cal: 480, protein: 38, carbs: 44, fat: 12 },
    status: "upcoming",
    logged: null,
  },
  {
    id: "dinner", label: "Dinner", time: "6–7 PM",
    suggested: { name: "Light salmon salad", cal: 380, protein: 36, carbs: 22, fat: 16 },
    originalSuggested: { name: "Salmon & roasted veg", cal: 540, protein: 44 },
    status: "upcoming", logged: null,
  },
  {
    id: "snack", label: "Snack", time: "3–4 PM",
    suggested: { name: "Protein shake + banana", cal: 240, protein: 26, carbs: 28, fat: 3 },
    status: "upcoming", logged: null,
  },
];

const GROCERY_DATA = [
  { category: "Protein", emoji: "🥩", items: [
    { name: "Chicken breast", qty: "2 lbs", done: true },
    { name: "Greek yogurt", qty: "32 oz", done: false },
    { name: "Salmon fillets", qty: "4 pieces", done: false },
    { name: "Eggs", qty: "1 dozen", done: false },
  ]},
  { category: "Produce", emoji: "🥦", items: [
    { name: "Mixed berries", qty: "1 bag", done: true },
    { name: "Broccoli", qty: "1 head", done: false },
    { name: "Sweet potato", qty: "3 medium", done: false },
    { name: "Spinach", qty: "5 oz bag", done: false },
  ]},
  { category: "Pantry", emoji: "🫙", items: [
    { name: "Brown rice", qty: "2 lbs", done: true },
    { name: "Olive oil", qty: "1 bottle", done: false },
    { name: "Protein powder", qty: "1 tub", done: false },
  ]},
];

  const key = text.toLowerCase().trim().replace(/[!?.]/g, "");
  return FALLBACK_REPLIES[key] || "Good question. Based on your plan and history, you're on track — keep it up and check in if anything feels off.";
}

async function fetchAIReply(messages, user, context, workoutContext = null) {
  const res = await fetch("/api/chat", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, user, context, workoutContext }),
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json(); // { text, action, chips }
}

function ChatScreen({ fromScreen = "home" }) {
  const { navigate, user, gymBranding, workoutContext, supabaseUser } = useApp();
  const [msgUsage, setMsgUsage] = useState(null);
  const a = gymBranding.accent;
  const [messages, setMessages] = useState([
    { id: 1, role: "ai", text: `Hey ${user.name || "there"}! I can see your full plan and history. What's up?` },
  ]);
  const [input, setInput] = useState("");
  const [voicePhase, setVoicePhase] = useState("idle"); // idle | listening | heard
  const [voiceText, setVoiceText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [dynamicChips, setDynamicChips] = useState(null); // chips returned by Claude
  const [apiError, setApiError] = useState(false);
  const scrollRef = useRef(null);
  const timerRef = useRef(null);

  // Default suggestion chips per context — shown before first exchange
  const defaultChips = CHAT_SUGGESTIONS[fromScreen] || CHAT_SUGGESTIONS.idle;
  // After first exchange: show Claude's chips if available, else nothing
  const visibleChips = messages.length <= 2 ? defaultChips : (dynamicChips || []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, thinking]);

  async function sendMessage(text) {
    if (!text.trim()) return;
    const userMsg = { id: Date.now(), role: "user", text: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setVoicePhase("idle");
    setVoiceText("");
    setThinking(true);
    setDynamicChips(null);
    setApiError(false);

    try {
      // Send full conversation history so Claude has context
      const userMessages = newMessages.filter(m => m.role === "user" || m.role === "ai");
      const profileId = await sb.getProfileId(supabaseUser?.id).catch(() => null);
      const { text: reply, action, chips, usageCount, usageLimit } = await fetchAIReply(
        userMessages,
        { ...user, gymName: gymBranding.name, profileId, gymId: gymBranding.gymId || "unknown" },
        fromScreen,
        workoutContext   // null when not in workout, object when mid-workout
      );
      if (usageCount !== undefined) setMsgUsage({ count: usageCount, limit: usageLimit });
      setThinking(false);
      setMessages(prev => [...prev, { id: Date.now() + 1, role: "ai", text: reply }]);
      if (chips?.length) setDynamicChips(chips);
      // Action handling — swap exercise or adjust meal
      if (action?.type === "swap_exercise") {
        console.log("[Morphiq] AI action: swap", action.from, "→", action.to);
        // TODO: wire to workoutExercises in AppContext when Supabase is added
      }
    } catch (err) {
      console.warn("[Morphiq] API unavailable, using fallback:", err.message);
      setApiError(true);
      setThinking(false);
      setMessages(prev => [...prev, { id: Date.now() + 1, role: "ai", text: getFallbackReply(text) }]);
    }
  }

  function startVoice() {
    setVoicePhase("listening");
    timerRef.current = setTimeout(() => {
      setVoiceText(defaultChips[Math.floor(Math.random() * defaultChips.length)]);
      setVoicePhase("heard");
    }, 2000);
  }
  function cancelVoice() {
    clearTimeout(timerRef.current);
    setVoicePhase("idle");
    setVoiceText("");
  }
  function confirmVoice() { sendMessage(voiceText); }
  useEffect(() => () => clearTimeout(timerRef.current), []);

  // Build a detailed context string — if we have live workout context, use it
  const ctxBase = { home: "Dashboard", workout: "Mid-workout", meals: "Meal plan", chat: "Dashboard" }[fromScreen] || "Dashboard";
  const ctx = (fromScreen === "workout" && workoutContext)
    ? `${workoutContext.exercise} · Set ${workoutContext.setNumber} of ${workoutContext.totalSets}`
    : ctxBase;

  return (
    <div style={{ background: theme.bg, borderRadius: 20, color: theme.text, minHeight: "100dvh", fontFamily: "system-ui,sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ background: "#0D1117", borderBottom: `1px solid ${theme.borderSubtle}`, padding: "14px 16px 12px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => navigate(fromScreen === "chat" ? "home" : fromScreen)} style={{ background: "none", border: "none", color: theme.textDim, cursor: "pointer", fontSize: 20, padding: 0, lineHeight: 1, marginRight: 2 }}>←</button>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#003D35", border: `1.5px solid ${a}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: a, flexShrink: 0 }}>AI</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>Morphiq Trainer</div>
            <div style={{ fontSize: 11, color: a }}>Knows your full plan</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: a }} />
            <span style={{ fontSize: 11, color: theme.textDim }}>Online</span>
          </div>
        </div>
        {/* Context chip */}
        <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 5, background: "#0A1628", border: `1px solid rgba(0,212,177,0.15)`, borderRadius: 20, padding: "4px 10px" }}>
          <span style={{ fontSize: 10, color: a }}>⏱</span>
          <span style={{ fontSize: 10, color: "#9BB3C8" }}>{ctx} · {gymBranding.name}</span>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "14px 14px 0", display: "flex", flexDirection: "column", gap: 4 }}>
        {messages.map(msg => (
          <div key={msg.id} className="mq-fade" style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start", marginBottom: 6 }}>
            {msg.role === "ai" && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 7, maxWidth: "90%" }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#003D35", border: `1px solid ${a}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 600, color: a, flexShrink: 0, marginTop: 2 }}>AI</div>
                <div style={{ background: "#1A2332", borderRadius: "12px 12px 12px 4px", padding: "9px 12px", fontSize: 13, lineHeight: 1.55, color: "#9BB3C8" }}>{msg.text}</div>
              </div>
            )}
            {msg.role === "user" && (
              <div style={{ background: a, borderRadius: "12px 12px 4px 12px", padding: "9px 12px", fontSize: 13, color: "#003D35", fontWeight: 500, maxWidth: "82%" }}>{msg.text}</div>
            )}
          </div>
        ))}
        {thinking && (
          <div className="mq-fade" style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#003D35", border: `1px solid ${a}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: a, flexShrink: 0 }}>AI</div>
            <div style={{ background: "#1A2332", borderRadius: "12px 12px 12px 4px", padding: "9px 14px" }}>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                {[0, 0.2, 0.4].map(d => <div key={d} style={{ width: 6, height: 6, borderRadius: "50%", background: a, animation: "mqPulse 1.2s infinite", animationDelay: `${d}s`, opacity: 0.7 }} />)}
              </div>
            </div>
          </div>
        )}
        <div style={{ height: 8 }} />
      </div>

      {/* API error banner — shown when proxy is unreachable */}
      {apiError && (
        <div style={{ margin: "6px 14px 0", background: "#1A1010", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10, padding: "7px 12px", fontSize: 11, color: "#F87171", flexShrink: 0 }}>
          ⚠ Using offline responses — check that your /api/chat server is running.
        </div>
      )}

      {/* Suggestion chips — default before first exchange, Claude's chips after */}
      {visibleChips.length > 0 && !thinking && (
        <div style={{ padding: "8px 14px 0", display: "flex", flexWrap: "wrap", gap: 6, flexShrink: 0 }}>
          {visibleChips.map(s => (
            <button key={s} onClick={() => sendMessage(s)}
              style={{ background: "#1A2332", border: `1px solid rgba(0,212,177,0.2)`, borderRadius: 20, padding: "5px 10px", fontSize: 11, color: a, cursor: "pointer", fontFamily: "inherit" }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Voice overlay */}
      {voicePhase !== "idle" && (
        <div className="mq-fade" style={{ margin: "8px 14px 0", background: "#0A1628", border: `1px solid rgba(0,212,177,0.2)`, borderRadius: 14, padding: "12px", textAlign: "center", flexShrink: 0 }}>
          {voicePhase === "listening" && <>
            <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 6 }}>Listening...</div>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 3, height: 28, marginBottom: 6 }} className="mq-wave">
              {[1,2,3,4,5,6].map(i => <span key={i} />)}
            </div>
            <div style={{ fontSize: 10, color: a, marginBottom: 8 }}>Speak your question</div>
            <button onClick={cancelVoice} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "5px 16px", fontSize: 10, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          </>}
          {voicePhase === "heard" && <>
            <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 7 }}>Heard you — does this look right?</div>
            <div style={{ background: "#111827", borderRadius: 8, padding: "7px 12px", fontSize: 12, color: "#9BB3C8", fontStyle: "italic", marginBottom: 10 }}>"{voiceText}"</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={cancelVoice} style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 9, padding: "7px", fontSize: 11, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>Redo</button>
              <button onClick={confirmVoice} style={{ flex: 2, background: a, border: "none", borderRadius: 9, padding: "7px", fontSize: 11, color: "#003D35", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Send ✓</button>
            </div>
          </>}
        </div>
      )}

      {/* Usage counter */}
      {msgUsage && (
        <div style={{ padding: "4px 14px 0", background: "#0D1117", display: "flex", justifyContent: "flex-end", flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: msgUsage.count >= msgUsage.limit ? "#F87171" : "#6B7A8D" }}>
            {msgUsage.count >= msgUsage.limit
              ? "Monthly limit reached — resets on the 1st"
              : `${msgUsage.count} / ${msgUsage.limit} AI messages this month`}
          </div>
        </div>
      )}

      {/* Input bar */}
      <div style={{ padding: "10px 14px 14px", background: "#0D1117", borderTop: `1px solid ${theme.borderSubtle}`, display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
        <button onClick={startVoice} disabled={voicePhase !== "idle"}
          style={{ width: 36, height: 36, borderRadius: "50%", background: voicePhase !== "idle" ? a : "#1A2332", border: `1px solid ${voicePhase !== "idle" ? a : "rgba(255,255,255,0.1)"}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
          <MicIcon size={14} color={voicePhase !== "idle" ? "#003D35" : "#6B7A8D"} />
        </button>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && sendMessage(input)}
          placeholder="Ask anything..."
          style={{ flex: 1, background: "#1A2332", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: "8px 12px", fontSize: 13, color: theme.text, outline: "none", fontFamily: "inherit" }}
        />
        <button onClick={() => sendMessage(input)} disabled={!input.trim()}
          style={{ width: 36, height: 36, borderRadius: "50%", background: input.trim() ? a : "#1A2332", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: input.trim() ? "pointer" : "default", flexShrink: 0, fontSize: 15, color: input.trim() ? "#003D35" : theme.textFaint, fontWeight: 700 }}>→</button>
      </div>

      {/* Bottom text */}
      <div style={{ textAlign: "center", fontSize: 10, color: theme.textFaint, paddingBottom: 10, background: "#0D1117", flexShrink: 0 }}>Powered by Morphiq</div>
    </div>
  );
}

const WEIGHT_DATA_MOCK = [{week:"W1",weight:187.0},{week:"W2",weight:185.5},{week:"W3",weight:184.2},{week:"W4",weight:183.0},{week:"W5",weight:182.1},{week:"W6",weight:181.4}];
const WORKOUT_LOG = [{date:"Mon May 5",name:"Full body A",sets:15,vol:"4,820 lbs",pbs:2},{date:"Wed May 7",name:"Full body B",sets:14,vol:"4,540 lbs",pbs:1},{date:"Fri May 9",name:"Full body A",sets:15,vol:"5,010 lbs",pbs:2},{date:"Mon May 12",name:"Full body B",sets:14,vol:"4,760 lbs",pbs:0},{date:"Wed May 14",name:"Full body A",sets:15,vol:"5,200 lbs",pbs:1}];
const PERSONAL_BESTS = [{exercise:"Goblet Squat",weight:"35 lbs",reps:13,date:"May 14"},{exercise:"Dumbbell Bench Press",weight:"35 lbs",reps:11,date:"May 12"},{exercise:"Seated Cable Row",weight:"95 lbs",reps:12,date:"May 14"},{exercise:"Romanian Deadlift",weight:"75 lbs",reps:10,date:"May 9"}];

function WeightChart({ data, accent }) {
  const W = 260, H = 84, PAD = 10;
  if (!data || data.length === 0) return null;
  // Need at least 2 points for a line; duplicate single point so chart renders
  const chartData = data.length === 1 ? [data[0], data[0]] : data;
  const vals = chartData.map(d => d.weight);
  const minV = Math.min(...vals) - 1;
  const maxV = Math.max(...vals) + 1;
  const xStep = (W - PAD * 2) / Math.max(chartData.length - 1, 1);
  const toY = v => PAD + ((maxV - v) / (maxV - minV)) * (H - PAD * 2 - 12);
  const points = chartData.map((d, i) => [PAD + i * xStep, toY(d.weight)]);
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const areaPath = linePath + ` L${points[points.length-1][0].toFixed(1)},${H-12} L${PAD},${H-12} Z`;
  const last = points[points.length - 1];
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.2" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#wg)" />
      <path d={linePath} fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="3.5"
          fill={i === points.length - 1 ? accent : "#1A2332"} stroke={accent} strokeWidth="1.5" />
      ))}
      {chartData.map((d, i) => (
        <text key={i} x={points[i][0]} y={H} textAnchor="middle" fontSize="8" fill="#6B7A8D">{d.week}</text>
      ))}
      <text x={last[0] + 6} y={last[1] - 4} fontSize="9" fill={accent} fontWeight="600">{chartData[chartData.length-1].weight}</text>
    </svg>
  );
}

function StreakCalendar({ accent, workoutDates }) {
  const days = ["M","T","W","T","F","S","S"];
  // Build a 4-week grid ending today
  const today = new Date();
  // Find the most recent Monday
  const dow = today.getDay(); // 0=Sun
  const mondayOffset = dow === 0 ? 6 : dow - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - mondayOffset - 21); // go back 3 more weeks
  const dateSet = new Set(workoutDates || []);
  const grid = [];
  for (let week = 0; week < 4; week++) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      const cell = new Date(monday);
      cell.setDate(monday.getDate() + week * 7 + d);
      if (cell > today) { row.push(null); }
      else {
        const iso = cell.toISOString().slice(0,10);
        row.push(dateSet.has(iso) ? 1 : 0);
      }
    }
    grid.push(row);
  }
  return (
    <div>
      <div style={{ display:"flex", gap:4, marginBottom:5 }}>
        {days.map((d,i) => <div key={i} style={{ flex:1, textAlign:"center", fontSize:9, color:"#6B7A8D" }}>{d}</div>)}
      </div>
      {grid.map((row, ri) => (
        <div key={ri} style={{ display:"flex", gap:4, marginBottom:4 }}>
          {row.map((v, ci) => (
            <div key={ci} style={{
              flex:1, height:20, borderRadius:4,
              background: v === 1 ? accent : v === 0 ? "#1A2332" : "transparent",
              border: v === 0 ? "1px solid #1E2D42" : "none",
            }} />
          ))}
        </div>
      ))}
    </div>
  );
}

function ProgressScreen() {
  const { gymBranding, supabaseUser, user, historicalData, loadHistoricalData } = useApp();
  const a = gymBranding.accent;
  const [tab, setTab] = useState("body");
  const sL = { ...theme.sL, fontSize: 10, letterSpacing: "1.2px", marginBottom: 10, fontWeight: 500 };

  // Pull workout logs from historicalData (loaded at sign-in) — no extra fetch needed
  const realLogs = historicalData?.workoutLogs || null;
  const useRealWorkoutData = realLogs !== null && realLogs.length > 0;

  const realSessions = useRealWorkoutData ? (() => {
    const byDate = {};
    realLogs.forEach(row => {
      if (!byDate[row.workout_date]) byDate[row.workout_date] = { date: row.workout_date, sets: 0, exercises: new Set(), totalVol: 0 };
      byDate[row.workout_date].sets++;
      byDate[row.workout_date].exercises.add(row.exercise_name);
      byDate[row.workout_date].totalVol += (row.weight || 0) * (row.reps || 0);
    });
    return Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map(s => ({
      date: new Date(s.date + "T12:00:00").toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" }),
      name: "Full body", sets: s.sets,
      vol: s.totalVol > 0 ? s.totalVol.toLocaleString() + " lbs" : "—", pbs: 0,
    }));
  })() : WORKOUT_LOG;

  const totalWorkouts = useRealWorkoutData ? realSessions.length : 14;

  const realPBs = useRealWorkoutData ? (() => {
    const best = {};
    realLogs.forEach(row => {
      const key = row.exercise_name;
      if (!best[key] || row.weight > best[key].weight) {
        best[key] = { exercise: key, weight: `${row.weight} lbs`, reps: row.reps, date: row.workout_date };
      }
    });
    return Object.values(best).slice(0, 6);
  })() : PERSONAL_BESTS;

  // ── Weight logs from historicalData ──────────────────────────────────────
  const [weightLoading] = useState(false);
  const [weightLogs, setWeightLogs] = useState(null);
  const [showLogWeight, setShowLogWeight] = useState(false);
  const [newWeightInput, setNewWeightInput] = useState("");
  const [savingWeight, setSavingWeight] = useState(false);
  const [weightSaved, setWeightSaved] = useState(false);

  const isRealUser = supabaseUser?.id && !supabaseUser.id.startsWith("sim-") && supabaseUser.id !== "dev-001";

  // Sync weightLogs from historicalData whenever it updates
  useEffect(() => {
    if (historicalData?.weightLogs) setWeightLogs(historicalData.weightLogs);
  }, [historicalData?.weightLogs]);

  // Build chart data: real entries or mock fallback
  const useRealWeightData = weightLogs !== null && weightLogs.length >= 1;
  const weightChartData = useRealWeightData
    ? weightLogs.map((r, i) => ({
        week: `W${i + 1}`,
        weight: parseFloat(r.weight_lbs),
        date: r.logged_date,
      }))
    : WEIGHT_DATA_MOCK;

  const lost = (weightChartData[0].weight - weightChartData[weightChartData.length - 1].weight).toFixed(1);
  const curr = weightChartData[weightChartData.length - 1].weight;
  const startWeight = weightChartData[0].weight;

  async function saveWeight() {
    const val = parseFloat(newWeightInput);
    if (!val || val < 50 || val > 600) return;
    setSavingWeight(true);
    // Always update local state immediately so chart refreshes
    const newEntry = { weight_lbs: val, logged_date: new Date().toISOString().slice(0, 10) };
    setWeightLogs(prev => [...(prev || []), newEntry]);
    // Also persist to Supabase if real user
    if (isRealUser) {
      await sb.insertWeightLog(supabaseUser.id, val);
      // Refresh historicalData so weight chart and home screen update
      await loadHistoricalData(supabaseUser.id);
    }
    setSavingWeight(false);
    setWeightSaved(true);
    setNewWeightInput("");
    setShowLogWeight(false);
    setTimeout(() => setWeightSaved(false), 3000);
  }

  return (
    <Layout activeNav="progress">
      <div style={{ padding:"1.25rem 1.25rem 0" }}>
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:20, fontWeight:600, color:theme.text }}>Your Progress</div>
          <div style={{ fontSize:12, color:theme.textDim, marginTop:2 }}>
            {useRealWeightData ? `${weightLogs.length} weigh-ins logged` : "Week 6 · Fat loss plan"}
          </div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:16 }}>
          {[
            { val: lost > 0 ? `−${lost} lbs` : `+${Math.abs(lost)} lbs`, lbl:"Weight change", color: lost >= 0 ? a : "#F87171" },
            { val: historicalData?.streak > 0 ? `🔥 ${historicalData.streak}` : (historicalData?.streak ?? "—"), lbl:"Day streak", color:"#F59E0B" },
            { val: String(realPBs.length || 0), lbl:"PBs logged", color:"#A78BFA" },
          ].map(({ val, lbl, color }) => (
            <div key={lbl} style={{ background:"#1A2332", borderRadius:12, padding:"10px 8px", textAlign:"center" }}>
              <div style={{ fontSize:18, fontWeight:700, color }}>{val}</div>
              <div style={{ fontSize:10, color:"#6B7A8D", marginTop:3, lineHeight:1.3 }}>{lbl}</div>
            </div>
          ))}
        </div>

        <div style={{ display:"flex", background:"#1A2332", borderRadius:10, padding:3, marginBottom:16 }}>
          {[["body","Body"],["workouts","Workouts"],["bests","Bests"]].map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex:1, padding:"7px 6px", background:tab===t ? a : "transparent", border:"none", borderRadius:8, fontSize:12, fontWeight:500, color:tab===t ? "#003D35" : theme.textDim, cursor:"pointer", fontFamily:"inherit", transition:"all .2s" }}>
              {label}
            </button>
          ))}
        </div>

        {tab === "body" && (
          <div className="mq-fade">
            {/* Weight chart card */}
            <div style={{ background:"#1A2332", borderRadius:14, padding:"14px 14px 10px", marginBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                <div>
                  <div style={sL}>
                    Weight trend
                    {!useRealWeightData && <span style={{ color:"#2D3A4A", marginLeft:6, fontStyle:"italic" }}>(sample)</span>}
                  </div>
                  <div style={{ fontSize:26, fontWeight:700, color:theme.text, lineHeight:1 }}>
                    {curr} <span style={{ fontSize:13, color:"#6B7A8D", fontWeight:400 }}>lbs</span>
                  </div>
                  <div style={{ fontSize:12, color: lost >= 0 ? a : "#F87171", marginTop:2 }}>
                    {lost >= 0 ? `↓ ${lost} lbs since day 1` : `↑ ${Math.abs(lost)} lbs since day 1`}
                  </div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
                  <div style={{ background:"#003D35", borderRadius:8, padding:"4px 10px", fontSize:11, color:a, fontWeight:500 }}>
                    {weightSaved ? "Saved ✓" : "On track ✓"}
                  </div>
                  <button onClick={() => setShowLogWeight(!showLogWeight)}
                    style={{ background:"transparent", border:`1px solid rgba(0,212,177,0.3)`, borderRadius:8, padding:"4px 10px", fontSize:11, color:a, cursor:"pointer", fontFamily:"inherit" }}>
                    {showLogWeight ? "Cancel" : "+ Log weight"}
                  </button>
                </div>
              </div>

              {/* Log weight inline form */}
              {showLogWeight && (
                <div className="mq-fade" style={{ background:"#0A1628", borderRadius:10, padding:"10px 12px", marginBottom:10, display:"flex", gap:8, alignItems:"center" }}>
                  <div style={{ fontSize:11, color:"#9BB3C8", flexShrink:0 }}>Today's weight:</div>
                  <input
                    type="number"
                    value={newWeightInput}
                    onChange={e => setNewWeightInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && saveWeight()}
                    placeholder="e.g. 182.5"
                    autoFocus
                    style={{ flex:1, background:"#111827", border:"1px solid rgba(255,255,255,0.1)", borderRadius:8, padding:"6px 10px", fontSize:13, color:"#E8EDF2", outline:"none", fontFamily:"inherit" }}
                  />
                  <div style={{ fontSize:11, color:"#6B7A8D", flexShrink:0 }}>lbs</div>
                  <button onClick={saveWeight} disabled={savingWeight || !newWeightInput}
                    style={{ background: newWeightInput ? a : "#1A2332", border:"none", borderRadius:8, padding:"6px 12px", fontSize:11, color: newWeightInput ? "#003D35" : "#6B7A8D", fontWeight:600, cursor: newWeightInput ? "pointer" : "default", fontFamily:"inherit", flexShrink:0 }}>
                    {savingWeight ? "..." : "Save"}
                  </button>
                </div>
              )}

              {weightLoading ? (
                <div style={{ display:"flex", justifyContent:"center", padding:"20px 0" }}>
                  <Spinner size={24} color={a} />
                </div>
              ) : (
                <WeightChart data={weightChartData} accent={a} />
              )}

              {!useRealWeightData && !weightLoading && (
                <div style={{ fontSize:10, color:"#2D3A4A", textAlign:"center", marginTop:4 }}>
                  Log your weight to replace this sample chart with your real data
                </div>
              )}
            </div>

            {/* Measurements */}
            <div style={sL}>Measurements</div>
            <div style={{ background:"#1A2332", borderRadius:14, overflow:"hidden", marginBottom:12 }}>
              {[
                { label:"Starting weight", start:"", current:`${startWeight} lbs`, delta:"", dColor:a },
                { label:"Current weight",  start:"", current:`${curr} lbs`,        delta: lost >= 0 ? `−${lost} lbs` : `+${Math.abs(lost)} lbs`, dColor: lost >= 0 ? a : "#F87171" },
                { label:"Body fat est.",   start:"", current:"21%",                delta:"−3%",                                                    dColor:a },
              ].map((row, i, arr) => (
                <div key={row.label} style={{ display:"flex", alignItems:"center", padding:"10px 14px", borderBottom: i < arr.length-1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <div style={{ flex:1, fontSize:13, color:theme.textMuted }}>{row.label}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:theme.text, marginRight:8 }}>{row.current}</div>
                  {row.delta && <div style={{ fontSize:11, color:row.dColor, fontWeight:600, minWidth:52, textAlign:"right" }}>{row.delta}</div>}
                </div>
              ))}
            </div>

            <div style={sL}>Workout streak</div>
            <div style={{ background:"#1A2332", borderRadius:14, padding:"14px" }}>
              <StreakCalendar accent={a} workoutDates={
                useRealWorkoutData
                  ? [...new Set(realLogs.map(r => r.workout_date))]
                  : []
              } />
              <div style={{ display:"flex", gap:14, marginTop:10 }}>
                <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <div style={{ width:10, height:10, borderRadius:3, background:a }} />
                  <span style={{ fontSize:10, color:"#6B7A8D" }}>Workout done</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <div style={{ width:10, height:10, borderRadius:3, background:"#1A2332", border:"1px solid #1E2D42" }} />
                  <span style={{ fontSize:10, color:"#6B7A8D" }}>Rest day</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "workouts" && (
          <div className="mq-fade">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
              {[
                { val: String(totalWorkouts), lbl:"Total workouts", color:a },
                { val:"98%",     lbl:"Completion rate",      color:a },
                { val:"67,330",  lbl:"Total volume (lbs)",   color:"#F59E0B" },
                { val:"40 min",  lbl:"Avg duration",         color:"#818cf8" },
              ].map(({ val, lbl, color }) => (
                <div key={lbl} style={{ background:"#1A2332", borderRadius:12, padding:"10px 12px" }}>
                  <div style={{ fontSize:20, fontWeight:700, color }}>{val}</div>
                  <div style={{ fontSize:10, color:"#6B7A8D", marginTop:2 }}>{lbl}</div>
                </div>
              ))}
            </div>
            <div style={sL}>Recent sessions</div>
            <div style={{ background:"#1A2332", borderRadius:14, overflow:"hidden" }}>
              {realSessions.map((w, i) => (
                <div key={w.date} style={{ padding:"10px 14px", borderBottom: i < realSessions.length-1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:theme.text }}>{w.name}</div>
                      <div style={{ fontSize:11, color:"#6B7A8D", marginTop:2 }}>{w.date} · {w.sets} sets · {w.vol}</div>
                    </div>
                    {w.pbs > 0 && (
                      <span style={{ background:"#2D1A00", color:"#F59E0B", borderRadius:20, padding:"2px 8px", fontSize:10, fontWeight:500, flexShrink:0 }}>
                        🔥 {w.pbs} PB{w.pbs > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "bests" && (
          <div className="mq-fade">
            <div style={{ background:"#0A1628", borderLeft:"2px solid #00D4B1", borderRadius:"0 10px 10px 0", padding:"8px 12px", marginBottom:14 }}>
              <div style={{ fontSize:12, color:"#9BB3C8", lineHeight:1.5 }}>
                You've set <span style={{ color:"#E8EDF2", fontWeight:600 }}>8 personal bests</span> this month. Progressive overload is working.
              </div>
            </div>
            <div style={sL}>Current bests</div>
            <div style={{ background:"#1A2332", borderRadius:14, overflow:"hidden", marginBottom:14 }}>
              {realPBs.map((pb, i) => (
                <div key={pb.exercise} style={{ padding:"11px 14px", borderBottom: i < realPBs.length-1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:theme.text }}>{pb.exercise}</div>
                      <div style={{ fontSize:11, color:"#6B7A8D", marginTop:2 }}>Set {pb.date}</div>
                    </div>
                    <div style={{ textAlign:"right" }}>
                      <div style={{ fontSize:15, fontWeight:700, color:a }}>{pb.weight}</div>
                      <div style={{ fontSize:11, color:"#6B7A8D" }}>{pb.reps} reps</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ background:"#1A2332", borderRadius:14, padding:"12px 14px" }}>
              <div style={{ fontSize:11, color:"#6B7A8D", textTransform:"uppercase", letterSpacing:"1px", marginBottom:10 }}>Volume progress this month</div>
              {[
                { label:"Goblet Squat",         pct:85, color:a },
                { label:"Dumbbell Bench Press",  pct:72, color:"#818cf8" },
                { label:"Seated Cable Row",      pct:91, color:"#F59E0B" },
                { label:"Romanian Deadlift",     pct:68, color:"#f472b6" },
              ].map(bar => (
                <div key={bar.label} style={{ marginBottom:8 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                    <span style={{ fontSize:11, color:theme.textMuted }}>{bar.label}</span>
                    <span style={{ fontSize:11, color:bar.color, fontWeight:600 }}>{bar.pct}%</span>
                  </div>
                  <div style={{ height:4, background:"#0F1922", borderRadius:2 }}>
                    <div style={{ height:4, borderRadius:2, background:bar.color, width:`${bar.pct}%`, transition:"width .8s ease" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}

function ProfileScreen() {
  const { navigate, user, setUser, plan, setPlan, gymBranding, signOut, supabaseUser } = useApp();
  const a = gymBranding.accent;
  const [editGoal, setEditGoal] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState(user.goal || "lose_fat");
  const [editDays, setEditDays] = useState(false);
  const [selectedDays, setSelectedDays] = useState(plan?.workoutDays || ["Monday","Wednesday","Friday"]);
  const [daySaveMsg, setDaySaveMsg] = useState("");

  async function saveDays() {
    if (selectedDays.length === 0) return;
    // Update plan with new workout days (keep everything else the same)
    const updatedPlan = { ...(plan || {}), workoutDays: selectedDays };
    const updatedUser = { ...(user || {}), daysPerWeek: selectedDays.length };
    setPlan(updatedPlan);
    setUser(updatedUser);
    setEditDays(false);
    setDaySaveMsg("Schedule updated ✓");
    setTimeout(() => setDaySaveMsg(""), 3000);
    // Save to Supabase (fire-and-forget)
    if (supabaseUser?.id) {
      sb.upsertProfile(supabaseUser.id, updatedUser, updatedPlan).catch(() => {});
    }
  }

  const goalLabel = GOAL_OPTIONS.find(g => g.id === selectedGoal)?.label || "Lose fat";
  const sL = theme.sL;

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
              <span style={{ fontSize: 10, color: a }}>Active plan · {goalLabel}</span>
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
                <div style={{ fontSize: 12, color: theme.textDim, marginTop: 2 }}>{(plan?.workoutDays?.length || user.daysPerWeek || 3)} workouts/week · {user.fitnessLevel || "Beginner"}</div>
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
          {[[(plan?.calories?.toLocaleString() || "1,800"), "Calories", a], [(plan?.protein ? plan.protein + "g" : "140g"), "Protein", "#F59E0B"], [(plan?.carbs ? plan.carbs + "g" : "160g"), "Carbs", "#818cf8"], [(plan?.fat ? plan.fat + "g" : "55g"), "Fat", "#f472b6"]].map(([v, l, c]) => (
            <div key={l} style={{ background: "#1A2332", borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div>
              <div style={{ fontSize: 11, color: theme.textDim, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>

        {/* Plan settings */}
        <div style={sL}>Plan Settings</div>
        <div style={{ background: "#1A2332", borderRadius: 14, padding: "12px 14px", marginBottom: 16 }}>
          {/* Workout day switcher */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 13, color: theme.text }}>Workout days</div>
              {editDays ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => setEditDays(false)} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "3px 10px", fontSize: 11, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                  <button onClick={saveDays} style={{ background: a, border: "none", borderRadius: 8, padding: "3px 10px", fontSize: 11, fontWeight: 600, color: "#003D35", cursor: "pointer", fontFamily: "inherit" }}>Save</button>
                </div>
              ) : (
                <button onClick={() => setEditDays(true)} style={{ background: "#003D35", border: `1px solid rgba(0,212,177,0.3)`, borderRadius: 8, padding: "4px 12px", fontSize: 11, color: a, cursor: "pointer", fontFamily: "inherit" }}>Change</button>
              )}
            </div>
            {editDays ? (
              <div style={{ display: "flex", gap: 5, flexWrap: "nowrap" }}>
                {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((short, idx) => {
                  const full = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"][idx];
                  const on = selectedDays.includes(full);
                  return (
                    <button key={full} onClick={() => setSelectedDays(prev => on ? prev.filter(d => d !== full) : [...prev, full])}
                      style={{ flex: 1, background: on ? "#003D35" : "transparent", border: `1.5px solid ${on ? a : "rgba(255,255,255,0.1)"}`, borderRadius: 8, padding: "7px 2px", fontSize: 10, fontWeight: on ? 600 : 400, color: on ? a : theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>
                      {short}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 13, fontWeight: 600, color: a }}>
                {(plan?.workoutDays || []).map(d => d.slice(0,3)).join(", ") || "Not set"}
              </div>
            )}
            {editDays && daySaveMsg && <div style={{ fontSize: 10, color: a, marginTop: 6 }}>{daySaveMsg}</div>}
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.04)", paddingTop: 10 }}>
            <StatRow label="Session length" value={`~${plan?.workoutDuration || 40} min`} />
          </div>
          <StatRow label="Injuries/notes" value={user.injuries || "None"} />
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

// Derive display properties from a raw profile + stats
function AppRouter() {
  const { screen } = useApp();
  if (screen === "auth") return <AuthScreen />;
  if (screen === "loading") return <LoadingScreen />;
  if (screen === "onboarding") return <OnboardingScreen />;
  if (screen === "plan") return <PlanOverviewScreen />;
  if (screen === "workout") return <WorkoutScreen />;
  if (screen === "meals") return <MealPlanScreen />;
  if (screen === "progress") return <ProgressScreen />;
  if (screen === "profile") return <ProfileScreen />;
  if (screen === "owner") return <GymOwnerDashboard />;
  if (screen === "chat") return <ChatScreen fromScreen="home" />;
  if (screen === "chat_workout") return <ChatScreen fromScreen="workout" />;
  if (screen === "chat_meals") return <ChatScreen fromScreen="meals" />;
  if (screen === "pricing") return <PricingScreen />;
  return <HomeDashboardScreen />;
}

export default function Morphiq() {
  return (
    <>
      <style>{css}</style>
      <AppProvider>
        <div className="mq-shell">
          <AppRouter />
        </div>
      </AppProvider>
    </>
  );
}
