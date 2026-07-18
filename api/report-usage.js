import { withSentry } from './_sentry.js';
// api/report-usage.js — STAGE 2 of automatic per-active-member billing.
//
// Reports last month's active-member count to Stripe for ONE gym at a time,
// so it becomes a real usage charge on that gym's next invoice.
//
// IMPORTANT (discovered while building this): Stripe retired the old
// "usage records" method this app's usage-based prices were originally set
// up to expect. The current replacement is called "Meters" — usage is now
// reported per Stripe customer via a Meter Event, not per subscription
// item. Confirmed via a read-only check that all 3 existing usage prices
// already point to one shared meter, event_name "_active_member" — so
// nothing about the Stripe setup itself needed to be rebuilt, only this
// file's reporting method.
//
// SAFETY — two modes, controlled by the address bar:
//   PREVIEW (default) — shows exactly what would be reported. Touches
//     Stripe only to read account info, never reports anything. Safe to
//     visit as many times as you want.
//   LIVE (?confirm=yes) — actually sends the usage number to Stripe. This
//     is the ONLY mode that can affect a real invoice.
//
// Usage — replace YOUR_GYM_ID with a value from /api/monthly-usage-report:
//   Preview: https://morphiq-nine.vercel.app/api/report-usage?gym_id=YOUR_GYM_ID
//   Live:    https://morphiq-nine.vercel.app/api/report-usage?gym_id=YOUR_GYM_ID&confirm=yes
//
// One gym per visit, on purpose — this should be tested on a single test gym
// before ever being pointed at a real paying gym. Stage 3 (running this
// automatically for every gym, on a schedule) is separate, later work.
//
// Tables/columns used: gyms (gym_id, name, plan_tier, stripe_customer_id,
// stripe_subscription_id), profiles (id, gym_id), workout_logs (user_id,
// workout_date) — same as api/monthly-usage-report.js.

import Stripe from "stripe";

const SUPABASE_URL = "https://uvnyjegmhsztdednjclb.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2bnlqZWdtaHN6dGRlZG5qY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTgwMjcsImV4cCI6MjA5NDI5NDAyN30.-hMNwCO-GymvbiyAKer6Q5AjDbDZl6GhXmSTmr5bY04";

// Same per-active-member dollar rates as api/create-checkout.js — for
// display in the preview only. Kept in sync manually if pricing changes.
const RATE_PER_MEMBER = { starter: 2, growth: 1.75, scale: 1.5 };

// Confirmed via /api/debug-price-config — all 3 plan tiers share this one
// meter, so the same event_name is used regardless of plan tier.
const METER_EVENT_NAME = "_active_member";

function previousMonthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const label = start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const periodKey = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
  return { start, end, label, periodKey };
}

// Counts how many distinct members at ONE gym logged a workout last month.
// Same logic/tables as api/monthly-usage-report.js, scoped to a single gym.
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

async function handler(req, res) {
  const gymId = req.query.gym_id;
  const confirmed = req.query.confirm === "yes";

  if (!gymId) {
    return res.status(400).json({
      error: "Missing gym_id in the address. Add ?gym_id=YOUR_GYM_ID — see /api/monthly-usage-report for a list of valid gym IDs.",
    });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: "Server not configured — STRIPE_SECRET_KEY is missing in Vercel." });
  }

  try {
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
  } catch (err) {
    console.error("report-usage error:", err);
    return res.status(500).json({ error: "Something went wrong: " + err.message });
  }
}

export default withSentry(handler);
