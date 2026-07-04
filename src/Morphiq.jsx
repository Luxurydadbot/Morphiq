import { createContext, useContext, useState, useEffect, useRef } from "react";
import { WorkoutScreen, CustomPlanScreen } from "./WorkoutScreen.jsx";
import { MealPlanScreen } from "./MealScreen.jsx";
import { GymOwnerDashboard, PricingScreen } from "./GymOwnerDashboard.jsx";
import { SuperAdminDashboard } from "./SuperAdminDashboard.jsx";
import { GymSignupScreen } from "./GymSignupScreen.jsx";
import { OnboardingScreen } from "./OnboardingScreen.jsx";
import { ProgressScreen } from "./ProgressScreen.jsx";
import { ChatScreen } from "./ChatScreen.jsx";
import {
  sb, theme, css, AppContext, DEFAULT_USER, SESSION_KEY,
  localDateStr, buildPlan, progressPlan,
  SUPABASE_URL, SB_GET, getAuthToken,
  MicIcon, VoiceBtn, Pill, Spinner, NavIcon, Layout,
  GOAL_OPTIONS, GOAL_ICONS, EQUIPMENT_OPTIONS,
  WORKOUT_EXERCISES, MEAL_DATA, GROCERY_DATA,
  FALLBACK_REPLIES, CHAT_SUGGESTIONS,
  WEIGHT_DATA_MOCK, PERSONAL_BESTS,
  getFallbackReply, fetchAIReply,
  WeightChart, StreakCalendar, getWeekStreak,
} from "./shared.jsx";

const useApp = () => useContext(AppContext);

// The one email address recognized as "the person who runs Morphiq itself."
// Logging in with this email skips every gym entirely and goes straight to
// the platform-wide Super Admin Dashboard, instead of a member or gym-owner view.
const SUPER_ADMIN_EMAIL = "admin@hypergentiq.com";

function AppProvider({ children }) {
  // ── Restore session from localStorage on first load ──────────────────────
  const savedSession = (() => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
  })();

  const [screen, setScreen] = useState(savedSession ? "loading" : (new URLSearchParams(window.location.search).get("join") === "gym" ? "gym_signup" : "auth"));
  const [user, setUser] = useState(DEFAULT_USER);
  const [plan, setPlan] = useState(null);
  const [supabaseUser, setSupabaseUser] = useState(null);
  // Ref mirrors supabaseUser.id synchronously — state updates are async so
  // supabaseUser?.id can be null inside onboarding even after setSupabaseUser runs.
  // Fix (June 2026): plan was never saved to Supabase on fresh PC login because
  // supabaseUser?.id was null when the save ran. Use this ref instead.
  const supabaseUserIdRef = useRef(null);
  const [gymBranding, setGymBranding] = useState({ name: "IronForge Gym", accent: "#00D4B1", welcome: "Welcome to IronForge Gym. Your personal AI trainer is ready. Let's get to work.", units: "imperial" });
  const [historicalData, setHistoricalData] = useState(null);
  // Tracks the current exercise + set while WorkoutScreen is active
  // so ChatScreen can pass exact context to Claude (e.g. "Set 2 of 3 · Goblet Squat")
  const [workoutContext, setWorkoutContext] = useState(null);
  // When AI chat suggests swapping an exercise mid-workout, this holds the swap payload.
  // WorkoutScreen watches this and calls doSwap when it's non-null, then clears it.
  const [pendingAISwap, setPendingAISwap] = useState(null);

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
    if (!savedSession?.uid) return;
    // Refresh the auth token before any reads. Supabase access tokens expire after
    // ~1 hour, so reopening the app the next day was using an expired token: RLS
    // rejected the workout reads and Progress/home showed zero. Renew first, then load.
    sb.refreshSession().then((renewed) => {
      if (renewed === "expired" || renewed === false) {
        // "expired" = Supabase explicitly rejected the refresh token (4xx).
        // false     = no refresh token exists at all (e.g. PC where the user never
        //             completed an OTP login on this device, so nothing was ever stored).
        // In both cases we have no valid auth token, so any Supabase read will use the
        // anon key and RLS will block it — returning an empty row that looks like "no plan"
        // and sending the user to the error screen. The only safe path is a clean re-login.
        // Fix (June 2026): previously only "expired" triggered this — "false" fell through
        // and tried to read the profile with the anon key, always failing on new devices.
        try { localStorage.removeItem("mq_access_token"); } catch {}
        try { localStorage.removeItem("mq_refresh_token"); } catch {}
        try { localStorage.removeItem(SESSION_KEY); } catch {}
        setScreen("auth");
        return "AUTH_REQUIRED";
      }
      return sb.getProfile(savedSession.uid);
    }).then(profile => {
      if (profile === "AUTH_REQUIRED") return;
      // Helper: try localStorage cache if Supabase returns no plan
      // This handles the case where upsert created a duplicate row or Supabase is slow.
      // Fix added: onboarding now writes mq_cached_plan_<uid> so this always finds the plan.
      const getCachedPlanData = () => {
        try {
          const raw = localStorage.getItem("mq_cached_plan_" + savedSession.uid);
          return raw ? JSON.parse(raw) : null;
        } catch { return null; }
      };

      const planSource = profile?.plan ? profile : null;
      const cachedData = !planSource ? getCachedPlanData() : null;
      const resolvedPlan = planSource?.plan || cachedData?.plan || null;
      const resolvedUser = planSource
        ? { name: profile.name, goal: profile.goal, sex: profile.sex, height: profile.height, weight: profile.weight, age: profile.age, daysPerWeek: profile.days_per_week, injuries: profile.injuries || "", unit: "imperial" }
        : cachedData?.user || null;

      if (resolvedPlan && resolvedUser) {
        setSupabaseUser({ email: savedSession.email, id: savedSession.uid });
        setUser(resolvedUser);
        // Patch missing weekStartDate — if the plan was saved without it, fill in today
        // so the 7-day check has something to work from. Save back to Supabase immediately.
        const patchedPlan = resolvedPlan?.weekStartDate
          ? resolvedPlan
          : { ...resolvedPlan, weekStartDate: new Date().toISOString().split("T")[0], weekNumber: resolvedPlan?.weekNumber || 1 };

        // Fix (June 2026): previously, if Supabase had NO plan but the browser's local
        // cache did (e.g. an earlier onboarding attempt that built a plan locally but
        // failed to save it — see the timeout bug from tonight), this code trusted the
        // cache, showed "home" looking completely normal, and tried to silently re-save
        // the cache up to Supabase in the background with no confirmation. If THAT save
        // also failed, the member would be stuck forever looking logged-in with a real
        // plan on screen, while the database never actually had their data — and every
        // future open of the app would repeat this same silent failure. Now, when we're
        // relying on the cache (not a confirmed Supabase plan), we wait for the re-save
        // to genuinely succeed before showing home. If it fails, we show a clear retry
        // screen instead of a falsely-normal-looking home screen.
        const needsConfirmedResave = !planSource?.plan && !!cachedData?.plan;

        if (needsConfirmedResave) {
          // Fix (June 2026): before trying to re-save, do one more Supabase read.
          // The profile IS in the database (confirmed on other devices) — the first
          // getProfile() may have returned a partial row due to a timing issue.
          // A second read often succeeds. Only fall back to upsert if it also fails.
          sb.getProfile(savedSession.uid).then(freshProfile => {
            if (freshProfile?.plan) {
              const fp = freshProfile.plan?.weekStartDate
                ? freshProfile.plan
                : { ...freshProfile.plan, weekStartDate: new Date().toISOString().split("T")[0], weekNumber: freshProfile.plan?.weekNumber || 1 };
              setPlan(fp);
              loadHistoricalData(savedSession.uid);
              checkAndGenerateNextWeek(savedSession.uid, fp, resolvedUser).catch(() => {});
              setScreen("home");
              return;
            }
            return sb.upsertProfile(savedSession.uid, resolvedUser, patchedPlan).then((ok) => {
              if (!ok) { setScreen("network_error"); return; }
              setPlan(patchedPlan);
              loadHistoricalData(savedSession.uid);
              checkAndGenerateNextWeek(savedSession.uid, patchedPlan, resolvedUser).catch(() => {});
              setScreen("home");
            }).catch(() => setScreen("network_error"));
          }).catch(() => setScreen("network_error"));
          return;
        }

        // Plan was already confirmed in Supabase (planSource?.plan was real) — just a
        // missing weekStartDate patch, which is low-stakes and fine to fire-and-forget.
        if (!resolvedPlan?.weekStartDate) sb.upsertProfile(savedSession.uid, resolvedUser, patchedPlan).catch(() => {});
        setPlan(patchedPlan);
        loadHistoricalData(savedSession.uid);
        checkAndGenerateNextWeek(savedSession.uid, patchedPlan, resolvedUser).catch(() => {});
        setScreen("home");
      } else {
        // No plan in Supabase or local cache — go to onboarding. Do NOT wipe the session.
        // This prevents OTP being required every time when plan is null.
        setSupabaseUser({ email: savedSession.email, id: savedSession.uid });
        supabaseUserIdRef.current = savedSession.uid;
        setScreen("onboarding");
      }
    }).catch(() => {
      // Network error on session restore — check local cache first.
      // Fix (June 2026): if there's no cache either, send to auth screen instead of
      // showing the error screen. The error screen was a dead end — the user had no
      // way to log in again without knowing to tap "Use a different account".
      // Sending to auth is cleaner: they log in once, tokens get stored, future opens work.
      try {
        const raw = localStorage.getItem("mq_cached_plan_" + savedSession.uid);
        const cached = raw ? JSON.parse(raw) : null;
        if (cached?.plan && cached?.user) {
          setSupabaseUser({ email: savedSession.email, id: savedSession.uid });
          setUser(cached.user);
          setPlan(cached.plan);
          setScreen("home");
          return;
        }
      } catch {}
      // No cache — clear stale session and send to login screen cleanly.
      try { localStorage.removeItem("mq_access_token"); } catch {}
      try { localStorage.removeItem("mq_refresh_token"); } catch {}
      try { localStorage.removeItem(SESSION_KEY); } catch {}
      setScreen("auth");
    });
  }, []);

  // ── Proactive background token renewal (Thing 2) ──────────────────────────
  // Access tokens expire after ~1 hour. Refreshing ONLY on app open meant a
  // member who kept the app open — or left it backgrounded on a phone — could
  // cross the 1-hour line mid-use and start silently failing authenticated
  // saves/reads. This renews the token well before it expires: on a 45-minute
  // timer while the app is open, and again whenever the tab/app regains focus
  // (the common mobile PWA "resume" case). Fire-and-forget — a failed renewal
  // never logs the member out mid-session; the retry-on-401 net (sbFetchRetry)
  // and the on-open re-login handle a genuinely dead session.
  useEffect(() => {
    if (!savedSession?.uid) return;
    const renew = () => { sb.refreshSession().catch(() => {}); };
    const id = setInterval(renew, 45 * 60 * 1000); // 45 min < ~60 min token life
    const onVisible = () => { if (document.visibilityState === "visible") renew(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [savedSession?.uid]);

  // Called after successful auth. role = "member" | "owner" | "super_admin".
  async function signIn(email, role, realAuthUserId = null) {
    const uid = realAuthUserId || ("sim-" + Date.now());
    setSupabaseUser({ email, id: uid });
    supabaseUserIdRef.current = uid;
    if (role === "super_admin") {
      // No gym to look up — this account sits above every gym, not inside one.
      setScreen("super_admin");
      return;
    }
    if (role === "owner") {
      // Look up the owner's gym and store the real gym_id in branding context
      // so GymOwnerDashboard can query real member data
      const gymRow = await sb.getGymByOwnerEmail(email);
      if (gymRow?.gym_id) {
        setGymBranding(prev => ({ ...prev, gymId: gymRow.gym_id, name: gymRow.name || prev.name, accent: gymRow.accent || prev.accent, welcome: gymRow.welcome || prev.welcome }));
      }
      setScreen("owner");
      return;
    }

    // Production: query profile from Supabase using the real auth UID.
    // Fix (June 2026): we do ONE fetch here and reuse the result directly instead of
    // making two back-to-back fetches (diagnostic + getProfile). Two fetches were
    // causing the second one to return a row without the plan field — likely a Supabase
    // RLS/token timing issue where the first fetch "consumed" something the second needed.
    // Using the single fetch result directly is simpler and eliminates the race entirely.
    setScreen("loading");
    try {
      let profile = null;
      try {
        const _res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?supabase_user_id=eq.${encodeURIComponent(uid)}&limit=1`, { headers: SB_GET() });
        const _text = await _res.text();
        const _rows = JSON.parse(_text);
        profile = _rows?.[0] || null;
        // Fix (June 2026): plan column may come back as a JSON string instead of
        // a parsed object depending on Supabase column type. Parse it if needed.
        if (profile && typeof profile.plan === "string") {
          try { profile.plan = JSON.parse(profile.plan); } catch { profile.plan = null; }
        }
      } catch(fetchErr) {
        console.error("[Morphiq] profile fetch error:", fetchErr?.message || fetchErr);
      }
      if (profile?.plan) {
        const u = { name: profile.name, goal: profile.goal, sex: profile.sex, height: profile.height, weight: profile.weight, age: profile.age, daysPerWeek: profile.days_per_week, injuries: profile.injuries || "", unit: "imperial" };
        setUser(u);
        // Patch missing weekStartDate — if the plan was saved without it, fill in today
        // so the 7-day check has something to work from. Save back to Supabase immediately.
        const patchedPlan = profile.plan?.weekStartDate
          ? profile.plan
          : { ...profile.plan, weekStartDate: new Date().toISOString().split("T")[0], weekNumber: profile.plan?.weekNumber || 1 };
        if (!profile.plan?.weekStartDate) sb.upsertProfile(uid, u, patchedPlan).catch(() => {});
        setPlan(patchedPlan);
        window._mq_plan_set = true; // flag so outer catch knows plan was set
        // Save session so next open skips login
        try { localStorage.setItem(SESSION_KEY, JSON.stringify({ uid, email })); } catch {}
        // Fire-and-forget — errors here must never prevent home screen from showing
        try { loadHistoricalData(uid); } catch {}
        try { checkAndGenerateNextWeek(uid, patchedPlan, u).catch(() => {}); } catch {}
        setScreen("home");
      } else {
        setUser(DEFAULT_USER); setPlan(null);
        // Save session even with no plan — user stays logged in through onboarding
        try { localStorage.setItem(SESSION_KEY, JSON.stringify({ uid, email })); } catch {}
        setScreen("onboarding");
      }
    } catch(err) {
      // Fix (June 2026): outer catch was sending to onboarding on ANY error — including
      // errors thrown by loadHistoricalData or checkAndGenerateNextWeek AFTER the plan
      // was already set. Now we check if we already have a plan and go home anyway.
      if (plan || window._mq_plan_set) { setScreen("home"); return; }
      setUser(DEFAULT_USER); setPlan(null); setScreen("onboarding");
    }
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
    // Save the token so authenticated DB writes work when the user arrives via the
    // magic LINK (not just the typed OTP-code path). Without this, getAuthToken()
    // falls back to the anon key and profile/plan saves can be silently rejected.
    try { localStorage.setItem("mq_access_token", accessToken); } catch {}
    // Also save the refresh token so the session auto-renews on reopen (tokens expire ~1hr).
    try { const rt = params.get("refresh_token"); if (rt) localStorage.setItem("mq_refresh_token", rt); } catch {}
    // Decode the JWT to get the user's Supabase UUID (sub claim)
    try {
      const payload = JSON.parse(atob(accessToken.split(".")[1]));
      const email = payload.email || "";
      const uid = payload.sub || "";
      if (uid) signIn(email, "member", uid);
    } catch(e) { console.error("Magic link error:", e); }
  }, []);

  // Load historical workout + weight data once we have a real user ID

  // Checks if 7+ days have passed since weekStartDate — if so, silently generates next week.
  // Week progression — fully code-driven, no API call
  // Called when session restores and plan is 7+ days old
  function checkAndGenerateNextWeek(uid, currentPlan, currentUser) {
    try {
      if (!currentPlan?.weekStartDate) return;
      const daysSince = Math.floor((Date.now() - new Date(currentPlan.weekStartDate)) / 86400000);
      if (daysSince < 7) return;
      // Fetch workout logs then run local progression engine
      if (!uid || uid.startsWith("sim-")) return;
      sb.getWorkoutLogs(uid, 30).then(logs => {
        const nextPlan = progressPlan(currentPlan, logs || [], currentUser);
        setPlan(nextPlan);
        sb.upsertProfile(uid, currentUser, nextPlan).catch(() => {});
        console.log("[Morphiq] Week", nextPlan.weekNumber, "generated locally — no API call");
      }).catch(() => {});
    } catch (e) { console.log("[Morphiq] Week progression skipped:", e.message); }
  }

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

      // Streak — count consecutive days ending today or yesterday.
      // Uses localDateStr (local time) — NOT UTC — so the day doesn't roll
      // over early for members west of UTC. (Same fix as the meal-day bug.)
      let streak = 0;
      const today = localDateStr();
      const dateSet = new Set(dates);
      let cursor = new Date(); // local "now", walked back one day at a time
      // allow today or yesterday as streak start
      if (!dateSet.has(today)) cursor.setDate(cursor.getDate() - 1);
      while (dateSet.has(localDateStr(cursor))) {
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
    // Also clear the Supabase auth tokens. Without this, "Log Out" left the old
    // (often expired) access/refresh tokens behind, so the next login kept tripping
    // over a dead token and reads returned 401. (Fix: June 2026 stuck-token bug.)
    try { localStorage.removeItem("mq_access_token"); } catch {}
    try { localStorage.removeItem("mq_refresh_token"); } catch {}
    setSupabaseUser(null);
    setUser(DEFAULT_USER);
    setPlan(null);
    setHistoricalData(null);
    setScreen("auth");
  }

  return (
    <AppContext.Provider value={{ screen, navigate: setScreen, user, setUser, plan, setPlan, supabaseUser, supabaseUserIdRef, gymBranding, setGymBranding, signIn, signOut, historicalData, loadHistoricalData, workoutContext, setWorkoutContext, pendingAISwap, setPendingAISwap }}>
      {children}
    </AppContext.Provider>
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
      // The platform admin email always wins — skip the gym-owner lookup entirely.
      if (email.trim().toLowerCase() === SUPER_ADMIN_EMAIL) {
        signIn(result.email, "super_admin", result.uid);
        return;
      }
      // Check if this email is a gym owner
      const gymRow = await sb.getGymByOwnerEmail(email);
      const role = gymRow ? "owner" : "member";
      signIn(result.email, role, result.uid);
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
        <div style={{ fontSize: 11, color: ob.muted, marginTop: 3 }}>Powered by Hypergentiq</div>
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


      <div style={{ textAlign: "center", fontSize: 9, color: "#333", letterSpacing: ".5px", padding: "4px 0 10px" }}>POWERED BY MORPHIQ</div>
    </div>
  );
}

function PlanOverviewScreen() {
  const { navigate, user, gymBranding, plan } = useApp();
  const a = gymBranding.accent;
  const sL = theme.sL;
  const goalLabel = GOAL_OPTIONS.find(g => g.id === user.goal)?.label?.toLowerCase() || "fitness";

  return (
    <Layout activeNav="home">
      <div style={{ padding: "1.75rem 1.25rem 1.25rem", borderBottom: `0.5px solid ${theme.borderSubtle}` }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(0,212,177,0.1)", border: "0.5px solid rgba(0,212,177,0.25)", borderRadius: 20, padding: "4px 12px", fontSize: 12, color: a, fontWeight: 500, marginBottom: ".75rem" }}>
          <div style={{ width: 6, height: 6, borderRadius: "50%", background: a }} />Plan ready
        </div>
        <div style={{ fontSize: 22, fontWeight: 500, color: "#F0F0F0", lineHeight: 1.3, marginBottom: ".4rem" }}>Your 4-week {goalLabel} program is live</div>
        <div style={{ fontSize: 14, color: theme.textDim }}>{user.daysPerWeek || plan?.daysPerWeek || 3} workouts per week · {plan?.workoutType || "Full body"} · {user.fitnessLevel || "Intermediate"}</div>
      </div>
      <div style={{ padding: "1.25rem 1.25rem 0" }}>
        <div style={sL}>Daily targets</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
          {[[plan?.calories?.toLocaleString() || "—", "Calories", "100%", a], [`${plan?.protein || "—"}g`, "Protein", "72%", "#5DCAA5"], [`${plan?.carbs || "—"}g`, "Carbs", "55%", "#1D9E75"]].map(([v, l, w, c]) => (
            <div key={l} style={{ background: theme.surface, border: `0.5px solid ${theme.border}`, borderRadius: 12, padding: ".85rem .75rem" }}>
              <div style={{ fontSize: 20, fontWeight: 500, color: "#F0F0F0" }}>{v}</div>
              <div style={{ fontSize: 12, color: theme.textDim, marginTop: 2 }}>{l}</div>
              <div style={{ height: 3, background: "#222", borderRadius: 2, marginTop: 6 }}><div style={{ height: 3, borderRadius: 2, background: c, width: w }} /></div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: "1.25rem 1.25rem 0" }}>
        <div style={sL}>Your first workout</div>
        <div className="mq-fade" style={{ background: theme.surface, border: `0.5px solid ${theme.border}`, borderRadius: 16, overflow: "hidden" }}>
            <div style={{ padding: "1rem 1.25rem", borderBottom: `0.5px solid ${theme.borderSubtle}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div><div style={{ fontSize: 15, fontWeight: 500, color: "#F0F0F0" }}>{plan?.workoutType || "Full body"}</div><div style={{ fontSize: 12, color: theme.textDim, marginTop: 2 }}>{plan?.exercises?.length || 5} exercises · ~{plan?.workoutDuration || 40} min</div></div>
              <div style={{ background: "#1E1E1E", borderRadius: 8, padding: "4px 10px", fontSize: 12, color: theme.textMuted }}>{plan?.workoutDuration || 40} min</div>
            </div>
            {(plan?.exercises || []).slice(0, 5).map((ex, i, arr) => (
              <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: ".8rem 1.25rem", borderBottom: i < arr.length - 1 ? `0.5px solid #1A1A1A` : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: "#1E1E1E", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: theme.textDim, fontWeight: 500, flexShrink: 0 }}>{i + 1}</div>
                  <div><div style={{ fontSize: 14, color: "#D0D0D0" }}>{ex.name}</div><div style={{ fontSize: 12, color: theme.textDim, marginTop: 2 }}>{ex.weight} lbs · {ex.reps} reps</div></div>
                </div>
                <div style={{ fontSize: 12, color: theme.textMuted, background: "#1A1A1A", borderRadius: 6, padding: "3px 8px" }}>{ex.sets} sets</div>
              </div>
            ))}
        </div>
      </div>
      <div style={{ padding: "1.25rem" }}>
        <button onClick={() => navigate("home")} style={{ width: "100%", background: a, color: "#0A1F1D", border: "none", borderRadius: 14, padding: "1rem", fontSize: 16, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Go to dashboard →</button>
      </div>
    </Layout>
  );
}

function HomeDashboardScreen() {
  const { navigate, user, plan, gymBranding, historicalData, supabaseUser } = useApp();
  const a = gymBranding.accent;
  // Read today's logged calories from MealScreen's localStorage (new v2 flat-entry format)
  const calGoal = plan?.calories || 1800;
  const todayNutritionKey = `morphiq_meals_v2_${supabaseUser?.id || user?.id || "anon"}_${localDateStr()}`;
  const todayNutritionCals = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(todayNutritionKey) || "[]");
      // v2 format: flat array of {id, name, cal, protein, carbs, fat, loggedAt}
      return saved.reduce((sum, e) => sum + (e.cal || 0), 0);
    } catch { return 0; }
  })();
  const cals = todayNutritionCals;
  const h = new Date().getHours();
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const sL = theme.sL;

  // With the new freeform meal log, there are no fixed meal slots.
  // nextMeal is simplified — just a nudge to log food if nothing logged yet.
  const nextMeal = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(todayNutritionKey) || "[]");
      if (saved.length === 0) return { label: "Food log", name: "Nothing logged yet — tap Meals to add", cal: 0, protein: 0 };
      return null; // already logging — no nudge needed
    } catch { return null; }
  })();

  // Weekly workout queue — resets every Monday, stored in localStorage
  const getWeekKey = () => {
    const now = new Date();
    const day = now.getDay(); // 0=Sun,1=Mon,...
    const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday of this week
    const monday = new Date(now.setDate(diff));
    return `morphiq_week_${monday.toISOString().slice(0,10)}`;
  };
  const weekKey = getWeekKey();
  const weeklyTarget = plan?.daysPerWeek ?? 3;
  const weeklyDone = parseInt(localStorage.getItem(weekKey) || "0", 10);
  const allDone = weeklyDone >= weeklyTarget;
  const weekNum = plan?.weekNumber ?? 1;
  // For custom multi-day plans, show the upcoming day's name and exercises
  const getUpcomingDayData = () => {
    if (plan?.isCustomPlan && Array.isArray(plan?.customDays) && plan.customDays.length > 1) {
      try {
        const now = new Date();
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(now); monday.setDate(diff);
        const wk = `morphiq_week_${monday.toISOString().slice(0, 10)}`;
        const done = parseInt(localStorage.getItem(wk) || "0", 10);
        const dayIdx = done % plan.customDays.length;
        return plan.customDays[dayIdx];
      } catch { return null; }
    }
    return null;
  };
  const upcomingDay = getUpcomingDayData();
  const workoutType = upcomingDay ? upcomingDay.dayLabel : (plan?.workoutType || "Full Body");
  const upcomingExercises = upcomingDay ? upcomingDay.exercises : plan?.exercises;
  const exerciseCount = upcomingExercises?.length ?? 5;
  const workoutDuration = Math.round(exerciseCount * 8);

  // Real historical values — fall back to placeholders until data loads
  const streak = historicalData?.streak ?? "—";
  const totalWorkouts = historicalData?.totalWorkouts ?? "—";
  const weightChange = historicalData?.weightChange;
  const lastSession = historicalData?.lastSession;
  const weightChangeLabel = weightChange !== null && weightChange !== undefined
    ? (parseFloat(weightChange) <= 0 ? `${weightChange} lbs` : `+${weightChange} lbs`)
    : "—";

  // AI coach message — generated by Claude once per day, cached in localStorage
  // Cache key includes userId + today's date so it refreshes each day automatically
  const coachNoteKey = `morphiq_coach_note_${supabaseUser?.id || "anon"}_${localDateStr()}`;
  const [coachMsg, setCoachMsg] = useState(() => {
    // On first render, try to load from today's cache immediately (no flash)
    try {
      const cached = localStorage.getItem(coachNoteKey);
      if (cached) return cached;
    } catch {}
    // Fallback while AI loads — plain greeting so card isn't empty
    const h2 = new Date().getHours();
    const g = h2 < 12 ? "Good morning" : h2 < 17 ? "Good afternoon" : "Good evening";
    return `${g}, ${user.name || "there"}.`;
  });
  const [coachLoading, setCoachLoading] = useState(false);

  function refreshCoachNote() {
    // Clear today's cache and fetch a fresh message
    try { localStorage.removeItem(coachNoteKey); } catch {}
    setCoachLoading(true);
    const allLogsR = historicalData?.workoutLogs || [];
    const lastDateR = lastSession;
    const lastLogsR = lastDateR ? allLogsR.filter(r => r.workout_date === lastDateR) : [];
    const seenR = {};
    for (const row of lastLogsR) {
      const name = row.exercise_name;
      if (!seenR[name] || (row.weight || 0) >= seenR[name].weight) {
        seenR[name] = { name, weight: row.weight || 0, reps: row.reps || 0 };
      }
    }
    const exSummaryR = Object.values(seenR).map(ex =>
      ex.weight > 0 ? `${ex.name}: ${ex.weight}lbs × ${ex.reps} reps` : `${ex.name}: ${ex.reps} reps`
    );
    fetch("/api/coach-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: user.name,
        goal: user.goal,
        weeklyDone, weeklyTarget, streak, totalWorkouts,
        weightChange, lastSession, weekNumber: weekNum, allDone,
        seed: Math.floor(Math.random() * 10000),
        lastSessionExercises: exSummaryR,
        nextWorkoutExercises: plan?.exercises?.slice(0, 3).map(e => e.name).join(", ") || null,
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (data?.note) {
          setCoachMsg(data.note);
          try { localStorage.setItem(coachNoteKey, data.note); } catch {}
        }
      })
      .catch(() => {})
      .finally(() => setCoachLoading(false));
  }

  useEffect(() => {
    // If we already have today's cached note, nothing to do
    try {
      if (localStorage.getItem(coachNoteKey)) return;
    } catch {}
    // No cache — call the AI
    setCoachLoading(true);
    // Build a real summary of the last workout session from actual log data
    const allLogs = historicalData?.workoutLogs || [];
    const lastDate = lastSession; // most recent workout date string
    const lastSessionLogs = lastDate
      ? allLogs.filter(r => r.workout_date === lastDate)
      : [];
    // Summarise: unique exercises with best set (highest weight × reps)
    const exerciseSummary = [];
    const seen = {};
    for (const row of lastSessionLogs) {
      const name = row.exercise_name;
      if (!seen[name]) {
        seen[name] = { name, weight: row.weight || 0, reps: row.reps || 0 };
      } else if ((row.weight || 0) >= seen[name].weight) {
        seen[name] = { name, weight: row.weight || 0, reps: row.reps || 0 };
      }
    }
    for (const ex of Object.values(seen)) {
      exerciseSummary.push(ex.weight > 0
        ? `${ex.name}: ${ex.weight}lbs × ${ex.reps} reps`
        : `${ex.name}: ${ex.reps} reps`);
    }

    // Next planned workout — first day in plan that isn't today
    const nextWorkout = plan?.exercises?.slice(0, 3).map(e => e.name).join(", ") || null;

    fetch("/api/coach-note", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: user.name,
        goal: user.goal,
        weeklyDone,
        weeklyTarget,
        streak,
        totalWorkouts,
        weightChange,
        lastSession,
        weekNumber: weekNum,
        allDone,
        seed: Math.floor(Math.random() * 10000),
        lastSessionExercises: exerciseSummary,
        nextWorkoutExercises: nextWorkout,
      }),
    })
      .then(r => r.json())
      .then(data => {
        if (data?.note) {
          setCoachMsg(data.note);
          try { localStorage.setItem(coachNoteKey, data.note); } catch {}
        }
      })
      .catch(() => {}) // silently keep fallback if API fails
      .finally(() => setCoachLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coachNoteKey]);

  // Gym messages — load once on mount
  const [gymMessages, setGymMessages] = useState([]);
  const [msgExpanded, setMsgExpanded] = useState(false);
  useEffect(() => {
    if (!supabaseUser?.id) return;
    sb.getProfileId(supabaseUser.id).then(profileId => {
      if (profileId) sb.getMessages(profileId).then(rows => setGymMessages(rows)).catch(() => {});
    }).catch(() => {});
  }, [supabaseUser?.id]);
  const unreadMessages = gymMessages.filter(m => !m.read);
  function dismissMessage(msg) {
    sb.markMessageRead(msg.id).catch(() => {});
    setGymMessages(prev => prev.map(m => m.id === msg.id ? { ...m, read: true } : m));
  }

  return (
    <Layout activeNav="home">
      <div style={{ margin: "1.5rem 1.25rem 0", background: theme.surface, border: `0.5px solid ${theme.border}`, borderRadius: 16, padding: "1rem 1.25rem", display: "flex", gap: 12, alignItems: "flex-start" }}>
        <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#1A2E2B", border: `1.5px solid ${a}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>🤖</div>
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div style={{ fontSize: 12, color: a, fontWeight: 500 }}>Your coach</div>
            <button onClick={refreshCoachNote} disabled={coachLoading}
              style={{ background: "none", border: "none", cursor: coachLoading ? "default" : "pointer", fontSize: 13, color: coachLoading ? "transparent" : "#6B7A8D", padding: 0, lineHeight: 1 }}
              title="Get a new message">↺</button>
          </div>
          <div style={{ fontSize: 14, color: "#C0C0C0", lineHeight: 1.55 }}>{coachLoading ? "..." : coachMsg}</div>
        </div>
      </div>
      {/* Gym messages notification card — only shown when there are unread messages */}
      {unreadMessages.length > 0 && (
        <div style={{ margin: "0.75rem 1.25rem 0" }}>
          <div style={{ background: theme.surface, border: `0.5px solid ${a}`, borderRadius: 16, overflow: "hidden" }}>
            <div
              onClick={() => setMsgExpanded(v => !v)}
              style={{ padding: "0.85rem 1.25rem", display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
            >
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(0,212,177,0.12)", border: `1.5px solid ${a}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>💬</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: a, fontWeight: 500 }}>Message from your gym</div>
                <div style={{ fontSize: 13, color: "#C0C0C0", marginTop: 2 }}>{unreadMessages.length} new message{unreadMessages.length > 1 ? "s" : ""}</div>
              </div>
              <div style={{ fontSize: 18, color: "#6B7A8D", transform: msgExpanded ? "rotate(90deg)" : "none", transition: "transform .2s" }}>›</div>
            </div>
            {msgExpanded && unreadMessages.map(msg => (
              <div key={msg.id} style={{ borderTop: "0.5px solid rgba(255,255,255,0.06)", padding: "0.85rem 1.25rem" }}>
                <div style={{ fontSize: 13, color: "#D0D0D0", lineHeight: 1.55, marginBottom: 10 }}>{msg.message}</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 11, color: "#6B7A8D" }}>{new Date(msg.sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                  <button
                    onClick={() => dismissMessage(msg)}
                    style={{ background: "transparent", border: `0.5px solid ${a}`, borderRadius: 8, padding: "4px 12px", fontSize: 12, color: a, cursor: "pointer", fontFamily: "inherit" }}
                  >Got it ✓</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div style={{ padding: "1.25rem 1.25rem 0" }}>
        <div style={sL}>Your next workout</div>
        <div style={{ background: theme.surface, border: `0.5px solid ${allDone ? theme.border : theme.border}`, borderRadius: 16, overflow: "hidden" }}>
          {allDone ? (
            <div style={{ padding: "1.5rem 1.25rem", textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🏆</div>
              <div style={{ fontSize: 18, fontWeight: 500, color: a, marginBottom: 6 }}>Week complete!</div>
              <div style={{ fontSize: 14, color: theme.textDim, marginBottom: 4 }}>You finished all {weeklyTarget} workouts this week.</div>
              <div style={{ fontSize: 13, color: theme.textMuted }}>New workouts unlock on Monday.</div>
            </div>
          ) : (
            <>
              <div style={{ padding: "1.1rem 1.25rem", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 500, color: "#F0F0F0" }}>Week {weekNum} · {workoutType}</div>
                  <div style={{ fontSize: 13, color: theme.textDim, marginTop: 4 }}>{exerciseCount} exercises · ~{workoutDuration} min</div>
                </div>
                <div style={{ background: "rgba(0,212,177,0.1)", border: "0.5px solid rgba(0,212,177,0.25)", borderRadius: 8, padding: "4px 10px", fontSize: 12, color: a, fontWeight: 500 }}>{workoutType}</div>
              </div>
              <div style={{ padding: "0 1.25rem .9rem" }}>
                <div style={{ height: 4, background: "#1A1A1A", borderRadius: 2, marginBottom: 6 }}>
                  <div style={{ height: 4, borderRadius: 2, background: a, width: `${Math.round((weeklyDone / weeklyTarget) * 100)}%`, transition: "width .5s" }} />
                </div>
                <div style={{ fontSize: 12, color: theme.textDim }}>{weeklyDone} of {weeklyTarget} workouts done this week</div>
              </div>
              {upcomingExercises?.length > 0 && (
                <div style={{ padding: "0 1.25rem .75rem", display: "flex", flexDirection: "column", gap: 6 }}>
                  {upcomingExercises.slice(0, 5).map((ex, idx) => (
                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(0,212,177,0.1)", border: `0.5px solid rgba(0,212,177,0.3)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: a, fontWeight: 600, flexShrink: 0 }}>{idx + 1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: "#F0F0F0" }}>{ex.name}</div>
                        <div style={{ fontSize: 11, color: theme.textDim, marginTop: 1 }}>{ex.muscle}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 13, color: a, fontWeight: 500 }}>{ex.sets} × {ex.reps}</div>
                        {ex.weight && <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 1 }}>{ex.weight} lbs</div>}
                      </div>
                    </div>
                  ))}
                  {upcomingExercises.length > 5 && (
                    <div style={{ fontSize: 12, color: theme.textMuted, paddingLeft: 34 }}>+{plan.exercises.length - 5} more exercises</div>
                  )}
                </div>
              )}
              <div style={{ padding: "0 1.25rem 1.25rem" }}>
                <button onClick={() => navigate("workout")} style={{ width: "100%", background: a, color: "#0A1F1D", border: "none", borderRadius: 12, padding: ".85rem", fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                  Start workout →
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <div style={{ padding: "1.25rem 1.25rem 0" }}>
        <div style={sL}>Your progress</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,minmax(0,1fr))", gap: 8 }}>
          {[
            [`${weeklyDone}/${weeklyTarget}`, "This week", weeklyDone >= weeklyTarget ? a : null],
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
          {nextMeal ? (
            <div style={{ padding: ".75rem 1.25rem", borderTop: `0.5px solid ${theme.borderSubtle}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 2 }}>Next suggested meal</div>
                <div style={{ fontSize: 14, color: "#D0D0D0", fontWeight: 500 }}>{nextMeal.name}</div>
                <div style={{ fontSize: 12, color: theme.textDim }}>{nextMeal.cal} cal · {nextMeal.protein}g protein</div>
              </div>
              <button onClick={() => navigate("meals")} style={{ background: "transparent", border: `0.5px solid ${a}`, borderRadius: 8, padding: "5px 12px", fontSize: 12, color: a, cursor: "pointer", fontFamily: "inherit" }}>
                Log meal →
              </button>
            </div>
          ) : (
            <div style={{ padding: ".75rem 1.25rem", borderTop: `0.5px solid ${theme.borderSubtle}`, textAlign: "center" }}>
              <div style={{ fontSize: 13, color: a, fontWeight: 500 }}>All meals logged today 🎉</div>
              <div style={{ fontSize: 12, color: theme.textDim, marginTop: 3 }}>Great job hitting your nutrition targets.</div>
            </div>
          )}
        </div>
      </div>

    </Layout>
  );
}

function ProfileScreen() {
  const { navigate, user, setUser, plan, setPlan, gymBranding, signOut, supabaseUser } = useApp();
  const a = gymBranding.accent;
  const sL = theme.sL;

  // Edit state for each editable field
  const [editGoal, setEditGoal]         = useState(false);
  const [editDays, setEditDays]         = useState(false);
  const [editEquip, setEditEquip]       = useState(false);
  const [saving, setSaving]             = useState(false);
  const [savedMsg, setSavedMsg]         = useState("");

  // Local selections — initialised from live data
  const [selectedGoal,  setSelectedGoal]  = useState(user.goal || "lose_fat");
  const [selectedDays,  setSelectedDays]  = useState(user.daysPerWeek || plan?.daysPerWeek || 3);
  const [selectedEquip, setSelectedEquip] = useState(user.equipment || "dumbbell");

  const goalLabel  = GOAL_OPTIONS.find(g => g.id === selectedGoal)?.label  || "Lose fat";
  const equipLabel = EQUIPMENT_OPTIONS.find(e => e.id === selectedEquip)?.label || "Dumbbells";

  // Shared save function — rebuilds plan from scratch, keeps all history/streaks untouched
  async function saveChanges(newGoal, newDays, newEquip) {
    setSaving(true);
    const updatedUser = { ...user, goal: newGoal, daysPerWeek: newDays, equipment: newEquip };
    const newPlan = buildPlan(updatedUser);
    // Preserve week tracking so streak isn't lost
    newPlan.weekNumber    = plan?.weekNumber    || 1;
    newPlan.weekStartDate = plan?.weekStartDate || new Date().toISOString().split("T")[0];
    setUser(updatedUser);
    setPlan(newPlan);
    // Fire-and-forget save to Supabase — never blocks the UI
    if (supabaseUser?.id) {
      sb.upsertProfile(supabaseUser.id, updatedUser, newPlan).catch(() => {});
    }
    setSaving(false);
    setSavedMsg("Plan updated ✓");
    setTimeout(() => setSavedMsg(""), 3000);
  }

  const StatRow = ({ label, value, sub }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <div>
        <div style={{ fontSize: 13, color: theme.text }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: theme.textDim, marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: a }}>{value}</div>
    </div>
  );

  const EditBtn = ({ onClick }) => (
    <button onClick={onClick} style={{ background: "#003D35", border: `1px solid rgba(0,212,177,0.3)`, borderRadius: 8, padding: "5px 12px", fontSize: 11, color: a, cursor: "pointer", fontFamily: "inherit" }}>Change</button>
  );

  const SaveCancelRow = ({ onSave, onCancel }) => (
    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
      <button onClick={onCancel} style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px", fontSize: 12, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
      <button onClick={onSave} disabled={saving} style={{ flex: 2, background: a, border: "none", borderRadius: 10, padding: "8px", fontSize: 12, fontWeight: 600, color: "#003D35", cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>
        {saving ? "Saving…" : "Save & rebuild plan"}
      </button>
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

        {/* Saved confirmation banner */}
        {savedMsg && (
          <div style={{ background: "#003D35", border: `1px solid rgba(0,212,177,0.4)`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: a, textAlign: "center" }}>
            {savedMsg}
          </div>
        )}

        {/* ── Goal ── */}
        <div style={sL}>Your Goal</div>
        <div style={{ background: "#1A2332", borderRadius: 14, padding: "12px 14px", marginBottom: 16 }}>
          {!editGoal ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: theme.text }}>{goalLabel}</div>
                <div style={{ fontSize: 12, color: theme.textDim, marginTop: 2 }}>{selectedDays} workouts/week</div>
              </div>
              <EditBtn onClick={() => setEditGoal(true)} />
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 10 }}>Choose new goal:</div>
              {GOAL_OPTIONS.map(g => (
                <button key={g.id} onClick={() => setSelectedGoal(g.id)}
                  style={{ width: "100%", background: selectedGoal === g.id ? "#003D35" : "transparent", border: `1px solid ${selectedGoal === g.id ? a : "rgba(255,255,255,0.08)"}`, borderRadius: 10, padding: "9px 10px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 6, fontFamily: "inherit", textAlign: "left" }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: selectedGoal === g.id ? a : theme.text }}>{g.label}</span>
                  {g.sub && <span style={{ fontSize: 11, color: theme.textDim, marginLeft: "auto" }}>{g.sub}</span>}
                </button>
              ))}
              <SaveCancelRow
                onCancel={() => { setEditGoal(false); setSelectedGoal(user.goal || "lose_fat"); }}
                onSave={() => { setEditGoal(false); saveChanges(selectedGoal, selectedDays, selectedEquip); }}
              />
            </div>
          )}
        </div>

        {/* ── Days per week ── */}
        <div style={sL}>Workouts per Week</div>
        <div style={{ background: "#1A2332", borderRadius: 14, padding: "12px 14px", marginBottom: 16 }}>
          {!editDays ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: theme.text }}>{selectedDays} days/week</div>
                <div style={{ fontSize: 12, color: theme.textDim, marginTop: 2 }}>~{Math.round((plan?.exercises?.length || 5) * 8)} min per session</div>
              </div>
              <EditBtn onClick={() => setEditDays(true)} />
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 10 }}>How many days per week?</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                {[2, 3, 4, 5].map(d => (
                  <button key={d} onClick={() => setSelectedDays(d)}
                    style={{ flex: 1, background: selectedDays === d ? "#003D35" : "transparent", border: `1px solid ${selectedDays === d ? a : "rgba(255,255,255,0.1)"}`, borderRadius: 10, padding: "10px 4px", fontSize: 16, fontWeight: 700, color: selectedDays === d ? a : theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>
                    {d}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: theme.textDim, textAlign: "center", marginBottom: 4 }}>days per week</div>
              <SaveCancelRow
                onCancel={() => { setEditDays(false); setSelectedDays(user.daysPerWeek || 3); }}
                onSave={() => { setEditDays(false); saveChanges(selectedGoal, selectedDays, selectedEquip); }}
              />
            </div>
          )}
        </div>

        {/* ── Equipment ── */}
        <div style={sL}>Equipment</div>
        <div style={{ background: "#1A2332", borderRadius: 14, padding: "12px 14px", marginBottom: 16 }}>
          {!editEquip ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: theme.text }}>{equipLabel}</div>
                <div style={{ fontSize: 12, color: theme.textDim, marginTop: 2 }}>{EQUIPMENT_OPTIONS.find(e => e.id === selectedEquip)?.sub || ""}</div>
              </div>
              <EditBtn onClick={() => setEditEquip(true)} />
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 10 }}>What equipment do you have?</div>
              {EQUIPMENT_OPTIONS.map(e => (
                <button key={e.id} onClick={() => setSelectedEquip(e.id)}
                  style={{ width: "100%", background: selectedEquip === e.id ? "#003D35" : "transparent", border: `1px solid ${selectedEquip === e.id ? a : "rgba(255,255,255,0.08)"}`, borderRadius: 10, padding: "9px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: 6, fontFamily: "inherit" }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: selectedEquip === e.id ? a : theme.text }}>{e.label}</span>
                  <span style={{ fontSize: 11, color: theme.textDim }}>{e.sub}</span>
                </button>
              ))}
              <SaveCancelRow
                onCancel={() => { setEditEquip(false); setSelectedEquip(user.equipment || "dumbbell"); }}
                onSave={() => { setEditEquip(false); saveChanges(selectedGoal, selectedDays, selectedEquip); }}
              />
            </div>
          )}
        </div>

        {/* Body stats — read-only */}
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

        {/* Injuries */}
        <div style={sL}>Injuries / Notes</div>
        <div style={{ background: "#1A2332", borderRadius: 14, padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: user.injuries ? theme.text : theme.textDim }}>{user.injuries || "None noted"}</div>
          <div style={{ fontSize: 11, color: theme.textDim, marginTop: 4 }}>Tell the AI trainer in chat to update these</div>
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

function LoadingScreen() {
  return (
    <Layout>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
        <Spinner />
        <div style={{ fontSize: 13, color: theme.textDim }}>Loading...</div>
      </div>
    </Layout>
  );
}

function NetworkErrorScreen() {
  const { navigate } = useApp();
  return (
    <Layout>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 16, padding: "0 32px", textAlign: "center" }}>
        <div style={{ fontSize: 40 }}>📶</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: theme.text }}>Connection issue</div>
        <div style={{ fontSize: 14, color: theme.textMuted, lineHeight: 1.6 }}>
          We couldn't confirm your data saved — could be a connection issue or a brief server hiccup. You're still logged in — just tap retry.
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{ background: theme.accent, color: "#003D35", border: "none", borderRadius: 12, padding: "14px 32px", fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 8 }}
        >
          Retry
        </button>
        <button
          onClick={() => navigate("auth")}
          style={{ background: "transparent", color: theme.textDim, border: "none", fontSize: 13, cursor: "pointer" }}
        >
          Use a different account
        </button>
      </div>
    </Layout>
  );
}


function AppRouter() {
  const { screen } = useApp();
  if (screen === "auth") return <AuthScreen />;
  if (screen === "gym_signup") return <GymSignupScreen />;
  if (screen === "network_error") return <NetworkErrorScreen />;
  if (screen === "loading") return <LoadingScreen />;
  if (screen === "onboarding") return <OnboardingScreen />;
  if (screen === "plan") return <PlanOverviewScreen />;
  if (screen === "workout") return <WorkoutScreen />;
  if (screen === "custom_plan") return <CustomPlanScreen />;
  if (screen === "meals") return <MealPlanScreen />;
  if (screen === "progress") return <ProgressScreen />;
  if (screen === "profile") return <ProfileScreen />;
  if (screen === "owner") return <GymOwnerDashboard />;
  if (screen === "super_admin") return <SuperAdminDashboard />;
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

