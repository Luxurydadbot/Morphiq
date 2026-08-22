import { withSentry } from './_sentry.js';
// api/delete-account.js — lets a signed-in member permanently delete their
// own account and all their data, from inside the app itself.
//
// WHY THIS EXISTS (Aug 22, 2026): Apple's App Store Review Guideline 5.1.1(v)
// requires that any app allowing account creation must also let a user
// delete their own account from inside the app — a "contact support to
// delete your data" flow is not enough. Before this file, there was no way
// for a member to delete their account at all.
//
// SAME SECURITY PATTERN AS api/admin-gym-action.js: this endpoint asks
// Supabase "who does this access token actually belong to" itself, rather
// than trusting any id the browser sends. A member can only ever delete
// their OWN account this way — there is no way to pass someone else's id in.
//
// WHY THIS CAN'T BE DONE FROM THE BROWSER WITH THE ANON KEY: deleting the
// underlying login (the row in Supabase's own auth.users table) requires
// Supabase's admin API, which only works with the service-role key — a
// secret that must never reach the browser. So the whole delete, not just
// the auth-user step, is done here on the backend with that key.
//
// DELETE ORDER MATTERS. Checked directly against the database (Aug 22,
// 2026): most of a member's tables cascade-delete automatically when their
// profiles row is deleted, but ai_usage, cardio_logs, grocery_custom_items,
// and water_logs do NOT (they're set to "NO ACTION"), so deleting the
// profiles row first would fail with a foreign-key error. Same problem one
// level up: user_settings points at auth.users directly with "NO ACTION",
// so it has to be cleared before the auth user itself can be deleted. This
// file deletes everything in an order that respects that, table by table,
// rather than relying on cascades to do the whole job.

const SUPABASE_URL = "https://uvnyjegmhsztdednjclb.supabase.co";

// Confirms the bearer token is a real, currently-valid Supabase session and
// returns the { id, email } it belongs to — or null if missing/expired/invalid.
// Never trusts a client-supplied id; only what Supabase itself reports.
async function getUserForToken(token) {
  if (!token) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user?.id ? { id: user.id, email: user.email || null } : null;
  } catch {
    return null;
  }
}

// Deletes every row in `table` matching column = value. Ignores "no rows to
// delete" as success (most members won't have rows in every table) but
// surfaces a real failure so the caller can stop before touching auth.users.
async function deleteRows(serviceKey, table, column, value) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?${column}=eq.${encodeURIComponent(value)}`,
    { method: "DELETE", headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
  );
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Failed deleting from ${table}: ${text}`);
  }
}

async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return res.status(500).json({ error: "Server not configured — SUPABASE_SERVICE_ROLE_KEY is missing in Vercel." });
  }

  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const authUser = await getUserForToken(token);

  if (!authUser) {
    return res.status(401).json({ error: "Not signed in, or your session has expired. Sign in again and retry." });
  }

  try {
    // Look up this member's profile row (profiles.supabase_user_id is a
    // plain text column holding the auth user's id — same lookup pattern
    // used everywhere else in the app, e.g. shared.jsx's getProfile()).
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?supabase_user_id=eq.${encodeURIComponent(authUser.id)}&select=id`,
      { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } }
    );
    if (!profileRes.ok) throw new Error("Could not look up the profile to delete.");
    const profileRows = await profileRes.json();
    const profileId = profileRows?.[0]?.id || null;

    if (profileId) {
      // Tables with NO ACTION on delete — must go before the profiles row.
      await deleteRows(serviceKey, "ai_usage", "user_id", profileId);
      await deleteRows(serviceKey, "cardio_logs", "user_id", profileId);
      await deleteRows(serviceKey, "grocery_custom_items", "user_id", profileId);
      await deleteRows(serviceKey, "water_logs", "user_id", profileId);
      // Not a declared foreign key, but still this member's data — a
      // message a gym owner sent to them specifically.
      await deleteRows(serviceKey, "gym_messages", "profile_id", profileId);
      // These three cascade automatically, but deleted explicitly anyway
      // rather than relying on that — clearer, and safe either way.
      await deleteRows(serviceKey, "workout_logs", "user_id", profileId);
      await deleteRows(serviceKey, "meal_logs", "user_id", profileId);
      await deleteRows(serviceKey, "weight_logs", "user_id", profileId);
      // Diagnostic-only rows, not a declared foreign key either.
      await deleteRows(serviceKey, "sync_issues", "supabase_user_id", authUser.id);

      await deleteRows(serviceKey, "profiles", "id", profileId);
    }

    // user_settings points at auth.users directly with NO ACTION on delete —
    // must be cleared before the auth user itself can be deleted below.
    await deleteRows(serviceKey, "user_settings", "user_id", authUser.id);

    // Finally, delete the actual login — this is what makes the account
    // itself gone, not just its data. Uses Supabase's admin user-management
    // API, which only accepts the service-role key.
    const authDeleteRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${authUser.id}`, {
      method: "DELETE",
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    });
    if (!authDeleteRes.ok) {
      const text = await authDeleteRes.text().catch(() => "");
      throw new Error(`All of this member's data was deleted, but removing the login itself failed: ${text}`);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("delete-account error:", err);
    return res.status(500).json({ error: err.message || "Something went wrong while deleting the account." });
  }
}

export default withSentry(handler);
