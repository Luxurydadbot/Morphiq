// ─── SUPABASE CLIENT ──────────────────────────────────────────────────────────
const SUPABASE_URL  = "https://uvnyjegmhsztdednjclb.supabase.co";
const SUPABASE_ANON = "sb_publishable_uMj3nFhXSfk4s9Upa4mkuw_nwFvBCll";

const H = { "apikey": SUPABASE_ANON, "Authorization": `Bearer ${SUPABASE_ANON}` };
const HJ = { ...H, "Content-Type": "application/json" };

const sb = {
  // ── AUTH ──────────────────────────────────────────────────────────────────
  async sendOTP(email) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/otp`, {
      method: "POST", headers: { "apikey": SUPABASE_ANON, "Content-Type": "application/json" },
      body: JSON.stringify({ email, options: { shouldCreateUser: true } }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, error: err?.msg || err?.message || `HTTP ${res.status}` };
    }
    return { ok: true };
  },

  async verifyOTP(email, token) {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/verify`, {
        method: "POST", headers: { "apikey": SUPABASE_ANON, "Content-Type": "application/json" },
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
        { headers: H }
      );
      const rows = await res.json();
      return rows?.[0] || null;
    } catch { return null; }
  },

  async upsertProfile(supabaseUserId, userData, planData, gymId = "demo-gym") {
    try {
      const body = {
        supabase_user_id: supabaseUserId, gym_id: gymId,
        name: userData.name, goal: userData.goal, sex: userData.sex,
        height: userData.height, weight: userData.weight, age: userData.age,
        days_per_week: userData.daysPerWeek, injuries: userData.injuries || "",
        rest_timer_secs: userData.restTimerSecs || 60,
        plan: planData, updated_at: new Date().toISOString(),
      };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles`, {
        method: "POST", headers: { ...HJ, "Prefer": "resolution=merge-duplicates" },
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch { return false; }
  },

  async getProfileId(supabaseUserId) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?supabase_user_id=eq.${encodeURIComponent(supabaseUserId)}&select=id&limit=1`,
        { headers: H }
      );
      const rows = await res.json();
      return rows?.[0]?.id || null;
    } catch { return null; }
  },

  // ── GYM ───────────────────────────────────────────────────────────────────
  async getGymByOwnerEmail(email) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/gyms?owner_email=eq.${encodeURIComponent(email.toLowerCase())}&limit=1`,
        { headers: H }
      );
      const rows = await res.json();
      return rows?.[0] || null;
    } catch { return null; }
  },

  async getGymBranding(gymId = "demo-gym") {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/gyms?gym_id=eq.${encodeURIComponent(gymId)}&limit=1`,
        { headers: H }
      );
      const rows = await res.json();
      return rows?.[0] || null;
    } catch { return null; }
  },

  async saveGymBranding(gymId = "demo-gym", { name, accent, welcome }) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/gyms`, {
        method: "POST", headers: { ...HJ, "Prefer": "resolution=merge-duplicates" },
        body: JSON.stringify({ gym_id: gymId, name, accent, welcome, updated_at: new Date().toISOString() }),
      });
      return res.ok;
    } catch { return false; }
  },

  // ── WORKOUT LOGS ──────────────────────────────────────────────────────────
  async insertWorkoutLog(supabaseUserId, { exerciseName, setNumber, reps, weight }) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return false;
      const res = await fetch(`${SUPABASE_URL}/rest/v1/workout_logs`, {
        method: "POST", headers: HJ,
        body: JSON.stringify({
          user_id: profileId, exercise_name: exerciseName,
          set_number: setNumber, reps, weight,
          workout_date: new Date().toISOString().slice(0, 10),
        }),
      });
      return res.ok;
    } catch { return false; }
  },

  async getWorkoutLogs(supabaseUserId, limit = 20) {
    try {
      const profileId = await this.getProfileId(supabaseUserId);
      if (!profileId) return [];
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/workout_logs?user_id=eq.${profileId}&order=logged_at.desc&limit=${limit}`,
        { headers: H }
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
        method: "POST", headers: HJ,
        body: JSON.stringify({
          user_id: profileId, meal_id: mealId,
          date: new Date().toISOString().slice(0, 10),
          status, logged_name: loggedName, logged_cal: loggedCal, logged_protein: loggedProtein,
        }),
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
        method: "POST", headers: HJ,
        body: JSON.stringify({
          user_id: profileId, weight_lbs: weightLbs,
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
        { headers: H }
      );
      return await res.json();
    } catch { return []; }
  },

  // ── GYM OWNER ─────────────────────────────────────────────────────────────
  async getGymMembers(gymId = "demo-gym") {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?gym_id=eq.${encodeURIComponent(gymId)}&select=id,name,goal,weight,updated_at&order=updated_at.desc`,
        { headers: H }
      );
      const rows = await res.json();
      return Array.isArray(rows) ? rows : [];
    } catch { return []; }
  },

  async getWorkoutCountsThisMonth(profileIds) {
    if (!profileIds.length) return {};
    const startStr = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10);
    try {
      const ids = profileIds.map(id => `"${id}"`).join(",");
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/workout_logs?user_id=in.(${ids})&workout_date=gte.${startStr}&select=user_id,workout_date`,
        { headers: H }
      );
      const rows = await res.json();
      if (!Array.isArray(rows)) return {};
      const dates = {};
      rows.forEach(r => { if (!dates[r.user_id]) dates[r.user_id] = new Set(); dates[r.user_id].add(r.workout_date); });
      const counts = {};
      Object.keys(dates).forEach(uid => { counts[uid] = dates[uid].size; });
      return counts;
    } catch { return {}; }
  },

  async getLastWorkoutDates(profileIds) {
    if (!profileIds.length) return {};
    try {
      const ids = profileIds.map(id => `"${id}"`).join(",");
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/workout_logs?user_id=in.(${ids})&select=user_id,workout_date&order=workout_date.desc`,
        { headers: H }
      );
      const rows = await res.json();
      if (!Array.isArray(rows)) return {};
      const lastDates = {};
      rows.forEach(r => { if (!lastDates[r.user_id]) lastDates[r.user_id] = r.workout_date; });
      return lastDates;
    } catch { return {}; }
  },

  async getWeightDeltas(profileIds) {
    if (!profileIds.length) return {};
    try {
      const ids = profileIds.map(id => `"${id}"`).join(",");
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/weight_logs?user_id=in.(${ids})&select=user_id,weight_lbs,logged_date&order=logged_date.asc`,
        { headers: H }
      );
      const rows = await res.json();
      if (!Array.isArray(rows)) return {};
      const first = {}, last = {};
      rows.forEach(r => { if (!first[r.user_id]) first[r.user_id] = parseFloat(r.weight_lbs); last[r.user_id] = parseFloat(r.weight_lbs); });
      const deltas = {};
      Object.keys(first).forEach(uid => { deltas[uid] = (last[uid] - first[uid]).toFixed(1); });
      return deltas;
    } catch { return {}; }
  },

  async sendBroadcast(gymId, message) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/broadcasts`, {
        method: "POST", headers: { ...HJ, "Prefer": "resolution=merge-duplicates" },
        body: JSON.stringify({ gym_id: gymId, message, created_at: new Date().toISOString() }),
      });
      return res.ok;
    } catch { return false; }
  },

  async getLatestBroadcast(gymId) {
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/broadcasts?gym_id=eq.${encodeURIComponent(gymId)}&order=created_at.desc&limit=1`,
        { headers: H }
      );
      const rows = await res.json();
      return rows?.[0] || null;
    } catch { return null; }
  },
};

export default sb;
