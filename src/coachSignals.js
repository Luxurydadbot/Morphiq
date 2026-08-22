// src/coachSignals.js
//
// WHY THIS FILE EXISTS (Aug 2026): Bryant asked for the AI coach to notice
// two things automatically instead of only reacting to raw numbers --
// (1) a weight-trend plateau (the scale genuinely flat for weeks, not just
// a slow week -- NOT the same thing as WorkoutScreen's lifting-progression
// deload logic in shared.jsx, which is about barbell weight stalling on a
// specific exercise), and (2) nutrition drifting off-target over the last
// week. These two pure functions compute both from data the app already
// has loaded (weight_logs, meal_logs) -- no new backend endpoint, no new
// database calls, nothing that touches Vercel's 12-serverless-function cap.
//
// Kept in its own file rather than added to shared.jsx specifically
// because shared.jsx is already close to this project's 3,800-line hard
// limit (see HANDOFF.md) -- adding ~130 lines there would have pushed it
// over, which the project's own rules say to stop and ask about instead of
// just doing.
//
// METHOD, and why it's built this way (researched against how top fitness/
// nutrition apps do this, Aug 2026 -- see HANDOFF.md for sources):
// - Weight trend uses smoothed multi-day averages, never a single day's
//   scale weight and never a raw day-to-day comparison -- one weigh-in
//   swings several pounds from water/food/sodium alone. This matches how
//   MacroFactor and WHOOP both work.
// - Like WHOOP's recovery coach (which checks 7/14/30-day windows together
//   rather than one cutoff), a plateau is only reported as "confirmed" when
//   multiple comparison windows agree it's flat -- a single flat window on
//   its own is only reported as a weaker "possible" signal. This avoids
//   false alarms from one unusual week.
// - Nutrition adherence is deliberately NOT a pass/fail "compliance score"
//   the way some coaching platforms (e.g. Trainerize) do it -- that clashes
//   with this app's own "no guilt language" design rule. Instead, matching
//   MacroFactor's "adherence-neutral" philosophy, this just reports the
//   real 7-day average vs. target so the AI can suggest an adjustment,
//   never a "you failed" message.

// Converts a "YYYY-MM-DD" date string into how many local calendar days
// ago it was. Deliberately builds the Date from its Y/M/D parts rather than
// `new Date(dateStr)` -- that parses as UTC midnight and silently shifts by
// a day depending on the member's timezone, which is the exact bug class
// already fixed elsewhere in this app (see localDateStr in shared.jsx and
// the meal-day-rollover fix). Keeping the same local-date approach here on
// purpose so this file doesn't reintroduce it.
function daysAgo(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const logged = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - logged) / 86400000);
}

// ── WEIGHT TREND / PLATEAU DETECTION ────────────────────────────────────
// weightLogs: array of { weight_lbs, logged_date } as returned by
// sb.getWeightLogs() -- ascending by date, up to 180 days back.
//
// Returns status as one of:
//   "insufficient_data" -- not enough recent weigh-ins to say anything;
//                          never guess from sparse data.
//   "trending"           -- normal progress, nothing worth mentioning.
//   "plateau_possible"   -- one comparison window looks flat; reported to
//                          the AI only as a soft, low-confidence signal.
//   "plateau_confirmed"  -- multiple windows agree it's flat; the AI can
//                          mention this directly.
export function computeWeightTrend(weightLogs) {
  if (!Array.isArray(weightLogs) || weightLogs.length < 2) {
    return { status: "insufficient_data" };
  }

  const inWindow = (startDaysAgo, endDaysAgo) =>
    weightLogs.filter(r => {
      const d = daysAgo(r.logged_date);
      return d >= startDaysAgo && d <= endDaysAgo;
    });

  const avg = rows => rows.length
    ? rows.reduce((sum, r) => sum + parseFloat(r.weight_lbs), 0) / rows.length
    : null;

  const recent = inWindow(0, 7);
  const mid = inWindow(8, 14);
  const long = inWindow(15, 28);

  // Need a recent weigh-in AND at least one further-back window to compare
  // against, or there's nothing to measure a trend from.
  if (recent.length === 0 || (mid.length === 0 && long.length === 0)) {
    return { status: "insufficient_data" };
  }

  const recentAvg = avg(recent);
  const midAvg = avg(mid);
  const longAvg = avg(long);

  const changeVsMid = midAvg !== null ? recentAvg - midAvg : null;
  const changeVsLong = longAvg !== null ? recentAvg - longAvg : null;

  // "Flat" = moved less than 0.75% of body weight across that window --
  // roughly noise-level (water, food volume, sodium), not a real trend.
  // Proportional rather than a fixed lb amount so this reads the same for
  // a 130lb member and a 260lb member.
  const flatThreshold = recentAvg * 0.0075;
  const isFlat = change => change !== null && Math.abs(change) < flatThreshold;

  const midFlat = isFlat(changeVsMid);
  const longFlat = isFlat(changeVsLong);

  let status = "trending";
  if (midAvg !== null && longAvg !== null) {
    status = midFlat && longFlat ? "plateau_confirmed" : (midFlat || longFlat) ? "plateau_possible" : "trending";
  } else if (midFlat || longFlat) {
    status = "plateau_possible"; // only one comparison window available yet
  }

  return {
    status,
    recentAvgLbs: Math.round(recentAvg * 10) / 10,
    changeVsMidLbs: changeVsMid !== null ? Math.round(changeVsMid * 10) / 10 : null,
    changeVsLongLbs: changeVsLong !== null ? Math.round(changeVsLong * 10) / 10 : null,
  };
}

// ── NUTRITION ADHERENCE (7-DAY ROLLING AVERAGE) ─────────────────────────
// mealLogs: array of { logged_cal, date } as returned by sb.getMealLogs().
// calorieTarget: the member's daily calorie target from their plan
// (plan.calories) -- NOT user_settings.calorie_target, which nothing in
// this app currently reads or writes (confirmed via direct database check,
// Aug 2026 -- that column is unused/leftover, see HANDOFF.md).
//
// Deliberately NOT a day-by-day pass/fail compliance score (see file-top
// note) -- just the real rolling average vs. target, framed for the AI to
// suggest an adjustment rather than report a failure.
export function computeNutritionAdherence(mealLogs, calorieTarget) {
  if (!calorieTarget || !Array.isArray(mealLogs) || mealLogs.length === 0) {
    return { status: "insufficient_data" };
  }

  const byDate = {};
  for (const row of mealLogs) {
    if (!row.logged_cal || !row.date) continue;
    const d = daysAgo(row.date);
    if (d < 0 || d > 6) continue; // last 7 calendar days only
    byDate[row.date] = (byDate[row.date] || 0) + row.logged_cal;
  }

  const loggedDates = Object.keys(byDate);
  // Fewer than 3 logged days this week isn't enough to call it a pattern --
  // could just be a member who logs inconsistently, not someone off-track.
  if (loggedDates.length < 3) return { status: "insufficient_data" };

  const avgCalories = loggedDates.reduce((sum, d) => sum + byDate[d], 0) / loggedDates.length;
  const pctOff = Math.round(((avgCalories - calorieTarget) / calorieTarget) * 100);

  return {
    status: Math.abs(pctOff) > 20 ? "off_track" : "on_track",
    avgCalories: Math.round(avgCalories),
    targetCalories: calorieTarget,
    pctOff,
    daysLogged: loggedDates.length,
  };
}
