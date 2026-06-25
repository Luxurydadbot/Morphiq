import { createContext, useContext, useState, useEffect, useRef } from "react";
import { WorkoutScreen } from "./WorkoutScreen.jsx";
import { MealPlanScreen } from "./MealScreen.jsx";
import { GymOwnerDashboard, PricingScreen } from "./GymOwnerDashboard.jsx";

const SUPABASE_URL  = "https://uvnyjegmhsztdednjclb.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2bnlqZWdtaHN6dGRlZG5qY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTgwMjcsImV4cCI6MjA5NDI5NDAyN30.-hMNwCO-GymvbiyAKer6Q5AjDbDZl6GhXmSTmr5bY04";
// Returns auth headers — uses the user's real access token if available, falls back to anon key.
// This fixes 401 errors on profile/workout writes caused by RLS policies requiring a real user session.
function getAuthToken() {
  try { return localStorage.getItem("mq_access_token") || SUPABASE_ANON; } catch { return SUPABASE_ANON; }
}
function SB_HEADERS() { const t = getAuthToken(); return { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${t}`, "Content-Type": "application/json" }; }
function SB_GET() { const t = getAuthToken(); return { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${t}` }; }

// Performs a Supabase REST request and, if the user's access token has gone
// stale (HTTP 401/403), renews the session ONCE and retries the same request
// with fresh headers, then gives up. buildOpts() must rebuild its headers via
// SB_HEADERS() each call so the retry picks up the freshly renewed token.
// Prevents silent save failures (lost workouts/meals/weights/profile) when an
// access token expires mid-session. (Thing 2 — June 2026 token-refresh hardening.)
async function sbFetchRetry(url, buildOpts) {
  let res = await fetch(url, buildOpts());
  if (res.status === 401 || res.status === 403) {
    const renewed = await sb.refreshSession();
    if (renewed === true) res = await fetch(url, buildOpts());
  }
  return res;
}

// Returns today's date as YYYY-MM-DD in the USER'S LOCAL timezone (not UTC).
// Using toISOString() here was a bug: it returns the UTC date, so the meal
// "day" rolled over in the early evening (UTC midnight) instead of local
// midnight. This helper makes the day turn over at the member's real midnight.
function localDateStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

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
      // Store the access token so authenticated DB writes work (fixes 401 on profile/workout saves)
      try { localStorage.setItem("mq_access_token", accessToken); } catch {}
      // Store the refresh token so the session can be renewed on reopen (access tokens expire ~1hr).
      try { if (data.refresh_token) localStorage.setItem("mq_refresh_token", data.refresh_token); } catch {}
      return { uid: payload.sub, email: payload.email || email };
    } catch { return null; }
  },

  // Exchanges the stored refresh token for a fresh access token. Supabase access
  // tokens expire after ~1 hour; we call this on app open so authenticated reads
  // (workouts, weight, etc.) don't fail with an expired token after the app has
  // been closed overnight. Returns true if a new token was obtained. (Fix: "stats
  // reset to zero on reopen" — expired token was rejected by RLS on reads.)
  //
  // RACE-CONDITION FIX (June 2026): Supabase refresh tokens are SINGLE-USE — once
  // exchanged, the old refresh token is permanently dead. Several places in this app
  // fire multiple Supabase requests back-to-back (e.g. signIn() calls both
  // loadHistoricalData() and checkAndGenerateNextWeek() at once, each making their own
  // calls). If the access token is stale at that moment, EACH of those requests
  // independently sees a 401 and independently calls refreshSession(). The first one
  // to reach Supabase wins and gets a new token pair; every other one is still holding
  // the now-burned old refresh token, so ITS refresh attempt is correctly rejected by
  // Supabase — and that caller then reports a false 401/NO_PROFILE_ID even though the
  // session is actually fine. This is the confirmed cause of the intermittent
  // NO_PROFILE_ID(HTTP_401) bug (see MORPHIQ_HANDOFF.md). The fix: track ONE shared
  // in-flight refresh. If a refresh is already happening when this is called again,
  // every caller awaits that SAME promise instead of starting a second, competing
  // refresh. Do NOT remove this sharing — without it the race comes back.
  _refreshInFlight: null,
  async refreshSession() {
    if (this._refreshInFlight) return this._refreshInFlight;
    this._refreshInFlight = this._doRefreshSession();
    try {
      return await this._refreshInFlight;
    } finally {
      this._refreshInFlight = null;
    }
  },
  async _doRefreshSession() {
    try {
      const rt = localStorage.getItem("mq_refresh_token");
      if (!rt) return false;
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: "POST",
        headers: { "apikey": SUPABASE_ANON, "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (!res.ok) {
        // Distinguish a dead session from a transient hiccup. A 4xx means the server
        // explicitly rejected the refresh token (expired / already used) — the session
        // is truly dead, so signal "expired" and the app will force a clean re-login.
        // A 5xx (or network error in the catch below) is transient — return false so we
        // keep the session and don't log the user out over a blip.
        // (Fix: June 2026 stuck-token / "workouts show zero on reopen" bug.)
        return res.status >= 400 && res.status < 500 ? "expired" : false;
      }
      const data = await res.json();
      if (data?.access_token) {
        try { localStorage.setItem("mq_access_token", data.access_token); } catch {}
        if (data.refresh_token) { try { localStorage.setItem("mq_refresh_token", data.refresh_token); } catch {} }
        return true;
      }
      return false;
    } catch { return false; }
  },

  // ── PROFILES ──────────────────────────────────────────────────────────────
  async getProfile(supabaseUserId) {
    try {
      const res = await sbFetchRetry(
        `${SUPABASE_URL}/rest/v1/profiles?supabase_user_id=eq.${encodeURIComponent(supabaseUserId)}&limit=1`,
        () => ({ headers: SB_GET() })
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
        plan: planData,
        week_number: planData?.weekNumber || 1,
        week_start_date: planData?.weekStartDate || new Date().toISOString().split('T')[0],
        equipment: userData.equipment || "",
        training_history: userData.trainingHistory || "",
        updated_at: new Date().toISOString(),
      };
      // Update-in-place if a profile already exists for this account.
      // Why this fix is here: a plain POST always inserted a NEW row with a fresh
      // auto-generated id, creating duplicate profiles and ORPHANING the user's
      // workout/meal/weight logs that still pointed at the old profile id (this is
      // what caused the "no sessions on Progress" bug). We now look up the existing
      // row by supabase_user_id and PATCH it by id, so the id stays stable and all
      // child data stays linked. Do NOT revert this to a plain insert-only POST.
      const existingId = await this.getProfileId(supabaseUserId);
      if (existingId) {
        const res = await sbFetchRetry(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${existingId}`, () => ({
          method: "PATCH",
          headers: SB_HEADERS(),
          body: JSON.stringify(body),
        }));
        return res.ok;
      }
      const res = await sbFetchRetry(`${SUPABASE_URL}/rest/v1/profiles`, () => ({
        method: "POST",
        headers: SB_HEADERS(),
        body: JSON.stringify(body),
      }));
      return res.ok;
    } catch { return false; }
  },

  // ── HELPERS ───────────────────────────────────────────────────────────────
  // Resolves supabase_user_id → profiles.id (UUID used as FK in workout/meal logs)
  async getProfileId(supabaseUserId) {
    try {
      // Fix (June 2026): the narrow "select=id" query was being rejected with HTTP 401
      // by Supabase's row-level security even though the EXACT SAME row, with the EXACT
      // SAME token, succeeds when no select= column list is given (see getProfile above,
      // which uses no select= and works). This was confirmed live: getProfile -> 200,
      // getProfileId -> 401, same uid, same token, same row. Dropping select=id and
      // reading the full row instead avoids whatever RLS rule is column-shape-sensitive.
      // Do NOT re-add select=id here without re-testing against live RLS.
      const res = await sbFetchRetry(
        `${SUPABASE_URL}/rest/v1/profiles?supabase_user_id=eq.${encodeURIComponent(supabaseUserId)}&limit=1`,
        () => ({ headers: SB_GET() })
      );
      // TEMP DIAGNOSTIC (June 2026) — stash the real outcome on a module-level var so
      // callers (insertWorkoutLog etc.) can report the EXACT cause instead of a flat
      // null. _lastProfileIdDebug is overwritten on every call — read it immediately
      // after awaiting getProfileId, before any other sb call runs. Remove once fixed.
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        sb._lastProfileIdDebug = "HTTP_" + res.status;
        console.error("[Morphiq] getProfileId: request failed", res.status, body);
        return null;
      }
      const rows = await res.json();
      if (!rows?.[0]?.id) {
        sb._lastProfileIdDebug = "ZERO_ROWS";
        return null;
      }
      sb._lastProfileIdDebug = "OK";
      return rows[0].id;
    } catch (e) {
      sb._lastProfileIdDebug = "THROW_" + (e?.message || e);
      console.error("[Morphiq] getProfileId threw:", e);
      return null;
    }
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
        headers: { ...SB_HEADERS(), "Prefer": "resolution=merge-duplicates" },
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
      // Retry once after 1s — handles transient network blip at sign-in
      if (!profileId) {
        await new Promise(r => setTimeout(r, 1000));
        profileId = await this.getProfileId(supabaseUserId);
      }
      // TEMP DIAGNOSTIC (June 2026) — workouts stuck on "Saving..." forever with no
      // visible cause. Report WHY instead of a silent false so the failure reason
      // shows up in the UI/console instead of disappearing. Remove once fixed.
      if (!profileId) {
        const why = sb._lastProfileIdDebug || "UNKNOWN";
        console.error("[Morphiq] insertWorkoutLog: no profileId found for", supabaseUserId, "reason:", why);
        return "NO_PROFILE_ID(" + why + ")";
      }
      const body = { user_id: profileId, exercise_name: exerciseName, set_number: setNumber, reps, weight, workout_date: localDateStr() };
      const res = await sbFetchRetry(`${SUPABASE_URL}/rest/v1/workout_logs`, () => ({
        method: "POST",
        headers: SB_HEADERS(),
        body: JSON.stringify(body),
      }));
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        console.error("[Morphiq] insertWorkoutLog: insert failed", res.status, errBody);
        return "HTTP_" + res.status;
      }
      return true;
    } catch (e) { console.error("[Morphiq] insertWorkoutLog threw:", e); return "EXCEPTION"; }
  },

  // Fetch recent workout logs for the progress screen
  async getWorkoutLogs(supabaseUserId, limit = 20) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return [];
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/workout_logs?user_id=eq.${profileId}&order=logged_at.desc&limit=${limit}`,
        { headers: SB_GET() }
      );
      return await res.json();
    } catch { return []; }
  },

  // ── MEAL LOGS ─────────────────────────────────────────────────────────────
  async insertMealLog(supabaseUserId, { mealId, status, loggedName, loggedCal, loggedProtein, loggedCarbs, loggedFat }) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return false;
      const res = await sbFetchRetry(`${SUPABASE_URL}/rest/v1/meal_logs`, () => ({
        method: "POST",
        headers: SB_HEADERS(),
        body: JSON.stringify({
          user_id: profileId,
          meal_id: mealId,
          date: localDateStr(),
          status,
          logged_name: loggedName,
          logged_cal: loggedCal,
          logged_protein: loggedProtein,
          logged_carbs: loggedCarbs ?? 0,
          logged_fat: loggedFat ?? 0,
        }),
      }));
      return res.ok;
    } catch { return false; }
  },

  // Fetch today's meal logs so the Meals screen can restore status across
  // devices/sessions, not just from localStorage on the same browser.
  // Returns a map of meal_id -> { status, logged_name, logged_cal, logged_protein, logged_at }
  // using only the most recent row per meal_id (handles edits creating multiple rows).
  async getMealLogsForDate(supabaseUserId, date) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return {};
      const targetDate = date || localDateStr();
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/meal_logs?user_id=eq.${profileId}&date=eq.${targetDate}&order=id.desc`,
        { headers: SB_GET() }
      );
      if (!res.ok) return {};
      const rows = await res.json();
      const byMeal = {};
      for (const row of rows) {
        // rows are newest-first (order=id.desc) — keep only the first (latest) per meal_id
        if (!byMeal[row.meal_id]) byMeal[row.meal_id] = row;
      }
      return byMeal;
    } catch { return {}; }
  },

  // ── GYM OWNER LOOKUP ─────────────────────────────────────────────────────
  async getGymByOwnerEmail(email) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/gyms?owner_email=eq.${encodeURIComponent(email.toLowerCase())}&limit=1`,
        { headers: SB_GET() }
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
        { headers: SB_GET() }
      );
      const rows = await res.json();
      return rows?.[0] || null;
    } catch { return null; }
  },

  async saveGymBranding(gymId = "demo-gym", { name, accent, welcome }) {
    try {
      // PATCH targets the specific existing row by gym_id — correct way to update
      const res = await fetch(`${SUPABASE_URL}/rest/v1/gyms?gym_id=eq.${encodeURIComponent(gymId)}`, {
        method: "PATCH",
        headers: { ...SB_HEADERS(), "Prefer": "return=representation" },
        body: JSON.stringify({ name, accent, welcome, updated_at: new Date().toISOString() }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "no body");
        console.error("saveGymBranding PATCH failed:", res.status, errText, "gymId:", gymId);
      }
      return res.ok;
    } catch (e) { console.error("saveGymBranding exception:", e); return false; }
  },

  // ── WEIGHT LOGS ───────────────────────────────────────────────────────────
  async insertWeightLog(supabaseUserId, weightLbs) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return false;
      const res = await sbFetchRetry(`${SUPABASE_URL}/rest/v1/weight_logs`, () => ({
        method: "POST",
        headers: SB_HEADERS(),
        body: JSON.stringify({
          user_id: profileId,
          weight_lbs: weightLbs,
          logged_date: new Date().toISOString().slice(0, 10),
          logged_at: new Date().toISOString(),
        }),
      }));
      return res.ok;
    } catch { return false; }
  },

  async getWeightLogs(supabaseUserId, limit = 12) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return [];
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/weight_logs?user_id=eq.${profileId}&order=logged_date.asc&limit=${limit}`,
        { headers: SB_GET() }
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
        { headers: SB_GET() }
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
        { headers: SB_GET() }
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
        { headers: SB_GET() }
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
        { headers: SB_GET() }
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

  // ── GYM MESSAGES ─────────────────────────────────────────────────────────
  async saveMessage(gymId, profileId, text) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/gym_messages`, {
        method: "POST",
        headers: SB_HEADERS(),
        body: JSON.stringify({
          gym_id: gymId,
          profile_id: profileId,
          message: text,
          read: false,
          sent_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "no body");
        console.error("saveMessage failed:", res.status, errText);
      }
      return res.ok;
    } catch (e) { console.error("saveMessage exception:", e); return false; }
  },

  async getMessages(profileId) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/gym_messages?profile_id=eq.${encodeURIComponent(profileId)}&order=sent_at.desc&limit=10`,
        { headers: SB_GET() }
      );
      const rows = await res.json();
      return Array.isArray(rows) ? rows : [];
    } catch { return []; }
  },

  async markMessageRead(messageId) {
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/gym_messages?id=eq.${messageId}`, {
        method: "PATCH",
        headers: SB_HEADERS(),
        body: JSON.stringify({ read: true }),
      });
    } catch { /* fire and forget */ }
  },

  // Sends a message to every member of a gym in parallel.
  // Returns { sent, failed } counts so the UI can show a summary.
  async broadcastMessage(gymId, profileIds, text) {
    const sentAt = new Date().toISOString();
    const results = await Promise.allSettled(
      profileIds.map(profileId =>
        fetch(`${SUPABASE_URL}/rest/v1/gym_messages`, {
          method: "POST",
          headers: SB_HEADERS(),
          body: JSON.stringify({ gym_id: gymId, profile_id: profileId, message: text, read: false, sent_at: sentAt }),
        }).then(r => r.ok ? "ok" : "fail")
      )
    );
    const sent   = results.filter(r => r.status === "fulfilled" && r.value === "ok").length;
    const failed = results.length - sent;
    return { sent, failed };
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

const AppContext = createContext(null);
const useApp = () => useContext(AppContext);

const DEFAULT_USER = { name: "", goal: null, sex: null, height: "", weight: "", age: "", unit: "imperial" };
// ═══════════════════════════════════════════════════════════════════
// EXERCISE LIBRARY — every exercise the app will ever assign.
// Claude never invents exercises. All workout generation is code-only.
// ═══════════════════════════════════════════════════════════════════
const EXERCISE_LIBRARY = {
  barbell: {
    squat:     { name: "Barbell back squat",        variation: "Barbell front squat",          muscle: "Quads / Glutes",       pattern: "squat" },
    hinge:     { name: "Barbell Romanian deadlift", variation: "Trap bar deadlift",            muscle: "Hamstrings / Glutes",  pattern: "hinge" },
    push:      { name: "Barbell bench press",       variation: "Barbell incline bench press",  muscle: "Chest / Shoulders",    pattern: "push"  },
    pull:      { name: "Barbell bent over row",     variation: "Chest-supported DB row",       muscle: "Back / Biceps",        pattern: "pull"  },
    accessory: { name: "Barbell overhead press",    variation: "Landmine press",               muscle: "Shoulders",            pattern: "accessory" },
    finisher:  { name: "Barbell complex",           variation: "Kettlebell swings x30",        muscle: "Full body",            pattern: "accessory" },
    core:      { name: "Farmers carry",             variation: "Pallof press",                 muscle: "Core / Grip",          pattern: "accessory" },
    // Injury swaps
    squat_knee:     { name: "Goblet squat",              muscle: "Quads / Glutes",    pattern: "squat" },
    squat_back:     { name: "Box squat",                 muscle: "Quads / Glutes",    pattern: "squat" },
    hinge_knee:     { name: "Hip thrust",                muscle: "Glutes",            pattern: "hinge" },
    hinge_back:     { name: "Trap bar deadlift",         muscle: "Hamstrings / Glutes", pattern: "hinge" },
    push_shoulder:  { name: "Landmine press",            muscle: "Shoulders / Chest", pattern: "push"  },
    pull_back:      { name: "Chest-supported DB row",    muscle: "Back / Biceps",     pattern: "pull"  },
    accessory_shoulder: { name: "Landmine press",        muscle: "Shoulders",         pattern: "accessory" },
    finisher_back:  { name: "Kettlebell swings",         muscle: "Full body",         pattern: "accessory" },
  },
  dumbbell: {
    squat:     { name: "Goblet squat",              variation: "Dumbbell split squat",         muscle: "Quads / Glutes",       pattern: "squat" },
    hinge:     { name: "Dumbbell Romanian deadlift",variation: "Hip thrust",                   muscle: "Hamstrings / Glutes",  pattern: "hinge" },
    push:      { name: "Dumbbell bench press",      variation: "Neutral-grip incline press",   muscle: "Chest / Shoulders",    pattern: "push"  },
    pull:      { name: "Single-arm dumbbell row",   variation: "Chest-supported DB row",       muscle: "Back / Biceps",        pattern: "pull"  },
    accessory: { name: "Dumbbell curl to press",    variation: "Lateral raise + shrug",        muscle: "Biceps / Shoulders",   pattern: "accessory" },
    finisher_beginner: { name: "Dumbbell squat to curl", variation: "Jump rope 2 min",         muscle: "Full body",            pattern: "accessory" },
    finisher:  { name: "Dumbbell thrusters",        variation: "Dumbbell swing",               muscle: "Full body",            pattern: "accessory" },
    core:      { name: "Suitcase carry",            variation: "Pallof press",                 muscle: "Core / Grip",          pattern: "accessory" },
    // Injury swaps
    squat_knee:     { name: "Hip thrust",                muscle: "Glutes",            pattern: "squat" },
    hinge_back:     { name: "Hip thrust",                muscle: "Glutes",            pattern: "hinge" },
    push_shoulder:  { name: "Neutral-grip incline press",muscle: "Chest",            pattern: "push"  },
    pull_back:      { name: "Chest-supported DB row",    muscle: "Back / Biceps",     pattern: "pull"  },
    accessory_shoulder: { name: "Hammer curl",           muscle: "Biceps",            pattern: "accessory" },
    finisher_shoulder:  { name: "Dumbbell swing",        muscle: "Full body",         pattern: "accessory" },
  },
  machine: {
    squat:     { name: "Leg press",                 variation: "Hack squat machine",           muscle: "Quads / Glutes",       pattern: "squat" },
    hinge:     { name: "Lying leg curl",            variation: "Seated leg curl",              muscle: "Hamstrings",           pattern: "hinge" },
    push:      { name: "Chest press machine",       variation: "Cable chest fly",              muscle: "Chest / Shoulders",    pattern: "push"  },
    pull:      { name: "Seated cable row",          variation: "Lat pulldown",                 muscle: "Back / Biceps",        pattern: "pull"  },
    accessory: { name: "Lat pulldown",              variation: "Cable bicep curl",             muscle: "Back / Biceps",        pattern: "accessory" },
    accessory_exp: { name: "Lat pulldown + cable curl", variation: "Cable fly + curl superset",muscle: "Back / Biceps",        pattern: "accessory" },
    finisher_beginner: { name: "Rowing machine 3 min",   variation: "Bike 5 min",             muscle: "Full body",            pattern: "accessory" },
    finisher:  { name: "Rowing machine 5 min",      variation: "Stairmaster 5 min",            muscle: "Full body",            pattern: "accessory" },
    core:      { name: "Cable Pallof press",        variation: "Ab wheel rollout",             muscle: "Core",                 pattern: "accessory" },
    // Injury swaps
    squat_knee: { name: "Seated leg extension (light)", muscle: "Quads",            pattern: "squat" },
    push_shoulder: { name: "Cable chest fly",       muscle: "Chest",                pattern: "push"  },
    pull_back:  { name: "Lat pulldown",             muscle: "Back",                 pattern: "pull"  },
  },
  kettlebell: {
    squat:     { name: "Kettlebell goblet squat",   variation: "Kettlebell sumo squat",        muscle: "Quads / Glutes",       pattern: "squat" },
    hinge:     { name: "Kettlebell deadlift",       variation: "Kettlebell single-leg RDL",    muscle: "Hamstrings / Glutes",  pattern: "hinge" },
    push:      { name: "Kettlebell floor press",    variation: "Kettlebell push press",        muscle: "Chest / Shoulders",    pattern: "push"  },
    push_exp:  { name: "Kettlebell push press",     variation: "Kettlebell floor press",       muscle: "Shoulders",            pattern: "push"  },
    pull:      { name: "Kettlebell single-arm row", variation: "Kettlebell high pull",         muscle: "Back / Biceps",        pattern: "pull"  },
    accessory: { name: "Kettlebell single-leg deadlift", variation: "Kettlebell Romanian deadlift", muscle: "Hamstrings / Balance", pattern: "accessory" },
    accessory_exp: { name: "Kettlebell Turkish get-up", variation: "Kettlebell windmill",      muscle: "Full body / Core",     pattern: "accessory" },
    finisher_beginner: { name: "Kettlebell swings x30", variation: "Jump rope 2 min",          muscle: "Full body",            pattern: "accessory" },
    finisher:  { name: "Kettlebell swings x50",     variation: "Kettlebell snatch x20",        muscle: "Full body",            pattern: "accessory" },
    core:      { name: "Kettlebell farmers carry",  variation: "Kettlebell halo",              muscle: "Core / Grip",          pattern: "accessory" },
    // Injury swaps
    squat_knee:     { name: "Kettlebell deadlift",       muscle: "Hamstrings / Glutes", pattern: "squat" },
    hinge_back:     { name: "Hip thrust",                muscle: "Glutes",            pattern: "hinge" },
    push_shoulder:  { name: "Kettlebell halo",           muscle: "Shoulders / Core",  pattern: "push"  },
    pull_back:      { name: "Kettlebell drag curl",      muscle: "Biceps",            pattern: "pull"  },
    accessory_wrist:{ name: "Kettlebell halo",           muscle: "Shoulders / Core",  pattern: "accessory" },
    finisher_back:  { name: "Jump rope 3 min",           muscle: "Full body",         pattern: "accessory" },
  },
};

// ═══════════════════════════════════════════════════════════════════
// STARTING WEIGHTS — conservative defaults, self-correcting in 1-2 sessions
// ═══════════════════════════════════════════════════════════════════
const STARTING_WEIGHTS = {
  "Barbell back squat":           { beginner: 45,  some: 65,  returning: 95,  experienced: 135 },
  "Barbell Romanian deadlift":    { beginner: 45,  some: 65,  returning: 85,  experienced: 115 },
  "Barbell bench press":          { beginner: 45,  some: 65,  returning: 85,  experienced: 115 },
  "Barbell bent over row":        { beginner: 45,  some: 55,  returning: 75,  experienced: 95  },
  "Barbell overhead press":       { beginner: 35,  some: 45,  returning: 65,  experienced: 85  },
  "Trap bar deadlift":            { beginner: 65,  some: 85,  returning: 115, experienced: 155 },
  "Box squat":                    { beginner: 45,  some: 65,  returning: 85,  experienced: 115 },
  "Goblet squat":                 { beginner: 15,  some: 25,  returning: 35,  experienced: 45  },
  "Dumbbell Romanian deadlift":   { beginner: 15,  some: 25,  returning: 35,  experienced: 50  },
  "Dumbbell bench press":         { beginner: 15,  some: 25,  returning: 40,  experienced: 55  },
  "Single-arm dumbbell row":      { beginner: 15,  some: 25,  returning: 35,  experienced: 50  },
  "Dumbbell shoulder press":      { beginner: 10,  some: 15,  returning: 25,  experienced: 35  },
  "Dumbbell curl to press":       { beginner: 10,  some: 15,  returning: 20,  experienced: 30  },
  "Neutral-grip incline press":   { beginner: 15,  some: 20,  returning: 30,  experienced: 45  },
  "Chest-supported DB row":       { beginner: 15,  some: 20,  returning: 30,  experienced: 45  },
  "Leg press":                    { beginner: 90,  some: 130, returning: 180, experienced: 230 },
  "Lying leg curl":               { beginner: 40,  some: 60,  returning: 80,  experienced: 100 },
  "Chest press machine":          { beginner: 40,  some: 60,  returning: 80,  experienced: 110 },
  "Seated cable row":             { beginner: 40,  some: 60,  returning: 80,  experienced: 110 },
  "Lat pulldown":                 { beginner: 40,  some: 60,  returning: 80,  experienced: 100 },
  "Kettlebell goblet squat":      { beginner: 15,  some: 25,  returning: 35,  experienced: 44  },
  "Kettlebell deadlift":          { beginner: 25,  some: 35,  returning: 44,  experienced: 53  },
  "Kettlebell floor press":       { beginner: 15,  some: 25,  returning: 35,  experienced: 44  },
  "Kettlebell push press":        { beginner: 15,  some: 25,  returning: 35,  experienced: 44  },
  "Kettlebell single-arm row":    { beginner: 15,  some: 25,  returning: 35,  experienced: 44  },
  "Kettlebell swings x30":        { beginner: 15,  some: 25,  returning: 35,  experienced: 44  },
  "Kettlebell swings x50":        { beginner: 25,  some: 35,  returning: 44,  experienced: 53  },
  "Hip thrust":                   { beginner: 0,   some: 25,  returning: 45,  experienced: 65  },
  "Landmine press":               { beginner: 25,  some: 35,  returning: 45,  experienced: 65  },
  "Barbell complex":              { beginner: 35,  some: 45,  returning: 55,  experienced: 65  },
};
const DEFAULT_WEIGHT = 20; // fallback if exercise not in table

// ═══════════════════════════════════════════════════════════════════
// buildPlan — takes onboarding profile, returns complete week 1 plan
// No API call. Deterministic. Fast.
// ═══════════════════════════════════════════════════════════════════
function buildPlan(userProfile, existingMacros) {
  const {
    goal = "get_fit",
    sex = "male",
    age = 30,
    trainingHistory = "some",
    recentActivity = "consistent",
    daysPerWeek = 3,
    equipment = "dumbbell",
    injuries = "none",
    restPref = null,
  } = userProfile;

  // Resolve experience tier
  const expTier = trainingHistory === "new" ? "beginner"
    : trainingHistory === "some" ? "some"
    : recentActivity === "returning" ? "returning"
    : "experienced";

  const ageNum = parseInt(age) || 30;
  const isOver40 = ageNum >= 40;
  const isFemale = sex === "female";
  const injuryLower = (injuries || "none").toLowerCase();
  const hasKnee = injuryLower.includes("knee");
  const hasBack = injuryLower.includes("back");
  const hasShoulder = injuryLower.includes("shoulder");
  const hasWrist = injuryLower.includes("wrist");

  const lib = EXERCISE_LIBRARY[equipment] || EXERCISE_LIBRARY.dumbbell;
  const isExperienced = expTier === "experienced";
  const isBeginner = expTier === "beginner";

  // ── Sets ──────────────────────────────────────────────────────────
  const baseSets = isBeginner ? 2 : (expTier === "some" || expTier === "returning") ? 3 : 4;
  const sets = isOver40 ? Math.min(baseSets, 3) : baseSets;

  // ── Rep ranges ────────────────────────────────────────────────────
  // [min, max] — upper body uses +2.5lb increments, lower body +5lb
  let repMin, repMax;
  if (goal === "build_muscle") {
    repMin = isFemale ? 10 : (isBeginner ? 10 : 8);
    repMax = isFemale ? 14 : (isBeginner ? 12 : 10);
  } else if (goal === "lose_fat") {
    repMin = 10; repMax = isBeginner ? 15 : 12;
  } else {
    repMin = 10; repMax = isBeginner ? 15 : 12;
  }

  // ── Rest periods ──────────────────────────────────────────────────
  const restCompound = isOver40
    ? (goal === "lose_fat" ? 90 : goal === "build_muscle" ? 150 : 105)
    : (goal === "lose_fat" ? 60 : goal === "build_muscle" ? 120 : 75);
  const restAccessory = isOver40
    ? (goal === "lose_fat" ? 75 : 90)
    : (goal === "lose_fat" ? 45 : 60);
  // If the user explicitly picked a rest preference in onboarding, honour it
  // instead of the calculated value. restPref is in seconds (60, 120, or 180).
  const effectiveRestCompound = restPref || restCompound;
  const effectiveRestAccessory = restPref
    ? Math.round(restPref * 0.75)
    : restAccessory;

  // ── RPE ───────────────────────────────────────────────────────────
  const rpeMax = isOver40 ? 8 : 9;
  const rpe = isBeginner ? 6
    : expTier === "some" ? 7
    : expTier === "returning" ? 7
    : Math.min(8, rpeMax);

  // ── Set structure ─────────────────────────────────────────────────
  const usePyramid = isExperienced && !isOver40;

  // ── Exercise selection with injury substitutions ──────────────────
  const pick = (slot, injurySlot) => {
    const injuryKey = injurySlot ? `${slot}_${injurySlot}` : null;
    const injuryEx = injuryKey && lib[injuryKey] ? lib[injuryKey] : null;
    const baseEx = lib[slot] || null;
    return injuryEx || baseEx;
  };

  const squatEx   = hasKnee     ? pick("squat", "knee")
                  : hasBack     ? pick("squat", "back")
                  : pick("squat");
  const hingeEx   = hasKnee     ? pick("hinge", "knee")
                  : hasBack     ? pick("hinge", "back")
                  : pick("hinge");
  const pushEx    = hasShoulder ? pick("push", "shoulder")  : pick("push");
  const pullEx    = hasBack     ? pick("pull", "back")       : pick("pull");

  // Slot 5: accessory vs finisher based on goal
  let slot5Ex;
  if (goal === "lose_fat") {
    slot5Ex = isBeginner
      ? (lib.finisher_beginner || lib.finisher || lib.accessory)
      : (lib.finisher || lib.accessory);
    if (hasShoulder && lib.finisher_shoulder) slot5Ex = lib.finisher_shoulder;
    if (hasBack && lib.finisher_back) slot5Ex = lib.finisher_back;
  } else {
    if (hasShoulder && lib.accessory_shoulder) {
      slot5Ex = lib.accessory_shoulder;
    } else if (hasWrist && lib.accessory_wrist) {
      slot5Ex = lib.accessory_wrist;
    } else {
      slot5Ex = isExperienced ? (lib.accessory_exp || lib.accessory) : lib.accessory;
    }
  }

  // Experienced members on push slot: kettlebell gets push_exp
  if (equipment === "kettlebell" && isExperienced && !hasShoulder) {
    const kbPushExp = lib.push_exp;
    if (kbPushExp) pushEx.name = kbPushExp.name; // in-place upgrade
  }

  // ── Starting weight lookup ────────────────────────────────────────
  const getWeight = (exName) => {
    const row = STARTING_WEIGHTS[exName];
    if (!row) return DEFAULT_WEIGHT;
    return row[expTier] || row.some || DEFAULT_WEIGHT;
  };

  // ── Warm-up ramp generator ────────────────────────────────────────
  // Best-practice hypertrophy setup: working sets stay at one weight (equal
  // volume drives growth), but the lifter ramps UP to it with non-fatiguing
  // warm-up sets first. These do NOT count as working sets and aren't logged.
  // Returns [] for light/bodyweight lifts that don't need a ramp.
  const buildWarmups = (workingWeight, isLower) => {
    // Skip ramp for bodyweight or light accessory loads — not needed.
    if (!workingWeight || workingWeight < 65) return [];
    const roundTo = isLower ? 5 : 2.5; // barbell/lower rounds to 5s, upper to 2.5s
    const round = (x) => Math.max(roundTo, Math.round(x / roundTo) * roundTo);
    // Ramp percentages of the working weight: ~50%, ~70%, ~85%
    const pcts = [0.5, 0.7, 0.85];
    return pcts
      .map((p, i) => ({
        weight: round(workingWeight * p),
        reps: i === 0 ? 8 : i === 1 ? 5 : 3, // fewer reps as it gets heavier
      }))
      // Drop any warm-up that lands at/above the working weight (very light lifts)
      .filter((s) => s.weight < workingWeight);
  };

  // ── Build exercise objects ────────────────────────────────────────
  const makeEx = (exObj, isLower) => {
    if (!exObj) return null;
    const w = getWeight(exObj.name);
    return {
      name: exObj.name,
      sets,
      reps: repMin,
      repMin,
      repMax,
      weight: w,
      warmupSets: buildWarmups(w, isLower), // ramp-up sets shown before working sets
      muscle: exObj.muscle,
      pattern: exObj.pattern,
      rpe,
      restSeconds: isLower ? effectiveRestCompound : (exObj.pattern === "accessory" ? effectiveRestAccessory : effectiveRestCompound),
      alternative: "", // filled by alternative lookup below
      usePyramid,
      weightIncrement: isLower ? 5 : 2.5,
    };
  };

  const exercises = [
    makeEx(squatEx, true),
    makeEx(hingeEx, true),
    makeEx(pushEx, false),
    makeEx(pullEx, false),
    makeEx(slot5Ex, false),
  ].filter(Boolean);

  // ── Add core slot for experienced members, 3+ days ────────────────
  if (isExperienced && daysPerWeek >= 3 && lib.core) {
    exercises.push({
      name: lib.core.name,
      sets: 3,
      reps: 40, // seconds for carries
      repMin: 30,
      repMax: 60,
      weight: getWeight(lib.core.name),
      warmupSets: [], // core/carry slot doesn't use a loaded warm-up ramp
      muscle: lib.core.muscle,
      pattern: lib.core.pattern,
      rpe: Math.min(rpe, 7),
      restSeconds: effectiveRestAccessory,
      alternative: "Pallof press",
      usePyramid: false,
      weightIncrement: 5,
    });
  }

  // ── Workout structure ─────────────────────────────────────────────
  const workoutType = daysPerWeek <= 3 ? "Full Body"
    : daysPerWeek === 4 ? "Upper / Lower"
    : "Push / Pull / Legs";

  const workoutDuration = isBeginner ? 35
    : expTier === "some" ? 40
    : expTier === "returning" ? 45
    : 50;

  return {
    // Macro targets come from onboarding calculation — pass through unchanged
    ...(existingMacros || {}),
    weekNumber: 1,
    weekStartDate: new Date().toISOString().split("T")[0],
    daysPerWeek,
    workoutType,
    workoutDuration,
    restSeconds: effectiveRestCompound,
    weeklyFocus: goal === "lose_fat"
      ? "Build the habit. Every session counts more than any single weight."
      : goal === "build_muscle"
      ? "Focus on feeling the target muscle, not just moving the weight."
      : "Consistency over intensity — showing up beats the perfect session.",
    tip: isBeginner
      ? "Form first, always. Perfect reps at light weight beat sloppy reps at heavy weight."
      : isOver40
      ? "Warm up longer than you think you need to. Your joints will thank you."
      : "Leave 1–2 reps in the tank on every set. Save max effort for the final set.",
    progressionRule: "Straight sets: ramp up with warm-ups, then keep the same weight across all working sets. Hit the top of your rep range two sessions in a row → add weight next session.",
    warmup: [
      { name: "Hip circles",       duration: "30 seconds",   description: "Hands on hips, slow circles each direction." },
      { name: "Leg swings",        duration: "10 each leg",  description: "Hold a wall, swing each leg forward and back." },
      { name: "Arm circles",       duration: "30 seconds",   description: "Arms out, slow circles forward then backward." },
      { name: "Bodyweight squat",  duration: "10 slow reps", description: "Full range of motion, slow and controlled." },
      { name: "Cat-cow stretch",   duration: "10 reps",      description: "Hands and knees — arch up, then dip down slowly." },
    ],
    cooldown: [
      { name: "Quad stretch",       duration: "30s each leg", description: "Stand on one leg, pull heel to glute." },
      { name: "Hamstring stretch",  duration: "30 seconds",   description: "Sit, legs straight, reach toward toes." },
      { name: "Chest stretch",      duration: "30 seconds",   description: "Hands clasped behind back, open chest." },
      { name: "Shoulder stretch",   duration: "30s each",     description: "Pull one arm across chest, hold with other hand." },
      { name: "Child's pose",       duration: "60 seconds",   description: "Kneel, reach arms forward, breathe deeply." },
    ],
    exercises,
  };
}

// ═══════════════════════════════════════════════════════════════════
// progressPlan — takes current plan + workout logs, returns next week's plan
// Applies the 2-for-2 NSCA rule: exceed rep target by 2+ for 2 sessions → add weight
// No API call. Deterministic.
// ═══════════════════════════════════════════════════════════════════
function progressPlan(currentPlan, workoutLogs, userProfile) {
  const nextWeekNum = (currentPlan.weekNumber || 1) + 1;
  const expTier = userProfile.trainingHistory === "new" ? "beginner"
    : userProfile.trainingHistory === "some" ? "some"
    : userProfile.recentActivity === "returning" ? "returning"
    : "experienced";
  const isExperienced = expTier === "experienced";
  const isOver40 = parseInt(userProfile.age || 30) >= 40;

  // ── Deload logic ──────────────────────────────────────────────────
  // Experienced members: deload every 5 weeks
  // Beginners/some: no scheduled deload — app detects fatigue via missed reps instead
  const isDeload = isExperienced && !isOver40 && nextWeekNum % 5 === 0;
  const isPostDeload = isExperienced && !isOver40 && nextWeekNum % 5 === 1 && nextWeekNum > 1;

  if (isDeload) {
    // Deload week: same exercises, 60% weight, RPE capped at 6
    return {
      ...currentPlan,
      weekNumber: nextWeekNum,
      weekStartDate: new Date().toISOString().split("T")[0],
      weeklyFocus: "Recovery week. Lighter weights, same movements. You'll come back stronger.",
      tip: "This week is supposed to feel easy. That's the point — let your body consolidate the gains.",
      progressionRule: "Deload: all weights at 60% of last week. RPE 6 max.",
      exercises: currentPlan.exercises.map(ex => ({
        ...ex,
        weight: Math.round(ex.weight * 0.6 / 5) * 5, // round to nearest 5
        rpe: Math.min(ex.rpe, 6),
        weeklyFocus: "deload",
      })),
    };
  }

  // ── Build log lookup: exerciseName → array of recent sessions ─────
  // workoutLogs is an array of { exercise_name, reps, weight, workout_date }
  const logMap = {};
  (workoutLogs || []).forEach(log => {
    const key = log.exercise_name;
    if (!logMap[key]) logMap[key] = [];
    logMap[key].push({ reps: log.reps, weight: log.weight, date: log.workout_date });
  });

  // Sort each exercise's logs newest first
  Object.keys(logMap).forEach(k => {
    logMap[k].sort((a, b) => new Date(b.date) - new Date(a.date));
  });

  // ── Progress each exercise ────────────────────────────────────────
  const nextExercises = currentPlan.exercises.map(ex => {
    const logs = logMap[ex.name] || [];

    // Post-deload: reset to week 1 weight + 10%, swap to variation exercise
    if (isPostDeload) {
      // Mesocycle number: 1 = weeks 1-5, 2 = weeks 6-10, 3 = weeks 11-15...
      // Even mesocycles use variation, odd mesocycles use primary
      const mesocycle = Math.floor((nextWeekNum - 1) / 5);
      const useVariation = mesocycle % 2 === 1;
      // Find this exercise's variation from the library
      const lib = EXERCISE_LIBRARY[userProfile.equipment] || EXERCISE_LIBRARY.dumbbell;
      let variationName = ex.name; // default: keep same
      Object.values(lib).forEach(slot => {
        if (slot.name === ex.name && slot.variation) variationName = useVariation ? slot.variation : slot.name;
        if (slot.variation === ex.name && slot.name) variationName = useVariation ? slot.variation : slot.name;
      });
      return {
        ...ex,
        name: variationName,
        weight: Math.round(ex.weight * 1.1 / 5) * 5,
        reps: ex.repMin || ex.reps,
        weekNumber: nextWeekNum,
      };
    }

    // Not enough log data — keep current weight, same reps
    if (logs.length < 2) {
      return { ...ex, weekNumber: nextWeekNum };
    }

    const increment = ex.weightIncrement || (ex.pattern === "squat" || ex.pattern === "hinge" ? 5 : 2.5);
    const repTarget = ex.repMax || (ex.reps + 2);

    if (ex.usePyramid) {
      // Pyramid: check if final-set reps hit target two sessions in a row
      // Use the highest reps logged per session as a proxy for the final set
      const session1 = logs[0] ? Math.max(...logs.slice(0, 3).filter(l => l.weight >= ex.weight * 0.9).map(l => l.reps)) : 0;
      const session2 = logs[3] ? Math.max(...logs.slice(3, 6).filter(l => l.weight >= ex.weight * 0.9).map(l => l.reps)) : 0;
      const hitTwoInARow = session1 >= repTarget && session2 >= repTarget;

      if (hitTwoInARow) {
        const newWorking = ex.weight + increment;
        return { ...ex, weight: newWorking, weekNumber: nextWeekNum };
      }
      // Fatigue detection: if member missed reps two sessions, hold weight
      return { ...ex, weekNumber: nextWeekNum };

    } else {
      // Straight sets: 2-for-2 rule — exceed rep target by 2+ reps, two sessions in a row
      const recentSets = logs.slice(0, 6);
      const session1MaxReps = Math.max(...recentSets.slice(0, 3).map(l => l.reps));
      const session2MaxReps = Math.max(...recentSets.slice(3, 6).map(l => l.reps));
      const twoForTwo = session1MaxReps >= repTarget + 2 && session2MaxReps >= repTarget + 2;

      if (twoForTwo) {
        return {
          ...ex,
          weight: ex.weight + increment,
          reps: ex.repMin || ex.reps, // reset reps to bottom of range
          weekNumber: nextWeekNum,
        };
      }

      // Fatigue detection: missed target reps two sessions → hold, drop 1 rep
      const session1MinReps = Math.min(...recentSets.slice(0, 3).map(l => l.reps));
      const session2MinReps = Math.min(...recentSets.slice(3, 6).map(l => l.reps));
      const missedTwice = session1MinReps < (ex.repMin || ex.reps) - 1
                       && session2MinReps < (ex.repMin || ex.reps) - 1;
      if (missedTwice && ex.reps > (ex.repMin || 6)) {
        return { ...ex, reps: ex.reps - 1, weekNumber: nextWeekNum };
      }

      return { ...ex, weekNumber: nextWeekNum };
    }
  });

  return {
    ...currentPlan,
    weekNumber: nextWeekNum,
    weekStartDate: new Date().toISOString().split("T")[0],
    weeklyFocus: nextWeekNum % 5 === 4
      ? "Last hard week before recovery. Leave everything on the floor."
      : "Progressive overload in action — a little better than last week is all you need.",
    tip: isExperienced
      ? "Track your final-set reps carefully — that's what triggers your weight increase."
      : "Consistency is the variable that matters most right now. Just show up.",
    progressionRule: "Auto-calculated from your logged reps.",
    exercises: nextExercises,
  };
}

const SESSION_KEY = "morphiq_session";

function AppProvider({ children }) {
  // ── Restore session from localStorage on first load ──────────────────────
  const savedSession = (() => {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
  })();

  const [screen, setScreen] = useState(savedSession ? "loading" : "auth");
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

  // Called after successful auth. role = "member" | "owner".
  async function signIn(email, role, realAuthUserId = null) {
    const uid = realAuthUserId || ("sim-" + Date.now());
    setSupabaseUser({ email, id: uid });
    supabaseUserIdRef.current = uid;
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
      <div style={{ textAlign: "center", fontSize: 11, color: theme.textFaint, padding: ".6rem", marginBottom: "3.5rem" }}>Powered by Hypergentiq</div>
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
         SUPABASE_URL, SUPABASE_ANON, SB_HEADERS, SB_GET, getAuthToken, theme,
         MEAL_DATA, GROCERY_DATA, WORKOUT_EXERCISES, localDateStr };

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
  const { navigate, setUser, setPlan, plan, gymBranding, supabaseUser, supabaseUserIdRef } = useApp();
  const ob = theme.ob;
  const a = gymBranding.accent || ob.teal;
  const [step, setStep] = useState(0);
  const [planError, setPlanError] = useState("");
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
  // Tracks whether each checklist item is visible yet (fades in before turning teal)
  const [checklistVisible, setChecklistVisible] = useState([false, false, false, false]);
  const [revealStep, setRevealStep] = useState(0); // 0=hidden, 1=header, 2=ai msg, 3=workouts, 4=targets, 5=button

  // When step 13 (plan reveal) is reached, stagger in each section for a celebration feel
  useEffect(() => {
    if (step !== 13) { setRevealStep(0); return; }
    setRevealStep(0);
    const delays = [120, 380, 640, 900, 1180];
    const timers = delays.map((d, i) => setTimeout(() => setRevealStep(i + 1), d));
    return () => timers.forEach(clearTimeout);
  }, [step]);

  useEffect(() => {
    if (step !== 12) return;
    let cancelled = false;
    [0,1,2,3].forEach(i => {
      // Item appears (fades in) first, then turns teal shortly after
      setTimeout(() => { if(!cancelled) setChecklistVisible(v => v.map((x,idx) => idx<=i ? true : x)); }, i*550+100);
      setTimeout(() => { if(!cancelled) setChecklist(c => c.map((v,idx) => idx<=i ? true : v)); }, i*550+300);
    });

    async function generatePlan() {
      const historyMap = { new: "beginner with no training history", some: "intermediate, 6 months to 2 years experience", years: "experienced lifter, several years of training" };
      const activityMap = { returning: "returning after a long break (treat as rebuilding, use 60-70% of experienced weights)", consistent: "moderately active, some consistency recently", active: "currently training regularly" };
      const fitnessProfile = `${historyMap[trainingHistory] || "beginner"}, ${activityMap[recentActivity] || "just starting out"}`;

      // Mifflin-St Jeor BMR — convert imperial to metric first
      const weightKg = parseFloat(weight) / 2.205;
      const heightCm = ((parseInt(heightFt) * 12) + parseInt(heightIn || 0)) * 2.54;
      const ageNum = parseInt(age);
      const bmrCalc = sex === "male"
        ? Math.round((10 * weightKg) + (6.25 * heightCm) - (5 * ageNum) + 5)
        : Math.round((10 * weightKg) + (6.25 * heightCm) - (5 * ageNum) - 161);
      const activityMult = daysPerWeek >= 4 ? 1.55 : 1.375;
      const tdeeCalc = Math.round(bmrCalc * activityMult);
      const goalAdj = goal === "build_muscle" ? 250 : goal === "lose_fat" ? -350 : 0; // Research: 350 cal deficit = ~0.7lb/week loss, maximizes fat loss while preserving muscle
      const minCals = sex === "male" ? 1600 : 1400;
      const targetCals = Math.max(minCals, tdeeCalc + goalAdj);

      const proteinPer = goal === "general_fitness" ? 0.8 : 1.0; // Research: 0.7g/lb is minimum; 0.8-1.0g/lb optimal for body recomposition at any goal
      const fatPer = goal === "build_muscle" ? 0.4 : goal === "lose_fat" ? 0.3 : 0.35; // Fat loss: slightly lower fat to create deficit room for protein
      const targetProtein = Math.round(parseFloat(weight) * proteinPer);
      const targetFat = Math.round(parseFloat(weight) * fatPer);
      const targetCarbs = Math.round((targetCals - (targetProtein * 4) - (targetFat * 9)) / 4);

      // Build plan locally — deterministic, code-driven, no prompt engineering needed
      const profileForPlan = {
        goal, sex, age, trainingHistory, recentActivity,
        daysPerWeek, equipment, injuries,
        restPref, // Fix (June 2026): restPref was captured in onboarding but never passed to buildPlan — rest times were always calculated from age/goal, ignoring the user's choice
      };
      const macrosForPlan = {
        calories: targetCals, protein: targetProtein,
        carbs: targetCarbs, fat: targetFat,
        bmr: bmrCalc, tdee: tdeeCalc, goalAdjustment: goalAdj,
      };

      try {
        const parsed = buildPlan(profileForPlan, macrosForPlan);
        if (!cancelled) {
          const userData = { name, goal, sex, height: `${heightFt}′ ${heightIn || "0"}″`, weight: `${weight} lbs`, age, daysPerWeek, injuries, equipment, unit, trainingHistory, recentActivity, restPref, fitnessLevel: trainingHistory === "new" ? "Beginner" : trainingHistory === "some" ? "Intermediate" : recentActivity === "returning" ? "Rebuilding" : "Advanced" };
          // Cache plan locally FIRST so it's never lost, even if the save below fails —
          // this is a safety net, not a substitute for confirming the cloud save succeeded.
          const _saveUid = supabaseUserIdRef?.current || supabaseUser?.id;
          try { localStorage.setItem("mq_cached_plan_" + (_saveUid || "anon"), JSON.stringify({ plan: parsed, user: userData })); } catch {}

          // Fix (June 2026): previously the app showed the plan and moved on to step 13
          // on a fixed 400ms timer, WITHOUT waiting to see if the database save actually
          // succeeded. If upsertProfile failed (e.g. a Supabase timeout), the member saw
          // their full plan with nothing saved behind it, and the very next action that
          // needed a profile row (like logging a workout set) would fail with no clear
          // explanation. Now we wait for the save to genuinely confirm before advancing,
          // and show a real retry screen if it fails, instead of guessing it worked.
          if (_saveUid) {
            const saveOk = await sb.upsertProfile(_saveUid, userData, parsed);
            if (!cancelled && !saveOk) {
              setPlanError("Your plan was built, but we couldn't save it — your connection or our database may have had a hiccup. Tap to try again.");
              return;
            }
            // Profile row now exists — safe to write the starting weight
            const startingWeight = parseFloat(weight);
            if (startingWeight > 0) {
              sb.insertWeightLog(_saveUid, startingWeight).catch(() => {});
            }
          }

          if (!cancelled) {
            setUser(userData);
            setPlan(parsed);
            setTimeout(() => { if (!cancelled) setStep(13); }, 400);
          }
        }
      } catch (planErr) {
        console.error("[Morphiq] Plan build failed:", planErr.message);
        if (!cancelled) {
          setPlanError("Plan generation failed — " + (planErr.message || "unknown error") + ". Tap to try again.");
        }
      }
    }

    if (step === 12) generatePlan();
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
        <span style={{ fontSize: 9, color: ob.muted }}>Powered by Hypergentiq</span>
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
            <div style={{ fontSize: 10, color: ob.muted, marginTop: 2 }}>Powered by Hypergentiq</div>
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
          <button onClick={() => setStep(6)} disabled={!bodyValid || !ageValid} style={{ ...s.tealBtn(!bodyValid || !ageValid), marginTop: "auto" }}>Continue →</button>
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
            <div style={{ fontSize: 11, color: ob.muted, marginTop: 4, textAlign: "center", lineHeight: 1.5 }}>Do them any day that works for you — the app always shows your next workout.</div>
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
              The fitness and nutrition plans provided by Hypergentiq are for <span style={{ color: ob.white, fontWeight: 600 }}>informational and educational purposes only</span> and do not constitute medical advice.<br /><br />
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
          <button onClick={() => { setChecklist([false, false, false, false]); setChecklistVisible([false, false, false, false]); setStep(12); }} style={{ ...s.tealBtn(false), marginTop: "auto" }}>Build my plan ✦</button>
          <button onClick={() => setStep(0)} style={{ ...s.outlineBtn, width: "100%", marginTop: 6 }}>Start over</button>
        </div>}

        {step === 12 && <div className="mq-fade" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
          {planError ? (
            <>
              <div style={{ fontSize: 13, color: "#F87171", textAlign: "center", fontWeight: 600 }}>Something went wrong</div>
              <div style={{ fontSize: 11, color: ob.muted, textAlign: "center", padding: "0 20px" }}>{planError}</div>
              <button onClick={() => { setPlanError(""); setStep(11); }} style={{ background: a, border: "none", borderRadius: 10, padding: "10px 24px", fontSize: 12, color: ob.tealDk, fontWeight: 600, cursor: "pointer", fontFamily: ob.font, marginTop: 8 }}>Try again</button>
            </>
          ) : (
            <>
              <Spinner size={40} color={a} trackColor={ob.card} />
              <div style={{ fontSize: 12, fontWeight: 600, color: ob.white }}>Building your plan</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%", marginTop: 4 }}>
                {["Analyzing your goal", "Selecting best exercises", "Building your meal guide", "Personalizing week one..."].map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: checklist[i] ? a : ob.muted, padding: "3px 0", opacity: checklistVisible[i] ? 1 : 0, transform: checklistVisible[i] ? "translateY(0)" : "translateY(6px)", transition: "opacity .35s ease, transform .35s ease, color .3s" }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: checklist[i] ? a : ob.card, flexShrink: 0, transition: "background .3s" }} />{item}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>}

        {step === 13 && plan && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>

          {/* ── Celebration header — fades in first ── */}
          <div style={{ opacity: revealStep >= 1 ? 1 : 0, transform: revealStep >= 1 ? "translateY(0)" : "translateY(-10px)", transition: "opacity .4s ease, transform .4s ease" }}>
            <div style={{ textAlign: "center", marginBottom: 14 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: ob.tealDk, border: `1px solid ${a}`, borderRadius: 20, padding: "5px 14px", marginBottom: 10 }}>
                <span style={{ fontSize: 13 }}>✦</span>
                <span style={{ fontSize: 10, color: a, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Your plan is ready</span>
                <span style={{ fontSize: 13 }}>✦</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: ob.white, letterSpacing: "-0.3px" }}>{name}&apos;s {goalLabel} Plan</div>
              <div style={{ fontSize: 10, color: ob.muted, marginTop: 2 }}>Built by Hypergentiq AI · Week 1</div>
            </div>
          </div>

          {/* ── Personalised AI message — slides in second ── */}
          <div style={{ opacity: revealStep >= 2 ? 1 : 0, transform: revealStep >= 2 ? "translateY(0)" : "translateY(8px)", transition: "opacity .4s ease, transform .4s ease", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: ob.tealDk, border: `1.5px solid ${a}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: a, fontWeight: 700, flexShrink: 0 }}>AI</div>
              <div style={{ background: ob.card, borderRadius: "12px 12px 12px 4px", padding: "9px 12px", fontSize: 13, color: ob.body, lineHeight: 1.55, flex: 1 }}>
                {goal === "lose_fat"
                  ? `${name}, you're all set. ${daysPerWeek} days a week is the sweet spot for fat loss — enough to burn, enough rest to recover. Here's exactly what week one looks like.`
                  : goal === "build_muscle"
                  ? `${name}, your muscle-building plan is locked in. ${daysPerWeek} training days with progressive overload built in from day one. This is how size gets built. Let's go.`
                  : `${name}, your plan is ready. ${daysPerWeek} days a week, balanced workouts, and nutrition targets tailored to you. Everything adjusts as you progress.`}
              </div>
            </div>
          </div>

          {/* ── Workout days card — slides in third ── */}
          <div style={{ opacity: revealStep >= 3 ? 1 : 0, transform: revealStep >= 3 ? "translateY(0)" : "translateY(8px)", transition: "opacity .4s ease, transform .4s ease", marginBottom: 8 }}>
            <div style={{ background: ob.card, borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: ob.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Workouts — {plan.workoutType}</div>
              {(plan.workoutDays || []).map((day, i, arr) => (
                <div key={day} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <span style={{ fontSize: 13, color: ob.white }}>{day}</span>
                  <Pill>{plan.workoutType} · {plan.workoutDuration} min</Pill>
                </div>
              ))}
            </div>
          </div>

          {/* ── Daily targets grid — slides in fourth ── */}
          <div style={{ opacity: revealStep >= 4 ? 1 : 0, transform: revealStep >= 4 ? "translateY(0)" : "translateY(8px)", transition: "opacity .4s ease, transform .4s ease", marginBottom: 8 }}>
            <div style={{ background: ob.card, borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: ob.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Daily targets</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {[["Calories", `${plan.calories?.toLocaleString()}`, "cal / day"], ["Protein", `${plan.protein}g`, "per day"], ["Carbs", `${plan.carbs}g`, "per day"], ["Fat", `${plan.fat}g`, "per day"]].map(([label, val, unit]) => (
                  <div key={label} style={{ background: "#0A1628", borderRadius: 10, padding: "12px 10px" }}>
                    <div style={{ fontSize: 10, color: ob.muted, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: a, lineHeight: 1 }}>{val}</div>
                    <div style={{ fontSize: 10, color: ob.muted, marginTop: 3 }}>{unit}</div>
                  </div>
                ))}
              </div>
            </div>
            {plan.bmr && plan.tdee && (
              <div style={{ background: "#0A1628", borderLeft: `2px solid ${a}`, borderRadius: "0 8px 8px 0", padding: "10px 12px", marginTop: 8, fontSize: 13, color: ob.body, lineHeight: 1.6 }}>
                {plan.goalAdjustment < 0
                  ? `Your body burns ~${plan.tdee?.toLocaleString()} cal/day. We've reduced that by ${Math.abs(plan.goalAdjustment)} for steady fat loss.`
                  : plan.goalAdjustment > 0
                  ? `Your body burns ~${plan.tdee?.toLocaleString()} cal/day. We've added ${plan.goalAdjustment} to fuel muscle growth.`
                  : `Your maintenance is ~${plan.tdee?.toLocaleString()} cal/day — we're keeping you right there.`}
              </div>
            )}
          </div>

          {/* ── Start Day 1 CTA — slides in last with glow ── */}
          <div style={{ opacity: revealStep >= 5 ? 1 : 0, transform: revealStep >= 5 ? "translateY(0)" : "translateY(10px)", transition: "opacity .5s ease, transform .5s ease", marginTop: "auto" }}>
            <button
              onClick={() => navigate("plan")}
              style={{ ...s.tealBtn(false), padding: "13px 10px", fontSize: 14, fontWeight: 700, borderRadius: 14, boxShadow: `0 0 28px rgba(0,212,177,0.4)`, letterSpacing: "0.2px" }}
            >
              Start Day 1 →
            </button>

          </div>

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

const FALLBACK_REPLIES = {
  "how many calories should i eat": "Based on your goal and weight, your target is already set in your plan. Check the Meals tab for your daily targets.",
  "what should i eat today": "Check your Meals tab — your full day is planned out with breakfast, lunch, and dinner suggestions.",
  "am i on track": "You're doing great. Keep logging your workouts and meals and I'll flag anything that needs attention.",
  "how do i lose weight": "You're already on a fat loss plan. Stick to your calorie target, hit your protein goal, and keep showing up to workouts.",
};

const CHAT_SUGGESTIONS = {
  idle: ["What should I eat today?","Am I on track?","How many calories?"],
  workout: ["How many sets left?","Is my form right?","Can I swap this exercise?"],
  meals: ["What can I snack on?","Did I hit protein today?","Adjust for tomorrow"],
  home: ["What's my plan today?","How am I doing this week?","Motivate me"],
};

function HomeDashboardScreen() {
  const { navigate, user, plan, gymBranding, historicalData, supabaseUser } = useApp();
  const a = gymBranding.accent;
  // Read today's logged calories from MealScreen's localStorage (same key, same format)
  const calGoal = plan?.calories || 1800;
  const todayNutritionKey = `morphiq_meals_${supabaseUser?.id || user?.id || "anon"}_${localDateStr()}`;
  const todayNutritionCals = (() => {
    try {
      const saved = JSON.parse(localStorage.getItem(todayNutritionKey) || "[]");
      return saved.reduce((sum, m) => {
        if (m.status === "done" || m.status === "swapped") {
          const cal = m.loggedCal ?? m.suggested?.cal ?? 0;
          return sum + cal;
        }
        return sum;
      }, 0);
    } catch { return 0; }
  })();
  const cals = todayNutritionCals;
  const h = new Date().getHours();
  const greeting = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  const sL = theme.sL;

  // Find the next upcoming meal — reads localStorage (same source as MealScreen)
  // so we show the real meal name and real macros, not hardcoded text
  const nextMeal = (() => {
    // Default meals built from the plan's macros (same split as MealScreen)
    const cal = plan?.calories || 1800;
    const pro = plan?.protein  || 140;
    const r = (n) => Math.round(n);
    const defaultMeals = [
      { id: "breakfast", label: "Breakfast", name: "Greek yogurt, berries & granola", cal: r(cal*0.22), protein: r(pro*0.22) },
      { id: "lunch",     label: "Lunch",     name: "Grilled chicken wrap with salad", cal: r(cal*0.30), protein: r(pro*0.30) },
      { id: "snack",     label: "Snack",     name: "Protein shake + banana",          cal: r(cal*0.14), protein: r(pro*0.14) },
      { id: "dinner",    label: "Dinner",    name: "Salmon fillet with roasted veg",  cal: r(cal*0.34), protein: r(pro*0.34) },
    ];
    try {
      const saved = JSON.parse(localStorage.getItem(todayNutritionKey) || "[]");
      // Merge saved status onto defaults
      const merged = defaultMeals.map(m => {
        const s = saved.find(sm => sm.id === m.id);
        return s ? { ...m, status: s.status } : { ...m, status: "upcoming" };
      });
      // Return the first meal that hasn't been logged, swapped, or skipped
      return merged.find(m => m.status === "upcoming") || null;
    } catch {
      return defaultMeals.find(m => h < 10) || defaultMeals[1]; // fallback by time of day
    }
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
  const workoutType = "Full Body";
  const exerciseCount = plan?.exercises?.length ?? 5;
  const workoutDuration = Math.round(exerciseCount * 8);

  // Real historical values — fall back to placeholders until data loads
  const streak = historicalData?.streak ?? "—";
  const totalWorkouts = historicalData?.totalWorkouts ?? "—";
  const weightChange = historicalData?.weightChange;
  const lastSession = historicalData?.lastSession;
  const weightChangeLabel = weightChange !== null && weightChange !== undefined
    ? (parseFloat(weightChange) <= 0 ? `${weightChange} lbs` : `+${weightChange} lbs`)
    : "—";

  // AI coach message — personalised when we have history
  const coachMsg = allDone
    ? `${greeting}, ${user.name || "there"}. You hit all ${weeklyTarget} workouts this week — incredible consistency. Rest up and come back strong next week! 💪`
    : lastSession
    ? `${greeting}, ${user.name || "there"}. Last workout: ${new Date(lastSession + "T12:00:00").toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}. ${weeklyDone > 0 ? `${weeklyDone} of ${weeklyTarget} workouts done this week — keep it up!` : "Ready to train today?"}`
    : `${greeting}, ${user.name || "there"}. Your plan is ready — let's get your first session in today.`;

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
          <div style={{ fontSize: 12, color: a, fontWeight: 500, marginBottom: 4 }}>Your coach</div>
          <div style={{ fontSize: 14, color: "#C0C0C0", lineHeight: 1.55 }}>{coachMsg}</div>
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
              {plan?.exercises?.length > 0 && (
                <div style={{ padding: "0 1.25rem .75rem", display: "flex", flexDirection: "column", gap: 6 }}>
                  {plan.exercises.slice(0, 5).map((ex, idx) => (
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
                  {plan.exercises.length > 5 && (
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
    { name: "Chicken breast",  qty: "3 lbs",    done: false },
    { name: "Salmon fillets",  qty: "4 pieces", done: false },
    { name: "Eggs",            qty: "1 dozen",  done: false },
    { name: "Canned tuna",     qty: "4 cans",   done: false },
    { name: "Protein powder",  qty: "1 tub",    done: false },
  ]},
  { category: "Dairy", emoji: "🧀", items: [
    { name: "Greek yogurt",    qty: "32 oz",    done: false },
    { name: "Low-fat milk",    qty: "½ gallon", done: false },
    { name: "String cheese",   qty: "1 pack",   done: false },
  ]},
  { category: "Produce", emoji: "🥦", items: [
    { name: "Spinach",         qty: "5 oz bag", done: false },
    { name: "Broccoli",        qty: "1 head",   done: false },
    { name: "Mixed berries",   qty: "1 bag",    done: false },
    { name: "Avocado",         qty: "3",        done: false },
    { name: "Cherry tomatoes", qty: "1 pint",   done: false },
    { name: "Lemons",          qty: "3",        done: false },
    { name: "Apples",          qty: "4",        done: false },
  ]},
  { category: "Pantry", emoji: "🫙", items: [
    { name: "Olive oil",       qty: "1 bottle", done: false },
    { name: "Almond butter",   qty: "1 jar",    done: false },
    { name: "Brown rice",      qty: "2 lbs",    done: false },
    { name: "Oats",            qty: "1 bag",    done: false },
    { name: "Sea salt & pepper",qty: "if needed",done: false },
  ]},
  { category: "Snacks", emoji: "🍎", items: [
    { name: "Baby carrots",    qty: "1 bag",    done: false },
    { name: "Rice cakes",      qty: "1 bag",    done: false },
    { name: "Mixed nuts",      qty: "1 bag",    done: false },
    { name: "Dark chocolate",  qty: "1 bar",    done: false },
  ]},
];

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
  const { navigate, user, plan, gymBranding, workoutContext, supabaseUser, setPendingAISwap } = useApp();
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
  const [apiErrorMsg, setApiErrorMsg] = useState("");
  const scrollRef = useRef(null);
  const timerRef = useRef(null);

  // Load usage count on mount so counter is visible before first message
  useEffect(() => {
    async function loadUsage() {
      try {
        const profileId = await sb.getProfileId(supabaseUser?.id).catch(() => null);
        if (!profileId) return;
        const month = new Date().toISOString().slice(0, 7);
        const url = `https://uvnyjegmhsztdednjclb.supabase.co/rest/v1/ai_usage?user_id=eq.${profileId}&month=eq.${month}&feature=eq.chat&select=id`;
        const res = await fetch(url, { headers: { apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2bnlqZWdtaHN6dGRlZG5qY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTgwMjcsImV4cCI6MjA5NDI5NDAyN30.-hMNwCO-GymvbiyAKer6Q5AjDbDZl6GhXmSTmr5bY04", Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2bnlqZWdtaHN6dGRlZG5qY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTgwMjcsImV4cCI6MjA5NDI5NDAyN30.-hMNwCO-GymvbiyAKer6Q5AjDbDZl6GhXmSTmr5bY04" } });
        const rows = await res.json();
        const count = Array.isArray(rows) ? rows.length : 0;
        setMsgUsage({ count, limit: 50 });
      } catch { /* non-blocking */ }
    }
    loadUsage();
  }, [supabaseUser]);

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
        { ...user, plan, gymName: gymBranding.name, profileId, gymId: gymBranding.gymId || "unknown" },
        fromScreen,
        workoutContext   // null when not in workout, object when mid-workout
      );
      if (usageCount !== undefined) setMsgUsage({ count: usageCount, limit: usageLimit });
      setThinking(false);
      setMessages(prev => [...prev, { id: Date.now() + 1, role: "ai", text: reply }]);
      if (chips?.length) setDynamicChips(chips);
      // Action handling — swap exercise or adjust meal
      if (action?.type === "swap_exercise") {
        // Store the swap in shared context. WorkoutScreen watches this and
        // calls doSwap() automatically, then clears it. This wires the AI
        // chat action to the live workout screen without prop drilling.
        // workoutContext has the current exercise's stats so the new exercise
        // starts with sensible defaults (slightly lighter weight to be safe).
        setPendingAISwap({
          name: action.to,
          muscle: action.muscle || "",
          sets: workoutContext?.totalSets || 3,
          targetReps: workoutContext?.targetReps || 10,
          weight: workoutContext?.weight ? Math.round(workoutContext.weight * 0.85) : 20,
          rpe: 7,
          alternative: null,
        });
      }
    } catch (err) {
      console.warn("[Morphiq] API unavailable, using fallback:", err.message);
      setApiError(true);
      setApiErrorMsg(err.message || "unknown error");
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
            <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>Hypergentiq Trainer</div>
            <div style={{ fontSize: 11, color: a }}>Knows your full plan</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: a }} />
              <span style={{ fontSize: 11, color: theme.textDim }}>Online</span>
            </div>
            {msgUsage && (
              <div style={{ background: msgUsage.count >= 45 ? "#1F1010" : "#0D1623", border: "1px solid " + (msgUsage.count >= 45 ? "rgba(248,113,113,0.3)" : "rgba(255,255,255,0.08)"), borderRadius: 10, padding: "2px 7px" }}>
                <span style={{ fontSize: 10, color: msgUsage.count >= msgUsage.limit ? "#F87171" : msgUsage.count >= 45 ? "#F59E0B" : "#6B7A8D", fontWeight: 500 }}>
                  {msgUsage.count >= msgUsage.limit ? "Limit reached" : (msgUsage.limit - msgUsage.count) + " left this month"}
                </span>
              </div>
            )}
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
          ⚠ API error: {apiErrorMsg || "check console for details"}
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

      {/* Usage counter moved to header */}

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
      <div style={{ textAlign: "center", fontSize: 10, color: theme.textFaint, paddingBottom: 10, background: "#0D1117", flexShrink: 0 }}>Powered by Hypergentiq</div>
    </div>
  );
}

const WEIGHT_DATA_MOCK = [{week:"W1",weight:187.0},{week:"W2",weight:185.5},{week:"W3",weight:184.2},{week:"W4",weight:183.0},{week:"W5",weight:182.1},{week:"W6",weight:181.4}];


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

// Returns the number of consecutive completed weeks (week streak).
// A week is "complete" when the morphiq_week_YYYY-MM-DD key in localStorage
// holds a value >= daysPerWeek. We look back up to 52 weeks.
function getWeekStreak(daysPerWeek) {
  daysPerWeek = daysPerWeek || 3;
  try {
    var streak = 0;
    for (var w = 0; w < 52; w++) {
      var d = new Date();
      var day = d.getDay();
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1) - w * 7);
      var key = "morphiq_week_" + d.toISOString().slice(0, 10);
      var done = parseInt(localStorage.getItem(key) || "0", 10);
      if (done >= daysPerWeek) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  } catch(e) { return 0; }
}

function ProgressScreen() {
  const { gymBranding, supabaseUser, user, plan, historicalData, loadHistoricalData } = useApp();
  const a = gymBranding.accent;
  const [tab, setTab] = useState("body");
  const sL = { ...theme.sL, fontSize: 10, letterSpacing: "1.2px", marginBottom: 10, fontWeight: 500 };

  // Fetch fresh workout + weight data every time Progress screen opens.
  // Track loading so we show "..." instead of "—" while waiting.
  const [logsLoading, setLogsLoading] = useState(!historicalData);
  useEffect(() => {
    if (!supabaseUser?.id) return;
    setLogsLoading(true);
    loadHistoricalData(supabaseUser.id).finally(() => setLogsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // realLogs: use whatever historicalData has — even an empty array means "loaded, just no data yet"
  const realLogs = historicalData?.workoutLogs ?? null;
  // hasData = logs loaded AND at least one row exists
  const useRealWorkoutData = Array.isArray(realLogs) && realLogs.length > 0;

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
  })() : [];

  // Count ALL unique workout dates, not just the 5 shown in the recent list
  const totalWorkouts = useRealWorkoutData ? new Set(realLogs.map(r => r.workout_date)).size : 0;

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
  const [weightError, setWeightError] = useState(false);

  const isRealUser = supabaseUser?.id && !supabaseUser.id.startsWith("sim-") && supabaseUser.id !== "dev-001";

  // Sync weightLogs from historicalData whenever it updates
  useEffect(() => {
    if (historicalData?.weightLogs) setWeightLogs(historicalData.weightLogs);
  }, [historicalData?.weightLogs]);

  // Build chart data: real entries or mock fallback
  const useRealWeightData = weightLogs !== null && weightLogs.length >= 1;
  const weightChartData = useRealWeightData
    ? weightLogs.map((r) => ({
        // Fix (June 2026): labels were W1/W2/W3 by entry order, not real dates.
        // Now shows the actual date (e.g. "Jun 3") so two weigh-ins on the same
        // day get the same label, and the chart reflects real time spacing.
        week: new Date(r.logged_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
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
    setWeightError(false);
    // Always update local state immediately so chart refreshes without waiting
    const newEntry = { weight_lbs: val, logged_date: new Date().toISOString().slice(0, 10) };
    setWeightLogs(prev => [...(prev || []), newEntry]);
    // Persist to Supabase if real user — check result so we can surface failures
    if (isRealUser) {
      const ok = await sb.insertWeightLog(supabaseUser.id, val);
      if (!ok) {
        // Save failed — remove the optimistic entry and show error
        setWeightLogs(prev => (prev || []).filter(r => r.logged_date !== newEntry.logged_date || r.weight_lbs !== val));
        setSavingWeight(false);
        setWeightError(true);
        setTimeout(() => setWeightError(false), 4000);
        return;
      }
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
            { val: (() => { var ws = getWeekStreak(plan ? plan.daysPerWeek : 3); return ws > 0 ? "🔥 " + ws : "—"; })(), lbl:"Week streak", color:"#F59E0B" },
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
                  <div style={{ background: weightError ? "#1F1010" : "#003D35", borderRadius:8, padding:"4px 10px", fontSize:11, color: weightError ? "#F87171" : a, fontWeight:500 }}>
                    {weightError ? "Save failed — try again" : weightSaved ? "Saved ✓" : "On track ✓"}
                  </div>
                </div>
              </div>

              {/* Log weight button — large and prominent */}
              <button onClick={() => setShowLogWeight(!showLogWeight)}
                style={{ width:"100%", background: showLogWeight ? "transparent" : a, border: showLogWeight ? "1px solid rgba(255,255,255,0.12)" : "none", borderRadius:12, padding:"13px", fontSize:15, fontWeight:600, color: showLogWeight ? "#6B7A8D" : "#003D35", cursor:"pointer", fontFamily:"inherit", marginBottom:10 }}>
                {showLogWeight ? "Cancel" : "＋ Log today's weight"}
              </button>

              {/* Log weight inline form */}
              {showLogWeight && (
                <div className="mq-fade" style={{ background:"#0A1628", borderRadius:12, padding:"14px", marginBottom:10 }}>
                  <div style={{ fontSize:13, color:"#9BB3C8", marginBottom:10, fontWeight:500 }}>What's your weight today?</div>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <input
                      type="number"
                      value={newWeightInput}
                      onChange={e => setNewWeightInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && saveWeight()}
                      placeholder="e.g. 182.5"
                      autoFocus
                      style={{ flex:1, background:"#111827", border:"1px solid rgba(255,255,255,0.12)", borderRadius:10, padding:"12px 14px", fontSize:16, color:"#E8EDF2", outline:"none", fontFamily:"inherit" }}
                    />
                    <div style={{ fontSize:13, color:"#6B7A8D", flexShrink:0 }}>lbs</div>
                    <button onClick={saveWeight} disabled={savingWeight || !newWeightInput}
                      style={{ background: newWeightInput ? a : "#1A2332", border:"none", borderRadius:10, padding:"12px 18px", fontSize:14, color: newWeightInput ? "#003D35" : "#6B7A8D", fontWeight:600, cursor: newWeightInput ? "pointer" : "default", fontFamily:"inherit", flexShrink:0 }}>
                      {savingWeight ? "..." : "Save"}
                    </button>
                  </div>
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
            {(() => {
              // Total volume = sum of weight × reps across all working sets (exclude warm-ups: set_number > 0)
              const totalVol = useRealWorkoutData
                ? realLogs.filter(r => r.set_number > 0).reduce((acc, r) => acc + (r.weight || 0) * (r.reps || 0), 0)
                : null;
              const volDisplay = logsLoading ? "..." : totalVol !== null ? totalVol.toLocaleString() + " lbs" : "—";
              const workoutsDisplay = logsLoading ? "..." : totalWorkouts > 0 ? String(totalWorkouts) : "0";
              return (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
                  <div style={{ background:"#1A2332", borderRadius:12, padding:"10px 12px" }}>
                    <div style={{ fontSize:20, fontWeight:700, color:a }}>{workoutsDisplay}</div>
                    <div style={{ fontSize:10, color:"#6B7A8D", marginTop:2 }}>Sessions logged</div>
                  </div>
                  <div style={{ background:"#1A2332", borderRadius:12, padding:"10px 12px" }}>
                    <div style={{ fontSize:20, fontWeight:700, color:"#F59E0B" }}>{volDisplay}</div>
                    <div style={{ fontSize:10, color:"#6B7A8D", marginTop:2 }}>Total volume lifted</div>
                  </div>
                </div>
              );
            })()}
            <div style={sL}>Recent sessions</div>
            <div style={{ background:"#1A2332", borderRadius:14, overflow:"hidden" }}>
              {realSessions.length === 0 ? (
                <div style={{ padding:"18px 14px", textAlign:"center" }}>
                  <div style={{ fontSize:13, fontWeight:600, color:theme.text }}>{logsLoading ? "Loading..." : "No sessions yet"}</div>
                  <div style={{ fontSize:11, color:"#6B7A8D", marginTop:4 }}>{logsLoading ? "Fetching your workout history." : "Log a set in the workout screen and it'll appear here."}</div>
                </div>
              ) : realSessions.map((w, i) => (
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

        {tab === "bests" && (() => {
          // Build real volume-per-exercise from workout logs for the current month
          const thisMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
          const volColors = [a, "#818cf8", "#F59E0B", "#f472b6", "#60A5FA", "#34D399"];
          const realVolBars = useRealWorkoutData ? (() => {
            const vol = {};
            realLogs.forEach(row => {
              if (!row.workout_date?.startsWith(thisMonth)) return;
              const k = row.exercise_name;
              if (!vol[k]) vol[k] = 0;
              vol[k] += (row.weight || 0) * (row.reps || 0);
            });
            const entries = Object.entries(vol).sort((a, b) => b[1] - a[1]).slice(0, 4);
            if (!entries.length) return null;
            const maxVol = entries[0][1];
            return entries.map(([label, v], i) => ({
              label, pct: Math.round((v / maxVol) * 100), color: volColors[i % volColors.length],
              total: v.toLocaleString() + " lbs",
            }));
          })() : null;

          const pbCount = useRealWorkoutData ? realPBs.length : 0;
          const pbMsg = useRealWorkoutData
            ? (realPBs.length > 0
                ? `You have ${pbCount} exercise best${pbCount !== 1 ? "s" : ""} on record. Keep adding weight to keep growing.`
                : "No workouts logged yet. Complete your first session to start tracking personal bests.")
            : "You've set 8 personal bests this month. Progressive overload is working.";

          return (
            <div className="mq-fade">
              <div style={{ background:"#0A1628", borderLeft:"2px solid #00D4B1", borderRadius:"0 10px 10px 0", padding:"8px 12px", marginBottom:14 }}>
                <div style={{ fontSize:12, color:"#9BB3C8", lineHeight:1.5 }}>{pbMsg}</div>
              </div>
              {realPBs.length > 0 && (
                <>
                  <div style={sL}>Current bests</div>
                  <div style={{ background:"#1A2332", borderRadius:14, overflow:"hidden", marginBottom:14 }}>
                    {realPBs.map((pb, i) => (
                      <div key={pb.exercise} style={{ padding:"11px 14px", borderBottom: i < realPBs.length-1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <div>
                            <div style={{ fontSize:13, fontWeight:600, color:theme.text }}>{pb.exercise}</div>
                            <div style={{ fontSize:11, color:"#6B7A8D", marginTop:2 }}>
                              {pb.date ? new Date(pb.date + "T12:00:00").toLocaleDateString("en-US", { month:"short", day:"numeric" }) : "—"}
                            </div>
                          </div>
                          <div style={{ textAlign:"right" }}>
                            <div style={{ fontSize:15, fontWeight:700, color:a }}>{pb.weight}</div>
                            <div style={{ fontSize:11, color:"#6B7A8D" }}>{pb.reps} reps</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {realVolBars && (
                <div style={{ background:"#1A2332", borderRadius:14, padding:"12px 14px" }}>
                  <div style={{ fontSize:11, color:"#6B7A8D", textTransform:"uppercase", letterSpacing:"1px", marginBottom:10 }}>Volume this month</div>
                  {realVolBars.map(bar => (
                    <div key={bar.label} style={{ marginBottom:8 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                        <span style={{ fontSize:11, color:theme.textMuted }}>{bar.label}</span>
                        <span style={{ fontSize:11, color:bar.color, fontWeight:600 }}>{bar.total}</span>
                      </div>
                      <div style={{ height:4, background:"#0F1922", borderRadius:2 }}>
                        <div style={{ height:4, borderRadius:2, background:bar.color, width:`${bar.pct}%`, transition:"width .8s ease" }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

      </div>
    </Layout>
  );
}

function ProfileScreen() {
  const { navigate, user, setUser, plan, setPlan, gymBranding, signOut, supabaseUser } = useApp();
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
          <StatRow label="Workouts per week" value={`${plan?.daysPerWeek || user.daysPerWeek || 3}×`} />
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
  if (screen === "network_error") return <NetworkErrorScreen />;
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









