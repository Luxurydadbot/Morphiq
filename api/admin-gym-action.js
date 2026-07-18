import { withSentry } from './_sentry.js';
// api/admin-gym-action.js — locked-down backend endpoint for the two super-admin
// gym actions that used to write straight to Supabase from the browser:
// suspending/unsuspending a gym, and saving the admin's private note about a gym.
//
// WHY THIS EXISTS (July 18, 2026 security session):
// Before this file, src/shared.jsx's setGymSuspended() and saveGymNotes() sent
// a PATCH straight to Supabase using the logged-in user's own token. A gym
// owner is allowed to update their OWN gym row (so they can edit their gym's
// name/branding), and Postgres Row Level Security can't tell "owner editing
// their name" apart from "owner editing their own is_suspended flag" at the
// column level — RLS policies work row-by-row, not column-by-column. So a
// gym owner could, in theory, craft their own direct API call and flip their
// own suspended status or read/write the admin's private notes about them.
//
// This endpoint closes that gap two ways at once:
//   1. It's the ONLY path that's allowed to change these two columns for a
//      normal request — a database trigger (enforce_gym_admin_only_fields on
//      the gyms table, added the same session) now REJECTS any change to
//      is_suspended or admin_notes unless the request either (a) comes from
//      this endpoint using the Supabase service-role key, or (b) is already
//      authenticated as admin@hypergentiq.com. So even if someone bypassed
//      this file entirely, the database itself would still say no.
//   2. This file double-checks the caller's identity itself before touching
//      anything, by asking Supabase "who does this access token actually
///     belong to" rather than trusting anything the browser claims.
//
// The service-role key (SUPABASE_SERVICE_ROLE_KEY) is a Vercel environment
// variable, never written into any file — it's read from process.env only,
// the same pattern already used for STRIPE_SECRET_KEY etc.

const SUPABASE_URL = "https://uvnyjegmhsztdednjclb.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2bnlqZWdtaHN6dGRlZG5qY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTgwMjcsImV4cCI6MjA5NDI5NDAyN30.-hMNwCO-GymvbiyAKer6Q5AjDbDZl6GhXmSTmr5bY04";
const SUPER_ADMIN_EMAIL = "admin@hypergentiq.com";

// Confirms the bearer token in the request is a real, currently-valid
// Supabase session and returns the email it belongs to — or null if the
// token is missing, expired, or invalid. Never trusts a client-supplied
// email, only what Supabase itself reports for that token.
async function getEmailForToken(token) {
  if (!token) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const user = await res.json();
    return user?.email || null;
  } catch {
    return null;
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
  const email = await getEmailForToken(token);

  if (!email || email.toLowerCase() !== SUPER_ADMIN_EMAIL) {
    return res.status(403).json({ error: "Not authorized — this action is restricted to the platform admin." });
  }

  const { action, gymId, value } = req.body || {};
  if (!gymId || (action !== "suspend" && action !== "notes")) {
    return res.status(400).json({ error: "Missing or invalid gymId/action." });
  }

  let patch;
  if (action === "suspend") {
    if (typeof value !== "boolean") {
      return res.status(400).json({ error: "value must be true or false for the suspend action." });
    }
    patch = { is_suspended: value, updated_at: new Date().toISOString() };
  } else {
    patch = { admin_notes: String(value ?? ""), updated_at: new Date().toISOString() };
  }

  try {
    const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/gyms?gym_id=eq.${encodeURIComponent(gymId)}`, {
      method: "PATCH",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(patch),
    });
    if (!patchRes.ok) {
      const text = await patchRes.text().catch(() => "");
      return res.status(502).json({ error: "Supabase rejected the update: " + text });
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("admin-gym-action error:", err);
    return res.status(500).json({ error: "Something went wrong: " + err.message });
  }
}

export default withSentry(handler);
