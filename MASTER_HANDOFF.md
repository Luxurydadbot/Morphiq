MORPHIQ — MASTER HANDOFF — July 12-13, 2026 (final, action-oriented)

1. File state (current line counts, fetched fresh from GitHub at end of session)

src/
Morphiq.jsx — 1,372
shared.jsx — 1,898
WorkoutScreen.jsx — 1,881
MealScreen.jsx — 714
OnboardingScreen.jsx — 596
ProgressScreen.jsx — 425
ChatScreen.jsx — 294
GymOwnerDashboard.jsx — 850
GymSignupScreen.jsx — 270
SuperAdminDashboard.jsx — 313

api/
chat.js — 257
plan.js — 29
coach-note.js — 106
parse-meal.js — 59
photo-meal.js — 74
ping.js — 10
stripe-webhook.js — 159
create-checkout.js — 87
monthly-usage-report.js — 99
report-usage.js — 163

None near the 3,800-line hard limit. src/components/ and src/utils/ (14 files) plus api/debug-price-config.js, src/App.js/App.css/App.test.js, src/chat.js, src/logo.svg, src/reportWebVitals.js, and src/index.css are GONE — deleted this session as confirmed dead code (see section 2). src/SuperAdminDashboard.jsx was previously undocumented in handoffs but is real, live code (imported by Morphiq.jsx, reachable by logging in as admin@hypergentiq.com) — added to this file list so it doesn't get missed again.

2. What was built/fixed this session, in order

Paywall enforcement (live): Added `isGymBlocked()` in shared.jsx — blocks a gym's owner and members only when subscription_status is past_due/unpaid/canceled, or a super admin manually sets is_suspended. Gyms flagged is_beta_exempt are never blocked, full stop. Wired into both the owner and member sign-in paths in Morphiq.jsx, plus a new "billing_blocked" screen. Bryant's Gym is set is_beta_exempt = true (permanent, by design, with an admin_notes explanation) — it will never be blocked or billed, on purpose, forever.

Member remove/restore (live): GymOwnerDashboard.jsx Members tab now has a Remove button (with confirm prompt) and a collapsible "removed members" list with Restore. Backed by a new profiles.is_active column (Bryant ran the one required ALTER TABLE statement himself via Supabase's SQL editor — Claude cannot run schema DDL, only data reads/writes, by design). Removed members drop out of active-member counts and stop receiving broadcast nudges; nothing is ever deleted.

Usage billing — investigated, did NOT build a duplicate: Went looking for "how do we bill per active member" and discovered a prior session (July 4) had already fully built this — api/monthly-usage-report.js (Stage 1, read-only, all gyms) and api/report-usage.js (Stage 2, one gym at a time, defaults to preview, only bills for real with `&confirm=yes` in the URL, uses Stripe's current Meters API correctly). Started drafting a duplicate using Stripe's deprecated method; the push failed on a sha conflict before it could overwrite the real file. Draft discarded. Also caught and reverted a mistaken vercel.json cron entry that would have hit report-usage.js with no gym_id every month (harmless — would have just errored — but pointless). No code changes needed here; just confirmed what already exists is correct and showed Bryant how to use it.

Dead code cleanup: Did a full repo tree listing (not just the file list from prior handoffs) and cross-checked every live file's imports before deleting anything. Removed: api/debug-price-config.js (temporary Stripe diagnostic, its own comment said it was safe to delete once Stage 2 was sorted); the entire src/components/ (11 files) and src/utils/ (3 files) — an old, self-contained earlier version of the app nothing currently imports; src/App.js, App.css, App.test.js, logo.svg, reportWebVitals.js, index.css — standard CRA boilerplate never wired into index.js; src/chat.js — a stray misplaced copy of the chat API code that ended up in src/ instead of api/ at some point. 22 files total, one commit batch, confirmed with a fresh Vercel deploy reaching Ready and the live site loading normally afterward.

Duplicate-account bug found and fixed (Bryant's own account): Bryant's phone was showing "Week 1, Full Body" instead of his real "Week 3, Upper/Lower" progress. Root cause: two separate Supabase Auth logins (bcarbonell@sbcglobal.net and cafe75designs@gmail.com) had each created their own profile row on demo-gym — one from June 21 with 113 logged workouts (the real one), one from July 11 with only 14 logs, all from the prior two days. Both had actually been used interchangeably on July 11 and 12. Fixed by migrating the 14 workout_logs rows + 1 weight_logs row from the July-11 duplicate onto the real June-21 profile (now 127 total logs, still correctly Week 3) and soft-deactivating the duplicate (is_active = false, not deleted). Bryant confirmed he should always sign in with cafe75designs@gmail.com going forward.

Weekly "workouts this week" count — replaced entirely: Was a localStorage-only counter, incremented once per device only when a session reached the very final cooldown screen. Two real problems this caused: stopping a workout partway through (e.g. 75% done) never counted at all, and switching devices/clearing storage silently reset the count to zero regardless of what was actually logged. Replaced with a live calculation off historicalData.workoutLogs (real Supabase data): any day with at least one logged set now counts toward the week, no percentage threshold needed. Found and fixed two other places quietly relying on the same old local counter (a custom-multi-day-plan day-picker in both WorkoutScreen.jsx and Morphiq.jsx) so nothing was left half-fixed. Also wired recordWorkoutComplete() to refresh historicalData immediately so the home screen updates right away instead of waiting for next sign-in.

Workout-screen UI fixes: Target reps during a set was a small pill badge, easy to miss next to the large 52px weight number — now shown as an equally large number in its own card right next to weight. Fixed a real data bug in the "Last time: 135 lbs × 8 reps" bubble — it was pulling literally the most recently logged set for that exercise with no date filter, so mid-session it would show a set from minutes ago instead of last workout's numbers. sb.getLastSetForExercise now excludes today's date entirely, so "Last time" always means a prior session.

Progression logic — checked, not changed: Bryant asked whether target reps/weight should always increase for hypertrophy. Read progressPlan() in shared.jsx — it's real double-progression: weight only increases once the rep target is hit two sessions in a row, holds steady otherwise, nudges reps down slightly after missing twice in a row, and schedules a deload week every 5th week for experienced lifters. This is correct, standard hypertrophy programming (better than pure linear increase, which causes plateaus/burnout). No change made.

3. Confirmed working
Every commit this session reached "Ready" on Vercel before being called done — checked directly each time, never assumed. Live site loaded normally after the dead-code deletion. Duplicate-account merge verified by re-querying workout_logs (127 rows under the real profile, matching 113+14). is_beta_exempt and is_active columns/flags verified via direct Supabase queries after every write.

4. Still needs testing (not yet clicked through live)
The paywall block screen itself has never been triggered live — neither current gym is in a blocked subscription_status, so the "billing_blocked" screen has only been verified by code review, not by seeing it render.
The Remove/Restore member buttons in GymOwnerDashboard have not been clicked in the live app yet.
The new target-reps/weight card layout and the corrected "Last time" bubble haven't been visually confirmed on a phone yet — worth a quick look next time Bryant is in a workout.
The weekly-count fix hasn't been watched live through a real stop-partway-through workout to confirm it shows up correctly. Bryant's own account (cafe75designs) is the one to test this on now that it's merged.

5. Action items for next session — split by who does what

Waiting on Bryant:
Still waiting on Bryant to send the gym invite link to a friend, for a clean gym-attach test (nothing to do here until that happens — every existing account is already used up).
Decide if/when to turn on real per-member Stripe billing (Stage 2, report-usage.js) for test-gym-1 — currently nothing is being billed per-member anywhere; it only fires with an explicit `&confirm=yes` per gym, on purpose.

Ready for Claude to start immediately, no dependency on the above:
No exercise library
PR celebration polish
Per-exercise strength chart
Visually confirm the workout-screen UI changes and weekly-count fix on an actual device
Decide whether to automate monthly usage billing (currently fully manual/preview-first by design) or keep it manual indefinitely

6. Standing technical notes
Sandbox terminal cannot reach api.github.com, raw.githubusercontent.com, supabase.co, or *.vercel.app — use the Chrome extension instead. Always confirm a Vercel deploy reaches "Ready" before calling a fix done.
Claude cannot run database schema changes (ALTER TABLE / CREATE TABLE) — only the public anon key is available, by design. Any future column/table additions need one SQL statement run by Bryant in Supabase's SQL editor, same as the profiles.is_active column this session.
Do a full `git/trees?recursive=1` listing at the start of any cleanup or "what exists" task — the fixed file list in past handoffs missed api/debug-price-config.js, api/monthly-usage-report.js, src/SuperAdminDashboard.jsx, and the entire dead src/components + src/utils trees. Don't trust the handoff's file list alone.

7. Database snapshot (fetched fresh, end of session)
gyms: test-gym-1 (starter, trialing, real Stripe subscription) and bryant-s-gym (starter, trialing, is_beta_exempt = true, no Stripe subscription — never billed).
profiles: 2 rows, both gym_id = demo-gym — "bryant" (id 67db3a9a…, is_active = true, 127 workout_logs, Week 3 Upper/Lower — the real one) and "Bryant" (id 52705b4b…, is_active = false, the deactivated duplicate, 0 logs remaining after migration).
sync_issues: table exists, 0 rows.

8. Paste this at the start of your next session
Continuing Morphiq. Last session: built paywall enforcement (blocks past_due/unpaid/canceled or manually-suspended gyms; Bryant's Gym is permanently exempt via is_beta_exempt); added member remove/restore in the owner dashboard backed by a new profiles.is_active column; investigated per-member usage billing and found it was ALREADY fully built by a prior session (api/monthly-usage-report.js + api/report-usage.js, correct modern Stripe Meters API, manual preview/confirm by design) — no new billing code was needed, just a reverted mistaken cron; deleted 22 confirmed-dead files (src/components, src/utils, CRA boilerplate, a stray misplaced chat.js); found and fixed a real duplicate-account bug for Bryant's own login (merged 14 workout logs from a July-11 duplicate profile onto his real June-21 profile, now 127 total, still Week 3); replaced the weekly "workouts this week" counter (was local-only, only counted full completions) with a live calculation from real logged sets (any logged set that day counts); enlarged the target-reps display on the workout screen to match the weight display; fixed "Last time" to only show a prior workout day, not something logged minutes ago in the same session; verified the hypertrophy progression logic (progressPlan in shared.jsx) is correct real double-progression, no change needed. THERE IS WORK TO DO — do not just report status. Two tracks: (1) waiting on Bryant for the invite-link test, and a decision on whether/when to turn on real per-member billing; (2) ready right now with zero dependencies — exercise library, PR celebration polish, per-exercise strength chart, and visually confirming this session's workout-screen UI changes on a real device. Default assumption: there is always something actionable next. Database snapshot: gyms has bryant-s-gym (exempt, no Stripe sub) + test-gym-1 (real trialing sub); profiles has 2 rows on demo-gym, one active (127 logs, Week 3) and one deactivated duplicate. Always do a full recursive file-tree listing before assuming you know what files exist — this session found 4+ files (including a whole dead src/components + src/utils tree) that weren't in the previous handoff's file list. Claude cannot run database schema changes — only Bryant can, via Supabase's SQL editor, one statement at a time. Sandbox terminal can't reach GitHub/Supabase/Vercel directly — use Chrome extension. Always confirm Vercel deploy reaches "Ready" before calling a fix done.
