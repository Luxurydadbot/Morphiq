// api/report-usage.js — STAGE 2 of automatic per-active-member billing.
//
// Reports last month's active-member count to Stripe for ONE gym at a time,
// so it becomes a real usage charge on that gym's next invoice.
//
// SAFETY — two modes, controlled by the address bar:
//   PREVIEW (default) — shows exactly what would be reported. Touches Stripe
//     only to look up account info, never writes/reports anything. Safe to
//     visit as many times as you want.
//   LIVE (?confirm=yes) — actually sends the usage number to Stripe. This is
//     the ONLY mode that can affect a real invoice.
//
// Usage — replace YOUR_GYM_ID with a value from /api/monthly-usage-report:
//   Preview: https://morphiq-nine.vercel.app/api/report-usage?gym_id=YOUR_GYM_ID
//   Live:    https://morphiq-nine.vercel.app/api/report-usage?gym_id=YOUR_GYM_ID&confirm=yes
//
// One gym per visit, on purpose — this should be tested on a single test gym
// before ever being pointed at a real paying gym. Stage 3 (running this
// automatically for every gym, on a schedule) is separate, later work.
//
// Tables/columns used: gyms (gym_id, name, plan_tier, stripe_subscription_id),
// profiles (id, gym_id), workout_logs (user_id, workout_date) — same as
// api/monthly-usage-report.js.

import Stripe from "stripe";

const SUPABASE_URL = "https://uvnyjegmhsztdednjclb.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2bnlqZWdtaHN6dGRlZG5qY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTgwMjcsImV4cCI6MjA5NDI5NDAyN30.-hMNwCO-GymvbiyAKer6Q5AjDbDZl6GhXmSTmr5bY04";

// Same usage-based price IDs as api/create-checkout.js — keep these two
// files in sync if pricing is ever regenerated in Stripe.
const USAGE_PRICE_IDS = {
  starter: "price_1ToZ2yR8eoLB9l0RbOlxgrCO",
  growth: "price_1TpAwJR8eoLB9l0ROMup1AqC",
  scale: "price_1TpB5sR8eoLB9l0RdHMfNMnx",
};

function previousMonthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const label = start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return { start, end, label };
}

// Counts how many distinct members at ONE gym logged a workout last month.
// Same logic/tables as api/monthly-usage-report.js, scoped to a single gym
// (this file deliberately doesn't import from that one — Vercel serverless
// functions are simplest kept self-contained, same pattern as create-checkout.js
// and stripe-webhook.js already not sharing code with each other).
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

export default async function handler(req, res) {
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
      `${SUPABASE_URL}/rest/v1/gyms?gym_id=eq.${encodeURIComponent(gymId)}&select=gym_id,name,plan_tier,stripe_subscription_id`,
      { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
    );
    const gymRows = await gymRes.json();
    const gym = gymRows?.[0];
    if (!gym) {
      return res.status(404).json({ error: `No gym found with gym_id "${gymId}".` });
    }
    if (!gym.stripe_subscription_id) {
      return res.status(400).json({
        error: `${gym.name || gymId} hasn't completed Stripe checkout yet, so there's no subscription to report usage against.`,
      });
    }

    const usagePriceId = USAGE_PRICE_IDS[gym.plan_tier];
    if (!usagePriceId) {
      return res.status(400).json({
        error: `Unknown or missing plan_tier ("${gym.plan_tier}") for this gym — can't tell which Stripe usage price to report against.`,
      });
    }

    const activeCount = await countActiveMembersLastMonth(gym.gym_id);
    const { label } = previousMonthBounds();

    const stripe = new Stripe(secretKey);

    // Find the specific line item on this gym's subscription that matches
    // the usage-based price for their plan tier.
    const subscription = await stripe.subscriptions.retrieve(gym.stripe_subscription_id);
    const usageItem = subscription.items.data.find(item => item.price.id === usagePriceId);
    if (!usageItem) {
      return res.status(400).json({
        error: `Couldn't find a usage-based line item on this gym's Stripe subscription matching price ${usagePriceId}. The subscription may have been set up differently than expected — stop and check before proceeding.`,
      });
    }

    if (!confirmed) {
      // PREVIEW MODE — nothing sent to Stripe.
      return res.status(200).json({
        mode: "preview",
        note: "Nothing has been sent to Stripe. Add &confirm=yes to the address to actually report this and affect the real invoice.",
        gym_name: gym.name || gym.gym_id,
        billing_period: label,
        active_members_last_month: activeCount,
        would_report_quantity: activeCount,
      });
    }

    // LIVE MODE — actually reports the number to Stripe. Using action:"set"
    // (not "increment") means visiting this twice for the same gym/month
    // safely overwrites to the same number rather than double-counting.
    const usageRecord = await stripe.subscriptionItems.createUsageRecord(usageItem.id, {
      quantity: activeCount,
      timestamp: Math.floor(Date.now() / 1000),
      action: "set",
    });

    return res.status(200).json({
      mode: "live",
      note: "This number has been reported to Stripe and will appear on this gym's next invoice.",
      gym_name: gym.name || gym.gym_id,
      billing_period: label,
      active_members_reported: activeCount,
      stripe_usage_record_id: usageRecord.id,
    });
  } catch (err) {
    console.error("report-usage error:", err);
    return res.status(500).json({ error: "Something went wrong: " + err.message });
  }
}
