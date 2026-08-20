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

  // Fetch WORKING sets only (excludes warm-ups, same set_number=gt.0
  // convention as getLastSetForExercise() above) over a date-based lookback
  // window, across every exercise. Feeds progressPlan()'s plateau/deload
  // trend check as well as its existing 2-for-2 progression rule.
  //
  // Session 11: added because the only thing progressPlan() was previously
  // fed at its real call site (checkAndGenerateNextWeek() in Morphiq.jsx)
  // was sb.getWorkoutLogs(uid, 30) -- no set_number filter at all, and a
  // flat 30-row cap across every exercise combined. That silently mixed
  // warm-up sets (lighter weight, different rep count) into every
  // progression decision, and 30 rows total wasn't enough history to judge
  // a real per-exercise trend once a member has more than a handful of
  // exercises in rotation. Kept as its own function rather than changing
  // getWorkoutLogs() itself, since the Progress screen still wants that
  // one's simple, unfiltered, most-recent-N-sets behavior as-is.
  async getWorkoutLogsForProgression(supabaseUserId, daysBack = 70) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return [];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysBack);
      const cutoffStr = localDateStr(cutoff);
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/workout_logs?user_id=eq.${profileId}&set_number=gt.0&workout_date=gte.${cutoffStr}&order=logged_at.desc&limit=500`,
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

  // Fetch the most recent time a SPECIFIC working set number (1st working set,
  // 2nd, etc.) was performed for this exercise -- NOT just whatever was logged
  // last overall. Used to show "Last time: X lbs x Y reps" before each set.
  // Bug fix (session 20): this used to ignore setNumber entirely and grab the
  // single most-recently-logged working set for the exercise, so every set of
  // a multi-set exercise (set 1, set 2, set 3...) showed the identical number --
  // usually the heaviest/last set from last time -- instead of the matching
  // set from last time's ramp. Now it matches set-for-set (today's set 1 is
  // compared to last time's set 1, not last time's set 4).
  // Returns { weight, reps, date } or null if no history found for that set number.
  async getLastSetForExercise(supabaseUserId, exerciseName, setNumber) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return null;
      const name = encodeURIComponent(exerciseName);
      // Only look at PRIOR workouts (before today) -- otherwise, mid-session,
      // this would show the set you just logged a few minutes ago instead of
      // last time you actually trained this exercise (a real prior session).
      const today = localDateStr();
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/workout_logs?user_id=eq.${profileId}&exercise_name=eq.${name}&set_number=eq.${setNumber}&workout_date=lt.${today}&order=logged_at.desc&limit=1`,
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

  // ── GROCERY CUSTOM ITEMS ──────────────────────────────────────────────────
  // Member-added grocery items that recur every week, unlike the rest of the
  // grocery list which rebuilds fresh from the plan each week. Only the item
  // itself lives here -- checked/done state stays local (localStorage, per
  // week), matching how every other grocery item's checked state already
  // works. table: grocery_custom_items (id, user_id, category, item_name,
  // qty, created_at), RLS-scoped to the member's own rows via profiles.id.
  async getGroceryCustomItems(supabaseUserId) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return [];
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/grocery_custom_items?user_id=eq.${profileId}&order=created_at.asc`,
        { headers: SB_GET() }
      );
      const rows = await res.json();
      return Array.isArray(rows) ? rows : [];
    } catch { return []; }
  },

  async insertGroceryCustomItem(supabaseUserId, { category, itemName, qty }) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return null;
      const res = await sbFetchRetry(`${SUPABASE_URL}/rest/v1/grocery_custom_items`, () => ({
        method: "POST",
        headers: { ...SB_HEADERS(), Prefer: "return=representation" },
        body: JSON.stringify({
          user_id: profileId,
          category,
          item_name: itemName,
          qty: qty || null,
        }),
      }));
      if (!res.ok) return null;
      const rows = await res.json();
      return Array.isArray(rows) && rows[0] ? rows[0] : null;
    } catch { return null; }
  },

  async deleteGroceryCustomItem(itemId) {
    try {
      const res = await sbFetchRetry(`${SUPABASE_URL}/rest/v1/grocery_custom_items?id=eq.${itemId}`, () => ({
        method: "DELETE",
        headers: SB_HEADERS(),
      }));
      return res.ok;
    } catch { return false; }
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

  // Fetch raw meal_logs rows over a lookback window, for the Progress screen's
  // Nutrition tab -- daysBack bounds by date (not row count) since a member
  // can log several entries per day, same reasoning as getCardioDatesForStreak's
  // date-based cutoff. 35 days comfortably covers both the 14-day trend chart
  // and a "this month" stat with room to spare. Each row already carries
  // logged_cal/logged_protein/logged_carbs/logged_fat (see insertMealLog above)
  // -- callers bucket by date client-side, same pattern as cardioLogs.
  async getMealLogs(supabaseUserId, daysBack = 35) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return [];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysBack);
      const cutoffStr = localDateStr(cutoff);
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/meal_logs?user_id=eq.${profileId}&date=gte.${cutoffStr}&order=date.desc&limit=500`,
        { headers: SB_GET() }
      );
      if (!res.ok) return [];
      return await res.json();
    } catch { return []; }
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
  // Fix (this session): this used to be a single attempt with a bare catch --
  // any transient failure (most commonly right when the app resumes from the
  // background on mobile and the network is still reconnecting) silently gave
  // up and left the caller's gymBranding state on its hardcoded placeholder
  // default. That placeholder used to be a real gym's name, so a flaky reload
  // could permanently show one specific real gym's identity to every member
  // until the next reload happened to succeed -- this is the "flips back to
  // the wrong gym after minimizing the app" bug. Retrying a few times with a
  // short backoff (same pattern as getProfileWithRetry) makes this correction
  // reliable instead of a coin flip on every app resume.
  async getGymBranding(gymId = "demo-gym", attempts = 3) {
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
    for (let i = 0; i < attempts; i++) {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/gyms?gym_id=eq.${encodeURIComponent(gymId)}&limit=1&select=${cols}`,
          { headers: SB_GET() }
        );
        const rows = await res.json();
        if (rows?.[0]) return rows[0];
      } catch {}
      if (i < attempts - 1) await new Promise(r => setTimeout(r, 600));
    }
    return null;
  },

  async saveGymBranding(gymId = "demo-gym", { name, accent, welcome, logo }) {
    try {
      // PATCH targets the specific existing row by gym_id — correct way to update.
      // logo is optional -- pass undefined (not called at all with the key) to
      // leave whatever's already saved untouched; pass null to explicitly clear it.
      const body = { name, accent, welcome, updated_at: new Date().toISOString() };
      if (logo !== undefined) body.logo_url = logo;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/gyms?gym_id=eq.${encodeURIComponent(gymId)}`, {
        method: "PATCH",
        headers: { ...SB_HEADERS(), "Prefer": "return=representation" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "no body");
        console.error("saveGymBranding PATCH failed:", res.status, errText, "gymId:", gymId);
      }
      return res.ok;
    } catch (e) { console.error("saveGymBranding exception:", e); return false; }
  },

  // Uploads (or replaces) a gym's logo image to Supabase Storage. Always
  // stored as "<gymId>/logo.<ext>" so a re-upload overwrites the old file
  // instead of piling up orphaned images -- x-upsert handles the overwrite.
  // Returns { ok: true, url } with a cache-busted public URL on success (so
  // a fresh upload shows immediately instead of serving a browser-cached
  // copy of the old logo at the same path), or { ok: false, error }.
  async uploadGymLogo(gymId, file) {
    try {
      const extFromName = (file.name || "").split(".").pop();
      const extFromType = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/svg+xml": "svg" }[file.type];
      const ext = (extFromType || extFromName || "png").toLowerCase();
      const path = `${gymId}/logo.${ext}`;
      const res = await fetch(`${SUPABASE_URL}/storage/v1/object/gym-logos/${path}`, {
        method: "POST",
        headers: { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${getAuthToken()}`, "Content-Type": file.type || "application/octet-stream", "x-upsert": "true" },
        body: file,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "no body");
        console.error("uploadGymLogo failed:", res.status, errText, "gymId:", gymId);
        return { ok: false, error: res.status === 413 ? "That image is too large (2MB max)." : "Upload failed — check your connection and try again." };
      }
      return { ok: true, url: `${SUPABASE_URL}/storage/v1/object/public/gym-logos/${path}?v=${Date.now()}` };
    } catch (e) {
      console.error("uploadGymLogo exception:", e);
      return { ok: false, error: "Network error — check your connection and try again." };
    }
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
          accent: "#4C8DFF",
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

  // Bug fix (Aug 2026): this used to fetch order=asc (oldest first) with a
  // limit, which silently returns only the OLDEST N entries ever logged --
  // once a member passed the limit, every new weigh-in they logged would
  // never appear on the chart again, forever. Now fetches the most recent
  // `limit` entries (order=desc) and reverses to ascending before returning,
  // so callers always see their latest history regardless of total count.
  async getWeightLogs(supabaseUserId, limit = 180) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return [];
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/weight_logs?user_id=eq.${profileId}&order=logged_date.desc&limit=${limit}`,
        { headers: SB_GET() }
      );
      const rows = await res.json();
      return Array.isArray(rows) ? rows.reverse() : rows;
    } catch { return []; }
  },

  // ── WATER LOGS ────────────────────────────────────────────────────────────
  // Session 37: water was previously localStorage-only (see WaterTracker,
  // MealScreen.jsx) -- today's count only, per device, no history. Table
  // created to match weight_logs' shape (same open RLS policy too), but
  // event-log style like meal_logs/cardio_logs rather than one-row-per-day
  // like weight_logs, since a day's water is several small additions (and
  // occasionally a correction) rather than one single value -- each add/
  // remove tap writes its own row (amount_oz negative for a removal) and
  // callers sum by logged_date to get a day's total, same division of
  // responsibility as getMealLogs()'s per-day byDate bucketing.
  async insertWaterLog(supabaseUserId, amountOz) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return false;
      const res = await sbFetchRetry(`${SUPABASE_URL}/rest/v1/water_logs`, () => ({
        method: "POST",
        headers: SB_HEADERS(),
        body: JSON.stringify({
          user_id: profileId,
          amount_oz: amountOz,
          logged_date: new Date().toISOString().slice(0, 10),
          logged_at: new Date().toISOString(),
        }),
      }));
      return res.ok;
    } catch { return false; }
  },

  async getWaterLogs(supabaseUserId, daysBack = 35) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return [];
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - daysBack);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/water_logs?user_id=eq.${profileId}&logged_date=gte.${cutoffStr}&order=logged_date.desc&limit=500`,
        { headers: SB_GET() }
      );
      const rows = await res.json();
      return Array.isArray(rows) ? rows : [];
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
  accent: "#4C8DFF", accentDim: "rgba(76,141,255,0.10)", accentBorder: "rgba(76,141,255,0.25)",
  bg: "#121316", surface: "#1B1D21", border: "#2B2E34", borderSubtle: "#242730",
  text: "#EDEEF0", textMuted: "#9BA0AA", textDim: "#6E7480", textFaint: "#3A3D44",
  success: "#1D9E75", amber: "#F59E0B", amberDim: "rgba(245,158,11,0.12)",
  red: "#F87171", card: "#212429", card2: "#171920",
  ob: {
    bg: "#121316", surface: "#1B1D21", card: "#212429", card2: "#171920",
    teal: "#4C8DFF", tealDk: "#0B1E3D", border: "#2B2E34",
    white: "#EDEEF0", body: "#9BA0AA", muted: "#6E7480",
    font: "'Inter', system-ui, sans-serif",
  },
  sL: { fontSize: 11, color: "#9BA0AA", letterSpacing: ".08em", textTransform: "uppercase", marginBottom: ".65rem" },
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
    // Push/Pull day secondary movements (session 15b) -- see comment above
    // pushSecondaryEx/pullSecondaryEx in buildPlan() for why these exist.
    push_secondary: { name: "Dumbbell lateral raise", muscle: "Shoulders (lateral delt)", pattern: "accessory" },
    pull_secondary: { name: "Barbell curl",           muscle: "Biceps",                  pattern: "accessory" },
    pull_secondary_wrist: { name: "Dumbbell hammer curl", muscle: "Biceps / Forearms",   pattern: "accessory" },
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
    push_secondary: { name: "Dumbbell lateral raise", muscle: "Shoulders (lateral delt)", pattern: "accessory" },
    pull_secondary: { name: "Dumbbell bicep curl",    muscle: "Biceps",                  pattern: "accessory" },
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
    push_secondary: { name: "Cable lateral raise", muscle: "Shoulders (lateral delt)", pattern: "accessory" },
    pull_secondary: { name: "Cable bicep curl",    muscle: "Biceps",                  pattern: "accessory" },
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
    push_secondary: { name: "Kettlebell lateral raise", muscle: "Shoulders (lateral delt)", pattern: "accessory" },
    pull_secondary: { name: "Kettlebell bicep curl",    muscle: "Biceps",                  pattern: "accessory" },
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
  // Push/Pull day secondary isolation movements (session 15b). Deliberately
  // lighter progressions than the compound lifts above -- lateral raises in
  // particular are notorious for looking "easy" on paper but wrecking form
  // and inviting shoulder impingement the moment the weight gets ambitious;
  // real coaching consensus is to stay conservative here and let reps/burn
  // do the work rather than the load.
  "Dumbbell lateral raise":       { beginner: 5,   some: 8,   returning: 10,  experienced: 12  },
  "Cable lateral raise":          { beginner: 5,   some: 10,  returning: 15,  experienced: 20  },
  // Kettlebells only come in big fixed jumps (see weightIncrement note in
  // buildPlan()) -- deliberately NOT reusing the same 15/25/35/44/53 ladder
  // every other kettlebell exercise in this table uses. That ladder is
  // calibrated for squats/presses/rows; a beginner starting lateral raises
  // at a 15lb kettlebell is a real recipe for using momentum instead of the
  // delt. Lighter, raise-appropriate numbers instead.
  "Kettlebell lateral raise":     { beginner: 8,   some: 12,  returning: 15,  experienced: 18  },
  "Barbell curl":                 { beginner: 20,  some: 30,  returning: 40,  experienced: 50  },
  "Dumbbell bicep curl":          { beginner: 10,  some: 15,  returning: 20,  experienced: 25  },
  "Dumbbell hammer curl":         { beginner: 10,  some: 15,  returning: 20,  experienced: 25  },
  "Cable bicep curl":             { beginner: 15,  some: 20,  returning: 30,  experienced: 40  },
  "Kettlebell bicep curl":        { beginner: 10,  some: 15,  returning: 20,  experienced: 25  },
};
const DEFAULT_WEIGHT = 20; // fallback if exercise not in table

// ── Weight increment lookup ───────────────────────────────────────────────
// What's actually loadable per equipment type, not a flat guess. A barbell
// needs a 2.5lb plate on EACH side to add weight at all -- that's really a
// 5lb jump, no smaller real option -- and commercial dumbbells/machine pins
// jump in 5s too. Kettlebells only come in big fixed sizes; the app's own
// STARTING_WEIGHTS ladder for kettlebell exercises above already jumps by
// 9-10lb between tiers (15->25->35->44->53), so 9 here isn't a guess, it's
// grounded in that same real spacing rather than pretending kettlebells
// behave like a barbell. Session 16 fix: CustomPlanScreen (WorkoutScreen.jsx)
// used to hardcode 2.5 for every hand-built exercise regardless of
// equipment -- real gyms essentially never offer a true 2.5lb TOTAL jump, so
// members were being told to add weight in increments that don't exist on
// the equipment they actually have. Shared here so buildPlan() (AI plans)
// and CustomPlanScreen (hand-built plans) can't drift apart on this again.
function getWeightIncrement(equipment) {
  return equipment === "kettlebell" ? 9 : 5;
}

// ── Plate-math breakdown ──────────────────────────────────────────────────
// Shows exactly which plates to load per side for a barbell working set --
// e.g. "2×45 + 1×10 per side" -- instead of a member doing that math
// themselves mid-set. Pure client-side arithmetic over the standard
// commercial plate set already on any gym floor; no AI call, same reasoning
// as detectPlateau()/isBigWeightJump() elsewhere in this file.
//
// Only meaningful for a true barbell lift -- dumbbells/kettlebells are
// already a single fixed-weight implement, and most machines are pin-loaded,
// not plate-loaded. isBarbellExercise() is deliberately name-based (checks
// for the "Barbell " prefix EXERCISE_LIBRARY already uses for every real
// barbell movement) rather than reading the plan-level equipment setting,
// because even a "barbell" plan mixes in real dumbbell accessory work (e.g.
// "Dumbbell lateral raise") that the plan-level flag alone can't tell apart.
//
// Known simplification, not a bug: assumes one standard 45lb Olympic bar for
// every barbell exercise. Doesn't account for a women's 35lb bar, EZ-curl
// bar, or trap bar weight -- revisit if that distinction ever becomes real
// (e.g. a per-exercise bar-weight field), same spirit as the kettlebell
// increment placeholder above.
const BAR_WEIGHT_LBS = 45;
const PLATE_SIZES_LBS = [45, 35, 25, 10, 5, 2.5]; // largest first, greedy fill

function isBarbellExercise(exerciseName) {
  return /^barbell\b/i.test((exerciseName || "").trim());
}

// Returns null when there isn't enough weight to break down (below bar
// weight -- can't happen with a real bar, but a manually-typed override
// could go there). { plates: [{size, count}], perSide, remainder, barOnly }
// otherwise. remainder is only ever nonzero for an odd manually-typed
// weight that doesn't land on a clean 2.5lb-per-side step -- every plan-
// generated and stepper-adjusted weight always does (5lb total increments).
function getPlateBreakdown(totalWeight, barWeight = BAR_WEIGHT_LBS) {
  if (!totalWeight || totalWeight < barWeight) return null;
  const perSide = (totalWeight - barWeight) / 2;
  if (perSide <= 0) return { plates: [], perSide: 0, remainder: 0, barOnly: true };

  const plates = [];
  let remaining = perSide;
  for (const size of PLATE_SIZES_LBS) {
    const count = Math.floor(remaining / size + 1e-9); // epsilon guards float drift
    if (count > 0) {
      plates.push({ size, count });
      remaining = Math.round((remaining - count * size) * 100) / 100;
    }
  }
  return { plates, perSide, remainder: remaining, barOnly: false };
}

// Human-readable line for the active-set screen, e.g. "2×45 + 1×10 per side"
// or "Just the bar". Returns null when there's nothing useful to show.
function formatPlateBreakdown(breakdown) {
  if (!breakdown) return null;
  if (breakdown.barOnly) return `Just the bar (${BAR_WEIGHT_LBS} lbs)`;
  if (!breakdown.plates.length) return null;
  const parts = breakdown.plates.map(p => `${p.count}×${p.size}`).join(" + ");
  return breakdown.remainder > 0.01 ? `~${parts} per side` : `${parts} per side`;
}

// ── Daily readiness check-in ──────────────────────────────────────────────
// One-tap "how do you feel today" nudge shown once at the start of a fresh
// workout (WorkoutScreen.jsx gates this the same way it already gates the
// one-time pre-workout mobility warm-up -- via the phase-persistence
// mechanism, so it never reappears on a resumed session). Deliberately
// touches ONLY the displayed working-set weight for THIS session, applied
// the exact same way the existing progressive-overload nudge and manual
// +/- stepper already work (a display-time layer on top of
// currentSpec.weight, never written back to the plan) -- so it can't
// interact with progressPlan()/buildPlan() or the deload/plateau logic at
// all. Warm-up sets are intentionally left unadjusted (already light by
// design, see buildWarmupRamp()'s own comments above).
const READINESS_MULTIPLIERS = { rough: 0.9, ok: 1, great: 1.05 };

function applyReadinessToWeight(weight, readiness, increment = 5) {
  if (!weight || !readiness || readiness === "ok") return weight;
  const mult = READINESS_MULTIPLIERS[readiness] ?? 1;
  // Round to the nearest real increment so it's always a loadable number --
  // same rounding convention buildWarmupRamp() uses -- with a safety floor
  // of one increment so this can never round down to zero or negative.
  return Math.max(increment, Math.round((weight * mult) / increment) * increment);
}

// ── Macro calculator (Mifflin-St Jeor) ────────────────────────────────────
// Same formula OnboardingScreen.jsx and CustomPlanScreen (WorkoutScreen.jsx)
// each used to keep as their own separate copy, "kept in sync manually" per
// the comments that used to live in both places -- collapsed to one shared
// function here instead, for the same reason isMultiDayPlan() was: two
// copies of the same math drifting apart is the recurring root cause of
// real bugs in this codebase. Returns null unless sex + a valid height +
// weight + age are all present, so callers can preview it before it's
// complete and fall back to manual entry when body stats are unknown.
function calcMacros({ sex, heightFt, heightIn, bodyWeight, age, daysPerWeek, goal }) {
  const validBody = heightFt && parseInt(heightFt) > 0 && parseInt(heightFt) < 9 && bodyWeight && parseFloat(bodyWeight) > 0;
  const validAge = age && parseInt(age) >= 13 && parseInt(age) <= 100;
  if (!sex || !validBody || !validAge) return null;
  // Case-insensitive on purpose -- sex is stored capitalized ("Male") coming
  // from some screens and lowercase ("male") from others; a bare === "male"
  // check silently gave every "Male" member the female BMR formula and
  // calorie floor until this was caught and fixed in OnboardingScreen in
  // July 2026. Keep this normalized even if the callers' casing changes.
  const isMale = (sex || "").toLowerCase() === "male";
  const weightKg = parseFloat(bodyWeight) / 2.205;
  const heightCm = ((parseInt(heightFt) * 12) + parseInt(heightIn || 0)) * 2.54;
  const ageNum = parseInt(age);
  const bmr = isMale
    ? Math.round((10 * weightKg) + (6.25 * heightCm) - (5 * ageNum) + 5)
    : Math.round((10 * weightKg) + (6.25 * heightCm) - (5 * ageNum) - 161);
  const activityMult = daysPerWeek >= 4 ? 1.55 : 1.375;
  const tdee = Math.round(bmr * activityMult);
  const goalAdj = goal === "build_muscle" ? 250 : goal === "lose_fat" ? -350 : 0; // Research: ~350 cal deficit = ~0.7lb/week loss, maximizes fat loss while preserving muscle
  const minCals = isMale ? 1600 : 1400;
  const cals = Math.max(minCals, tdee + goalAdj);
  const proteinPer = goal === "general_fitness" ? 0.8 : 1.0; // Research: 0.7g/lb is minimum; 0.8-1.0g/lb optimal for body recomposition at any goal
  const fatPer = goal === "build_muscle" ? 0.4 : goal === "lose_fat" ? 0.3 : 0.35; // Fat loss: slightly lower fat to create deficit room for protein
  const prot = Math.round(parseFloat(bodyWeight) * proteinPer);
  const ft = Math.round(parseFloat(bodyWeight) * fatPer);
  const cb = Math.round((cals - (prot * 4) - (ft * 9)) / 4);
  return { calories: cals, protein: prot, carbs: cb, fat: ft, bmr, tdee, goalAdjustment: goalAdj };
}

// ── Warm-up ramp generator ──────────────────────────────────────────────────
// Shared by buildPlan() (bakes a ramp into AI-generated plans at creation
// time) and WorkoutScreen's live fallback (computes one on the fly for
// custom plans and any older plan that never stored a warmupSets array --
// custom plans NEVER store one, so this is the path they always hit).
// Fix (session 9): these used to be two separate copies of this same function
// that quietly drifted out of sync -- one got updated to round to a flat 5 lb
// increment, the other didn't, so upper-body warm-ups could land on a
// fractional weight like 87.5 lbs. On top of that, neither copy told the
// difference between a heavy compound lift and a single-joint isolation
// exercise, so isolation work (curls, leg curls, calf raises, tricep
// pushdowns) got the exact same 3-set ramp as a barbell squat -- not how
// anyone actually trains. Now there's one function: compound/multi-joint
// lifts get the full 50/70/85% ramp, everything else gets a single lighter
// warm-up set (or none, if the working weight is already light).
const COMPOUND_LIFT_PATTERN = /squat|lunge|step-up|leg press|deadlift|\brdl\b|romanian|hip thrust|\brow\b|pull-?up|pulldown|chin-?up|bench press|incline press|shoulder press|overhead press|push press|floor press|landmine press|chest press|thruster/i;

function buildWarmupRamp(workingWeight, exerciseName) {
  // Skip ramp for bodyweight or light accessory loads — not needed.
  if (!workingWeight || workingWeight < 65) return [];
  const roundTo = 5; // what's actually loadable on barbell/dumbbell/machine gear, not a body-region guess
  const round = (x) => Math.max(roundTo, Math.round(x / roundTo) * roundTo);
  const isCompound = COMPOUND_LIFT_PATTERN.test(exerciseName || "");
  // Compound lifts ramp up over 3 sets; isolation/single-joint work gets one
  // lighter set just to get the joint moving, matching how people actually warm up.
  const pcts = isCompound ? [0.5, 0.7, 0.85] : [0.6];
  return pcts
    .map((p, i) => ({
      weight: round(workingWeight * p),
      reps: isCompound ? (i === 0 ? 8 : i === 1 ? 5 : 3) : 10, // fewer reps as it gets heavier
    }))
    // Drop any warm-up that lands at/above the working weight (very light lifts)
    .filter((s) => s.weight < workingWeight);
}

// Re-ramp the remaining warm-up sets when a member manually raises an
// earlier warm-up's weight (e.g. it felt too light). Bug this fixes: the
// live workout screen let you bump a warm-up set's weight with the +/-
// stepper, but every warm-up after it kept using the original plan's
// numbers -- so raising set 1 from 95 to 135 could be followed by a
// "next" warm-up of 125, lower than what you just lifted. That's because
// warm-ups were a fixed, pre-computed ramp that never looked at what
// actually got logged, unlike working sets (see autoregulatedWeight() in
// WorkoutScreen.jsx), which already carry a manual adjustment forward.
//
// Fix: back out an "implied" working weight from the member's own number
// (their weight divided by that step's normal percentage), then rebuild
// every step AFTER the overridden one off that implied weight -- so the
// ramp keeps climbing in the same shape instead of just flat-copying one
// number forward, which could otherwise flatten or even invert the ramp
// if the plan's next step was originally lower than what was just typed.
// Steps at/before the overridden index are left alone (already lifted).
function reRampWarmups(workingWeight, exerciseName, overriddenIndex, overriddenWeight) {
  if (!workingWeight || !overriddenWeight || overriddenIndex == null) return null;
  const isCompound = COMPOUND_LIFT_PATTERN.test(exerciseName || "");
  const pcts = isCompound ? [0.5, 0.7, 0.85] : [0.6];
  if (!pcts[overriddenIndex]) return null; // nothing after this step to re-ramp
  const roundTo = 5;
  const round = (x) => Math.max(roundTo, Math.round(x / roundTo) * roundTo);
  // Bug fix (Bryant, live report): this used to back out an "implied
  // working weight" by dividing the override by that step's OWN percentage
  // (overriddenWeight / pcts[overriddenIndex]), then rebuild every later
  // step off that number. For an early, low-percentage step this massively
  // amplifies a modest bump -- a real example: bumping a 90 lb first warm-up
  // (50% step) to 135 implied a 270 lb working weight (135 / 0.5), nearly
  // double the real 175 lb target, and cascaded a 190 lb "warm-up" that was
  // already heavier than the actual working set it was supposed to build
  // toward. Checked against Hevy, Fitbod, and JuggernautAI (the closest
  // real comparison, since it's the one mainstream app that also reacts to
  // warm-up feedback): none of them do a percentage-inversion recalculation
  // like this, and none ever let a warm-up reach the real working weight,
  // at any experience level. New rule, matching that: every later step
  // becomes the HIGHER of (a) its own original planned number or (b) what
  // was just lifted -- so the ramp never visibly drops after a bump, which
  // is the original problem this function exists to prevent -- and is
  // always capped strictly below the real working weight, however it was
  // derived, matching buildWarmupRamp()'s own rule for the initial ramp.
  const cap = Math.max(roundTo, workingWeight - roundTo);
  return pcts.map((p, i) => {
    const reps = isCompound ? (i === 0 ? 8 : i === 1 ? 5 : 3) : 10;
    if (i <= overriddenIndex) return { weight: Math.min(overriddenWeight, cap), reps }; // not read by the caller for i < overriddenIndex; kept valid regardless
    const originalPlanned = round(workingWeight * p);
    return { weight: Math.min(Math.max(originalPlanned, overriddenWeight), cap), reps };
  });
}

// Suggested new working weight when the member manually raises their LAST
// warm-up set (the one closest to their actual working weight, e.g. the 85%
// step on a compound lift). Deliberately NOT used for earlier warm-up sets --
// those are supposed to feel light by design (that's the whole point of a
// warm-up), so treating "felt light" as a signal on every step would react
// to something that's working correctly. The last step is the one real
// readiness check, the same way lifters use a heavy "opener" set to decide
// whether to push their working weight up, hold, or back off.
function impliedWorkingWeight(exerciseName, overriddenWeight) {
  const isCompound = COMPOUND_LIFT_PATTERN.test(exerciseName || "");
  const pcts = isCompound ? [0.5, 0.7, 0.85] : [0.6];
  const lastPct = pcts[pcts.length - 1];
  const roundTo = 5;
  return Math.max(roundTo, Math.round((overriddenWeight / lastPct) / roundTo) * roundTo);
}

// Evenly interleaves dedicated cardio days into a lifting-day rotation so
// cardio days never cluster at the end or land back-to-back with each other
// (even-distribution interleave, same idea as Bresenham's line algorithm).
// liftingDays: array of already-built day objects (the lifting rotation,
// expanded to however many lifting slots/week the caller wants). cardioNum:
// 0-4 dedicated cardio days/week. Returns the merged weekly sequence
// unchanged (liftingDays as-is) if cardioNum is 0 or liftingDays is empty.
// Shared by buildPlan() (AI-generated lose_fat plans) and CustomPlanScreen's
// savePlan() (WorkoutScreen.jsx, hand-built plans) so there is exactly one
// copy of this logic -- see "duplicate logic is the recurring root cause of
// real bugs" note in HANDOFF.md technical notes.
function interleaveCardioDays(liftingDays, cardioNum) {
  if (!cardioNum || cardioNum <= 0 || !liftingDays?.length) return liftingDays;
  const liftingSequence = liftingDays;
  const cardioSequence = Array.from({ length: cardioNum }, () => ({ dayLabel: "Cardio", isCardio: true, exercises: [] }));
  const total = liftingSequence.length + cardioSequence.length;
  const weekSequence = [];
  let liftUsed = 0, cardioUsed = 0;
  for (let i = 0; i < total; i++) {
    // Whichever group is proportionally furthest behind its fair share
    // goes next -- classic even-distribution interleave.
    const liftDue = (liftUsed + 1) / liftingSequence.length;
    const cardioDue = (cardioUsed + 1) / cardioSequence.length;
    if (cardioUsed < cardioSequence.length && (liftUsed >= liftingSequence.length || cardioDue <= liftDue)) {
      weekSequence.push(cardioSequence[cardioUsed]);
      cardioUsed++;
    } else {
      weekSequence.push(liftingSequence[liftUsed]);
      liftUsed++;
    }
  }
  return weekSequence;
}

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
    cardioDaysPerWeek: cardioDaysPerWeekRaw = 0,
  } = userProfile;

  // Resolve experience tier
  const expTier = trainingHistory === "new" ? "beginner"
    : trainingHistory === "some" ? "some"
    : recentActivity === "returning" ? "returning"
    : "experienced";

  const ageNum = parseInt(age) || 30;
  const isOver40 = ageNum >= 40;
  // Bug fix (July 2026): same case-mismatch bug as OnboardingScreen.jsx's BMR
  // calc — the sex value coming through from onboarding is capitalized
  // ("Male"/"Female"), so a bare === "female" check was always false. Keep
  // this case-insensitive even if the source casing changes later.
  const isFemale = (sex || "").toLowerCase() === "female";
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
  // Fix (session 9): "strength" ("Get stronger, hit PRs") is a real,
  // selectable goal in onboarding, but was never actually branched here --
  // it silently fell through to the same bucket as "get_fit", producing the
  // exact same 10-15/10-12 rep range as general fitness. That's a
  // hypertrophy/endurance rep range, not a strength one, so a member who
  // picked "get stronger" was getting a plan indistinguishable from "get
  // fit". Now uses a real low-rep strength range: 5-8 while still building
  // technique as a beginner, 3-6 (the standard strength-training range) once
  // experienced.
  let repMin, repMax;
  if (goal === "strength") {
    repMin = isBeginner ? 5 : 3;
    repMax = isBeginner ? 8 : 6;
  } else if (goal === "build_muscle") {
    repMin = isFemale ? 10 : (isBeginner ? 10 : 8);
    repMax = isFemale ? 14 : (isBeginner ? 12 : 10);
  } else if (goal === "lose_fat") {
    repMin = 10; repMax = isBeginner ? 15 : 12;
  } else {
    repMin = 10; repMax = isBeginner ? 15 : 12;
  }

  // ── Rest periods ──────────────────────────────────────────────────
  // Same gap as the rep range above -- "strength" fell through to the same
  // rest periods as general fitness. Heavy low-rep work needs full ATP-PC
  // recovery between sets, so strength gets its own, longer, flat rest
  // regardless of age (under-recovering a heavy set is the wrong place to
  // cut time for an older lifter, not a place to shorten it).
  const restCompound = goal === "strength" ? 180
    : isOver40
    ? (goal === "lose_fat" ? 90 : goal === "build_muscle" ? 150 : 105)
    : (goal === "lose_fat" ? 60 : goal === "build_muscle" ? 120 : 75);
  const restAccessory = goal === "strength" ? 120
    : isOver40
    ? (goal === "lose_fat" ? 75 : 90)
    : (goal === "lose_fat" ? 45 : 60);
  // If the user explicitly picked a rest preference in onboarding, honour it
  // instead of the calculated value. restPref is in seconds (60, 120, or 180).
  const effectiveRestCompound = restPref || restCompound;
  const effectiveRestAccessory = restPref
    ? Math.round(restPref * 0.75)
    : restAccessory;

  // ── RPE ───────────────────────────────────────────────────────────
  // Same gap again -- strength work is meant to be pushed closer to true
  // near-max effort than general fitness, so it gets a higher RPE target at
  // every experience tier (still capped by the same age-based rpeMax safety
  // ceiling as everyone else).
  const rpeMax = isOver40 ? 8 : 9;
  const rpe = goal === "strength"
    ? (isBeginner ? 7 : Math.min(9, rpeMax))
    : isBeginner ? 6
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
  let pushEx      = hasShoulder ? pick("push", "shoulder")  : pick("push");
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

  // Experienced members on push slot: kettlebell gets push_exp.
  // Bug fix (session 15b): this used to mutate just pushEx.name in place,
  // leaving pushEx.variation pointing at push_exp's own name too (push_exp's
  // variation IS "Kettlebell push press" -- the same string this line was
  // writing into .name) -- invisible before this session since only one push
  // exercise was ever built per plan, but the new Push/Pull/Legs split now
  // builds a second exercise off .variation, which would have shown
  // "Kettlebell push press" twice back to back. Swapping the whole object
  // instead of one field keeps .variation correctly pointing at the
  // original push exercise (floor press), which now correctly becomes the
  // second Push-day movement instead of a duplicate.
  if (equipment === "kettlebell" && isExperienced && !hasShoulder && lib.push_exp) {
    pushEx = lib.push_exp;
  }

  // Push/Pull day secondary isolation movements (session 15b) -- only used
  // by the Push/Pull/Legs split (5+ days/week, see "Day structure" below).
  // Push day already gets two pressing angles (primary + variation), so the
  // highest-value single addition is lateral raise -- the medial delt is the
  // one shoulder head pressing barely touches, it's low-injury-risk done
  // light, and it's an easy movement to coach correctly with no supervision.
  // Skipped entirely on a shoulder injury rather than substituted -- lateral
  // raises are one of the more impingement-prone accessory movements, and
  // "do less" is the safer call for an isolation bonus exercise (unlike a
  // primary compound slot, which always needs a real replacement).
  const pushSecondaryEx = hasShoulder ? null : (lib.push_secondary || null);

  // Pull day already gets two rowing angles, so its highest-value addition
  // is a biceps curl -- "back and biceps" is the standard real-world PPL
  // pairing, and biceps get zero direct work anywhere else in the plan.
  // Wrist injury swaps to a neutral-grip hammer curl where the library has
  // one (currently just barbell, where a straight bar curl is the most
  // wrist-stressed of the four equipment variants) -- dumbbell/kettlebell/
  // cable curls already allow a wrist-friendly grip without needing a swap.
  const pullSecondaryEx = hasWrist && lib.pull_secondary_wrist
    ? lib.pull_secondary_wrist
    : (lib.pull_secondary || null);

  // ── Starting weight lookup ────────────────────────────────────────
  const getWeight = (exName) => {
    const row = STARTING_WEIGHTS[exName];
    if (!row) return DEFAULT_WEIGHT;
    return row[expTier] || row.some || DEFAULT_WEIGHT;
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
      warmupSets: buildWarmupRamp(w, exObj.name), // ramp-up sets shown before working sets
      muscle: exObj.muscle,
      pattern: exObj.pattern,
      rpe,
      restSeconds: isLower ? effectiveRestCompound : (exObj.pattern === "accessory" ? effectiveRestAccessory : effectiveRestCompound),
      alternative: "", // filled by alternative lookup below
      usePyramid,
      // What's actually loadable, not a body-region guess. A barbell needs a
      // 2.5 lb plate on EACH side to add weight at all -- that's a 5 lb jump,
      // with no smaller real option -- and commercial dumbbells/machine pins
      // jump in 5s too. 2.5 lb total jumps aren't something most gyms offer,
      // which is exactly why barbell incline press couldn't land on 135.
      // Kettlebells are a separate, coarser problem (fixed sizes, ~9-13 lb
      // gaps between them) -- left at 5 here as a placeholder, not a real fix.
      weightIncrement: getWeightIncrement(equipment),
    };
  };

  // A slot's `variation` field (already used week-to-week by progressPlan's
  // post-deload primary/variation alternation) doubles as a second, distinct
  // exercise for the same movement pattern -- used below to give split plans
  // more than one exercise per pattern without inventing new library entries.
  const makeVariationEx = (exObj, isLower) => {
    if (!exObj?.variation) return null;
    return makeEx({ ...exObj, name: exObj.variation }, isLower);
  };

  // Core/carry slot -- same construction reused across every plan shape
  // (full body, Upper/Lower, Push/Pull/Legs). Only added for experienced
  // members on 3+ days/week, same gate as before this feature existed.
  const buildCoreEx = () => {
    if (!(isExperienced && daysPerWeek >= 3 && lib.core)) return null;
    return {
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
      weightIncrement: getWeightIncrement(equipment),
    };
  };

  // Isolation accessory builder (lateral raise / bicep curl) -- deliberately
  // NOT built from makeEx()'s compound rep range. Real programming trains
  // single-joint isolation work at higher reps (12-15) than compound lifts
  // regardless of the member's overall goal or experience tier -- lighter
  // load, less systemic fatigue, and a higher rep target actively protects
  // against using momentum to cheat a lateral raise. RPE is capped at 7 for
  // the same reason accessories don't need to be pushed to true failure to
  // do their job, and rest is short (effectiveRestAccessory) since a single-
  // joint movement doesn't need full ATP-PC recovery between sets the way a
  // heavy compound does.
  const makeIsolationEx = (exObj) => {
    if (!exObj) return null;
    const w = getWeight(exObj.name);
    return {
      name: exObj.name,
      sets: 3,
      reps: 12,
      repMin: 12,
      repMax: 15,
      weight: w,
      warmupSets: [], // light isolation work doesn't need a loaded warm-up ramp
      muscle: exObj.muscle,
      pattern: exObj.pattern,
      rpe: Math.min(rpe, 7),
      restSeconds: effectiveRestAccessory,
      alternative: "",
      usePyramid: false,
      weightIncrement: getWeightIncrement(equipment),
    };
  };

  // ── Day structure ─────────────────────────────────────────────────
  // Below 4 days/week: one full-body session, reused every workout --
  // unchanged from before this feature. 4 days/week: a real Upper/Lower
  // split -- a Lower day (squat + hinge, each paired with its variation for
  // extra volume) and an Upper day (push + pull, same treatment, plus slot
  // 5). 5+ days/week: real Push/Pull/Legs -- Push and Pull days use each
  // pattern's variation as their second exercise (the library only has one
  // named exercise per pattern per equipment type), Legs carries squat +
  // hinge + their variations + core.
  //
  // Bug fix (session 15): workoutType used to be just a label -- every day
  // actually got the identical 5-exercise list underneath no matter what the
  // label said ("Upper / Lower" and "Push / Pull / Legs" were both lies).
  // Below, each split actually builds distinct per-day exercise lists,
  // stored the exact same way CustomPlanScreen already stores hand-built
  // multi-day plans (plan.customDays) -- so the existing day-rotation UI,
  // progressPlan(), and the plateau/deload detector, all of which already
  // read customDays generically, pick these up with no separate changes.
  let exercises, customDays;

  if (daysPerWeek >= 5) {
    const pushDay = [makeEx(pushEx, false), makeVariationEx(pushEx, false), makeIsolationEx(pushSecondaryEx)].filter(Boolean);
    const pullDay = [makeEx(pullEx, false), makeVariationEx(pullEx, false), makeIsolationEx(pullSecondaryEx)].filter(Boolean);
    const legsDay = [
      makeEx(squatEx, true), makeVariationEx(squatEx, true),
      makeEx(hingeEx, true), makeVariationEx(hingeEx, true),
      buildCoreEx(),
    ].filter(Boolean);
    customDays = [
      { dayLabel: "Push", exercises: pushDay },
      { dayLabel: "Pull", exercises: pullDay },
      { dayLabel: "Legs", exercises: legsDay },
    ];
    exercises = pushDay;
  } else if (daysPerWeek === 4) {
    const lowerDay = [
      makeEx(squatEx, true), makeVariationEx(squatEx, true),
      makeEx(hingeEx, true), makeVariationEx(hingeEx, true),
      buildCoreEx(),
    ].filter(Boolean);
    const upperDay = [
      makeEx(pushEx, false), makeVariationEx(pushEx, false),
      makeEx(pullEx, false), makeVariationEx(pullEx, false),
      makeEx(slot5Ex, false),
    ].filter(Boolean);
    customDays = [
      { dayLabel: "Lower", exercises: lowerDay },
      { dayLabel: "Upper", exercises: upperDay },
    ];
    exercises = lowerDay;
  } else {
    exercises = [
      makeEx(squatEx, true),
      makeEx(hingeEx, true),
      makeEx(pushEx, false),
      makeEx(pullEx, false),
      makeEx(slot5Ex, false),
    ].filter(Boolean);
    const coreEx = buildCoreEx();
    if (coreEx) exercises.push(coreEx);
    customDays = null;
  }

  // ── Cardio-day scheduling (lose_fat goal only, Aug 2026 redesign) ──
  // Member picks a separate cardio-days/week count in onboarding, kept apart
  // from the lifting daysPerWeek question above (see OnboardingScreen.jsx
  // step 7, DECISIONS.md Aug 9 2026 entries). When present, this expands the
  // plan's day rotation into a full weekly sequence -- cycling through the
  // lifting day-type(s) already built above (Full Body / Upper-Lower /
  // Push-Pull-Legs) exactly daysPerWeek times, then interleaving
  // cardioDaysPerWeek cardio-only days as evenly as possible among them (an
  // even-distribution interleave, the same idea as Bresenham's line
  // algorithm) so cardio days don't cluster at the end or land back-to-back.
  // Not pinned to real calendar weekdays -- customDays entries are worked
  // through in order whenever the member actually trains (see
  // getAutoWorkoutDayIndex below), so "spacing" here means spacing within
  // that sequence, not a specific day like Tuesday. A cardio day carries no
  // exercises -- the real cardio-day experience (activity-type picker, live
  // timer, MET-based calorie estimate) is a separate, not-yet-built screen
  // (DECISIONS.md, Aug 9 2026). For now it's a correctly-scheduled slot the
  // rest of the app already treats safely: every customDays consumer in this
  // file reads day.exercises defensively (`day.exercises || []`), and
  // Morphiq.jsx's "Start workout" button checks upcomingDay.isCardio before
  // ever routing into WorkoutScreen, which still assumes a real exercise
  // list and would break on an empty one.
  const cardioDaysPerWeekNum = Math.max(0, Math.min(4, parseInt(cardioDaysPerWeekRaw) || 0));
  if (goal === "lose_fat" && cardioDaysPerWeekNum > 0) {
    const liftingDayTypes = (customDays && customDays.length > 0)
      ? customDays
      : [{ dayLabel: daysPerWeek <= 3 ? "Full Body" : "Full Body", exercises }];
    const liftingSequence = Array.from({ length: daysPerWeek }, (_, i) => liftingDayTypes[i % liftingDayTypes.length]);
    customDays = interleaveCardioDays(liftingSequence, cardioDaysPerWeekNum);
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
    cardioDaysPerWeek: cardioDaysPerWeekNum,
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
    customDays,
  };
}

// ═══════════════════════════════════════════════════════════════════
// buildSetDetails — generates a per-set {reps, weight} array for a chosen
// loading style. Moved here from WorkoutScreen.jsx (session 6) so both the
// plan builder AND progressPlan() below can call the same logic — previously
// only the builder had it, so week-over-week progression could bump the flat
// weight field but never regenerate the actual per-set table.
//
// 'same'      = flat weight/reps every working set (identical to the old behavior).
// 'ramp_up'   = ascending toward the entered weight as the last/top set.
// 'ramp_down' = "Top set + backoff": the entered weight is the member's
//               heaviest set (their ~6-rep max), and every set after it drops
//               to one repeated lighter backoff weight. The drop is picked
//               automatically from the member's goal — this isn't a guess,
//               it's the standard range strength coaches use for backoff
//               sets: ~15% lighter for a pure strength goal, ~25% lighter
//               for hypertrophy/general-fitness/fat-loss goals (which use
//               higher reps and tolerate — and benefit from — a bigger drop).
//               The member never sees or picks a percentage; it's invisible.
//               Backoff sets also get a few more reps than the top set —
//               pairing a lighter load with slightly higher reps (e.g. a
//               5-rep top set followed by ~8-rep backoff sets) is the actual
//               textbook pattern; repeating the same rep count at a lighter
//               weight is not. Capped so it never runs away on a high-rep
//               goal. The member still only ever types one rep number.
// 'custom'    = seeds flat like 'same' — it just signals the member intends
//               to hand-edit every row themselves.
// Every style is always shown as editable rows after this generates them —
// this is just the starting point, never the final word.
function buildSetDetails(sets, reps, weight, loadStyle, goal) {
  const n = Math.max(1, parseInt(sets) || 1);
  const w = parseFloat(weight) || 0;
  const r = parseInt(reps) || 8;
  const round5 = (x) => Math.max(5, Math.round(x / 5) * 5);
  if (loadStyle === "ramp_up") {
    return Array.from({ length: n }).map((_, i) => {
      const pct = n === 1 ? 1 : 0.7 + (0.3 * i) / (n - 1); // 70% of top weight -> 100%
      return { reps: r, weight: i === n - 1 ? w : round5(w * pct) };
    });
  }
  if (loadStyle === "ramp_down") {
    const dropPct = goal === "build_strength" ? 0.15 : 0.25;
    const backoff = round5(w * (1 - dropPct));
    const backoffReps = Math.min(r + 3, 20); // heavier top set, lighter+higher-rep backoff — capped at 20
    return Array.from({ length: n }).map((_, i) => ({ reps: i === 0 ? r : backoffReps, weight: i === 0 ? w : backoff }));
  }
  // 'same' and 'custom' both start flat — 'custom' just means "edit every row"
  return Array.from({ length: n }).map(() => ({ reps: r, weight: w }));
}

// ═══════════════════════════════════════════════════════════════════
// detectPlateau — looks at ONE exercise's own working-set history (already
// filtered to set_number > 0 by the caller -- see getWorkoutLogsForProgression()
// above -- warm-ups excluded, same convention as getLastSetForExercise()) and
// flags whether it's been flat or dropping for several sessions in a row.
//
// Session 11: this is the real signal behind the new plateau-based deload
// trigger below, replacing the old flat "every 5 weeks" calendar clock.
// Same trend-math approach as isBigWeightJump() (WorkoutScreen.jsx) and the
// 2-for-2 rule already in progressPlan() below -- plain comparisons over
// numbers already being logged, no AI call needed.
//
// logs: array of {reps, weight, date} for ONE exercise, any order (this
// re-sorts by date). Same shape progressPlan()'s logMap already builds --
// reuse that, don't build a second copy (see the "duplicate logic" note in
// HANDOFF.md -- that's the recurring root cause of real bugs here).
// sessionsToCheck: how many most-recent distinct session DATES to look at
// (a session may have several sets; only that day's top set counts).
//
// Returns { isPlateaued, sessionsChecked, topWeightTrend }. isPlateaued is
// only ever true when there's enough history to actually judge (never
// flags a brand-new exercise) AND the most recent session's top weight is
// no higher than the oldest checked session's AND reps didn't pick up the
// slack either -- a member adding reps at the same weight is still
// progressing, that's the 2-for-2 rule about to fire, not a plateau.
// ═══════════════════════════════════════════════════════════════════
function detectPlateau(logs, sessionsToCheck = 4) {
  const byDate = {};
  (logs || []).forEach(l => {
    if (!l.date) return;
    if (!byDate[l.date]) byDate[l.date] = [];
    byDate[l.date].push(l);
  });
  const sessionDates = Object.keys(byDate).sort((a, b) => new Date(b) - new Date(a));
  if (sessionDates.length < sessionsToCheck) {
    return { isPlateaued: false, sessionsChecked: sessionDates.length, topWeightTrend: [] };
  }
  const recentDates = sessionDates.slice(0, sessionsToCheck);
  // Per session: top weight actually lifted that day, and the best reps
  // logged at that top weight.
  const sessions = recentDates.map(date => {
    const sets = byDate[date];
    const topWeight = Math.max(...sets.map(s => s.weight || 0));
    const repsAtTop = Math.max(...sets.filter(s => s.weight === topWeight).map(s => s.reps || 0));
    return { date, topWeight, repsAtTop };
  }).reverse(); // oldest -> newest, easier to read as a trend

  const oldest = sessions[0];
  const newest = sessions[sessions.length - 1];
  const weightFlatOrDown = newest.topWeight <= oldest.topWeight;
  const repsFlatOrDown = newest.repsAtTop <= oldest.repsAtTop;
  const isPlateaued = weightFlatOrDown && repsFlatOrDown;

  return {
    isPlateaued,
    sessionsChecked: sessions.length,
    topWeightTrend: sessions.map(s => ({ date: s.date, weight: s.topWeight, reps: s.repsAtTop })),
  };
}

// ═══════════════════════════════════════════════════════════════════
// shouldTriggerDeloadFromPlateau — the plan-wide decision progressPlan()
// calls to decide isDeload. Runs detectPlateau() (above) across every
// exercise in the plan and applies a majority rule: deload once at least
// half of the exercises we have ENOUGH data to judge are flat or dropping
// -- one stalled accessory lift shouldn't force a deload while everything
// else is still climbing.
//
// Two safety floors so this can't misbehave at the edges:
// 1. minWeeksSinceLastDeload -- never deload again immediately after one
//    (a member's numbers are SUPPOSED to look flat/down the week right
//    after a deload; that's not a new plateau, don't double-trigger).
// 2. calendarFallbackDue -- if it's been 8+ weeks since the last deload
//    and we still don't have enough clean per-exercise history to judge a
//    real plateau (new member, brand-new plan, sparse logging), fall back
//    to the old calendar behavior rather than letting a data gap mean
//    "never deload." Once real data exists, the plateau signal takes over.
// ═══════════════════════════════════════════════════════════════════
function shouldTriggerDeloadFromPlateau(currentPlan, workoutLogs, nextWeekNum, opts = {}) {
  const sessionsToCheck = opts.sessionsToCheck ?? 4;
  const minWeeksSinceLastDeload = opts.minWeeksSinceLastDeload ?? 3;
  const calendarFallbackWeeks = opts.calendarFallbackWeeks ?? 8;

  const lastDeloadWeek = currentPlan.lastDeloadWeek || 0;
  const weeksSinceLastDeload = nextWeekNum - lastDeloadWeek;
  const calendarFallbackDue = weeksSinceLastDeload >= calendarFallbackWeeks;

  if (weeksSinceLastDeload < minWeeksSinceLastDeload) {
    return { shouldDeload: false, reason: "too_soon_since_last_deload", plateauedExercises: [], exercisesChecked: 0 };
  }

  const allExercises = [
    ...(currentPlan.exercises || []),
    ...((currentPlan.customDays || []).flatMap(day => day.exercises || [])),
  ];
  const uniqueNames = [...new Set(allExercises.map(ex => ex.name))];

  const logMap = {};
  (workoutLogs || []).forEach(log => {
    const key = log.exercise_name;
    if (!logMap[key]) logMap[key] = [];
    logMap[key].push({ reps: log.reps, weight: log.weight, date: log.workout_date });
  });

  const results = uniqueNames.map(name => ({ name, ...detectPlateau(logMap[name] || [], sessionsToCheck) }));
  const withEnoughData = results.filter(r => r.sessionsChecked >= sessionsToCheck);

  if (withEnoughData.length === 0) {
    return {
      shouldDeload: calendarFallbackDue,
      reason: calendarFallbackDue ? "calendar_fallback_no_data" : "insufficient_data",
      plateauedExercises: [],
      exercisesChecked: 0,
    };
  }

  const plateaued = withEnoughData.filter(r => r.isPlateaued);
  const plateauRate = plateaued.length / withEnoughData.length;
  const realPlateau = plateauRate >= 0.5;

  // Once there's enough real data to judge, trust it -- the calendar
  // fallback above only exists to cover the NO-data case. Without this,
  // a member with clean data clearly showing progress every week would
  // still get force-deloaded the moment 8 weeks passed, which defeats
  // the entire point of making this data-driven instead of calendar-driven.
  return {
    shouldDeload: realPlateau,
    reason: realPlateau ? "plateau_detected" : "still_progressing",
    plateauedExercises: plateaued.map(r => r.name),
    exercisesChecked: withEnoughData.length,
  };
}

// ═══════════════════════════════════════════════════════════════════
// progressPlan — takes current plan + workout logs, returns next week's plan
// Applies the 2-for-2 NSCA rule: exceed rep target by 2+ for 2 sessions → add weight
// No API call. Deterministic.
//
// Session 6 fix: this used to only ever read/write the flat currentPlan.exercises
// mirror. That mirror is only populated from Day 1 of a custom multi-day plan
// (see savePlan() in WorkoutScreen.jsx) and the live workout screen doesn't even
// read it once a plan has more than one day — it reads plan.customDays instead.
// Net effect: every day past Day 1 of a custom plan silently never progressed,
// and even Day 1 only ever got its flat weight bumped, never its setDetails
// (the actual per-set table rendered for ramp/pyramid loading styles). Now both
// the flat mirror and every day inside customDays run through the same
// progression logic below.
// ═══════════════════════════════════════════════════════════════════
function progressPlan(currentPlan, workoutLogs, userProfile) {
  const nextWeekNum = (currentPlan.weekNumber || 1) + 1;
  const expTier = userProfile.trainingHistory === "new" ? "beginner"
    : userProfile.trainingHistory === "some" ? "some"
    : userProfile.recentActivity === "returning" ? "returning"
    : "experienced";
  const isExperienced = expTier === "experienced";
  const isBeginner = expTier === "beginner";
  const goal = userProfile.goal || "general_fitness";

  // ── Deload logic ──────────────────────────────────────────────────
  // Session 11: replaced the old flat "every 5 weeks" calendar clock with
  // shouldTriggerDeloadFromPlateau() (above) -- deload timing now follows
  // each member's actual working-weight/reps trend from workout_logs
  // instead of a fixed countdown that fired whether or not they were
  // really stalling.
  //
  // Session 23: this used to also require isExperienced && !isOver40 --
  // meaning beginners, "some"/"returning" members, AND anyone 40+ never
  // reached this at all, so their exercise selection (which only ever
  // changes via the post-deload primary/variation swap below) was frozen
  // for the life of the plan. The staleness audit this session found that
  // gap; the age-40 cutoff in particular had no real training rationale
  // behind it -- competitive-app research (Fitbod, JuggernautAI) and the
  // periodization literature both tie rotation cadence to training
  // experience, never age, and if anything older lifters benefit MORE from
  // variation since natural movement-coordination variability drops with
  // age, raising overuse-injury risk from repeating one exact pattern.
  // Age no longer gates this anywhere below.
  //
  // Every experience tier is now eligible, but a true beginner still gets
  // a real runway before their first rotation -- 6 weeks, the standard
  // "let the nervous system groove one motor pattern before introducing
  // variation" window used across strength-coaching sources -- instead of
  // the old 3-week floor everyone else keeps. This is pacing, not
  // exclusion: a beginner's plateau/deload check simply can't fire until
  // week 6+, same signal-driven logic as everyone else after that.
  const minWeeksSinceLastDeload = isBeginner ? 6 : 3;
  const deloadCheck = shouldTriggerDeloadFromPlateau(currentPlan, workoutLogs, nextWeekNum, { minWeeksSinceLastDeload });
  const isDeload = deloadCheck.shouldDeload;
  // Post-deload = the week right after a deload week. currentPlan.isDeloadWeek
  // is set on the deload week's own plan (see the return object below) --
  // this reads whether the plan the member is CURRENTLY finishing was one.
  // No longer gated by isExperienced/!isOver40 -- see note above.
  const isPostDeload = currentPlan.isDeloadWeek === true;

  // ── Build log lookup: exerciseName → array of recent sessions ─────
  // workoutLogs is an array of { exercise_name, reps, weight, workout_date }
  // Shared across the flat mirror AND every day in customDays — an exercise's
  // log history is the same regardless of which day of the split it lives on.
  const logMap = {};
  (workoutLogs || []).forEach(log => {
    const key = log.exercise_name;
    if (!logMap[key]) logMap[key] = [];
    logMap[key].push({ reps: log.reps, weight: log.weight, date: log.workout_date });
  });
  Object.keys(logMap).forEach(k => {
    logMap[k].sort((a, b) => new Date(b.date) - new Date(a.date));
  });

  // The flat exercises mirror always carries repMin/repMax/weightIncrement/
  // usePyramid/rpe (set explicitly in savePlan()). Raw customDays exercise
  // objects never did — they only ever stored {name, sets, reps, weight,
  // loadStyle, setDetails}. This backfills sensible defaults so the same
  // progression math works on both without customDays silently no-op'ing.
  function normalize(ex) {
    return {
      ...ex,
      repMin: ex.repMin ?? ex.reps,
      repMax: ex.repMax ?? (ex.reps + 2),
      // Same fix as buildPlan()'s makeEx() -- only used as a fallback for
      // plans saved before every exercise carried its own weightIncrement.
      weightIncrement: ex.weightIncrement ?? 5,
      usePyramid: ex.usePyramid ?? (ex.loadStyle === "ramp_up" || ex.loadStyle === "ramp_down"),
      rpe: ex.rpe ?? 7,
    };
  }

  // Progresses one exercise, whether it came from the flat mirror or one day
  // of a custom plan. Regenerates setDetails via buildSetDetails() whenever
  // the weight changes, for every loading style except 'custom' -- 'custom'
  // is the one style where the member explicitly hand-typed every row
  // themselves, so progression leaves those numbers alone rather than
  // silently overwriting their edits. 'same' also needs regenerating here,
  // not just 'ramp_up'/'ramp_down': every exercise always gets a populated
  // setDetails array from the plan builder (buildSetDetails' fallback branch
  // covers 'same' too), and the workout screen always prefers setDetails
  // over the flat weight field when it's present -- so without this, a
  // progressed flat-style exercise would still render its old frozen weight.
  function progressOne(rawEx) {
    const ex = normalize(rawEx);
    const shouldRegenerateSetDetails = ex.loadStyle !== "custom";
    const withSetDetails = (weight, reps) => shouldRegenerateSetDetails
      ? buildSetDetails(ex.sets, reps ?? ex.reps, weight, ex.loadStyle, goal)
      : ex.setDetails;

    if (isDeload) {
      // Deload week: same exercise, 60% weight, RPE capped at 6
      const newWeight = Math.round(ex.weight * 0.6 / 5) * 5; // round to nearest 5
      return { ...ex, weight: newWeight, rpe: Math.min(ex.rpe, 6), weeklyFocus: "deload", setDetails: withSetDetails(newWeight) };
    }

    const logs = logMap[ex.name] || [];

    // Post-deload: reset to week 1 weight + 10%, swap to variation exercise
    if (isPostDeload) {
      // Mesocycle number = how many deloads have happened so far (see
      // deloadCount on the returned plan below). Used to be calendar math
      // (floor((week-1)/5)) back when deloads were fixed every 5 weeks --
      // now that deloads are data-triggered and irregular, the deload
      // COUNT is the only reliable mesocycle boundary. Even/odd meaning
      // below is unchanged from the original.
      // Even mesocycles use variation, odd mesocycles use primary
      const mesocycle = currentPlan.deloadCount || 0;
      const useVariation = mesocycle % 2 === 1;
      // Find this exercise's variation from the library (custom-plan exercise
      // names typically won't match anything here, so variationName just
      // stays the original name — harmless no-op for custom exercises)
      const lib = EXERCISE_LIBRARY[userProfile.equipment] || EXERCISE_LIBRARY.dumbbell;
      let variationName = ex.name;
      Object.values(lib).forEach(slot => {
        if (slot.name === ex.name && slot.variation) variationName = useVariation ? slot.variation : slot.name;
        if (slot.variation === ex.name && slot.name) variationName = useVariation ? slot.variation : slot.name;
      });
      const newWeight = Math.round(ex.weight * 1.1 / 5) * 5;
      const newReps = ex.repMin;
      return { ...ex, name: variationName, weight: newWeight, reps: newReps, weekNumber: nextWeekNum, setDetails: withSetDetails(newWeight, newReps) };
    }

    // Not enough log data — keep current weight, same reps
    if (logs.length < 2) {
      return { ...ex, weekNumber: nextWeekNum };
    }

    const increment = ex.weightIncrement;
    const repTarget = ex.repMax;

    if (ex.usePyramid) {
      // Pyramid: check if final-set reps hit target two sessions in a row
      // Use the highest reps logged per session as a proxy for the final set
      const qualifyingLogs = logs.slice(0, 6).filter(l => l.weight >= ex.weight * 0.9);
      const session1 = logs[0] ? Math.max(...logs.slice(0, 3).filter(l => l.weight >= ex.weight * 0.9).map(l => l.reps)) : 0;
      const session2 = logs[3] ? Math.max(...logs.slice(3, 6).filter(l => l.weight >= ex.weight * 0.9).map(l => l.reps)) : 0;
      const hitTwoInARow = session1 >= repTarget && session2 >= repTarget;

      // Top weight the member has actually been using recently — whether
      // that's above or below the plan's stored number (manual adjustment
      // via the weight stepper, time off, injury, etc). If a big drop means
      // nothing cleared the "near top weight" filter above, fall back to
      // whatever was logged at all before finally falling back to the plan.
      const recentTop = Math.max(...qualifyingLogs.map(l => l.weight || 0));
      const anyRecentTop = Math.max(...logs.slice(0, 6).map(l => l.weight || 0));
      const actualWeightLifted = recentTop > 0 ? recentTop : (anyRecentTop > 0 ? anyRecentTop : ex.weight);

      if (hitTwoInARow) {
        const newWeight = actualWeightLifted + increment;
        return { ...ex, weight: newWeight, weekNumber: nextWeekNum, setDetails: withSetDetails(newWeight) };
      }
      // Fatigue detection: missed reps two sessions → hold at the weight
      // actually lifted, not the stale plan number. Also regenerates
      // setDetails — the workout screen renders that table, not this flat
      // field, so without this the held weight would never actually show up.
      return { ...ex, weight: actualWeightLifted, weekNumber: nextWeekNum, setDetails: withSetDetails(actualWeightLifted) };

    } else {
      // Straight sets: 2-for-2 rule — exceed rep target by 2+ reps, two sessions in a row
      const recentSets = logs.slice(0, 6);
      const session1MaxReps = Math.max(...recentSets.slice(0, 3).map(l => l.reps));
      const session2MaxReps = Math.max(...recentSets.slice(3, 6).map(l => l.reps));
      const twoForTwo = session1MaxReps >= repTarget + 2 && session2MaxReps >= repTarget + 2;

      // What the member has actually been training at recently — the real
      // starting point for next week, whether that's heavier (manually
      // bumped mid-set) or lighter (time off, injury, etc). The rep-based
      // rules below only decide whether to add to this, hold it, or step
      // it back further — the number itself always comes from what was
      // actually lifted, not the plan's original stored figure.
      const loggedWeight = Math.max(...recentSets.map(l => l.weight || 0));
      const actualWeightLifted = loggedWeight > 0 ? loggedWeight : ex.weight;

      if (twoForTwo) {
        const newWeight = actualWeightLifted + increment;
        return {
          ...ex,
          weight: newWeight,
          reps: ex.repMin, // reset reps to bottom of range
          weekNumber: nextWeekNum,
          setDetails: withSetDetails(newWeight, ex.repMin),
        };
      }

      // Fatigue detection: missed target reps two sessions → hold at the
      // weight actually lifted (not the stale plan number) and drop 1 rep
      const session1MinReps = Math.min(...recentSets.slice(0, 3).map(l => l.reps));
      const session2MinReps = Math.min(...recentSets.slice(3, 6).map(l => l.reps));
      const missedTwice = session1MinReps < ex.repMin - 1 && session2MinReps < ex.repMin - 1;
      if (missedTwice && ex.reps > (ex.repMin || 6)) {
        const newReps = ex.reps - 1;
        return { ...ex, weight: actualWeightLifted, reps: newReps, weekNumber: nextWeekNum, setDetails: withSetDetails(actualWeightLifted, newReps) };
      }

      // Steady state — neither a clear win nor a clear miss. Still sync the
      // weight/setDetails to what was actually lifted so the plan tracks
      // reality even when the 2-for-2 rule hasn't fired either way.
      return { ...ex, weight: actualWeightLifted, weekNumber: nextWeekNum, setDetails: withSetDetails(actualWeightLifted) };
    }
  }

  const nextExercises = (currentPlan.exercises || []).map(progressOne);
  const nextCustomDays = Array.isArray(currentPlan.customDays)
    ? currentPlan.customDays.map(day => ({ ...day, exercises: (day.exercises || []).map(progressOne) }))
    : currentPlan.customDays;

  // "Last hard week before recovery" used to be predictable (calendar-based
  // deloads meant week 4-of-5 could always warn "recovery's next week").
  // That's no longer knowable in advance now that deloads are data-triggered
  // -- removed rather than left in place showing a stale/misleading heads-up.
  return {
    ...currentPlan,
    weekNumber: nextWeekNum,
    weekStartDate: new Date().toISOString().split("T")[0],
    // Deload bookkeeping for next time shouldTriggerDeloadFromPlateau() and
    // the mesocycle/isPostDeload logic above run: lastDeloadWeek anchors the
    // minWeeksSinceLastDeload gate, deloadCount drives the primary/variation
    // exercise alternation, isDeloadWeek is what next week's progressPlan()
    // call reads to know it's now in a post-deload reset.
    lastDeloadWeek: isDeload ? nextWeekNum : (currentPlan.lastDeloadWeek || 0),
    deloadCount: isDeload ? (currentPlan.deloadCount || 0) + 1 : (currentPlan.deloadCount || 0),
    isDeloadWeek: isDeload,
    weeklyFocus: isDeload
      ? (deloadCheck.reason === "plateau_detected"
          ? "Your weight and reps have leveled off the last few sessions — recovery week. Lighter weights, same movements. You'll come back stronger."
          : "Recovery week. Lighter weights, same movements. You'll come back stronger.")
      : "Progressive overload in action — a little better than last week is all you need.",
    tip: isDeload
      ? "This week is supposed to feel easy. That's the point — let your body consolidate the gains."
      : (isExperienced
          ? "Track your final-set reps carefully — that's what triggers your weight increase."
          : "Consistency is the variable that matters most right now. Just show up."),
    progressionRule: isDeload
      ? (deloadCheck.reason === "plateau_detected"
          ? "Deload triggered: your weight and reps flattened across recent sessions. All weights at 60% this week, RPE 6 max."
          : "Deload: all weights at 60% of last week. RPE 6 max.")
      : "Auto-calculated from your logged weight and reps.",
    exercises: nextExercises,
    customDays: nextCustomDays,
  };
}

const SESSION_KEY = "morphiq_session";


const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  .mq-fade{animation:mqFade .3s ease;}
  @keyframes mqFade{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
  .mq-pop{animation:mqPop .3s cubic-bezier(.2,1.4,.5,1);}
  @keyframes mqPop{from{transform:scale(0);}to{transform:scale(1);}}
  .mq-spin{animation:mqSpin .8s linear infinite;}
  @keyframes mqSpin{to{transform:rotate(360deg);}}
  .mq-pulse-ring{animation:mqPulse 2s ease-out infinite;pointer-events:none;}
  @keyframes mqPulse{0%{transform:scale(1);opacity:.5;}100%{transform:scale(1.7);opacity:0;}}
  /* Loading-splash logo -- slow, gentle breathing so the screen feels
     alive instead of static during however long the real load takes.
     Purely visual (CSS only): it never adds to or waits on the actual
     load time, it just plays for whatever that natural duration is. */
  .mq-splash-pulse{animation:mqSplashPulse 2.4s ease-in-out infinite;}
  @keyframes mqSplashPulse{0%,100%{opacity:.88;transform:scale(1);}50%{opacity:1;transform:scale(1.045);}}
  /* Loading placeholder for stat values that come from an async fetch (e.g.
     Home screen's Total workouts / Since you started tiles) -- a soft pulse
     instead of a static "-" so a still-loading number doesn't read as "no
     data" for the half-second before historicalData resolves. */
  .mq-skeleton{display:inline-block;background:rgba(255,255,255,0.09);border-radius:5px;animation:mqSkeletonPulse 1.3s ease-in-out infinite;}
  @keyframes mqSkeletonPulse{0%,100%{opacity:.45;}50%{opacity:.9;}}
  .mq-mic-pulse{animation:micPulse 1.2s infinite;}
  @keyframes micPulse{0%{box-shadow:0 0 0 0 rgba(76,141,255,0.4);}70%{box-shadow:0 0 0 14px rgba(76,141,255,0);}100%{box-shadow:0 0 0 0 rgba(76,141,255,0);}}
  .mq-wave span{display:inline-block;width:3px;border-radius:2px;background:#4C8DFF;animation:wv .9s infinite ease-in-out;}
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

function MicIcon({ size = 22, color = "#0B1E3D" }) {
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
      <MicIcon size={Math.round(size * 0.4)} color="#0B1E3D" />
    </button>
  );
}

function Pill({ children, variant = "teal" }) {
  const colors = {
    teal: { bg: "#0B1E3D", color: "#4C8DFF" },
    amber: { bg: "#2D1A00", color: "#F59E0B" },
    gray: { bg: "#212429", color: "#6E7480" },
    red: { bg: "#1F1010", color: "#F87171" },
  };
  const c = colors[variant] || colors.teal;
  return (
    <span style={{ background: c.bg, color: c.color, borderRadius: 20, padding: "2px 8px", fontSize: 10, fontWeight: 500 }}>
      {children}
    </span>
  );
}
function Spinner({ size = 28, color = "#4C8DFF", trackColor = "#212429" }) {
  return <div style={{ width: size, height: size, border: `3px solid ${trackColor}`, borderTopColor: color, borderRadius: "50%", animation: "spin .9s linear infinite", flexShrink: 0 }} />;
}

// ─── CardioQuickLog — voice + text quick-add for a PAST cardio session ─────
// Moved here from ProgressScreen.jsx (session 31) so it can be shared with
// the new CardioScreen.jsx's manual-entry mode, instead of duplicating this
// logic in a second file -- same reasoning as every other shared/*.jsx
// component. Mirrors the voice/text pattern already used for meal logging
// (LogInput in MealScreen.jsx): say or type what you did, AI fills in
// type/duration/an estimated calorie burn, you confirm. No GPS/heart-rate --
// that needs a connected wearable this app doesn't integrate with yet.
function CardioQuickLog({ accent, supabaseUserId, onLogged }) {
  const [phase, setPhase] = useState("idle"); // idle | listening | processing | confirming | error
  const [textVal, setTextVal] = useState("");
  const [parsed, setParsed] = useState(null);
  const [errMsg, setErrMsg] = useState("");
  const [saved, setSaved] = useState(false);
  const [lastLogged, setLastLogged] = useState(null); // { activityType, durationMinutes, calories } captured right before reset() clears parsed, so the post-save confirmation can show real numbers instead of just "Saved"
  const recognitionRef = useRef(null);

  function reset() {
    recognitionRef.current?.abort();
    setPhase("idle"); setTextVal(""); setParsed(null); setErrMsg("");
  }

  function startVoice() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { setErrMsg("Microphone not available on this browser -- type instead."); setPhase("error"); return; }
    const rec = new SR();
    rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 1;
    recognitionRef.current = rec;
    rec.onresult = (e) => { const text = e.results[0][0].transcript; setTextVal(text); parseText(text); };
    rec.onerror = () => { setErrMsg("Microphone error -- try typing instead."); setPhase("error"); };
    setPhase("listening");
    rec.start();
  }

  function submitText() {
    if (!textVal.trim()) return;
    parseText(textVal.trim());
  }

  async function parseText(text) {
    setPhase("processing");
    try {
      const res = await fetch("/api/parse-cardio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok || !data?.activityType) { setErrMsg(data?.error || "Couldn't log that -- try again."); setPhase("error"); return; }
      setParsed(data);
      setPhase("confirming");
    } catch {
      setErrMsg("Network error -- check your connection."); setPhase("error");
    }
  }

  async function confirmLog() {
    if (!parsed) return;
    setPhase("processing");
    const ok = await sb.insertCardioLog(supabaseUserId, {
      activityType: parsed.activityType,
      durationMinutes: parsed.durationMinutes,
      calories: parsed.calories,
    });
    if (!ok) { setErrMsg("Couldn't save -- try again."); setPhase("error"); return; }
    setLastLogged({ activityType: parsed.activityType, durationMinutes: parsed.durationMinutes, calories: parsed.calories });
    reset();
    setSaved(true);
    setTimeout(() => setSaved(false), 4000);
    onLogged?.();
  }

  return (
    <div style={{ background: "#212429", border: "1px solid " + theme.borderSubtle, borderRadius: 14, padding: "14px", marginBottom: 12 }}>
      {phase === "idle" && (
        <>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button onClick={startVoice}
              style={{ flex: 1, background: "#1B1D21", border: "1px solid rgba(76,141,255,0.25)", borderRadius: 10, padding: "10px 6px", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", fontFamily: "inherit" }}>
              <MicIcon size={14} color={accent} /> <span style={{ fontSize: 12, color: accent, fontWeight: 600 }}>Voice</span>
            </button>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={textVal}
              onChange={e => setTextVal(e.target.value)}
              onKeyDown={e => e.key === "Enter" && submitText()}
              placeholder="e.g. 30 minutes of running"
              style={{ flex: 1, background: "#1B1D21", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "9px 10px", fontSize: 13, color: "#EDEEF0", outline: "none", fontFamily: "inherit" }}
            />
            <button onClick={submitText} disabled={!textVal.trim()}
              style={{ background: accent, border: "none", borderRadius: 8, padding: "9px 14px", color: "#0B1E3D", fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: textVal.trim() ? 1 : 0.4 }}>Log</button>
          </div>
        </>
      )}
      {phase === "listening" && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#6E7480", marginBottom: 10 }}>Listening... say what cardio you did</div>
          <button onClick={reset} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "5px 16px", fontSize: 10, color: "#6E7480", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
        </div>
      )}
      {phase === "processing" && (
        <div style={{ textAlign: "center", padding: "8px 0" }}>
          <Spinner size={22} color={accent} />
        </div>
      )}
      {phase === "confirming" && parsed && (
        <>
          <div style={{ fontSize: 11, color: "#6E7480", marginBottom: 8 }}>Does this look right?</div>
          <div style={{ background: "#1B1D21", borderRadius: 10, padding: "12px 14px", marginBottom: 10 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: "#EDEEF0", marginBottom: 6 }}>{parsed.activityType}</div>
            <div style={{ display: "flex", gap: 12 }}>
              <span style={{ fontSize: 13, color: accent, fontWeight: 600 }}>{parsed.durationMinutes} min</span>
              <span style={{ fontSize: 13, color: "#6E7480" }}>~{parsed.calories} cal</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={reset} style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 9, padding: "8px", fontSize: 11, color: "#6E7480", cursor: "pointer", fontFamily: "inherit" }}>Redo</button>
            <button onClick={confirmLog} style={{ flex: 2, background: accent, border: "none", borderRadius: 9, padding: "8px", fontSize: 12, color: "#0B1E3D", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Log this session</button>
          </div>
        </>
      )}
      {phase === "error" && (
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#F87171", marginBottom: 8 }}>{errMsg}</div>
          <button onClick={reset} style={{ background: accent, border: "none", borderRadius: 9, padding: "7px 20px", fontSize: 11, color: "#0B1E3D", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Try again</button>
        </div>
      )}
      {saved && lastLogged && (
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <div style={{ fontSize: 11, color: accent, marginBottom: 2 }}>{lastLogged.activityType} saved <Icon name="check" size={11} style={{ verticalAlign: "-1px" }} /></div>
          <div style={{ fontSize: 12, color: "#EDEEF0" }}>
            <span style={{ fontWeight: 600 }}>{lastLogged.durationMinutes} min</span>
            <span style={{ color: "#6E7480" }}> &middot; </span>
            <span style={{ fontWeight: 600 }}>~{lastLogged.calories} cal</span>
          </div>
        </div>
      )}
    </div>
  );
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
      <div style={{ textAlign: "center", fontSize: 11, color: theme.textFaint, padding: ".6rem", marginBottom: "3.5rem" }}><PoweredByHypergentiq /></div>

      <div className="mq-pulse-ring" style={{ position: "absolute", bottom: "4.8rem", right: "1.25rem", width: 52, height: 52, borderRadius: "50%", background: "rgba(76,141,255,0.18)" }} />
      <button onClick={() => navigate(chatTarget)} style={{ position: "absolute", bottom: "4.8rem", right: "1.25rem", width: 52, height: 52, borderRadius: "50%", background: a, border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M11 2C6.03 2 2 5.8 2 10.5c0 1.8.55 3.5 1.5 4.9L2 20l4.8-1.4A9.2 9.2 0 0011 19c4.97 0 9-3.8 9-8.5S15.97 2 11 2z" fill="#0B1E3D" /><circle cx="7.5" cy="10.5" r="1.2" fill={a} /><circle cx="11" cy="10.5" r="1.2" fill={a} /><circle cx="14.5" cy="10.5" r="1.2" fill={a} /></svg>
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
function PoweredByHypergentiq({ caps = false, logoHeight = "1em", hideLabel = false }) {
  // hideLabel drops the "Powered by" text and just renders the mark itself
  // -- used by the loading splash, which wants a large standalone logo, not
  // the small inline footer credit this component was originally built for.
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: hideLabel ? 0 : 4, verticalAlign: "middle" }}>
      {!hideLabel && <span>{caps ? "POWERED BY" : "Powered by"}</span>}
      <svg viewBox="0 -99.2 584.8 130.2" style={{ height: logoHeight, width: "auto", flexShrink: 0 }} role="img" aria-label="Hypergentiq">
      <path d="M70 0V720H154V419Q179 464 224.5 490.0Q270 516 324 516Q382 516 425.0 492.5Q468 469 491.0 421.0Q514 373 514 300V0H431V291Q431 367 399.0 405.5Q367 444 306 444Q263 444 228.5 423.0Q194 402 174.0 363.0Q154 324 154 267V0Z" fill="#9BA0AA" transform="translate(0.00,0) scale(0.100000,-0.100000)"/>
      <path d="M125 -220 248 56H219L21 504H112L276 119L448 504H535L213 -220Z" fill="#9BA0AA" transform="translate(57.50,0) scale(0.100000,-0.100000)"/>
      <path d="M70 -220V504H146L153 422Q169 446 194.0 467.5Q219 489 254.0 502.5Q289 516 334 516Q408 516 462.5 481.0Q517 446 547.5 386.5Q578 327 578.0 251.0Q578 175 547.5 115.5Q517 56 462.0 22.0Q407 -12 333 -12Q272 -12 225.5 13.0Q179 38 154 83V-220ZM324 61Q373 61 411.0 85.0Q449 109 470.5 151.5Q492 194 492 252Q492 309 470.5 352.0Q449 395 411.0 419.0Q373 443 324 443Q274 443 236.0 419.0Q198 395 177.0 352.0Q156 309 156 252Q156 194 177.0 151.5Q198 109 236.0 85.0Q274 61 324 61Z" fill="#9BA0AA" transform="translate(113.10,0) scale(0.100000,-0.100000)"/>
      <path d="M291 -12Q220 -12 165.5 21.0Q111 54 80.0 113.5Q49 173 49 252Q49 332 79.5 391.0Q110 450 165.5 483.0Q221 516 293 516Q367 516 418.5 483.0Q470 450 497.5 396.5Q525 343 525 279V258Q525 247 524 233H131Q134 180 154 143Q176 101 212.5 80.0Q249 59 291 59Q344 59 378.5 82.5Q413 106 428 146H511Q499 101 469.0 65.0Q439 29 394.5 8.5Q350 -12 291 -12ZM132 298H443Q440 367 397.5 406.0Q355 445 291 445Q248 445 211.5 425.5Q175 406 153 369Q136 339 132 298Z" fill="#9BA0AA" transform="translate(175.70,0) scale(0.100000,-0.100000)"/>
      <path d="M70 0V504H146L152 408Q169 442 195.5 466.0Q222 490 259.5 503.0Q297 516 345 516V428H314Q282 428 253.0 419.5Q224 411 201.5 392.0Q179 373 166.5 340.5Q154 308 154 260V0Z" fill="#9BA0AA" transform="translate(232.50,0) scale(0.100000,-0.100000)"/>
      <path d="M269 -232Q201 -232 148.5 -214.5Q96 -197 67.0 -161.0Q38 -125 38 -72Q38 -49 47.5 -23.0Q57 3 81 28Q92 41 109 52Q89 60 75 70Q57 82 43 95V118L129 203Q107 222 93 247Q70 287 70.0 337.0Q70 387 93.5 427.0Q117 467 161.0 491.5Q205 516 268 516Q312 516 347 504H531V441L436 437Q439 432 442 427Q465 387 465.0 337.0Q465 287 442.0 246.5Q419 206 375.0 182.0Q331 158 268 158Q226 158 192 169L140 123Q144 120 147 118Q157 111 174.0 106.0Q191 101 221.5 97.0Q252 93 302 89Q371 84 412.5 65.0Q454 46 472.5 14.0Q491 -18 491 -62Q491 -105 467.5 -143.5Q444 -182 395.0 -207.0Q346 -232 269 -232ZM188 31Q149 12 136 -11Q120 -40 120 -64Q120 -97 139.0 -119.0Q158 -141 192.0 -152.0Q226 -163 269.0 -163.0Q312 -163 343.0 -151.0Q374 -139 391.0 -117.0Q408 -95 408 -65Q408 -30 382.0 -6.5Q356 17 283 21Q227 25 188 31ZM268 227Q322 227 353.0 255.0Q384 283 384 337Q384 390 353.0 418.0Q322 446 268 446Q215 446 182.5 418.0Q150 390 150 337Q150 283 182.0 255.0Q214 227 268 227Z" fill="#9BA0AA" transform="translate(269.50,0) scale(0.100000,-0.100000)"/>
      <path d="M291 -12Q220 -12 165.5 21.0Q111 54 80.0 113.5Q49 173 49 252Q49 332 79.5 391.0Q110 450 165.5 483.0Q221 516 293 516Q367 516 418.5 483.0Q470 450 497.5 396.5Q525 343 525 279V258Q525 247 524 233H131Q134 180 154 143Q176 101 212.5 80.0Q249 59 291 59Q344 59 378.5 82.5Q413 106 428 146H511Q499 101 469.0 65.0Q439 29 394.5 8.5Q350 -12 291 -12ZM132 298H443Q440 367 397.5 406.0Q355 445 291 445Q248 445 211.5 425.5Q175 406 153 369Q136 339 132 298Z" fill="#9BA0AA" transform="translate(325.30,0) scale(0.100000,-0.100000)"/>
      <path d="M70 0V504H146L150 416Q174 463 218.5 489.5Q263 516 320 516Q379 516 422.0 492.5Q465 469 489.0 421.5Q513 374 513 301V0H429V292Q429 368 395.5 406.0Q362 444 301 444Q259 444 226.0 423.5Q193 403 173.5 364.5Q154 326 154 269V0Z" fill="#9BA0AA" transform="translate(382.10,0) scale(0.100000,-0.100000)"/>
      <path d="M268 0Q223 0 190.0 14.0Q157 28 139.5 61.5Q122 95 122 152V433H34V504H122L133 626H206V504H352V433H206V152Q206 105 225.0 88.5Q244 72 292 72H346V0Z" fill="#9BA0AA" transform="translate(439.50,0) scale(0.100000,-0.100000)"/>
      <path d="M68 0V700H208V0Z" fill="#4C8DFF" transform="translate(478.70,0) scale(0.100000,-0.100000)"/>
      <path d="M555 -111 485 -1Q442 -12 392 -12Q290 -12 212.0 34.0Q134 80 89.5 161.5Q45 243 45.0 350.0Q45 457 89.5 538.5Q134 620 212.0 666.0Q290 712 392 712Q495 712 573.5 666.0Q652 620 695.5 538.5Q739 457 739.0 350.0Q739 243 696 162Q663 101 611 60L723 -111ZM392 114Q402 114 412 115L299 292H460L538 173Q558 195 572 225Q597 277 597.0 350.0Q597 423 572.0 475.5Q547 528 501.0 557.0Q455 586 392 586Q330 586 284.5 557.0Q239 528 213.5 475.5Q188 423 188.0 350.0Q188 277 213.5 224.5Q239 172 284.5 143.0Q330 114 392 114Z" fill="#4C8DFF" transform="translate(506.30,0) scale(0.100000,-0.100000)"/>
      </svg>
    </span>
  );
}

// Renders a gym-uploaded logo safely on the app's dark backgrounds. Small
// gym-provided logo files are often lower quality than what a real design
// team would produce -- flat JPEGs (which can't have transparency at all)
// or PNGs exported with a baked-in white/solid background -- and would show
// up as an ugly rectangle floating on the black background otherwise.
// Detects that case (every corner pixel fully opaque = no real
// transparency) and automatically drops the logo onto a small light plate
// instead, the same trick real design systems use for third-party logo
// lockups. Fails safe: if the pixel check can't run for any reason (CORS,
// a browser that blocks canvas reads, etc.) the logo just renders plainly,
// no plate, no error shown to anyone.
function GymLogo({ src, size = 64, style }) {
  const [needsPlate, setNeedsPlate] = useState(false);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    setNeedsPlate(false);
    setErrored(false);
    if (!src) return;
    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      try {
        const w = img.naturalWidth, h = img.naturalHeight;
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
        const allOpaque = corners.every(([x, y]) => ctx.getImageData(x, y, 1, 1).data[3] === 255);
        if (!cancelled) setNeedsPlate(allOpaque);
      } catch { /* CORS-tainted canvas or similar — render plainly, no plate */ }
    };
    img.onerror = () => { if (!cancelled) setErrored(true); };
    img.src = src;
    return () => { cancelled = true; };
  }, [src]);

  if (!src || errored) return null;

  return (
    <div style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      padding: needsPlate ? Math.round(size * 0.14) : 0,
      background: needsPlate ? "#F4F5F7" : "transparent",
      borderRadius: needsPlate ? 14 : 0,
      ...style,
    }}>
      <img src={src} alt="" style={{ height: size, width: "auto", maxWidth: size * 3.5, objectFit: "contain", display: "block", borderRadius: needsPlate ? 6 : 0 }} />
    </div>
  );
}

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


// WeightChart (Aug 2026 rewrite): the old version squeezed every entry into
// a fixed 260px box, so frequent weigh-ins (multiple same-day entries, or
// just months of history piling up) made the date labels overlap into an
// unreadable smear -- reported by Bryant after a day (June 21) with four
// same-day weigh-ins ran its labels together.
//
// Two-part fix, following iOS Health / Apple's own weight-trend pattern:
// 1. Caller (ProgressScreen.jsx) now collapses same-day entries to one point
//    per day before this ever renders, so a single day can never produce
//    more than one dot/label.
// 2. This component grows wider (fixed px-per-day spacing) instead of
//    squeezing once there are more days than comfortably fit, and becomes
//    horizontally scrollable -- opens scrolled to the most recent entry,
//    swipe/scroll left for history. Below that point count it still fills
//    the card at 100% width exactly like before, so the common case (a
//    handful of entries) looks unchanged.
// Date labels are thinned dynamically (skip a label if it would land closer
// than LABEL_MIN_GAP px to the last one drawn) so labels never overlap
// regardless of how many days are plotted -- first and last day always
// keep their label so the visible range is always legible.
//
// Bug fix (Aug 2026, found live-testing on a real phone-width viewport):
// the first version compared the needed width against a hardcoded 260px
// assumption instead of the card's real rendered width. Real cards are
// often wider than 260px (measured ~432px in testing), so the computed
// chart width often stayed *narrower* than the real card and "scrollable"
// mode never actually produced anything to scroll -- swiping did nothing,
// even with 11 days of data. Now measures the real container width via a
// ref + resize listener and only switches into wide/scrollable mode once
// the data genuinely doesn't fit in that real, measured space.
function WeightChart({ data, accent }) {
  const H = 84, PAD = 10;
  const POINT_SPACING = 34;   // px per day once there are enough days to need scrolling
  const LABEL_MIN_GAP = 26;   // don't draw a date label closer than this to the last one drawn
  const FALLBACK_W = 260;     // used only for the very first render, before we've measured the real card width
  const containerRef = useRef(null);
  const scrollRef = useRef(null);
  const [containerWidth, setContainerWidth] = useState(null);
  const hasData = !!(data && data.length > 0);
  // Need at least 2 points for a line; duplicate single point so chart renders
  const chartData = hasData ? (data.length === 1 ? [data[0], data[0]] : data) : [];
  const neededW = hasData ? PAD * 2 + (chartData.length - 1) * POINT_SPACING : 0;
  const availableW = containerWidth || FALLBACK_W;
  const scrollable = hasData && neededW > availableW;
  const W = scrollable ? neededW : availableW;

  // Measure the real card width on mount and on resize/rotation -- see fix
  // note above for why this can't be a hardcoded constant.
  useEffect(() => {
    function measure() {
      if (containerRef.current) setContainerWidth(containerRef.current.clientWidth);
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Open scrolled to the most recent entry (right edge) whenever the chart
  // is wide enough to scroll, or whenever the data changes length. Hooks
  // must run unconditionally on every render (React's rules-of-hooks --
  // this exact ordering issue broke the production build once already,
  // see HANDOFF.md), so this stays above the `!hasData` early return below
  // and just no-ops when there's nothing to scroll.
  useEffect(() => {
    if (scrollable && scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [scrollable, chartData.length]);

  if (!hasData) return <div ref={containerRef} />;

  const vals = chartData.map(d => d.weight);
  const minV = Math.min(...vals) - 1;
  const maxV = Math.max(...vals) + 1;
  const xStep = (W - PAD * 2) / Math.max(chartData.length - 1, 1);
  const toY = v => PAD + ((maxV - v) / (maxV - minV)) * (H - PAD * 2 - 12);
  const points = chartData.map((d, i) => [PAD + i * xStep, toY(d.weight)]);
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const areaPath = linePath + ` L${points[points.length-1][0].toFixed(1)},${H-12} L${PAD},${H-12} Z`;
  const last = points[points.length - 1];

  // Always show the first and last date label; otherwise only show a label
  // if it's far enough from the last label actually drawn.
  let lastLabelX = -Infinity;
  const showLabel = chartData.map((d, i) => {
    const isEdge = i === 0 || i === chartData.length - 1;
    const x = points[i][0];
    if (isEdge || x - lastLabelX >= LABEL_MIN_GAP) {
      lastLabelX = x;
      return true;
    }
    return false;
  });

  // Fix (Aug 2026, found live-testing this session): the current-value label
  // next to the last point used to be positioned at last[0]+6 with no regard
  // for the right edge of the viewBox, so on any chart where the last point
  // landed near the edge (the common case -- it's the most recent entry),
  // SVG's default clipping cut the label down to just its first character
  // (e.g. "185" rendered as "1"). Now right-aligned and pulled inward
  // instead of left-aligned and pushed outward, so it can't run past W.
  const valueLabelX = Math.min(last[0] + 6, W - PAD);
  const valueLabelAnchor = last[0] + 6 > W - PAD - 20 ? "end" : "start";

  // Bug fix (Aug 2026): the browser's own scrollbar track (with arrow
  // buttons) was showing up under the chart whenever it scrolled -- fine on
  // most phones, where the OS hides it by default, but ugly on desktop and
  // some Android browsers, and not what "swipe to see more" is supposed to
  // look like. Hidden explicitly (WebKit/Blink + Firefox + old Edge) so the
  // chart is swipeable everywhere without ever showing scrollbar chrome.
  return (
    <div ref={containerRef}>
      <style>{`.mq-weightchart-scroll::-webkit-scrollbar { display: none; }`}</style>
      <div
        ref={scrollRef}
        className="mq-weightchart-scroll"
        style={scrollable ? { overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none" } : undefined}
      >
        <svg width={scrollable ? W : "100%"} viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
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
              fill={i === points.length - 1 ? accent : "#212429"} stroke={accent} strokeWidth="1.5" />
          ))}
          {chartData.map((d, i) => {
            if (!showLabel[i]) return null;
            // Fix (Aug 2026): same right-edge clipping bug as the value
            // label above -- a date label centered (textAnchor="middle")
            // on a point sitting near the right edge of the viewBox runs
            // half its text past W, and SVG's default clipping cuts it
            // (observed live: "Aug 10" rendered as "Aug 1"). Anchor labels
            // near either edge inward instead of centering them past it;
            // everything else keeps the normal centered anchor.
            const x = points[i][0];
            const nearRight = x > W - PAD - 16;
            const nearLeft = x < PAD + 16;
            const anchor = nearRight ? "end" : nearLeft ? "start" : "middle";
            const labelX = nearRight ? Math.min(x + 8, W - PAD) : nearLeft ? Math.max(x - 8, PAD) : x;
            return <text key={i} x={labelX} y={H - 3} textAnchor={anchor} fontSize="9" fontFamily="'Inter', system-ui, sans-serif" fill="#6E7480">{d.week}</text>;
          })}
          <text x={valueLabelX} y={last[1] - 4} textAnchor={valueLabelAnchor} fontSize="9" fontFamily="'Inter', system-ui, sans-serif" fill={accent} fontWeight="600">{chartData[chartData.length-1].weight}</text>
        </svg>
      </div>
    </div>
  );
}

// CardioWeeklyChart — simple bar chart of total cardio minutes per week,
// same minimal SVG style as WeightChart above (same viewBox scale, font,
// muted label color) so it reads as part of the same chart family instead
// of a one-off. data: [{ label, minutes }], oldest week first -- caller
// (ProgressScreen.jsx) buckets the raw cardioLogs into weeks; this
// component only draws what it's given. Requested by Bryant so members can
// see a week/month cardio trend at a glance, not just the two totals cards.
function CardioWeeklyChart({ data, accent }) {
  const W = 260, H = 90, PAD = 10;
  if (!data || data.length === 0) return null;
  const maxV = Math.max(...data.map(d => d.minutes), 1);
  const slot = (W - PAD * 2) / data.length;
  const barW = slot * 0.6;
  const toH = v => (v / maxV) * (H - PAD * 2 - 14);
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      {data.map((d, i) => {
        const barH = d.minutes > 0 ? Math.max(toH(d.minutes), 2) : 0;
        const x = PAD + i * slot + (slot - barW) / 2;
        const y = H - 14 - barH;
        const isCurrent = i === data.length - 1;
        return (
          <g key={i}>
            <rect x={x} y={H - 14 - 2} width={barW} height={2} rx={1} fill="#242730" />
            {barH > 0 && <rect x={x} y={y} width={barW} height={barH} rx={3} fill={accent} opacity={isCurrent ? 1 : 0.5} />}
            <text x={x + barW / 2} y={H - 3} textAnchor="middle" fontSize="9" fontFamily="'Inter', system-ui, sans-serif" fill="#6E7480">{d.label}</text>
            {d.minutes > 0 && (
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="9" fontFamily="'Inter', system-ui, sans-serif" fill={isCurrent ? accent : "#9BA0AA"} fontWeight="600">{d.minutes}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// NutritionTrendChart -- daily calories (or any single numeric metric) vs.
// a target, last N days. Same minimal bar-chart family as CardioWeeklyChart
// above, plus a dashed target reference line -- the one feature every
// well-reviewed macro tracker (MacroFactor in particular) leads with: not
// just raw daily numbers, but numbers shown against a target so adherence
// is visible at a glance rather than requiring mental math. data:
// [{ label, [valueKey]: number }], oldest day first. target: the goal value
// (or null if no target set, in which case the line is simply omitted --
// never draws a target at 0). valueKey defaults to "calories" (original
// caller) -- Session 37's Protein card on the Nutrition tab passes
// valueKey="protein" against the same component instead of duplicating it.
function NutritionTrendChart({ data, target, accent, valueKey = "calories" }) {
  const W = 260, H = 100, PAD = 10;
  if (!data || data.length === 0) return null;
  const maxV = Math.max(...data.map(d => d[valueKey]), target || 0, 1) * 1.1;
  const slot = (W - PAD * 2) / data.length;
  const barW = slot * 0.62;
  const toY = v => (H - 16) - (v / maxV) * (H - PAD - 16);
  const targetY = target ? toY(target) : null;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      {targetY !== null && (
        <>
          <line x1={PAD} y1={targetY} x2={W - PAD} y2={targetY} stroke="#9BA0AA" strokeWidth="1" strokeDasharray="3,3" />
          <text x={W - PAD} y={targetY - 3} textAnchor="end" fontSize="8" fontFamily="'Inter', system-ui, sans-serif" fill="#9BA0AA">target {target}</text>
        </>
      )}
      {data.map((d, i) => {
        const val = d[valueKey];
        const barH = val > 0 ? Math.max((H - 16) - toY(val), 2) : 0;
        const x = PAD + i * slot + (slot - barW) / 2;
        const y = (H - 16) - barH;
        const isCurrent = i === data.length - 1;
        const overTarget = target && val > target * 1.1;
        return (
          <g key={i}>
            {barH > 0 && <rect x={x} y={y} width={barW} height={barH} rx={2} fill={overTarget ? "#F59E0B" : accent} opacity={isCurrent ? 1 : 0.5} />}
            <text x={x + barW / 2} y={H - 3} textAnchor="middle" fontSize="8" fontFamily="'Inter', system-ui, sans-serif" fill="#6E7480">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// MacroBar — shared protein/carbs/fat progress indicator. Full-size mode
// matches the original card used on the Meals screen's calorie header;
// compact mode is a smaller version (small text, no percentage line) for
// tight spots like the Home screen and Progress > Nutrition, so every
// screen that shows macros uses the same component instead of each screen
// inventing its own. Nutrition-consistency request from Bryant, Aug 2026.
function MacroBar({ label, current, goal, color, compact }) {
  const pct = Math.min(100, Math.round((current / goal) * 100));
  if (compact) {
    // Stacked full-width row (label + current/goal left-right, then a
    // full-width thin bar underneath) -- matches the visual pattern of the
    // Calories bar above it on the Home screen, instead of the old 3-across
    // layout where each macro only got a third of the card's width.
    // Bryant, Aug 2026: "wouldn't it make more sense to stack them one on
    // top of the other at the exact same width?"
    return (
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: theme.textDim, marginBottom: 4 }}>
          <span style={{ textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</span>
          <span style={{ color: theme.text }}>
            <span style={{ color, fontWeight: 600 }}>{current}</span>/{goal}g
          </span>
        </div>
        <div style={{ height: 4, background: "#242730", borderRadius: 2 }}>
          <div style={{ height: 4, borderRadius: 2, background: color, width: `${pct}%`, transition: "width .5s" }} />
        </div>
      </div>
    );
  }
  return (
    <div style={{ flex: 1, background: "#212429", borderRadius: 12, padding: "12px 10px", textAlign: "center" }}>
      <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color, lineHeight: 1, marginBottom: 2 }}>{current}</div>
      <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 8 }}>of {goal}g</div>
      <div style={{ height: 5, background: "#0F1922", borderRadius: 3 }}>
        <div style={{ height: 5, borderRadius: 3, background: color, width: `${pct}%`, transition: "width .6s" }} />
      </div>
      <div style={{ fontSize: 10, color: color, marginTop: 4, fontWeight: 600 }}>{pct}%</div>
    </div>
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
          <text key={i} x={PAD + i * xStep} y={H - 4} textAnchor="middle" fontSize="10" fontFamily="'Inter', system-ui, sans-serif" fill="#6E7480">{m.label}</text>
        ))}
      </svg>
      <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
        {series.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, color: "#9BA0AA" }}>
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
        // Fix (Bryant, live report): this used cell.toISOString().slice(0,10),
        // which reads the UTC date, not the member's local date -- the same
        // bug localDateStr()'s own comment already documents being found and
        // fixed for the meal-day rollover, just never applied here. Any time
        // local evening hours have already rolled past UTC midnight (e.g.
        // ~5pm PDT onward), every cell's computed date was one day ahead of
        // the real local date, so it could never match workout_date (which
        // IS stored via localDateStr() -- see shared.jsx's log-set save) --
        // real logged workouts just never lit up on the grid. localDateStr()
        // matches what's actually in the database.
        const iso = localDateStr(cell);
        row.push(dateSet.has(iso) ? 1 : 0);
      }
    }
    grid.push(row);
  }
  return (
    <div>
      <div style={{ display:"flex", gap:4, marginBottom:5 }}>
        {days.map((d,i) => <div key={i} style={{ flex:1, textAlign:"center", fontSize:9, color:"#6E7480" }}>{d}</div>)}
      </div>
      {grid.map((row, ri) => (
        <div key={ri} style={{ display:"flex", gap:4, marginBottom:4 }}>
          {row.map((v, ci) => (
            <div key={ci} style={{
              flex:1, height:20, borderRadius:4,
              background: v === 1 ? accent : v === 0 ? "#212429" : "transparent",
              border: v === 0 ? "1px solid #2B2E34" : "none",
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



// -- Multi-day plan helper ----------------------------------------------
// A plan is "multi-day" (has more than one distinct workout to rotate
// through) purely based on whether plan.customDays holds more than one day
// -- NOT on plan.isCustomPlan. That flag only ever meant "a member hand-built
// this in CustomPlanScreen" and has nothing to do with day-count; AI-generated
// Upper/Lower and Push/Pull/Legs plans (see buildPlan(), session 15) also
// populate customDays and need the exact same day-rotation UI. Session 15
// bug fix: this used to be duplicated inline in both Morphiq.jsx and
// WorkoutScreen.jsx as `plan?.isCustomPlan && ...`, which silently excluded
// AI split plans from ever rotating days -- collapsed to one shared function
// here instead of patching each copy separately (the exact lesson from the
// session-10 warm-up bug).
function isMultiDayPlan(plan) {
  return Array.isArray(plan?.customDays) && plan.customDays.length > 1;
}

// -- Weekly-aware auto day-pick -------------------------------------------
// Which day of a multi-day plan to land on next, when the member hasn't
// explicitly picked one. Two things Bryant asked for directly, neither of
// which the old plain "(lastWorkoutDayIndex + 1) % numDays" math understood,
// since lastWorkoutDayIndex just rolls forward forever with no idea what
// week it's in:
//   1. A new week always starts on Day 1 -- profiles.last_workout_day_index
//      from a PREVIOUS week is stale and must never carry into this one.
//   2. Once a real workout has actually been completed THIS week, the next
//      auto-pick continues from the day AFTER that one (lastWorkoutDayIndex
//      + 1, wrapping) -- picking up from whatever was last completed, not a
//      blind 1-2-3-4 guess that drifts the moment a manual day-pick (or a
//      skipped day) breaks the plain sequence.
// "Completed this week" reuses the exact qualifying-workout definition the
// home-screen weekly-progress ring already uses (a logged cardio session,
// or 2+ distinct exercises with real reps logged on one date) so the two
// pieces of UI can never disagree about whether the week has started.
function getAutoWorkoutDayIndex(plan, user, historicalData) {
  if (!isMultiDayPlan(plan)) return null;
  const numDays = plan.customDays.length;
  const now = new Date();
  const dow = now.getDay(); // 0=Sun,1=Mon,...
  const mondayDiff = now.getDate() - dow + (dow === 0 ? -6 : 1);
  const monday = new Date(now.getFullYear(), now.getMonth(), mondayDiff);
  const mondayStr = localDateStr(monday);
  const logsThisWeek = (historicalData?.workoutLogs || []).filter(l => l.workout_date >= mondayStr);
  const byDate = {};
  for (const l of logsThisWeek) {
    if (!byDate[l.workout_date]) byDate[l.workout_date] = { exercises: new Set(), hasCardio: false };
    if (l.is_cardio) byDate[l.workout_date].hasCardio = true;
    else if ((l.reps || 0) > 0 && l.exercise_name) byDate[l.workout_date].exercises.add(l.exercise_name);
  }
  const hasQualifyingWorkoutThisWeek = Object.values(byDate).some(d => d.hasCardio || d.exercises.size > 1);
  if (!hasQualifyingWorkoutThisWeek) return 0; // fresh week -- always Day 1
  return typeof user?.lastWorkoutDayIndex === "number" ? (user.lastWorkoutDayIndex + 1) % numDays : 0;
}

// -- Clear stale in-progress workout state -------------------------------
// Bug found live-testing a freshly-built custom plan: after restarting
// onboarding and saving a brand new plan, WorkoutScreen would resume the
// OLD plan's in-progress workout snapshot (exIdx/setIdx/loggedSets/weight)
// from morphiq_workout_progress_<uid> in localStorage -- that key is keyed
// only by user id, with no check for whether the plan itself changed. The
// "only resume if saved today" guard in WorkoutScreen.jsx's savedProgress
// doesn't catch this, since a same-day plan rebuild is exactly the case
// that guard was never designed for. Neither OnboardingScreen.jsx's AI-plan
// save nor CustomPlanScreen's savePlan() (WorkoutScreen.jsx) ever cleared
// this on a successful save -- same shape of bug as every other "two save
// paths, one shared cleanup step missing" issue in this file. One shared
// function now, called from both of those plus WorkoutScreen's own
// clearProgress(), instead of three separate copies that can drift apart.
function clearWorkoutProgress(uid) {
  try { localStorage.removeItem(`morphiq_workout_progress_${uid || "anon"}`); } catch {}
  if (uid) sb.syncWorkoutProgress(uid, null).catch(() => {});
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
  buildPlan, progressPlan, buildSetDetails, buildWarmupRamp, reRampWarmups, impliedWorkingWeight,
  interleaveCardioDays,
  detectPlateau, shouldTriggerDeloadFromPlateau,
  isBarbellExercise, getPlateBreakdown, formatPlateBreakdown,
  applyReadinessToWeight,
  // Exercise data
  EXERCISE_LIBRARY, STARTING_WEIGHTS, DEFAULT_WEIGHT,
  // UI components
  MicIcon, VoiceBtn, Pill, Spinner, NavIcon, Layout, Icon, PoweredByHypergentiq, GymLogo, CardioQuickLog,
  // Screen data constants
  GOAL_ICONS, GOAL_OPTIONS, EQUIPMENT_OPTIONS,
  WORKOUT_EXERCISES, MEAL_DATA, GROCERY_DATA,
  FALLBACK_REPLIES, CHAT_SUGGESTIONS,
  WEIGHT_DATA_MOCK, PERSONAL_BESTS,
  // Utility functions
  getFallbackReply, fetchAIReply,
  // Progress screen sub-components
  WeightChart, CardioWeeklyChart, NutritionTrendChart, StreakCalendar, getWeekStreakFromDates, MacroBar,
  // Admin dashboard sub-components
  MonthlyTrendLineChart,
  // Billing / paywall
  isGymBlocked,
  // Multi-day plan helper
  isMultiDayPlan, getAutoWorkoutDayIndex,
  // Macro calc + weight increment lookup
  calcMacros, getWeightIncrement,
  // Stale in-progress workout cleanup
  clearWorkoutProgress,
};
