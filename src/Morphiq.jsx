import { createContext, useContext, useState, useEffect, useRef } from "react";

const SUPABASE_URL  = "https://uvnyjegmhsztdednjclb.supabase.co";
const SUPABASE_ANON = "sb_publishable_uMj3nFhXSfk4s9Upa4mkuw_nwFvBCll";
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

  // ── WORKOUT LOGS ──────────────────────────────────────────────────────────
  async insertWorkoutLog(supabaseUserId, { exerciseName, setNumber, reps, weight }) {
    try {
      // Resolve to profiles.id so the FK constraint is satisfied
      const profileId = await this.getProfileId(supabaseUserId);
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
    const uid = realAuthUserId || ("sim-" + Date.now());
    setSupabaseUser({ email, id: uid });
    if (role === "owner") { setScreen("owner"); return; }

    if (hasPlan === true) {
      setUser({ name: "Alex", goal: "lose_fat", sex: "Male", height: "5′ 11″", weight: "183 lbs", age: "28", daysPerWeek: 3, injuries: "", unit: "imperial" });
      setPlan(MOCK_RETURNING_PLAN);
      setScreen("home");
      return;
    }
    if (hasPlan === false) {
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

const GOAL_OPTIONS = [
  { id: "lose_fat", icon: "🔥", label: "Lose fat", sub: "Burn calories, drop weight" },
  { id: "build_muscle", icon: "💪", label: "Build muscle", sub: "Get stronger, gain size" },
  { id: "get_fit", icon: "⚡", label: "Get fit & healthy", sub: "More energy, feel better" },
  { id: "strength", icon: "🏋️", label: "Get stronger", sub: "Build power, hit PRs" },
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
  const [daysPerWeek, setDaysPerWeek] = useState(null);
  const [injuries, setInjuries] = useState("");
  const [checklist, setChecklist] = useState([false, false, false, false]);

  useEffect(() => {
    if (step !== 9) return;
    let cancelled = false;
    [0,1,2,3].forEach(i => setTimeout(() => { if(!cancelled) setChecklist(c => c.map((v,idx) => idx<=i ? true : v)); }, i*550+300));

    async function generatePlan() {
      const prompt = `You are a certified personal trainer. Return ONLY valid JSON (no markdown, no preamble) for this member: name=${name}, goal=${goal}, sex=${sex}, height=${heightFt}ft${heightIn||0}in, weight=${weight}lbs, age=${age}, daysPerWeek=${daysPerWeek}, injuries=${injuries||"none"}.\nJSON shape exactly: {"calories":<number>,"protein":<number>,"carbs":<number>,"fat":<number>,"workoutDays":[<${daysPerWeek} day names>],"workoutType":"<string>","workoutDuration":<minutes>,"weeklyFocus":"<1 sentence>","exercises":[{"name":"<string>","sets":<n>,"reps":<n>,"weight":<starting lbs>,"muscle":"<string>"}],"tip":"<1 sentence>"}\nInclude 5-6 exercises appropriate for ${goal === "lose_fat" ? "fat loss (cardio-friendly, compound movements)" : goal === "build_muscle" ? "muscle building (progressive overload, hypertrophy)" : "general fitness"}. Starting weights should match a ${sex} beginner at ${weight}lbs. All numeric fields must be plain numbers.`;
      try {
        const res = await fetch("/api/plan", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });
        const data = await res.json();
        const raw = (data.text || "").replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(raw);
        if (!cancelled) {
          const userData = { name, goal, sex, height: `${heightFt}′ ${heightIn || "0"}″`, weight: `${weight} lbs`, age, daysPerWeek, injuries, unit };
          setUser(userData);
          setPlan(parsed);
          // Persist to Supabase profiles table (fire-and-forget — UI doesn't block on this)
          if (supabaseUser?.id) {
            sb.upsertProfile(supabaseUser.id, userData, parsed).catch(() => {});
          }
          setTimeout(() => { if (!cancelled) setStep(10); }, 400);
        }
      } catch (_) {
        if (!cancelled) {
          const userData = { name, goal, sex, height: `${heightFt}′ ${heightIn || "0"}″`, weight: `${weight} lbs`, age, daysPerWeek, injuries, unit };
          const fallbackPlan = {
            calories: goal === "lose_fat" ? 1800 : goal === "build_muscle" ? 2800 : 2200,
            protein: 140, carbs: 160, fat: 55,
            workoutDays: ["Monday","Wednesday","Friday","Saturday","Tuesday","Thursday"].slice(0, daysPerWeek || 3),
            workoutType: "Full Body", workoutDuration: 40,
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
          setTimeout(() => { if (!cancelled) setStep(10); }, 400);
        }
      }
    }

    Promise.all([generatePlan(), new Promise(r => setTimeout(r, 2600))]);
    return () => { cancelled = true; };
  }, [step]);

  const bodyValid = heightFt && parseInt(heightFt) > 0 && parseInt(heightFt) < 9 && weight && parseFloat(weight) > 0;
  const ageValid = age && parseInt(age) >= 13 && parseInt(age) <= 100;
  const progressPct = [15, 25, 35, 50, 60, 72, 82, 88, 95, 100, 100][step] || 15;
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

  const confirmRows = [
    ["Name", name], ["Goal", goalLabel], ["Sex", sex || "—"],
    ["Height", `${heightFt}′ ${heightIn || "0"}″`], ["Weight", `${weight} lbs`],
    ["Age", age ? `${age} yrs` : "—"], ["Days/week", daysPerWeek ? `${daysPerWeek}×` : "—"],
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
          <div style={{ display: "flex", gap: 7, marginBottom: 8 }}><AiAvatar /><div style={s.aiBubble}>Hey! I'm your Morphiq trainer. I'll build a plan completely personal to you — takes about 2 minutes. Ready?</div></div>
          <div style={{ display: "flex", gap: 7, marginBottom: 8 }}><AiAvatar /><div style={s.aiBubble}>First — what's your name?</div></div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: "auto" }}>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && name.trim().length >= 2 && setStep(1)} placeholder="Type your name..." style={{ flex: 1, background: ob.card, border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 16, padding: "8px 10px", fontSize: 12, color: ob.white, outline: "none", fontFamily: ob.font }} maxLength={30} />
            <button onClick={() => name.trim().length >= 2 && setStep(1)} style={{ width: 30, height: 30, borderRadius: "50%", background: a, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 13, color: ob.tealDk, fontWeight: 700, opacity: name.trim().length < 2 ? 0.4 : 1 }}>→</button>
          </div>
        </div>}

        {step === 1 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", gap: 7, marginBottom: 10 }}><AiAvatar /><div style={s.aiBubble}>Nice to meet you, <span style={{ color: a, fontWeight: 600 }}>{name}</span>! No judgment — what's the main thing you want to achieve?</div></div>
          <div style={{ flex: 1 }}>
            {GOAL_OPTIONS.map(g => (
              <button key={g.id} onClick={() => setGoal(g.id)} style={s.goalCard(goal === g.id)}>
                <span style={{ fontSize: 16 }}>{g.icon}</span>
                <div><div style={{ fontSize: 12, fontWeight: 600, color: goal === g.id ? a : ob.white }}>{g.label}</div><div style={{ fontSize: 9, color: ob.muted }}>{g.sub}</div></div>
              </button>
            ))}
          </div>
          <button onClick={() => setStep(2)} disabled={!goal} style={s.tealBtn(!goal)}>Continue →</button>
        </div>}

        {step === 2 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", gap: 7, marginBottom: 10 }}><AiAvatar /><div style={s.aiBubble}>Got it! Are you male or female? (helps me calculate your calorie targets accurately)</div></div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {[["Male", "♂"], ["Female", "♀"]].map(([label, icon]) => (
              <button key={label} onClick={() => setSex(label)} style={{ flex: 1, background: sex === label ? ob.tealDk : ob.card, border: `1.5px solid ${sex === label ? a : "rgba(255,255,255,0.08)"}`, borderRadius: 10, padding: "12px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, cursor: "pointer" }}>
                <span style={{ fontSize: 20 }}>{icon}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: sex === label ? a : ob.white }}>{label}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setStep(3)} disabled={!sex} style={s.tealBtn(!sex)}>Continue →</button>
        </div>}

        {step === 3 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", gap: 7, marginBottom: 10 }}><AiAvatar /><div style={s.aiBubble}>Quick stats — I use these to set the right calorie and weight targets for you.</div></div>
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

        {step === 4 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", gap: 7, marginBottom: 10 }}><AiAvatar /><div style={s.aiBubble}>How many days per week can you commit to working out?</div></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
            {[2, 3, 4, 5, 6, 7].map(d => (
              <button key={d} onClick={() => setDaysPerWeek(d)} style={{ background: daysPerWeek === d ? ob.tealDk : ob.card, border: `1.5px solid ${daysPerWeek === d ? a : "rgba(255,255,255,0.08)"}`, borderRadius: 10, padding: "10px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer" }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: daysPerWeek === d ? a : ob.white }}>{d}</span>
                <span style={{ fontSize: 9, color: ob.muted }}>days</span>
              </button>
            ))}
          </div>
          <button onClick={() => setStep(5)} disabled={!daysPerWeek} style={{ ...s.tealBtn(!daysPerWeek), marginTop: "auto" }}>Continue →</button>
        </div>}

        {step === 5 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", gap: 7, marginBottom: 8 }}><AiAvatar /><div style={s.aiBubble}>Any injuries or areas to avoid? (optional — tap "None" to skip)</div></div>
          <textarea value={injuries} onChange={e => setInjuries(e.target.value)} placeholder="e.g. bad left knee, no overhead pressing..." style={{ ...s.numInput, minHeight: 80, resize: "none", lineHeight: 1.5 }} maxLength={200} />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => { setInjuries(""); setStep(6); }} style={{ ...s.outlineBtn, flex: 1 }}>None →</button>
            <button onClick={() => setStep(6)} style={{ ...s.tealBtn(false), flex: 2, marginTop: 0 }}>Continue →</button>
          </div>
        </div>}

        {step === 6 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", gap: 7, marginBottom: 10 }}><AiAvatar /><div style={s.aiBubble}>Almost there. Where do you usually work out?</div></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {[["🏋️", "Gym", "Full equipment available"], ["🏠", "Home", "Dumbbells or bodyweight"], ["🌳", "Both", "Flexible setup"]].map(([icon, label, sub]) => (
              <button key={label} style={{ background: ob.card, border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 10, padding: "9px 10px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => setStep(7)}>
                <span style={{ fontSize: 16 }}>{icon}</span>
                <div><div style={{ fontSize: 12, fontWeight: 600, color: ob.white }}>{label}</div><div style={{ fontSize: 9, color: ob.muted }}>{sub}</div></div>
              </button>
            ))}
          </div>
        </div>}

        {step === 7 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
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
          <button onClick={() => setStep(8)} style={{ ...s.tealBtn(false), marginTop: 6 }}>I agree — build my plan ✦</button>
          <div style={{ textAlign: "center", marginTop: 8 }}>
            <button onClick={() => navigate("auth")} style={{ fontSize: 10, color: ob.muted, background: "none", border: "none", cursor: "pointer", fontFamily: ob.font }}>Decline — go back</button>
          </div>
        </div>}

        {step === 8 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", gap: 7, marginBottom: 8 }}><AiAvatar /><div style={s.aiBubble}>Perfect. {goalLabel}, {daysPerWeek} days a week{injuries.trim() ? `, noting: ${injuries.trim()}` : ", no injuries"}. I have everything I need.</div></div>
          <div style={{ background: ob.card, borderRadius: 10, padding: "6px 10px", marginBottom: 8 }}>
            {confirmRows.map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ color: ob.muted }}>{k}</span>
                <span style={{ color: ob.white, fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>
          <button onClick={() => { setChecklist([false, false, false, false]); setStep(9); }} style={{ ...s.tealBtn(false), marginTop: "auto" }}>Build my plan ✦</button>
          <button onClick={() => setStep(0)} style={{ ...s.outlineBtn, width: "100%", marginTop: 6 }}>Start over</button>
        </div>}

        {step === 9 && <div className="mq-fade" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
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

        {step === 10 && plan && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
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

function WorkoutScreen() {
  const { navigate, user, gymBranding, plan, supabaseUser, setWorkoutContext } = useApp();
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
  const [repCount, setRepCount] = useState(null); // null = not set yet, number = user typed/adjusted

  const REST_SECS = 60;
  const [restSecs, setRestSecs] = useState(REST_SECS);
  const timerRef = useRef(null);
  const confirmTimerRef = useRef(null);

  const [nudgedWeight, setNudgedWeight] = useState(null);
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

  useEffect(() => {
    if (state === "rest") {
      // Record the exact wall-clock time rest started
      restStartRef.current = Date.now();
      setRestSecs(REST_SECS);
      // Poll every 500ms — uses real elapsed time so screen sleep doesn't break it
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - restStartRef.current) / 1000);
        const remaining = REST_SECS - elapsed;
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
    const newLogs = loggedSetsRef.current;
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

  const loggedSetsRef = useRef(loggedSets);
  useEffect(() => { loggedSetsRef.current = loggedSets; }, [loggedSets]);

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
    setNudgedWeight(null);
    setRepCount(null);
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
                {savingToCloud ? "☁ Saving to account..." : savedToCloud ? "☁ Saved to account ✓" : supabaseUser?.id && !supabaseUser.id.startsWith("sim-") && supabaseUser.id !== "dev-001" ? "☁ Saving..." : "☁ Dev mode — not saved to DB"}
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
            <RestRing secondsLeft={restSecs} totalSeconds={REST_SECS} accent={a} size={RING_SIZE} />
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

          <button onClick={skipRest} style={{ width: "100%", background: "transparent", border: `1px solid rgba(0,212,177,0.3)`, borderRadius: 12, padding: "13px", fontSize: 14, color: a, cursor: "pointer", fontFamily: "inherit", marginTop: "auto", marginBottom: 4 }}>
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            <div style={{ fontSize: 13, color: theme.textDim }}>{ex.muscle}</div>
            <Pill variant={isLastSet ? "amber" : "teal"}>{isLastSet ? "Final set" : `Target: ${ex.targetReps} reps`}</Pill>
          </div>
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

        {/* Weight display */}
        <div style={{ background: "#1A2332", borderRadius: 12, padding: "10px 12px", marginBottom: 10, textAlign: "center" }}>
          <div style={{ fontSize: 10, color: theme.textDim, marginBottom: 2 }}>Weight this set</div>
          <div style={{ fontSize: 52, fontWeight: 700, color: a, lineHeight: 1 }}>{currentWeight} <span style={{ fontSize: 18, color: theme.textDim }}>lbs</span></div>
          <div style={{ fontSize: 10, color: theme.textDim, marginTop: 4 }}>+5lb from last session</div>
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
          <button onClick={() => { if (exIdx < WORKOUT_EXERCISES.length - 1) { setExIdx(i => i + 1); setSetIdx(0); setNudgedWeight(null); setRepCount(null); setState("active"); } }}
            style={{ flex: 1, background: "transparent", border: `1px solid rgba(255,255,255,0.1)`, borderRadius: 10, padding: "9px 6px", fontSize: 10, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>Swap exercise</button>
          <button onClick={() => logSet(displayReps)}
            style={{ flex: 2, background: a, border: "none", borderRadius: 10, padding: "9px 6px", fontSize: 12, color: "#003D35", fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Log {displayReps} reps ✓</button>
        </div>

        <div style={{ marginTop: 8, fontSize: 9, color: theme.textFaint, textAlign: "center" }}>
          Exercise {exIdx + 1} of {exercises.length} · {totalCompleted} sets logged
        </div>
      </div>
    </Layout>
  );
}

const EXERCISES_DISPLAY = [{name:"Goblet squat",weight:"35 lbs",reps:"10 reps",sets:"3 sets"},{name:"Dumbbell bench press",weight:"30 lbs",reps:"10 reps",sets:"3 sets"},{name:"Seated cable row",weight:"85 lbs",reps:"12 reps",sets:"3 sets"},{name:"Dumbbell shoulder press",weight:"25 lbs",reps:"10 reps",sets:"3 sets"},{name:"Romanian deadlift",weight:"65 lbs",reps:"10 reps",sets:"3 sets"}];

const WEEK = [{name:"Mon",type:"Full body",isWorkout:true},{name:"Tue",type:"Rest",isWorkout:false},{name:"Wed",type:"Full body",isWorkout:true},{name:"Thu",type:"Rest",isWorkout:false},{name:"Fri",type:"Full body",isWorkout:true},{name:"Sat",type:"Rest",isWorkout:false},{name:"Sun",type:"Rest",isWorkout:false}];

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

function MacroBar({ label, current, goal, color }) {
  const pct = Math.min(100, Math.round((current / goal) * 100));
  return (
    <div style={{ flex: 1, background: "#1A2332", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color }}>{current}<span style={{ fontSize: 9, color: theme.textDim, fontWeight: 400 }}>/{goal}</span></div>
      <div style={{ fontSize: 9, color: theme.textDim, margin: "2px 0 4px" }}>{label}</div>
      <div style={{ height: 3, background: "#0F1922", borderRadius: 2 }}>
        <div style={{ height: 3, borderRadius: 2, background: color, width: `${pct}%`, transition: "width .6s" }} />
      </div>
    </div>
  );
}

function MealSlot({ meal, onDone, onSkip, onOpenDetail }) {
  const { gymBranding } = useApp();
  const a = gymBranding.accent;
  const sc = {
    done:    { border: "rgba(0,212,177,0.2)",    bg: "rgba(0,212,177,0.04)" },
    swapped: { border: "rgba(245,158,11,0.25)", bg: "rgba(245,158,11,0.04)" },
    upcoming:{ border: "#1E2D42",               bg: "#1A2332" },
    skipped: { border: "#1E1E1E",               bg: "#161616" },
  }[meal.status] || { border: "#1E2D42", bg: "#1A2332" };

  return (
    <div className="mq-fade" style={{ borderRadius: 14, border: `1px solid ${sc.border}`, background: sc.bg, marginBottom: 10, overflow: "hidden" }}>
      {/* Header row */}
      <div style={{ padding: "8px 12px 6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 9, color: theme.textDim, textTransform: "uppercase", letterSpacing: "1px", fontWeight: 500 }}>{meal.label}</span>
          <span style={{ fontSize: 9, color: theme.textFaint }}>{meal.time}</span>
        </div>
        {{ done: <Pill variant="teal">✓ Logged</Pill>, swapped: <Pill variant="amber">⚡ Swapped</Pill>, upcoming: <Pill variant="gray">Up next</Pill>, skipped: <Pill variant="red">Skipped</Pill> }[meal.status]}
      </div>

      {/* Suggested */}
      <div style={{ padding: "0 12px 6px" }}>
        <div style={{ fontSize: 9, color: theme.textDim, marginBottom: 2 }}>
          {meal.status === "swapped" ? "Suggested" : meal.status === "done" ? "Eaten" : "Suggested"}
          {meal.id === "dinner" && meal.status === "upcoming" ? " · adjusted for lunch" : ""}
        </div>
        <div style={{ fontSize: 13, fontWeight: 600, color: meal.status === "swapped" ? theme.textFaint : "#D8E4E0", textDecoration: meal.status === "swapped" ? "line-through" : "none" }}>
          {meal.suggested.name}
        </div>
        {meal.status !== "swapped" && (
          <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
            <span style={{ fontSize: 10, color: theme.textDim }}>{meal.suggested.cal} cal</span>
            <span style={{ fontSize: 10, color: theme.textDim }}>·</span>
            <span style={{ fontSize: 10, color: theme.textDim }}>{meal.suggested.protein}g protein</span>
          </div>
        )}
      </div>

      {/* Swapped actual */}
      {meal.status === "swapped" && meal.logged && (
        <div style={{ margin: "0 12px 8px", background: "#1E1A0A", border: "1px solid rgba(245,158,11,0.15)", borderRadius: 8, padding: "6px 10px" }}>
          <div style={{ fontSize: 9, color: theme.amber, marginBottom: 2 }}>Actually ate</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#EDD08A" }}>{meal.logged.name}</div>
          <div style={{ display: "flex", gap: 8, marginTop: 3 }}>
            <span style={{ fontSize: 10, color: "#c08040" }}>{meal.logged.cal} cal</span>
            <span style={{ fontSize: 10, color: theme.textDim }}>·</span>
            <span style={{ fontSize: 10, color: theme.textDim }}>{meal.logged.protein}g protein</span>
          </div>
        </div>
      )}

      {/* Action buttons */}
      {meal.status === "upcoming" && (
        <div style={{ padding: "4px 12px 10px", display: "flex", gap: 6 }}>
          <button onClick={onOpenDetail} className="mq-meal-tap"
            style={{ flex: 2, background: "#0A1628", border: `1px solid rgba(0,212,177,0.2)`, borderRadius: 9, padding: "7px 6px", fontSize: 10, color: a, cursor: "pointer", fontFamily: "inherit" }}>
            🎤 I ate something else
          </button>
          <button onClick={onDone} className="mq-meal-tap"
            style={{ flex: 2, background: a, border: "none", borderRadius: 9, padding: "7px 6px", fontSize: 10, color: "#003D35", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            ✓ Mark done
          </button>
          <button onClick={onSkip} className="mq-meal-tap"
            style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 9, padding: "7px 4px", fontSize: 10, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>
            Skip
          </button>
        </div>
      )}
    </div>
  );
}

function MealDetailScreen({ meal, onBack, onConfirm, onSwap }) {
  const { gymBranding, user } = useApp();
  const a = gymBranding.accent;
  const [voicePhase, setVoicePhase] = useState("idle");
  const [transcript, setTranscript] = useState("");
  const [parsedMeal, setParsedMeal] = useState(null);
  const [textInput, setTextInput] = useState("");
  const recognitionRef = useRef(null);

  function startVoice() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) { setVoicePhase("text_fallback"); return; }
    const rec = new SpeechRecognition();
    rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 1;
    recognitionRef.current = rec;
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript;
      setTranscript(text); setVoicePhase("processing"); parseWithAI(text);
    };
    rec.onerror = () => setVoicePhase("error");
    setVoicePhase("listening"); rec.start();
  }

  function cancelVoice() {
    recognitionRef.current?.abort();
    setVoicePhase("idle"); setTranscript(""); setParsedMeal(null); setTextInput("");
  }

  async function parseWithAI(text) {
    const prompt = `The user said they ate: "${text}". Parse into a meal entry. Return ONLY valid JSON, no markdown, no extra text: {"name":"<clean meal name>","cal":<number>,"protein":<number>,"carbs":<number>,"fat":<number>}. Use realistic average nutrition values. All numbers must be plain integers.`;
    try {
      const res = await fetch("/api/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ id: 1, role: "user", text: prompt }],
          user: { name: user?.name || "member" },
          context: "meal_parser",
        }),
      });
      const data = await res.json();
      // API returns { text } for chat responses
      const raw = (data.text || data.reply || "").replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(raw);
      if (parsed.name && parsed.cal) {
        setParsedMeal(parsed); setVoicePhase("heard");
      } else {
        throw new Error("Bad parse");
      }
    } catch {
      // Fallback: estimate based on common foods
      const lower = text.toLowerCase();
      const fallback = lower.includes("burger") ? { name: "Burger", cal: 550, protein: 28, carbs: 45, fat: 28 }
        : lower.includes("salad") ? { name: "Salad", cal: 280, protein: 18, carbs: 22, fat: 14 }
        : lower.includes("pizza") ? { name: "Pizza", cal: 620, protein: 24, carbs: 72, fat: 26 }
        : lower.includes("chicken") ? { name: "Chicken", cal: 350, protein: 42, carbs: 8, fat: 12 }
        : { name: text.charAt(0).toUpperCase() + text.slice(1), cal: 450, protein: 22, carbs: 48, fat: 18 };
      setParsedMeal(fallback); setVoicePhase("heard");
    }
  }

  function submitText() {
    if (!textInput.trim()) return;
    setTranscript(textInput); setVoicePhase("processing"); parseWithAI(textInput);
  }

  useEffect(() => () => recognitionRef.current?.abort(), []);

  // Dinner has an AI-adjusted original; other meals show the suggested as both sides
  const hasAdjustment = !!meal.originalSuggested;
  const originalMeal = meal.originalSuggested || meal.suggested;
  const confirmLabel = `✓ I'll have the ${meal.suggested.name.split(" ")[0].toLowerCase()}`;

  return (
    <Layout activeNav="meals" chatTarget="chat_meals">
      <div className="mq-fade" style={{ padding: "1rem 1.25rem 0", display: "flex", flexDirection: "column" }}>

        {/* Back + title */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", color: theme.textDim, cursor: "pointer", fontSize: 18, padding: 0, lineHeight: 1 }}>←</button>
          <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>{meal.label} — Up Next</div>
        </div>

        {/* AI note — only shown when meal was adjusted */}
        {hasAdjustment && (
          <div style={{ background: "#080E1A", borderLeft: "2px solid #00D4B1", borderRadius: "0 10px 10px 0", padding: "8px 12px", marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: "#9BB3C8", lineHeight: 1.6 }}>
              You had a bigger lunch today — no problem. I've lightened dinner to keep you close to your daily target. You're only <span style={{ color: "#E8EDF2", fontWeight: 600 }}>280 calories</span> over.
            </div>
          </div>
        )}

        {/* Before / after — only shown when AI adjusted */}
        {hasAdjustment && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
            <div style={{ flex: 1, background: "#1A2332", borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontSize: 9, color: theme.textDim, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>Original</div>
              <div style={{ fontSize: 12, color: theme.textDim, textDecoration: "line-through", marginBottom: 3 }}>{originalMeal.name}</div>
              <div style={{ fontSize: 11, color: theme.textDim }}>{originalMeal.cal} cal · {originalMeal.protein}g protein</div>
            </div>
            <div style={{ fontSize: 16, color: theme.textDim, flexShrink: 0 }}>→</div>
            <div style={{ flex: 1, background: "#0A1A14", border: "1px solid rgba(0,212,177,0.2)", borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontSize: 9, color: a, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>New suggestion</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "#E8EDF2", marginBottom: 3 }}>{meal.suggested.name}</div>
              <div style={{ fontSize: 11, color: a }}>{meal.suggested.cal} cal · {meal.suggested.protein}g protein</div>
            </div>
          </div>
        )}

        {/* Suggested meal summary — shown when no adjustment */}
        {!hasAdjustment && (
          <div style={{ background: "#1A2332", borderRadius: 12, padding: "12px 14px", marginBottom: 14 }}>
            <div style={{ fontSize: 9, color: theme.textDim, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 6 }}>Suggested</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: "#E8EDF2", marginBottom: 4 }}>{meal.suggested.name}</div>
            <div style={{ display: "flex", gap: 10 }}>
              <span style={{ fontSize: 12, color: a }}>{meal.suggested.cal} cal</span>
              <span style={{ fontSize: 12, color: theme.textDim }}>·</span>
              <span style={{ fontSize: 12, color: theme.textDim }}>{meal.suggested.protein}g protein</span>
            </div>
          </div>
        )}

        {/* Voice overlay */}
        <div style={{ background: "#0A1628", border: "1px solid rgba(0,212,177,0.2)", borderRadius: 14, padding: "14px 14px 12px", marginBottom: 14, textAlign: "center" }}>
          {voicePhase === "idle" && (
            <>
              <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 12 }}>Did you eat something different? Tap the mic and tell me.</div>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 4 }}>
                <VoiceBtn onPress={startVoice} size={54} />
              </div>
              <div style={{ fontSize: 10, color: theme.textDim, marginTop: 8 }}>Tap mic to log something else</div>
            </>
          )}
          {voicePhase === "listening" && (
            <>
              <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 6 }}>Tell me what you had instead</div>
              <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 3, height: 28, marginBottom: 6 }} className="mq-wave">
                {[1,2,3,4,5,6].map(i => <span key={i} />)}
              </div>
              <div style={{ fontSize: 11, color: a, marginBottom: 10 }}>Listening...</div>
              <button onClick={cancelVoice} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "5px 16px", fontSize: 10, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            </>
          )}
          {voicePhase === "processing" && (
            <>
              <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 8, fontStyle: "italic" }}>"{transcript}"</div>
              <Spinner size={24} color={a} />
              <div style={{ fontSize: 11, color: a }}>Looking up nutrition info…</div>
            </>
          )}
          {voicePhase === "heard" && parsedMeal && (
            <>
              <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 8 }}>Does this look right?</div>
              <div style={{ background: "#111827", borderRadius: 10, padding: "10px 12px", marginBottom: 10, textAlign: "left" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#E8EDF2", marginBottom: 6 }}>{parsedMeal.name}</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <span style={{ fontSize: 11, color: a }}>{parsedMeal.cal} cal</span>
                  <span style={{ fontSize: 11, color: theme.textDim }}>·</span>
                  <span style={{ fontSize: 11, color: theme.textDim }}>{parsedMeal.protein}g protein</span>
                  <span style={{ fontSize: 11, color: theme.textDim }}>·</span>
                  <span style={{ fontSize: 11, color: theme.textDim }}>{parsedMeal.fat}g fat</span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={cancelVoice} style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 9, padding: "7px 6px", fontSize: 11, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>Redo</button>
                <button onClick={() => onSwap(parsedMeal)} style={{ flex: 2, background: a, border: "none", borderRadius: 9, padding: "7px 6px", fontSize: 11, color: "#003D35", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Log this ✓</button>
              </div>
            </>
          )}
          {voicePhase === "text_fallback" && (
            <>
              <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 8 }}>Type what you ate instead</div>
              <input value={textInput} onChange={e => setTextInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && submitText()}
                placeholder="e.g. burger and fries"
                style={{ width: "100%", background: "#111827", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#E8EDF2", outline: "none", fontFamily: "inherit", marginBottom: 8 }} />
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={cancelVoice} style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 9, padding: "7px 6px", fontSize: 11, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                <button onClick={submitText} disabled={!textInput.trim()} style={{ flex: 2, background: a, border: "none", borderRadius: 9, padding: "7px 6px", fontSize: 11, color: "#003D35", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", opacity: textInput.trim() ? 1 : 0.4 }}>Look up →</button>
              </div>
            </>
          )}
          {voicePhase === "error" && (
            <>
              <div style={{ fontSize: 11, color: "#F87171", marginBottom: 8 }}>Mic not available — type instead</div>
              <button onClick={() => setVoicePhase("text_fallback")} style={{ background: a, border: "none", borderRadius: 9, padding: "7px 16px", fontSize: 11, color: "#003D35", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Type it instead</button>
            </>
          )}
        </div>

        {/* Bottom CTAs */}
        <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
          <button onClick={startVoice} style={{ flex: 1, background: "transparent", border: `1px solid rgba(0,212,177,0.3)`, borderRadius: 12, padding: "11px 8px", fontSize: 12, color: a, cursor: "pointer", fontFamily: "inherit" }}>
            🎤 Something else
          </button>
          <button onClick={onConfirm} style={{ flex: 2, background: a, border: "none", borderRadius: 12, padding: "11px 8px", fontSize: 12, color: "#003D35", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            {confirmLabel}
          </button>
        </div>

      </div>
    </Layout>
  );
}

function GroceryList({ groceries, onToggle }) {
  const { gymBranding } = useApp();
  const a = gymBranding.accent;
  const total = groceries.flatMap(c => c.items).length;
  const done = groceries.flatMap(c => c.items).filter(i => i.done).length;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 600, color: theme.text }}>Grocery List</div>
        <Pill variant="teal">{done} of {total} ✓</Pill>
      </div>
      {groceries.map(cat => (
        <div key={cat.category} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6 }}>{cat.emoji} {cat.category}</div>
          <div style={{ background: "#1A2332", borderRadius: 12, overflow: "hidden" }}>
            {cat.items.map((item, i) => (
              <button key={item.name} onClick={() => onToggle(cat.category, i)}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "none", border: "none", borderBottom: i < cat.items.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", cursor: "pointer", fontFamily: "inherit", textAlign: "left" }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${item.done ? a : "rgba(0,212,177,0.3)"}`, background: item.done ? "#003D35" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 9, color: a }}>
                  {item.done ? "✓" : ""}
                </div>
                <span style={{ flex: 1, fontSize: 13, color: item.done ? theme.textDim : theme.text, textDecoration: item.done ? "line-through" : "none" }}>{item.name}</span>
                <span style={{ fontSize: 11, color: theme.textFaint }}>{item.qty}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function MealPlanScreen() {
  const { gymBranding, supabaseUser } = useApp();
  const a = gymBranding.accent;

  const [tab, setTab] = useState("today");
  const [meals, setMeals] = useState(MEAL_DATA);
  const [groceries, setGroceries] = useState(GROCERY_DATA);
  const [detailMeal, setDetailMeal] = useState(null); // null = list view, meal obj = detail view

  const CAL_GOAL = 1840, PROTEIN_GOAL = 140, CARBS_GOAL = 160, FAT_GOAL = 55;

  const calcMacros = (mealList) => mealList.reduce((acc, m) => {
    const src = (m.status === "done" || m.status === "swapped") ? (m.logged || m.suggested) : null;
    if (!src) return acc;
    return { cal: acc.cal + src.cal, protein: acc.protein + src.protein, carbs: acc.carbs + (src.carbs || 0), fat: acc.fat + (src.fat || 0) };
  }, { cal: 0, protein: 0, carbs: 0, fat: 0 });

  const macros = calcMacros(meals);

  function markDone(id) {
    const meal = meals.find(m => m.id === id);
    setMeals(prev => prev.map(m => m.id === id ? { ...m, status: "done" } : m));
    if (supabaseUser?.id && meal) {
      sb.insertMealLog(supabaseUser.id, {
        mealId: id, status: "done",
        loggedName: meal.suggested.name, loggedCal: meal.suggested.cal, loggedProtein: meal.suggested.protein,
      }).catch(() => {});
    }
  }
  function skipMeal(id) {
    setMeals(prev => prev.map(m => m.id === id ? { ...m, status: "skipped" } : m));
    if (supabaseUser?.id) {
      sb.insertMealLog(supabaseUser.id, { mealId: id, status: "skipped", loggedName: null, loggedCal: 0, loggedProtein: 0 }).catch(() => {});
    }
  }
  function confirmSalad(id) {
    const meal = meals.find(m => m.id === id);
    setMeals(prev => prev.map(m => m.id === id ? { ...m, status: "done" } : m));
    setDetailMeal(null);
    if (supabaseUser?.id && meal) {
      sb.insertMealLog(supabaseUser.id, {
        mealId: id, status: "done",
        loggedName: meal.suggested.name, loggedCal: meal.suggested.cal, loggedProtein: meal.suggested.protein,
      }).catch(() => {});
    }
  }
  function logSwap(id, parsedMeal) {
    const swapped = parsedMeal || { name: "Something else", cal: 500, protein: 25, carbs: 50, fat: 20 };
    setMeals(prev => prev.map(m => m.id === id ? { ...m, status: "swapped", logged: swapped } : m));
    setDetailMeal(null);
    if (supabaseUser?.id) {
      sb.insertMealLog(supabaseUser.id, {
        mealId: id, status: "swapped",
        loggedName: swapped.name, loggedCal: swapped.cal, loggedProtein: swapped.protein,
      }).catch(() => {});
    }
  }
  function toggleGrocery(category, idx) {
    setGroceries(prev => prev.map(cat => cat.category !== category ? cat : {
      ...cat, items: cat.items.map((item, i) => i !== idx ? item : { ...item, done: !item.done })
    }));
  }

  // Show dinner detail screen
  if (detailMeal) {
    return (
      <MealDetailScreen
        meal={detailMeal}
        onBack={() => setDetailMeal(null)}
        onConfirm={() => confirmSalad(detailMeal.id)}
        onSwap={(parsedMeal) => logSwap(detailMeal.id, parsedMeal)}
      />
    );
  }

  return (
    <Layout activeNav="meals" chatTarget="chat_meals">
      <div style={{ padding: "1.25rem 1.25rem 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 600, color: theme.text }}>Today's Meals</div>
            <div style={{ fontSize: 12, color: theme.textDim, marginTop: 2 }}>Monday · Fat loss plan</div>
          </div>
          <Pill variant={macros.cal > CAL_GOAL ? "amber" : "teal"}>{macros.cal} / {CAL_GOAL} cal</Pill>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
          <MacroBar label="Calories" current={macros.cal} goal={CAL_GOAL} color={a} />
          <MacroBar label="Protein" current={macros.protein} goal={PROTEIN_GOAL} color="#F59E0B" />
          <MacroBar label="Carbs" current={macros.carbs} goal={CARBS_GOAL} color="#818cf8" />
          <MacroBar label="Fat" current={macros.fat} goal={FAT_GOAL} color="#f472b6" />
        </div>

        <div style={{ display: "flex", background: "#1A2332", borderRadius: 10, padding: 3, marginBottom: 16 }}>
          {[["today", "Meals"], ["grocery", "Grocery List"]].map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "7px 6px", background: tab === t ? a : "transparent", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 500, color: tab === t ? "#003D35" : theme.textDim, cursor: "pointer", fontFamily: "inherit", transition: "all .2s" }}>
              {label}
            </button>
          ))}
        </div>

        {tab === "today" && (
          <div className="mq-fade">
            {meals.map(meal => (
              <MealSlot
                key={meal.id}
                meal={meal}
                onDone={() => markDone(meal.id)}
                onSkip={() => skipMeal(meal.id)}
                onOpenDetail={() => setDetailMeal(meal)}
              />
            ))}
            <div style={{ background: "#0F1922", border: "1px solid rgba(0,212,177,0.1)", borderRadius: 12, padding: "12px 14px", marginBottom: 10 }}>
              <div style={{ fontSize: 11, color: a, fontWeight: 500, marginBottom: 4 }}>Still hungry?</div>
              <div style={{ fontSize: 12, color: "#9BB3C8", lineHeight: 1.5 }}>
                You have <span style={{ color: "#E8EDF2", fontWeight: 600 }}>{Math.max(0, CAL_GOAL - macros.cal)} cal</span> and <span style={{ color: "#E8EDF2", fontWeight: 600 }}>{Math.max(0, PROTEIN_GOAL - macros.protein)}g protein</span> left today.
              </div>
            </div>
          </div>
        )}

        {tab === "grocery" && (
          <div className="mq-fade">
            <GroceryList groceries={groceries} onToggle={toggleGrocery} />
          </div>
        )}
      </div>
    </Layout>
  );
}

const CHAT_SUGGESTIONS = {
  idle:    ["What should I eat today?", "How was my last workout?", "I'm feeling tired"],
  workout: ["My knee hurts on squats", "Can I swap an exercise?", "How many sets left?"],
  meals:   ["What can I eat for dinner?", "I already had lunch", "I'm still hungry"],
};

const FALLBACK_REPLIES = {
  "my knee hurts on squats": "Stop squats for now — not worth the risk. I'm swapping in seated leg press instead, much easier on the knee. If it keeps bothering you, let me know and I'll adjust your whole program.",
  "can i swap an exercise": "Of course. Which exercise are you on? Tell me the name and I'll find a solid alternative that hits the same muscle group.",
  "how many sets left": "You've done 2 sets of this exercise. One more to go, then it's dumbbell rows — 3 sets of 10.",
  "what should i eat today": "Your meal plan is set — Greek yogurt breakfast, grilled chicken wrap for lunch, salmon salad for dinner. 1,840 calories total. Want me to swap anything?",
  "how was my last workout": "Monday was strong — you hit every exercise and beat your target reps on goblet squat. Weight is up 5 lbs from last week. Progressing well.",
  "i'm feeling tired": "That's normal mid-week. Hit your protein goal — it helps recovery. I can scale down today's intensity if needed.",
  "what can i eat for dinner": "You have about 460 calories and 36g protein left. Light salmon salad fits perfectly. Tell me if you want something different.",
  "i already had lunch": "Got it — what did you have? Tell me and I'll log it and adjust dinner to fit your remaining calories.",
  "i'm still hungry": "You have 460 calories left. Options: protein shake + banana (240 cal, 26g protein), Greek yogurt (280 cal), or 2 boiled eggs + rice cakes (190 cal). Want me to add one?",
};

function getFallbackReply(text) {
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
  const { navigate, user, gymBranding, workoutContext } = useApp();
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
      const { text: reply, action, chips } = await fetchAIReply(
        userMessages,
        { ...user, gymName: gymBranding.name },
        fromScreen,
        workoutContext   // null when not in workout, object when mid-workout
      );
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
  const { navigate, user, gymBranding, signOut } = useApp();
  const a = gymBranding.accent;
  const [editGoal, setEditGoal] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState(user.goal || "lose_fat");

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
function buildMemberRow(profile, sessions, lastDate, weightDelta) {
  const initials = (profile.name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const avatarColors = ["#003D35/#00D4B1","#2D1A00/#F59E0B","#1A1040/#A78BFA","#1F1010/#F87171","#0A1628/#60A5FA"];
  const [bg, color] = (avatarColors[initials.charCodeAt(0) % avatarColors.length]).split("/");

  const today = new Date();
  const daysSince = lastDate
    ? Math.floor((today - new Date(lastDate)) / 86400000)
    : null;

  let status, statusColor;
  if (daysSince === null || daysSince > 7) {
    status = daysSince !== null ? `No activity — ${daysSince} days` : "Never logged in";
    statusColor = "#F87171";
  } else if (sessions >= 10) {
    status = `${sessions} sessions · ahead of plan`;
    statusColor = "#00D4B1";
  } else if (sessions >= 5) {
    status = `${sessions} sessions · on track`;
    statusColor = "#6B7A8D";
  } else {
    status = `${sessions} sessions · needs nudge`;
    statusColor = "#F59E0B";
  }

  const delta = weightDelta !== undefined
    ? (parseFloat(weightDelta) > 0 ? `+${weightDelta}lb` : `${weightDelta}lb`)
    : "—";
  const deltaColor = weightDelta !== undefined
    ? (parseFloat(weightDelta) < 0 ? "#00D4B1" : "#F87171")
    : "#6B7A8D";

  return { id: profile.id, name: profile.name || "Member", initials, bg, color, sessions: sessions || 0, status, statusColor, delta, deltaColor, atRisk: daysSince === null || daysSince > 7 };
}

// Shared hook — loads all owner data once, shared between Overview + Members tabs
function useOwnerData() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const profiles = await sb.getGymMembers("demo-gym");
      if (cancelled || !profiles.length) { setLoading(false); return; }

      const profileIds = profiles.map(p => p.id);
      const [counts, lastDates, deltas] = await Promise.all([
        sb.getWorkoutCountsThisMonth(profileIds),
        sb.getLastWorkoutDates(profileIds),
        sb.getWeightDeltas(profileIds),
      ]);

      if (cancelled) return;
      const rows = profiles.map(p => buildMemberRow(p, counts[p.id] || 0, lastDates[p.id] || null, deltas[p.id]));
      setMembers(rows);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return { members, loading };
}

function OwnerStatCard({ value, label, sub, color }) {
  return (
    <div style={{ background: "#1A2332", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || "#E8EDF2" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#6B7A8D", marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "#00D4B1", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function OwnerSpinner() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "32px 0" }}>
      <Spinner />
      <div style={{ fontSize: 12, color: "#6B7A8D" }}>Loading member data…</div>
    </div>
  );
}

function OwnerOverviewTab() {
  const { members, loading } = useOwnerData();

  if (loading) return <OwnerSpinner />;

  const total = members.length;
  const activeCount = members.filter(m => m.sessions > 0).length;
  const activePct = total > 0 ? Math.round((activeCount / total) * 100) : 0;
  const totalSessions = members.reduce((s, m) => s + m.sessions, 0);
  const weightLosers = members.filter(m => m.delta !== "—" && parseFloat(m.delta) < 0);
  const avgLoss = weightLosers.length > 0
    ? (weightLosers.reduce((s, m) => s + parseFloat(m.delta), 0) / weightLosers.length).toFixed(1)
    : null;
  const atRisk = members.filter(m => m.atRisk);

  return (
    <div className="mq-fade">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
        <OwnerStatCard value={total || "0"} label="Total members" />
        <OwnerStatCard value={`${activePct}%`} label="Active this month" color="#00D4B1" />
        <OwnerStatCard value={totalSessions.toLocaleString()} label="Sessions this month" color="#F59E0B" />
        <OwnerStatCard value={avgLoss ? `${avgLoss}lb` : "—"} label="Avg weight change" color="#818cf8" />
      </div>

      <div style={{ fontSize: 11, color: "#6B7A8D", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>Activity breakdown</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {[
          [`${activePct}%`, "Active members", "#00D4B1"],
          [`${members.filter(m => m.sessions >= 8).length}`, "On track", "#F59E0B"],
          [`${atRisk.length}`, "At risk", "#F87171"],
        ].map(([v, l, c]) => (
          <div key={l} style={{ flex: 1, background: "#1A2332", borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: c }}>{v}</div>
            <div style={{ fontSize: 10, color: "#6B7A8D", marginTop: 3, lineHeight: 1.3 }}>{l}</div>
          </div>
        ))}
      </div>

      {atRisk.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: "#6B7A8D", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>Needs attention</div>
          {atRisk.slice(0, 3).map(m => (
            <div key={m.id} style={{ background: "#1F1010", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#1F1010", border: "1px solid #F87171", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#F87171", fontWeight: 600, flexShrink: 0 }}>{m.initials}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#E8EDF2" }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: "#F87171" }}>{m.status}</div>
                </div>
                <Pill variant="red">At risk</Pill>
              </div>
            </div>
          ))}
        </>
      )}

      {total === 0 && (
        <div style={{ background: "#1A2332", borderRadius: 12, padding: "20px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "#6B7A8D", lineHeight: 1.6 }}>No members yet. Share your gym's sign-up link to get started.</div>
        </div>
      )}
    </div>
  );
}

function OwnerMembersTab() {
  const { members, loading } = useOwnerData();
  const [composeTo, setComposeTo] = useState(null);
  const [msgText, setMsgText] = useState("");
  const [sent, setSent] = useState(false);

  function sendMsg() { setSent(true); setTimeout(() => { setSent(false); setComposeTo(null); setMsgText(""); }, 1400); }

  if (loading) return <OwnerSpinner />;

  if (!members.length) {
    return (
      <div className="mq-fade" style={{ background: "#1A2332", borderRadius: 14, padding: "24px 16px", textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "#6B7A8D", lineHeight: 1.6 }}>No members have signed up yet.</div>
      </div>
    );
  }

  return (
    <div className="mq-fade">
      <div style={{ background: "#1A2332", borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
        {members.map((m, i) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: i < members.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: m.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: m.color, flexShrink: 0 }}>{m.initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#E8EDF2", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
              <div style={{ fontSize: 11, color: m.statusColor }}>{m.status}</div>
            </div>
            <div style={{ textAlign: "right", marginRight: 8, flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: m.deltaColor }}>{m.delta}</div>
              <div style={{ fontSize: 10, color: "#6B7A8D" }}>weight</div>
            </div>
            <button onClick={() => { setComposeTo(m); setSent(false); setMsgText(""); }}
              style={{ width: 28, height: 28, borderRadius: 8, background: "#0D1623", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 6.5c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.4-.6 2.6-1.5 3.5L10.5 12H6.5c-2.76 0-5-2.24-5-5z" stroke="#00D4B1" strokeWidth="1" /></svg>
            </button>
          </div>
        ))}
      </div>

      {composeTo && (
        <div className="mq-fade" style={{ background: "#1A2332", borderRadius: 14, padding: "14px" }}>
          <div style={{ fontSize: 12, color: "#6B7A8D", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>Message</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#0D1623", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: "#6B7A8D" }}>To:</span>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: composeTo.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: composeTo.color, fontWeight: 600 }}>{composeTo.initials}</div>
            <span style={{ fontSize: 12, color: "#E8EDF2" }}>{composeTo.name}</span>
            <button onClick={() => setComposeTo(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#6B7A8D", cursor: "pointer", fontSize: 14 }}>×</button>
          </div>
          <textarea value={msgText} onChange={e => setMsgText(e.target.value)}
            placeholder={`Hey ${composeTo.name.split(" ")[0]} — we noticed you haven't logged in for a while. How's everything going? We're here if you need support 💪`}
            style={{ width: "100%", background: "#0D1623", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 12px", fontSize: 12, color: "#9BB3C8", outline: "none", fontFamily: "inherit", resize: "none", minHeight: 80, lineHeight: 1.5, marginBottom: 10 }} />
          <button onClick={sendMsg} style={{ width: "100%", background: sent ? "#003D35" : "#00D4B1", color: sent ? "#00D4B1" : "#003D35", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            {sent ? "Sent ✓" : "Send message"}
          </button>
        </div>
      )}
    </div>
  );
}

function OwnerBrandingTab() {
  const { gymBranding, setGymBranding } = useApp();
  const [gymName, setGymName] = useState(gymBranding.name);
  const [brandColor, setBrandColor] = useState(gymBranding.accent);
  const [welcome, setWelcome] = useState(gymBranding.welcome || `Welcome to ${gymBranding.name}. Your personal AI trainer is ready. Let's get to work.`);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    setSaving(true);
    setError(null);
    const ok = await sb.saveGymBranding("demo-gym", { name: gymName, accent: brandColor, welcome });
    setSaving(false);
    if (ok) {
      setGymBranding({ name: gymName, accent: brandColor, welcome, units: gymBranding.units });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      setError("Save failed — check your connection and try again.");
    }
  }

  return (
    <div className="mq-fade">
      <div style={{ background: "#1A2332", borderRadius: 14, padding: "14px", marginBottom: 16 }}>
        {/* Gym name */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#6B7A8D", marginBottom: 6 }}>Gym name</div>
          <input value={gymName} onChange={e => setGymName(e.target.value)}
            style={{ width: "100%", background: "#0D1623", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#E8EDF2", outline: "none", fontFamily: "inherit" }} />
        </div>
        {/* Brand color */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#6B7A8D", marginBottom: 6 }}>Brand color</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {["#00D4B1","#7C3AED","#EF4444","#F59E0B","#3B82F6"].map(c => (
              <button key={c} onClick={() => setBrandColor(c)} style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: brandColor === c ? "3px solid #E8EDF2" : "2px solid transparent", cursor: "pointer", flexShrink: 0 }} />
            ))}
            <div style={{ fontSize: 12, color: "#9BB3C8", marginLeft: 4, fontFamily: "monospace" }}>{brandColor}</div>
          </div>
        </div>
        {/* Welcome message */}
        <div>
          <div style={{ fontSize: 11, color: "#6B7A8D", marginBottom: 6 }}>Welcome message</div>
          <textarea value={welcome} onChange={e => setWelcome(e.target.value)}
            style={{ width: "100%", background: "#0D1623", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#9BB3C8", outline: "none", fontFamily: "inherit", resize: "none", minHeight: 60, lineHeight: 1.5 }} />
        </div>
      </div>

      {/* Live preview */}
      <div style={{ fontSize: 11, color: "#6B7A8D", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>Live member preview</div>
      <div style={{ background: "#111827", borderRadius: 14, overflow: "hidden", marginBottom: 16, border: "1px solid #1E2D42" }}>
        <div style={{ background: "#111827", padding: "10px 14px", borderBottom: "1px solid #1E2D42", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#003D35", border: `2px solid ${brandColor}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: brandColor }}>M</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#E8EDF2" }}>{gymName}</div>
            <div style={{ fontSize: 10, color: "#6B7A8D" }}>Powered by Morphiq</div>
          </div>
        </div>
        <div style={{ padding: "14px" }}>
          <div style={{ fontSize: 12, color: "#9BB3C8", marginBottom: 12, lineHeight: 1.5 }}>"{welcome}"</div>
          <div style={{ background: brandColor, borderRadius: 10, padding: "9px", fontSize: 12, fontWeight: 600, color: "#003D35", textAlign: "center" }}>Build my plan →</div>
        </div>
      </div>

      {error && <div style={{ fontSize: 12, color: "#F87171", marginBottom: 8, padding: "8px 12px", background: "#1F1010", borderRadius: 8 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save} disabled={saving} style={{ flex: 2, background: saved ? "#003D35" : "#00D4B1", color: saved ? "#00D4B1" : "#003D35", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 600, cursor: saving ? "default" : "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
        </button>
        <button onClick={() => { setGymName(gymBranding.name); setBrandColor(gymBranding.accent); setWelcome(gymBranding.welcome || ""); }} style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px", fontSize: 12, color: "#6B7A8D", cursor: "pointer", fontFamily: "inherit" }}>Reset</button>
      </div>
    </div>
  );
}

function OwnerInviteTab() {
  const gymId = "demo-gym";
  const inviteUrl = `${window.location.origin}?gym=${gymId}`;
  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      // Fallback for browsers without clipboard API
      const el = document.createElement("textarea");
      el.value = inviteUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div className="mq-fade">
      <div style={{ background: "#1A2332", borderRadius: 14, padding: "16px 14px", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#E8EDF2", marginBottom: 6 }}>Member invite link</div>
        <div style={{ fontSize: 12, color: "#9BB3C8", lineHeight: 1.6, marginBottom: 14 }}>
          Share this link with new members. When they open it, they'll land directly on your branded gym sign-up — no searching for Morphiq separately.
        </div>
        <div style={{ background: "#0D1623", border: "1px solid #1E2D42", borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, fontSize: 11, color: "#9BB3C8", fontFamily: "monospace", wordBreak: "break-all", lineHeight: 1.5 }}>{inviteUrl}</div>
          <button onClick={copyLink} style={{ flexShrink: 0, background: copied ? "#003D35" : "#00D4B1", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: copied ? "#00D4B1" : "#003D35", cursor: "pointer", fontFamily: "inherit", transition: "all .2s" }}>
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
        <div style={{ fontSize: 10, color: "#6B7A8D", lineHeight: 1.6 }}>
          Members who sign up via this link are automatically assigned to your gym. Their plan will show your branding.
        </div>
      </div>

      <div style={{ background: "#1A2332", borderRadius: 14, padding: "14px", marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: "#6B7A8D", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>How it works</div>
        {[
          ["1", "Copy the link above and share it via text, email, or your gym's social media."],
          ["2", "Member opens the link → sees your gym name and branding on the sign-in screen."],
          ["3", "They sign up with their email → get a 6-digit code → complete the quiz."],
          ["4", "Their plan is built by Morphiq AI and appears in the Members tab of your dashboard."],
        ].map(([num, text]) => (
          <div key={num} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#003D35", border: "1px solid rgba(0,212,177,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#00D4B1", flexShrink: 0 }}>{num}</div>
            <div style={{ fontSize: 12, color: "#9BB3C8", lineHeight: 1.6 }}>{text}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#0F1922", border: "1px solid rgba(0,212,177,0.1)", borderRadius: 12, padding: "12px 14px" }}>
        <div style={{ fontSize: 11, color: "#00D4B1", fontWeight: 600, marginBottom: 4 }}>Tip: QR code</div>
        <div style={{ fontSize: 11, color: "#6B7A8D", lineHeight: 1.6 }}>
          Go to qr-code-generator.com, paste your link, and print the QR code to display at your front desk or on your website.
        </div>
      </div>
    </div>
  );
}

function PricingScreen() {
  const { navigate } = useApp();
  const plans = [
    {
      name: "Starter",
      price: "$99",
      perMember: "$2",
      color: "#00D4B1",
      bg: "#003D35",
      border: "rgba(0,212,177,0.3)",
      badge: null,
      features: [
        "Up to 100 active members",
        "AI workout plans",
        "AI meal plans",
        "Voice rep logging",
        "Member progress tracking",
        "Basic gym branding",
        "Email support",
      ],
    },
    {
      name: "Growth",
      price: "$199",
      perMember: "$1.75",
      color: "#A78BFA",
      bg: "#1E1040",
      border: "rgba(167,139,250,0.4)",
      badge: "Most popular",
      features: [
        "Up to 500 active members",
        "Everything in Starter",
        "Broadcast messaging to all members",
        "Advanced analytics dashboard",
        "Custom welcome message",
        "Priority email support",
        "Weekly engagement report",
      ],
    },
    {
      name: "Scale",
      price: "$399",
      perMember: "$1.50",
      color: "#F59E0B",
      bg: "#2D1A00",
      border: "rgba(245,158,11,0.3)",
      badge: "Best value",
      features: [
        "Unlimited active members",
        "Everything in Growth",
        "Dedicated account manager",
        "Custom AI personality name",
        "White-label mobile app icon",
        "API access",
        "Phone & chat support",
      ],
    },
  ];

  return (
    <div style={{ background: "#080E1A", borderRadius: 20, color: "#E8EDF2", fontFamily: "'DM Sans', system-ui, sans-serif", minHeight: "100dvh", overflow: "hidden" }}>
      <div style={{ background: "#0D1623", borderBottom: "1px solid #1E2D42", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => navigate("owner")} style={{ background: "none", border: "none", color: "#6B7A8D", cursor: "pointer", fontSize: 18, padding: 0 }}>←</button>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#E8EDF2" }}>Pricing Plans</div>
      </div>

      <div style={{ padding: "16px 16px 80px", overflowY: "auto" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: "#9BB3C8", lineHeight: 1.6 }}>
            All plans include a <span style={{ color: "#00D4B1", fontWeight: 600 }}>14-day free trial</span>. No credit card required to start.
          </div>
          <div style={{ fontSize: 11, color: "#6B7A8D", marginTop: 4 }}>
            Billing is monthly. "Active member" = logged at least one workout that month.
          </div>
        </div>

        {plans.map(plan => (
          <div key={plan.name} style={{ background: plan.bg, border: `1px solid ${plan.border}`, borderRadius: 16, padding: "16px 14px", marginBottom: 12, position: "relative" }}>
            {plan.badge && (
              <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: plan.color, color: plan.name === "Growth" ? "#1E1040" : "#2D1A00", borderRadius: 20, padding: "2px 12px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>
                {plan.badge}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: plan.color }}>{plan.name}</div>
                <div style={{ fontSize: 11, color: "#9BB3C8", marginTop: 2 }}>Base monthly fee</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#E8EDF2", lineHeight: 1 }}>{plan.price}<span style={{ fontSize: 12, color: "#9BB3C8", fontWeight: 400 }}>/mo</span></div>
                <div style={{ fontSize: 11, color: plan.color, marginTop: 2 }}>+ {plan.perMember} per active member</div>
              </div>
            </div>
            <div style={{ borderTop: `1px solid rgba(255,255,255,0.06)`, paddingTop: 10 }}>
              {plan.features.map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                  <div style={{ width: 14, height: 14, borderRadius: "50%", background: plan.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#080E1A", fontWeight: 700, flexShrink: 0 }}>✓</div>
                  <span style={{ fontSize: 12, color: "#C0C0C0" }}>{f}</span>
                </div>
              ))}
            </div>
            <button style={{ width: "100%", background: plan.color, color: "#080E1A", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginTop: 14 }}>
              Start {plan.name} trial →
            </button>
          </div>
        ))}

        <div style={{ background: "#1A2332", borderRadius: 14, padding: "14px", textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#E8EDF2", marginBottom: 6 }}>Need something custom?</div>
          <div style={{ fontSize: 12, color: "#9BB3C8", marginBottom: 10, lineHeight: 1.6 }}>
            Enterprise plans available for gym chains, franchises, and large studios. Let's talk.
          </div>
          <div style={{ fontSize: 12, color: "#00D4B1" }}>hello@morphiq.app</div>
        </div>
      </div>

      <div style={{ textAlign: "center", fontSize: 10, color: "#333", letterSpacing: ".5px", padding: "8px 0 12px" }}>POWERED BY MORPHIQ</div>
    </div>
  );
}

function GymOwnerDashboard() {
  const { navigate } = useApp();
  const [tab, setTab] = useState("overview");
  const tabs = [["overview","Overview"],["members","Members"],["invite","Invite"],["branding","Branding"]];

  return (
    <div style={{ background: "#080E1A", borderRadius: 20, color: "#E8EDF2", fontFamily: "'DM Sans', system-ui, sans-serif", minHeight: "100dvh", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ background: "#0D1623", borderBottom: "1px solid #1E2D42", padding: "14px 16px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#E8EDF2" }}>Gym Dashboard</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00D4B1" }} />
            <span style={{ fontSize: 11, color: "#6B7A8D" }}>Admin</span>
          </div>
        </div>
        {/* Tab bar */}
        <div style={{ display: "flex", gap: 0 }}>
          {tabs.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ flex: 1, padding: "8px 4px", background: "none", border: "none", borderBottom: `2px solid ${tab === id ? "#00D4B1" : "transparent"}`, fontSize: 12, fontWeight: tab === id ? 600 : 400, color: tab === id ? "#00D4B1" : "#6B7A8D", cursor: "pointer", fontFamily: "inherit", transition: "all .2s" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "16px 16px 0", overflowY: "auto" }}>
        {tab === "overview" && <OwnerOverviewTab />}
        {tab === "members"  && <OwnerMembersTab />}
        {tab === "invite"   && <OwnerInviteTab />}
        {tab === "branding" && <OwnerBrandingTab />}
      </div>

      {/* Footer back link */}
      <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={() => navigate("home")} style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 14px", fontSize: 12, color: "#6B7A8D", cursor: "pointer", fontFamily: "inherit" }}>← Member view</button>
        <button onClick={() => navigate("pricing")} style={{ background: "none", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 8, padding: "6px 14px", fontSize: 12, color: "#A78BFA", cursor: "pointer", fontFamily: "inherit" }}>Plans & pricing →</button>
      </div>
      <div style={{ textAlign: "center", fontSize: 10, color: "#333", letterSpacing: ".5px", padding: "0 0 12px" }}>POWERED BY MORPHIQ</div>
    </div>
  );
}

function LoadingScreen() {
  const { gymBranding } = useApp();
  const a = gymBranding.accent;
  const ob = theme.ob;
  return (
    <div style={{ background: ob.bg, borderRadius: 20, minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: ob.font }}>
      <div style={{ width: 48, height: 48, borderRadius: "50%", background: ob.tealDk, border: `2px solid ${a}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: a }}>M</div>
      <Spinner size={36} color={a} trackColor={ob.card} />
      <div style={{ fontSize: 13, color: ob.body }}>Loading your account…</div>
      <div style={{ fontSize: 9, color: "#333", letterSpacing: ".5px", marginTop: 20 }}>POWERED BY MORPHIQ</div>
    </div>
  );
}

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
