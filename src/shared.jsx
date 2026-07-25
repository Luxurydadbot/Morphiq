import { createContext, useContext, useState, useEffect, useRef } from "react";

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

// ── SESSION COOKIE BACKUP ────────────────────────────────────────────────
// iOS Safari can silently evict localStorage for a tab after it is fully
// closed (confirmed via on-device diagnostics, July 2026) even though the
// data was written and confirmed present moments earlier. Cookies with an
// explicit expiry are held much more durably by Safari, so the session key
// and tokens are mirrored into a cookie backup on every write, and restored
// from that backup on boot if localStorage comes back empty.
function setSessionCookie(name, value) {
  try {
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = name + "=" + encodeURIComponent(value) + "; expires=" + expires + "; path=/; SameSite=Lax";
  } catch {}
}
function getSessionCookie(name) {
  try {
    const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : null;
  } catch { return null; }
}
function clearSessionCookie(name) {
  try { document.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;"; } catch {}
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
      try { localStorage.setItem("mq_access_token", accessToken); setSessionCookie("mq_access_token", accessToken); } catch {}
      // Store the refresh token so the session can be renewed on reopen (access tokens expire ~1hr).
      try { if (data.refresh_token) { localStorage.setItem("mq_refresh_token", data.refresh_token); setSessionCookie("mq_refresh_token", data.refresh_token); } } catch {}
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
        try { localStorage.setItem("mq_access_token", data.access_token); setSessionCookie("mq_access_token", data.access_token); } catch {}
        if (data.refresh_token) { try { localStorage.setItem("mq_refresh_token", data.refresh_token); setSessionCookie("mq_refresh_token", data.refresh_token); } catch {} }
        return true;
      }
      return false;
    } catch { return false; }
  },

    // Checks whether the currently stored access token still has real time left,
    // instead of always calling refreshSession() on every app open. Refresh tokens
    // are single-use (see note above) -- refreshing on every open rotates the token
    // every time, which raises the odds of losing the race if the app is closed
    // mid-rotation. Skipping the refresh when the current token is still good
    // removes that risk. (Fix: July 2026 -- member sessions not surviving a full
    // app close, even though the same mechanism worked fine for lower-traffic logins.)
    isAccessTokenValid() {
      try {
        const t = localStorage.getItem("mq_access_token");
        if (!t) return false;
        const payload = JSON.parse(atob(t.split(".")[1]));
        return !!payload.exp && (payload.exp * 1000) > (Date.now() + 3 * 60 * 1000);
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

  // Persists which day index (0-based, into plan.customDays) was actually used
  // for this custom-plan session -- so the next auto-pick can continue from
  // here (lastIndex + 1) instead of re-deriving a guess from weekly workout
  // count, which drifts once a manual day-pick breaks the 1-2-3-4 sequence.
  // Fire-and-forget: a failed save just means the next auto-pick falls back
  // to Day 1, never crashes anything.
  async updateLastWorkoutDayIndex(supabaseUserId, dayIndex) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return false;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${profileId}`, {
        method: "PATCH",
        headers: SB_HEADERS(),
        body: JSON.stringify({ last_workout_day_index: dayIndex }),
      });
      return res.ok;
    } catch { return false; }
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
  async logSyncIssue(supabaseUserId, gymId, reason) {
    try {
      const res = await sbFetchRetry(SUPABASE_URL + "/rest/v1/sync_issues", () => ({
        method: "POST",
        headers: SB_HEADERS(),
        body: JSON.stringify({ supabase_user_id: supabaseUserId, gym_id: gymId || null, reason }),
      }));
      return res.ok;
    } catch { return false; }
  },

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
      if (!res.ok) return null;
      const rows = await res.json();
      if (!rows?.[0]?.id) {
        return null;
      }
      return rows[0].id;
    } catch (e) {
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
  // Returns { ok: true, id } on success (id is the new row's UUID — needed so
  // a later correction via updateWorkoutLogReps can target the right row) or
  // { ok: false, reason } on failure.
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
      if (!profileId) return { ok: false, reason: "NO_PROFILE" };
      const body = { user_id: profileId, exercise_name: exerciseName, set_number: setNumber, reps, weight, workout_date: localDateStr() };
      const res = await sbFetchRetry(`${SUPABASE_URL}/rest/v1/workout_logs`, () => ({
        method: "POST",
        headers: { ...SB_HEADERS(), "Prefer": "return=representation" },
        body: JSON.stringify(body),
      }));
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        console.error("[Morphiq] insertWorkoutLog: insert failed", res.status, errBody);
        return { ok: false, reason: "HTTP_" + res.status };
      }
      const rows = await res.json().catch(() => []);
      return { ok: true, id: rows?.[0]?.id ?? null };
    } catch (e) { console.error("[Morphiq] insertWorkoutLog threw:", e); return { ok: false, reason: "EXCEPTION" }; }
  },

  // Corrects the rep count on an already-saved set (used by the "Wrong
  // number? Fix it" flow). Updates the existing row rather than inserting a
  // new one, so a correction never double-counts toward totals/analytics.
  async updateWorkoutLogReps(rowId, newReps) {
    if (!rowId) return false;
    try {
      const res = await sbFetchRetry(`${SUPABASE_URL}/rest/v1/workout_logs?id=eq.${encodeURIComponent(rowId)}`, () => ({
        method: "PATCH",
        headers: SB_HEADERS(),
        body: JSON.stringify({ reps: newReps }),
      }));
      if (!res.ok) {
        const errBody = await res.text().catch(() => "");
        console.error("[Morphiq] updateWorkoutLogReps: update failed", res.status, errBody);
        return false;
      }
      return true;
    } catch (e) { console.error("[Morphiq] updateWorkoutLogReps threw:", e); return false; }
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

  // Fetch just the distinct workout dates (no exercise detail) over a lookback
  // window, for the week-streak calculation in loadHistoricalData(). Deliberately
  // separate from getWorkoutLogs() above: that one is capped at a small row limit
  // (each row is a single SET, not a day) which isn't enough rows to reliably see
  // 52 weeks back. Selecting only workout_date keeps the payload small even over
  // a full year lookback. Returns an array of "YYYY-MM-DD" strings (may contain
  // duplicates — one per set logged that day; caller should dedupe with a Set).
  async getWorkoutDatesForStreak(supabaseUserId, daysBack = 370) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return [];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysBack);
      const cutoffStr = localDateStr(cutoff);
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/workout_logs?user_id=eq.${profileId}&workout_date=gte.${cutoffStr}&select=workout_date&order=workout_date.desc&limit=1000`,
        { headers: SB_GET() }
      );
      const rows = await res.json();
      return Array.isArray(rows) ? rows.map(r => r.workout_date) : [];
    } catch { return []; }
  },

  // ── In-progress workout sync (profiles.workout_progress, jsonb) ──────────
  // Local-first: WorkoutScreen keeps writing to localStorage for instant,
  // offline-safe responsiveness (gym wifi can be unreliable), and ALSO fires
  // this in the background so the SAME progress is resumable from another
  // device/browser origin, since localStorage never carries over. Uses the
  // existing fire-and-forget pattern (.catch(() => {})) at the call site --
  // a failed sync must never interrupt an active workout.
  async syncWorkoutProgress(supabaseUserId, progress) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return false;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${profileId}`, {
        method: "PATCH",
        headers: SB_HEADERS(),
        body: JSON.stringify({ workout_progress: progress }),
      });
      return res.ok;
    } catch { return false; }
  },

  // Reads back the cloud-saved in-progress workout (or null). Only meaningful
  // if it matches today's local date -- same staleness rule WorkoutScreen
  // already applies to the localStorage copy.
  async getWorkoutProgress(supabaseUserId) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return null;
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${profileId}&select=workout_progress`,
        { headers: SB_GET() }
      );
      const rows = await res.json();
      return rows?.[0]?.workout_progress || null;
    } catch { return null; }
  },

  // Fetch the most recent WORKING set for a specific exercise (excludes warm-ups tagged set_number=0).
  // Used to show "Last time: X lbs × Y reps" before each set.
  // Returns { weight, reps, date } or null if no history found.
  async getLastSetForExercise(supabaseUserId, exerciseName) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return null;
      const name = encodeURIComponent(exerciseName);
      // Only look at PRIOR workouts (before today) -- otherwise, mid-session,
      // this would show the set you just logged a few minutes ago instead of
      // last time you actually trained this exercise (a real prior session).
      const today = localDateStr();
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/workout_logs?user_id=eq.${profileId}&exercise_name=eq.${name}&set_number=gt.0&workout_date=lt.${today}&order=logged_at.desc&limit=1`,
        { headers: SB_GET() }
      );
      const rows = await res.json();
      if (!rows || rows.length === 0) return null;
      return { weight: rows[0].weight, reps: rows[0].reps, date: rows[0].workout_date };
    } catch { return null; }
  },

  // ── CARDIO LOGS ───────────────────────────────────────────────────────────
  async insertCardioLog(supabaseUserId, { activityType, durationMinutes, calories }) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return false;
      const res = await sbFetchRetry(`${SUPABASE_URL}/rest/v1/cardio_logs`, () => ({
        method: "POST",
        headers: SB_HEADERS(),
        body: JSON.stringify({
          user_id: profileId,
          activity_type: activityType,
          duration_minutes: durationMinutes,
          calories: calories ?? null,
          logged_date: localDateStr(),
        }),
      }));
      return res.ok;
    } catch { return false; }
  },

  // Fetch recent cardio sessions for the Progress screen.
  async getCardioLogs(supabaseUserId, limit = 20) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return [];
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/cardio_logs?user_id=eq.${profileId}&order=logged_at.desc&limit=${limit}`,
        { headers: SB_GET() }
      );
      return await res.json();
    } catch { return []; }
  },

  // Distinct cardio dates over a lookback window, for merging into the same
  // week-streak calculation workout_logs already uses (mirrors
  // getWorkoutDatesForStreak above). Returns "YYYY-MM-DD" strings, may contain
  // duplicates if multiple cardio sessions were logged the same day.
  async getCardioDatesForStreak(supabaseUserId, daysBack = 370) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return [];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysBack);
      const cutoffStr = localDateStr(cutoff);
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/cardio_logs?user_id=eq.${profileId}&logged_date=gte.${cutoffStr}&select=logged_date&order=logged_date.desc&limit=1000`,
        { headers: SB_GET() }
      );
      const rows = await res.json();
      return Array.isArray(rows) ? rows.map(r => r.logged_date) : [];
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
      // Logged-out visitors (no real session yet) only have permission to see
      // the public branding columns -- asking for anything else here fails
      // outright, since Postgres requires access to every column touched
      // when no explicit column list is given. Once someone's actually signed
      // in, fetch the full row so the paywall/suspension check still works.
      let hasRealToken = false;
      try { hasRealToken = !!localStorage.getItem("mq_access_token"); } catch {}
      const cols = hasRealToken
        ? "gym_id,name,accent,welcome,logo_url,plan_tier,owner_email,subscription_status,is_suspended,is_beta_exempt,trial_ends_at,admin_notes,stripe_customer_id,stripe_subscription_id,created_at,updated_at"
        : "gym_id,name,accent,welcome,logo_url";
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/gyms?gym_id=eq.${encodeURIComponent(gymId)}&limit=1&select=${cols}`,
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

  // ── SUPER ADMIN — PLATFORM-WIDE GYM MANAGEMENT ──────────────────────────
  // Returns every gym row, newest first. Used only by SuperAdminDashboard.
  async getAllGyms() {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/gyms?order=created_at.desc`, { headers: SB_GET() });
      if (!res.ok) return [];
      return await res.json();
    } catch { return []; }
  },

  // Returns { [gym_id]: memberCount } across every gym in one query, so the
  // super admin dashboard doesn't need one request per gym.
  async getMemberCountsByGym() {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=gym_id`, { headers: SB_GET() });
      if (!res.ok) return {};
      const rows = await res.json();
      const counts = {};
      for (const r of rows) {
        if (!r.gym_id) continue;
        counts[r.gym_id] = (counts[r.gym_id] || 0) + 1;
      }
      return counts;
    } catch { return {}; }
  },

  // Manual lock/unlock switch — sets is_suspended on a gym's row.
  // Goes through /api/admin-gym-action (not a direct Supabase write) — a
  // database trigger now rejects direct writes to this column from anyone
  // but the platform admin, so this backend endpoint is the only path that
  // still works. (July 2026 security hardening — see admin-gym-action.js
  // for the full explanation.)
  async setGymSuspended(gymId, suspended) {
    try {
      const res = await fetch(`/api/admin-gym-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ action: "suspend", gymId, value: suspended }),
      });
      return res.ok;
    } catch { return false; }
  },

  // Saves the super admin's private note about a gym.
  // Same reasoning as setGymSuspended above — routed through the backend
  // endpoint instead of writing admin_notes directly from the browser.
  async saveGymNotes(gymId, notes) {
    try {
      const res = await fetch(`/api/admin-gym-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${getAuthToken()}` },
        body: JSON.stringify({ action: "notes", gymId, value: notes }),
      });
      return res.ok;
    } catch { return false; }
  },

  // Platform-wide usage snapshot — how many distinct members logged a workout
  // in the last 7 / 30 days, across every gym combined. Reuses the same
  // workout_logs table and columns already used for per-gym activity tracking.
  async getPlatformActivitySummary() {
    try {
      const d30 = new Date(); d30.setDate(d30.getDate() - 30);
      const startStr = d30.toISOString().slice(0, 10);
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/workout_logs?workout_date=gte.${startStr}&select=user_id,workout_date`,
        { headers: SB_GET() }
      );
      const rows = await res.json();
      if (!Array.isArray(rows)) return { active7: 0, active30: 0 };
      const d7 = new Date(); d7.setDate(d7.getDate() - 7);
      const d7Str = d7.toISOString().slice(0, 10);
      const set7 = new Set(); const set30 = new Set();
      rows.forEach(r => {
        set30.add(r.user_id);
        if (r.workout_date >= d7Str) set7.add(r.user_id);
      });
      return { active7: set7.size, active30: set30.size };
    } catch { return { active7: 0, active30: 0 }; }
  },

  // Returns { [gym_id]: { active7, active30 } } — same activity window and
  // workout_logs columns as getPlatformActivitySummary above, just grouped
  // per gym (via profiles.gym_id) instead of totalled across the platform.
  async getActiveMemberCountsByGym() {
    try {
      const d30 = new Date(); d30.setDate(d30.getDate() - 30);
      const startStr = d30.toISOString().slice(0, 10);
      const [profilesRes, logsRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,gym_id`, { headers: SB_GET() }),
        fetch(`${SUPABASE_URL}/rest/v1/workout_logs?workout_date=gte.${startStr}&select=user_id,workout_date`, { headers: SB_GET() }),
      ]);
      if (!profilesRes.ok || !logsRes.ok) return {};
      const profiles = await profilesRes.json();
      const logs = await logsRes.json();

      // Map each member's profile id to their gym, so we can tell which gym
      // a workout log entry belongs to.
      const gymByProfileId = {};
      profiles.forEach(p => { if (p.gym_id) gymByProfileId[p.id] = p.gym_id; });

      const d7 = new Date(); d7.setDate(d7.getDate() - 7);
      const d7Str = d7.toISOString().slice(0, 10);
      const set7ByGym = {};
      const set30ByGym = {};
      logs.forEach(r => {
        const gymId = gymByProfileId[r.user_id];
        if (!gymId) return;
        if (!set30ByGym[gymId]) set30ByGym[gymId] = new Set();
        set30ByGym[gymId].add(r.user_id);
        if (r.workout_date >= d7Str) {
          if (!set7ByGym[gymId]) set7ByGym[gymId] = new Set();
          set7ByGym[gymId].add(r.user_id);
        }
      });

      const result = {};
      Object.keys(set30ByGym).forEach(gymId => {
        result[gymId] = {
          active7: set7ByGym[gymId] ? set7ByGym[gymId].size : 0,
          active30: set30ByGym[gymId].size,
        };
      });
      return result;
    } catch { return {}; }
  },

  // Platform-wide monthly active member counts — last 12 calendar months.
  // Each month shows how many distinct people (profiles.id, via workout_logs
  // user_id) logged at least one workout that month. Same workout_logs
  // table/columns as getPlatformActivitySummary and getActiveMemberCountsByGym
  // above, just bucketed by calendar month instead of a rolling 7/30-day window.
  async getMonthlyActiveMembers() {
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
      const startStr = start.toISOString().slice(0, 10);
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/workout_logs?workout_date=gte.${startStr}&select=user_id,workout_date`,
        { headers: SB_GET() }
      );
      if (!res.ok) return [];
      const rows = await res.json();

      // Build all 12 month buckets up front (oldest to newest) so a month
      // with zero activity still shows as a bar, not a missing gap.
      const months = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        months.push({ key, label: d.toLocaleDateString("en-US", { month: "short" }), set: new Set() });
      }
      const byKey = {};
      months.forEach(m => { byKey[m.key] = m; });

      if (Array.isArray(rows)) {
        rows.forEach(r => {
          if (!r.workout_date) return;
          const key = r.workout_date.slice(0, 7); // "YYYY-MM"
          if (byKey[key]) byKey[key].set.add(r.user_id);
        });
      }

      return months.map(m => ({ label: m.label, count: m.set.size }));
    } catch { return []; }
  },

  // Platform-wide running total of signed-up members — last 12 calendar
  // months. Table: profiles, column: created_at (confirmed to exist). For
  // each month, counts every profile whose created_at falls on or before the
  // end of that month — a cumulative total, since members don't "unjoin" in
  // this count, so the line only ever climbs or holds flat, never drops.
  async getMonthlyTotalMembers() {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=created_at`, { headers: SB_GET() });
      if (!res.ok) return [];
      const rows = await res.json();
      const now = new Date();
      const months = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const cutoff = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
        months.push({ label: d.toLocaleDateString("en-US", { month: "short" }), cutoff });
      }
      if (!Array.isArray(rows)) return months.map(m => ({ label: m.label, count: 0 }));
      return months.map(m => ({
        label: m.label,
        count: rows.filter(r => r.created_at && new Date(r.created_at) <= m.cutoff).length,
      }));
    } catch { return []; }
  },

    // Returns every member across all gyms, newest signups first — used for
  // the super admin dashboard's "Recent signups" list, so you can verify
  // test members actually signed up and see who's used the app recently.
  // Tables: profiles (id, name, gym_id, created_at), gyms (gym_id, name),
  // workout_logs (user_id, workout_date) for the "active this week" flag —
  // same table/column already used by getPlatformActivitySummary above.
  async getRecentMembers() {
    try {
      const d7 = new Date(); d7.setDate(d7.getDate() - 7);
      const d7Str = d7.toISOString().slice(0, 10);
      const [profilesRes, gymsRes, logsRes] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,name,gym_id,created_at&order=created_at.desc`, { headers: SB_GET() }),
        fetch(`${SUPABASE_URL}/rest/v1/gyms?select=gym_id,name`, { headers: SB_GET() }),
        fetch(`${SUPABASE_URL}/rest/v1/workout_logs?workout_date=gte.${d7Str}&select=user_id`, { headers: SB_GET() }),
      ]);
      if (!profilesRes.ok) return [];
      const profiles = await profilesRes.json();
      const gyms = gymsRes.ok ? await gymsRes.json() : [];
      const logs = logsRes.ok ? await logsRes.json() : [];

      const gymNameById = {};
      gyms.forEach(g => { gymNameById[g.gym_id] = g.name || g.gym_id; });

      const activeThisWeek = new Set(logs.map(r => r.user_id));

      return profiles.map(p => ({
        id: p.id,
        name: p.name || "(no name)",
        gymName: gymNameById[p.gym_id] || p.gym_id || "Unknown gym",
        joined: p.created_at,
        activeThisWeek: activeThisWeek.has(p.id),
      }));
    } catch { return []; }
  },

// ── GYM SELF-SERVE SIGNUP ────────────────────────────────────────────────
  // Returns true if gymId is free to use, false if it's already taken.
  async isGymIdAvailable(gymId) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/gyms?gym_id=eq.${encodeURIComponent(gymId)}&limit=1`,
        { headers: SB_GET() }
      );
      if (!res.ok) return false; // be safe — treat a failed check as "not available"
      const rows = await res.json();
      return rows.length === 0;
    } catch { return false; }
  },

  // Creates a new gym row. Caller must already have confirmed the owner_email
  // isn't taken (via getGymByOwnerEmail) and the gymId is available
  // (via isGymIdAvailable) before calling this.
  // Returns { ok: true, gymId } on success, or { ok: false, error } on failure.
  async createGym({ gymId, name, ownerEmail, planTier }) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/gyms`, {
        method: "POST",
        headers: { ...SB_HEADERS(), "Prefer": "return=representation" },
        body: JSON.stringify({
          gym_id: gymId,
          name,
          owner_email: ownerEmail.toLowerCase(),
          plan_tier: planTier,
          accent: "#00D4B1",
          welcome: `Welcome to ${name}. Your personal AI trainer is ready. Let's get to work.`,
          logo_url: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "no body");
        console.error("createGym POST failed:", res.status, errText);
        return { ok: false, error: errText || `Server error (${res.status})` };
      }
      return { ok: true, gymId };
    } catch (e) {
      console.error("createGym exception:", e);
      return { ok: false, error: "Network error — check your connection and try again." };
    }
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
        `${SUPABASE_URL}/rest/v1/profiles?gym_id=eq.${encodeURIComponent(gymId)}&select=id,name,goal,weight,updated_at,is_active&order=updated_at.desc`,
        { headers: SB_GET() }
      );
      const rows = await res.json();
      return Array.isArray(rows) ? rows : [];
    } catch { return []; }
  },

  // Soft-deactivate (or restore) a member. Never deletes their data --
  // just flips is_active so they stop (or start again) counting toward
  // the gym's active-member total and monthly billing.
  async setMemberActive(profileId, isActive) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(profileId)}`, {
        method: "PATCH",
        headers: { ...SB_HEADERS(), "Prefer": "return=representation" },
        body: JSON.stringify({ is_active: isActive, updated_at: new Date().toISOString() }),
      });
      return res.ok;
    } catch { return false; }
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

  // Returns the highest weight ever logged for an exercise by this user BEFORE today,
  // so we can detect personal records when a set is saved. Returns null if no history.
  // Only looks at working sets (set_number > 0) to exclude warm-ups from PR tracking.
  async getPersonalRecord(supabaseUserId, exerciseName) {
    try {
      const profileId = await sb.getProfileId(supabaseUserId);
      if (!profileId) return null;
      const today = localDateStr();
      const url = `${SUPABASE_URL}/rest/v1/workout_logs?user_id=eq.${profileId}&exercise_name=eq.${encodeURIComponent(exerciseName)}&set_number=gt.0&workout_date=lt.${today}&order=weight.desc&limit=1`;
      const res = await fetch(url, { headers: SB_GET() });
      if (!res.ok) return null;
      const rows = await res.json();
      if (!rows || rows.length === 0) return null;
      return rows[0].weight;
    } catch { return null; }
  },

  // Fetches max weight lifted per session date for one exercise — powers the strength chart.
  // Returns array of { week: "Jun 3", weight: 30 } sorted oldest→newest, max 20 sessions.
  async getExerciseHistory(supabaseUserId, exerciseName) {
    try {
      const profileId = await sb.getProfileId(supabaseUserId);
      if (!profileId) return [];
      const url = `${SUPABASE_URL}/rest/v1/workout_logs?user_id=eq.${profileId}&exercise_name=eq.${encodeURIComponent(exerciseName)}&set_number=gt.0&order=workout_date.asc&limit=200`;
      const res = await fetch(url, { headers: SB_GET() });
      if (!res.ok) return [];
      const rows = await res.json();
      if (!rows || rows.length === 0) return [];
      // Group by date — take max weight per session
      const byDate = {};
      rows.forEach(r => {
        if (!byDate[r.workout_date] || r.weight > byDate[r.workout_date]) {
          byDate[r.workout_date] = r.weight;
        }
      });
      return Object.entries(byDate)
        .slice(-20)
        .map(([date, weight]) => ({
          week: new Date(date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
          weight,
        }));
    } catch { return []; }
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
  .mq-ring-fill{transition:stroke-dashoffset 1s linear;}
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

// ── Icon() — single shared icon set ─────────────────────────────────────────
// Replaces the native emoji ("clip art") that used to be scattered through
// the app (pencil, trophy, flame, food icons, etc.) with simple line-style
// vector icons, matching the look GOAL_ICONS below already used. Emoji glyphs
// are drawn by the phone's own emoji font in full color no matter what --
// they can never pick up the app's teal theme. These use stroke="currentColor"
// so they automatically match whatever text color surrounds them.
function Icon({ name, size = 16, color = "currentColor", style, filled = false }) {
  const common = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", style };
  switch (name) {
    case "arrow-right": return <svg {...common}><line x1="5" y1="12" x2="19" y2="12" /><polyline points="12 5 19 12 12 19" /></svg>;
    case "arrow-left": return <svg {...common}><line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" /></svg>;
    case "arrow-up": return <svg {...common}><line x1="12" y1="19" x2="12" y2="5" /><polyline points="5 12 12 5 19 12" /></svg>;
    case "arrow-down": return <svg {...common}><line x1="12" y1="5" x2="12" y2="19" /><polyline points="19 12 12 19 5 12" /></svg>;
    case "check": return <svg {...common}><polyline points="20 6 9 17 4 12" /></svg>;
    case "x": return <svg {...common}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>;
    case "refresh": return <svg {...common}><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0114.36-3.36L23 10M1 14l5.13 5.36A9 9 0 0020.49 15" /></svg>;
    case "swap": return <svg {...common}><polyline points="17 1 21 5 17 9" /><path d="M3 11V9a4 4 0 014-4h14" /><polyline points="7 23 3 19 7 15" /><path d="M21 13v2a4 4 0 01-4 4H3" /></svg>;
    case "sparkle": return <svg {...common}><path d="M12 2l1.5 5.5L19 9l-5.5 1.5L12 16l-1.5-5.5L5 9l5.5-1.5L12 2z" /></svg>;
    case "bolt": return <svg {...common} fill={color} stroke="none"><polygon points="13 2 3 14 11 14 10 22 21 10 13 10 13 2" /></svg>;
    case "flame": return <svg {...common} fill={filled ? color : "none"}><path d="M12 2c1.2 3.6-2.5 4.8-2.5 8.3a2.5 2.5 0 005 0c0-.9-.4-1.6-.8-2.3 1.3.9 2.8 2.7 2.8 5A4.5 4.5 0 0112 17.5 5.5 5.5 0 016.5 12C6.5 7.5 12 5.5 12 2z" /></svg>;
    case "trophy": return <svg {...common}><path d="M8 21h8M12 17v4" /><path d="M7 4h10v4a5 5 0 01-10 0V4z" /><path d="M7 5H4.5a2.5 2.5 0 002.5 4.5M17 5h2.5A2.5 2.5 0 0117 9.5" /></svg>;
    case "flex": return <svg {...common}><path d="M4 13l2-2 3 1 3-2 3 1 3-2 2 2" /><path d="M6 11V7a2 2 0 012-2M18 11V7a2 2 0 00-2-2" /><path d="M4 13v3a3 3 0 003 3h10a3 3 0 003-3v-3" /></svg>;
    case "meditate": return <svg {...common}><circle cx="12" cy="5" r="2" /><path d="M5 20c1-3 3-5 4-5M19 20c-1-3-3-5-4-5" /><path d="M9 15c0-2 1.5-3 3-3s3 1 3 3" /><path d="M2 20h20" /></svg>;
    case "pencil": return <svg {...common}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>;
    case "dumbbell": return <svg {...common}><path d="M6.5 6.5l11 11" /><path d="M4 9l3-3M17 20l3-3M2 15l3-3M19 6l3-3" /><rect x="1" y="12" width="4" height="4" rx="1" transform="rotate(-45 3 14)" /><rect x="19" y="6" width="4" height="4" rx="1" transform="rotate(-45 21 8)" /></svg>;
    case "bot": return <svg {...common}><rect x="3" y="8" width="18" height="12" rx="2" /><circle cx="8.5" cy="14" r="1.2" /><circle cx="15.5" cy="14" r="1.2" /><path d="M12 8V4M8 4h8" /></svg>;
    case "clipboard": return <svg {...common}><rect x="6" y="4" width="12" height="17" rx="2" /><rect x="9" y="2" width="6" height="4" rx="1" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="15" y2="16" /></svg>;
    case "sprout": return <svg {...common}><path d="M12 22v-9" /><path d="M7 9a5 5 0 015-5 5 5 0 01-5 5z" /><path d="M17 13a5 5 0 00-5-5 5 5 0 005 5z" /></svg>;
    case "trending-up": return <svg {...common}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" /></svg>;
    case "alert": return <svg {...common}><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
    case "phone": return <svg {...common}><rect x="7" y="2" width="10" height="20" rx="2" /><line x1="11" y1="18" x2="13" y2="18" /></svg>;
    case "party": return <svg {...common}><path d="M2 22l4-11 14-5-5 14z" /><path d="M17 6.5l1-3M13.5 3l1.5 2M20.5 9l2.5.5" /></svg>;
    case "signal": return <svg {...common}><line x1="3" y1="20" x2="3" y2="16" /><line x1="9" y1="20" x2="9" y2="11" /><line x1="15" y1="20" x2="15" y2="7" /><line x1="21" y1="20" x2="21" y2="3" /></svg>;
    case "chat": return <svg {...common}><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.4 8.4 0 01-3.8-.9L3 20l1-5.5a8.4 8.4 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.3z" /></svg>;
    case "megaphone": return <svg {...common}><path d="M3 11v3a1 1 0 001 1h2l4 5h2l-1-6" /><path d="M10 9l7-4v14l-7-4H4a1 1 0 01-1-1v-4a1 1 0 011-1h6z" /></svg>;
    case "camera": return <svg {...common}><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h3.5l1.8-2.4c.2-.4.6-.6 1-.6h5.4c.4 0 .8.2 1 .6L17.5 6H21a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></svg>;
    case "meat": return <svg {...common}><path d="M8.5 14.5C5.5 11.5 5.5 7 8.5 4.5c2-1.5 5-1.5 7 .5l3.5 3.5c2 2 2 5.5-.5 7-2.5 2.5-6 2.5-8.5-.5z" /><line x1="4" y1="20" x2="8.5" y2="14.5" /></svg>;
    case "cheese": return <svg {...common}><path d="M2 17L12 4l10 13z" /><circle cx="9" cy="14" r="1" fill={color} /><circle cx="14" cy="14" r="1" fill={color} /><circle cx="12" cy="9.5" r="1" fill={color} /></svg>;
    case "broccoli": return <svg {...common}><circle cx="9" cy="7.5" r="4" /><circle cx="15" cy="7.5" r="4" /><circle cx="12" cy="5.5" r="4" /><line x1="12" y1="11" x2="12" y2="21" /></svg>;
    case "avocado": return <svg {...common}><ellipse cx="12" cy="13" rx="7" ry="9" /><circle cx="12" cy="14" r="3" /></svg>;
    case "apple": return <svg {...common}><path d="M12 8c-3.3 0-5.5 2.7-5.5 6.5A6.5 6.5 0 0013 21c.8 0 1.3-.4 1.7-.8.4.4.9.8 1.7.8a6.5 6.5 0 004.6-11.1c-1.8-.6-3.3.3-4 .8-.5-.5-1.2-1.2-2.5-1.4" /><path d="M12 8c0-2 1-3.5 3-4.2" /></svg>;
    case "droplet": return <svg {...common}><path d="M12 2.5s7 8.2 7 13a7 7 0 01-14 0c0-4.8 7-13 7-13z" /></svg>;
    case "tap": return <svg {...common}><circle cx="12" cy="10" r="3" /><path d="M12 13v6M9 22h6" /><circle cx="12" cy="10" r="7" strokeDasharray="1 3" /></svg>;
    case "cloud": return <svg {...common}><path d="M17.5 19a4.5 4.5 0 000-9 6 6 0 00-11.4-2A5 5 0 006.5 19h11z" /></svg>;
    case "jar": return <svg {...common}><path d="M7 8h10v11a2 2 0 01-2 2H9a2 2 0 01-2-2V8z" /><path d="M8 8V5a1 1 0 011-1h6a1 1 0 011 1v3" /><line x1="7" y1="13" x2="17" y2="13" /></svg>;
    default: return null;
  }
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


const WORKOUT_EXERCISES = [
  { name: "Goblet Squat", muscle: "Quads / Glutes", sets: 3, targetReps: 12, weight: 25 },
  { name: "Dumbbell Row", muscle: "Back / Biceps", sets: 3, targetReps: 10, weight: 30 },
  { name: "Incline Press", muscle: "Chest / Shoulders", sets: 3, targetReps: 10, weight: 35 },
  { name: "Romanian Deadlift", muscle: "Hamstrings", sets: 3, targetReps: 10, weight: 65 },
  { name: "Shoulder Press", muscle: "Shoulders", sets: 3, targetReps: 10, weight: 25 },
];


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
  { category: "Protein", emoji: <Icon name="meat" size={13} style={{ verticalAlign: "-2px", marginRight: 3 }} />, items: [
    { name: "Chicken breast",  qty: "3 lbs",    done: false },
    { name: "Salmon fillets",  qty: "4 pieces", done: false },
    { name: "Eggs",            qty: "1 dozen",  done: false },
    { name: "Canned tuna",     qty: "4 cans",   done: false },
    { name: "Protein powder",  qty: "1 tub",    done: false },
  ]},
  { category: "Dairy", emoji: <Icon name="cheese" size={13} style={{ verticalAlign: "-2px", marginRight: 3 }} />, items: [
    { name: "Greek yogurt",    qty: "32 oz",    done: false },
    { name: "Low-fat milk",    qty: "½ gallon", done: false },
    { name: "String cheese",   qty: "1 pack",   done: false },
  ]},
  { category: "Produce", emoji: <Icon name="broccoli" size={13} style={{ verticalAlign: "-2px", marginRight: 3 }} />, items: [
    { name: "Spinach",         qty: "5 oz bag", done: false },
    { name: "Broccoli",        qty: "1 head",   done: false },
    { name: "Mixed berries",   qty: "1 bag",    done: false },
    { name: "Avocado",         qty: "3",        done: false },
    { name: "Cherry tomatoes", qty: "1 pint",   done: false },
    { name: "Lemons",          qty: "3",        done: false },
    { name: "Apples",          qty: "4",        done: false },
  ]},
  { category: "Pantry", emoji: <Icon name="jar" size={13} style={{ verticalAlign: "-2px", marginRight: 3 }} />, items: [
    { name: "Olive oil",       qty: "1 bottle", done: false },
    { name: "Almond butter",   qty: "1 jar",    done: false },
    { name: "Brown rice",      qty: "2 lbs",    done: false },
    { name: "Oats",            qty: "1 bag",    done: false },
    { name: "Sea salt & pepper",qty: "if needed",done: false },
  ]},
  { category: "Snacks", emoji: <Icon name="apple" size={13} style={{ verticalAlign: "-2px", marginRight: 3 }} />, items: [
    { name: "Baby carrots",    qty: "1 bag",    done: false },
    { name: "Rice cakes",      qty: "1 bag",    done: false },
    { name: "Mixed nuts",      qty: "1 bag",    done: false },
    { name: "Dark chocolate",  qty: "1 bar",    done: false },
  ]},
];


const WEIGHT_DATA_MOCK = [{week:"W1",weight:187.0},{week:"W2",weight:185.5},{week:"W3",weight:184.2},{week:"W4",weight:183.0},{week:"W5",weight:182.1},{week:"W6",weight:181.4}];


const PERSONAL_BESTS = [{exercise:"Goblet Squat",weight:"35 lbs",reps:13,date:"May 14"},{exercise:"Dumbbell Bench Press",weight:"35 lbs",reps:11,date:"May 12"},{exercise:"Seated Cable Row",weight:"95 lbs",reps:12,date:"May 14"},{exercise:"Romanian Deadlift",weight:"75 lbs",reps:10,date:"May 9"}];


const EQUIPMENT_OPTIONS = [
  { id: "dumbbell",    label: "Dumbbells",         sub: "Home or gym — most common" },
  { id: "barbell",     label: "Barbell & rack",     sub: "Full gym with squat rack" },
  { id: "machine",     label: "Machines only",      sub: "Commercial gym machines" },
  { id: "kettlebell",  label: "Kettlebells",         sub: "Home gym or functional fitness" },
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

function MonthlyTrendLineChart({ series }) {
  // series: [{ label, color, data: [{ label, count }, ...] }, ...]
  // All series are expected to share the same month labels/order.
  const W = 600, H = 150, PAD = 18;
  if (!series || series.length === 0 || !series[0].data || series[0].data.length === 0) return null;
  const months = series[0].data;
  const allCounts = series.flatMap(s => s.data.map(d => d.count));
  const maxV = Math.max(...allCounts, 1);
  const xStep = (W - PAD * 2) / Math.max(months.length - 1, 1);
  const toY = v => PAD + (1 - v / maxV) * (H - PAD * 2 - 18);
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
        {series.map((s, si) => {
          const points = s.data.map((d, i) => [PAD + i * xStep, toY(d.count)]);
          const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
          return (
            <g key={si}>
              <path d={linePath} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              {points.map((p, i) => (
                <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill={s.color} />
              ))}
            </g>
          );
        })}
        {months.map((m, i) => (
          <text key={i} x={PAD + i * xStep} y={H - 4} textAnchor="middle" fontSize="9" fill="#6B7A8D">{m.label}</text>
        ))}
      </svg>
      <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
        {series.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#9BB3C8" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
            {s.label}
          </div>
        ))}
      </div>
    </div>
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

// Returns the number of consecutive completed weeks (week streak), computed
// from real workout_logs dates already loaded from Supabase (see
// historicalData.weekStreak in Morphiq.jsx) — NOT from local device storage.
// A week is "complete" when at least `daysPerWeek` distinct workout dates
// fall within it. We look back up to 52 weeks, breaking at the first week
// that didn't meet the target. `workoutDates` is an array of "YYYY-MM-DD"
// strings (as stored in workout_logs.workout_date).
// Replaces the old localStorage-based version (June 2026): that version keyed
// off "morphiq_week_YYYY-MM-DD" in localStorage, which nothing ever wrote to,
// so it silently always returned 0. It also didn't survive switching domains
// (Morphiq -> Hypergentiq) since localStorage doesn't carry over between
// origins. Deriving from the database fixes both problems at once.
function getWeekStreakFromDates(workoutDates, daysPerWeek) {
  daysPerWeek = daysPerWeek || 3;
  try {
    const dateSet = new Set(workoutDates || []);
    let streak = 0;
    for (let w = 0; w < 52; w++) {
      const monday = new Date();
      const day = monday.getDay();
      monday.setDate(monday.getDate() - (day === 0 ? 6 : day - 1) - w * 7);
      let count = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        if (dateSet.has(localDateStr(d))) count++;
      }
      if (count >= daysPerWeek) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  } catch(e) { return 0; }
}



// -- Billing / paywall gate --------------------------------------------
// Central place that decides if a gym's members and owner should be locked
// out of the app. Internal/beta-exempt gyms (is_beta_exempt) are NEVER
// blocked, regardless of subscription_status. A manually-suspended gym
// (is_suspended) is always blocked. Otherwise, block only on subscription
// statuses that clearly mean "not paying" (past_due / unpaid / canceled).
// Fails OPEN: a missing/null gym row never blocks access on its own.
function isGymBlocked(gymRow) {
  if (!gymRow) return false;
  if (gymRow.is_beta_exempt) return false;
  if (gymRow.is_suspended) return true;
  const blockedStatuses = ["past_due", "unpaid", "canceled"];
  return blockedStatuses.includes(gymRow.subscription_status);
}

// ── All shared exports for screen files ─────────────────────────────────────
export {
  // Auth / DB
  sb, SUPABASE_URL, SUPABASE_ANON, SB_HEADERS, SB_GET, getAuthToken, localDateStr,
  // App context
  AppContext, useApp, DEFAULT_USER, SESSION_KEY, setSessionCookie, getSessionCookie, clearSessionCookie,
  // Theme
  theme, css,
  // Plan engine
  buildPlan, progressPlan,
  // Exercise data
  EXERCISE_LIBRARY, STARTING_WEIGHTS, DEFAULT_WEIGHT,
  // UI components
  MicIcon, VoiceBtn, Pill, Spinner, NavIcon, Layout, Icon,
  // Screen data constants
  GOAL_ICONS, GOAL_OPTIONS, EQUIPMENT_OPTIONS,
  WORKOUT_EXERCISES, MEAL_DATA, GROCERY_DATA,
  FALLBACK_REPLIES, CHAT_SUGGESTIONS,
  WEIGHT_DATA_MOCK, PERSONAL_BESTS,
  // Utility functions
  getFallbackReply, fetchAIReply,
  // Progress screen sub-components
  WeightChart, StreakCalendar, getWeekStreakFromDates,
  // Admin dashboard sub-components
  MonthlyTrendLineChart,
  // Billing / paywall
  isGymBlocked,
};
