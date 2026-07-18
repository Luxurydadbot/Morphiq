import { withSentry } from './_sentry.js';
// api/monthly-usage-report.js — STAGE 1 of automatic per-active-member billing.
//
// READ-ONLY. This endpoint does not touch Stripe, does not charge anyone, and
// does not write anything to the database. It only calculates, for the
// previous calendar month, how many distinct members were active at each
// gym — so those numbers can be checked by eye before Stage 2 (actually
// reporting usage to Stripe) gets built and turned on.
//
// Visit this directly in a browser to see the results as JSON:
//   https://morphiq-nine.vercel.app/api/monthly-usage-report
//
// Tables/columns used (already relied on elsewhere in the app — see
// src/shared.jsx and src/SuperAdminDashboard.jsx):
//   gyms          — gym_id, name, plan_tier
//   profiles      — id, gym_id
//   workout_logs  — user_id, workout_date

const SUPABASE_URL = "https://uvnyjegmhsztdednjclb.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2bnlqZWdtaHN6dGRlZG5qY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTgwMjcsImV4cCI6MjA5NDI5NDAyN30.-hMNwCO-GymvbiyAKer6Q5AjDbDZl6GhXmSTmr5bY04";

// Same per-active-member rates as api/create-checkout.js — keep these two
// files in sync if pricing ever changes.
const RATE_PER_MEMBER = { starter: 2, growth: 1.75, scale: 1.5 };

// Returns the start/end dates of the previous calendar month (e.g. if today
// is in July, this returns all of June) — not a rolling 30-day window, so it
// lines up cleanly with a monthly Stripe invoice.
function previousMonthBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  const label = start.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  return { start, end, label };
}

async function handler(req, res) {
  try {
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
      note: "READ-ONLY report. Nothing here has been sent to Stripe yet — this is Stage 1, just the counting, for checking by eye.",
      gyms: report,
    });
  } catch (err) {
    console.error("monthly-usage-report error:", err);
    return res.status(500).json({ error: "Something went wrong generating the report." });
  }
}

export default withSentry(handler);
