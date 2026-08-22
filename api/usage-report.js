import { withSentry } from './_sentry.js';
// api/usage-report.js — per-active-member billing report tool. Combines what
// used to be two separate files (monthly-usage-report.js + report-usage.js)
// into one, purely to stay under Vercel's Hobby-plan 12-serverless-function
// cap (Aug 22, 2026 — adding api/delete-account.js would have made 13).
// Nothing about what either tool DOES changed, only that they now live
// behind one URL with two modes, chosen by whether ?gym_id= is present:
//
//   ALL-GYMS PREVIEW (old monthly-usage-report.js) — visit with no gym_id:
//     https://morphiq-nine.vercel.app/api/usage-report
//   Read-only. Shows every gym's active-member count for last month, so the
//   numbers can be checked by eye. Never touches Stripe.
//
//   SINGLE-GYM REPORT (old report-usage.js) — visit with a gym_id from the
//   list above:
//     Preview: https://morphiq-nine.vercel.app/api/usage-report?gym_id=YOUR_GYM_ID
//     Live:    https://morphiq-nine.vercel.app/api/usage-report?gym_id=YOUR_GYM_ID&confirm=yes
//   PREVIEW (default) touches Stripe only to read account info. LIVE
//   (&confirm=yes) actually reports that gym's count to Stripe as a Meter
//   Event, affecting their next invoice. One gym per visit, on purpose.
//
// Tables/columns used: gyms (gym_id, name, plan_tier, stripe_customer_id,
// stripe_subscription_id), profiles (id, gym_id), workout_logs (user_id,
// workout_date).

import Stripe from "stripe";

const SUPABASE_URL = "https://uvnyjegmhsztdednjclb.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2bnlqZWdtaHN6dGRlZG5qY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTgwMjcsImV4cCI6MjA5NDI5NDAyN30.-hMNwCO-GymvbiyAKer6Q5AjDbDZl6GhXmSTmr5bY04";

// Same per-active-member rates as api/create-checkout.js — keep these files
// in sync if pricing ever changes.
const RATE_PER_MEMBER = { starter: 2, growth: 1.75, scale: 1.5 };

// Confirmed via /api/debug-price-config — all 3 plan tiers share this one
// meter, so the same event_name is used regardless of plan tier.
const METER_EVENT_NAME = "_active_member";

// Returns the start/end dates of the previous calendar month (e.g. if today
// is in July, this returns all of June) — not a rolling 30-day window, so it
// lines up cleanly with a monthly Stripe invoice.
function previousMonthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const label = start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const periodKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
  return { start, end, label, periodKey };
}

// ── ALL-GYMS PREVIEW (no gym_id) — formerly monthly-usage-report.js ────────
async function allGymsPreview(res) {
  const { start, end, label } = previousMonthBounds();
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  const headers = { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` };

  const [gymsRes, profilesRes, logsRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/gyms?select=gym_id,name,plan_tier`, { headers }),
    fetch(`${SUPABASE_URL}/rest/v1/profiles?select=id,gym_id`, { headers }),
    fetch(
      `${SUPABASE_URL}/rest/v1/workout_logs?workout_date=gte.${startStr}&workout_date=lte.${endStr}&select=user_id,workout_date`,
      { headers }
    ),
  ]);

  if (!gymsRes.ok || !profilesRes.ok || !logsRes.ok) {
    return res.status(500).json({ error: "Could not read from Supabase — one of the gyms/profiles/workout_logs tables didn't respond as expected." });
  }

  const gyms = await gymsRes.json();
  const profiles = await profilesRes.json();
  const logs = await logsRes.json();

  // Map each member's profile id to their gym, so a workout log entry can
  // be attributed to the right gym.
  const gymByProfileId = {};
  profiles.forEach(p => { if (p.gym_id) gymByProfileId[p.id] = p.gym_id; });

  const activeSetByGym = {};
  logs.forEach(r => {
    const gymId = gymByProfileId[r.user_id];
    if (!gymId) return;
    if (!activeSetByGym[gymId]) activeSetByGym[gymId] = new Set();
    activeSetByGym[gymId].add(r.user_id);
  });

  const report = gyms.map(g => {
    const activeCount = activeSetByGym[g.gym_id] ? activeSetByGym[g.gym_id].size : 0;
    const rate = RATE_PER_MEMBER[g.plan_tier] ?? 0;
    return {
      gym_id: g.gym_id,
      gym_name: g.name || g.gym_id,
      plan_tier: g.plan_tier || "unknown",
      active_members_last_month: activeCount,
      rate_per_member: rate,
      would_charge_for_usage: +(activeCount * rate).toFixed(2),
    };
  });

  return res.status(200).json({
    billing_period: label,
    period_start: startStr,
    period_end: endStr,
    note: "READ-ONLY report. Nothing here has been sent to Stripe yet — visit with ?gym_id=... to report one gym's usage.",
    gyms: report,
  });
}

// ── SINGLE-GYM REPORT (?gym_id=...) — formerly report-usage.js ─────────────

// Counts how many distinct members at ONE gym logged a workout last month.
async function countActiveMembersLastMonth(gymId) {
  const { start, end } = previousMonthBounds();
  const startStr = start.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  const headers = { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` };

  const profilesRes = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?gym_id=eq.${encodeURIComponent(gymId)}&select=id`,
    { headers }
  );
  if (!profilesRes.ok) throw new Error("Could not read the profiles table");
  const profiles = await profilesRes.json();
  const profileIds = new Set(profiles.map(p => p.id));
  if (profileIds.size === 0) return 0;

  const logsRes = await fetch(
    `${SUPABASE_URL}/rest/v1/workout_logs?workout_date=gte.${startStr}&workout_date=lte.${endStr}&select=user_id,workout_date`,
    { headers }
  );
  if (!logsRes.ok) throw new Error("Could not read the workout_logs table");
  const logs = await logsRes.json();

  const activeSet = new Set();
  logs.forEach(r => { if (profileIds.has(r.user_id)) activeSet.add(r.user_id); });
  return activeSet.size;
}

async function singleGymReport(req, res, gymId) {
  const confirmed = req.query.confirm === "yes";

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: "Server not configured — STRIPE_SECRET_KEY is missing in Vercel." });
  }

  const gymRes = await fetch(
    `${SUPABASE_URL}/rest/v1/gyms?gym_id=eq.${encodeURIComponent(gymId)}&select=gym_id,name,plan_tier,stripe_customer_id,stripe_subscription_id`,
    { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
  );
  const gymRows = await gymRes.json();
  const gym = gymRows?.[0];
  if (!gym) {
    return res.status(404).json({ error: `No gym found with gym_id "${gymId}".` });
  }
  if (!gym.stripe_customer_id || !gym.stripe_subscription_id) {
    return res.status(400).json({
      error: `${gym.name || gymId} hasn't completed Stripe checkout yet, so there's no subscription to report usage against.`,
    });
  }

  const activeCount = await countActiveMembersLastMonth(gym.gym_id);
  const { label, periodKey } = previousMonthBounds();
  const rate = RATE_PER_MEMBER[gym.plan_tier] ?? 0;

  if (!confirmed) {
    // PREVIEW MODE — nothing sent to Stripe.
    return res.status(200).json({
      mode: "preview",
      note: "Nothing has been sent to Stripe. Add &confirm=yes to the address to actually report this and affect the real invoice.",
      gym_name: gym.name || gym.gym_id,
      billing_period: label,
      active_members_last_month: activeCount,
      would_report_quantity: activeCount,
      estimated_charge: +(activeCount * rate).toFixed(2),
    });
  }

  // LIVE MODE — actually reports the number to Stripe via a Meter Event.
  // The "identifier" field makes this safe to re-run for the same
  // gym/month: Stripe treats a repeated identifier as a duplicate rather
  // than double-counting, so accidentally visiting this twice is safe.
  const stripe = new Stripe(secretKey);
  const event = await stripe.billing.meterEvents.create({
    event_name: METER_EVENT_NAME,
    identifier: `usage-${gym.gym_id}-${periodKey}`,
    payload: {
      stripe_customer_id: gym.stripe_customer_id,
      value: String(activeCount), // Stripe requires this as a string, not a number
    },
    timestamp: Math.floor(Date.now() / 1000),
  });

  return res.status(200).json({
    mode: "live",
    note: "This number has been reported to Stripe and will appear on this gym's next invoice. Stripe processes meter events asynchronously, so it may take a few minutes to show up in the Stripe dashboard.",
    gym_name: gym.name || gym.gym_id,
    billing_period: label,
    active_members_reported: activeCount,
    estimated_charge: +(activeCount * rate).toFixed(2),
    stripe_meter_event_identifier: event.identifier,
  });
}

async function handler(req, res) {
  try {
    const gymId = req.query.gym_id;
    if (!gymId) return await allGymsPreview(res);
    return await singleGymReport(req, res, gymId);
  } catch (err) {
    console.error("usage-report error:", err);
    return res.status(500).json({ error: err.message || "Something went wrong generating the report." });
  }
}

export default withSentry(handler);
