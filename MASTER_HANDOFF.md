HYPERGENTIQ — MASTER HANDOFF — July 25, 2026 (session 5: multi-day plan UX + cardio tracking)

## 1. File state (line counts, verified fresh from GitHub via git clone)

src/: Morphiq.jsx — 1,451 · shared.jsx — 2,132 · WorkoutScreen.jsx — 2,090 · MealScreen.jsx — 713 · OnboardingScreen.jsx — 595 · ProgressScreen.jsx — 580 · ChatScreen.jsx — 293 · GymOwnerDashboard.jsx — 849 · GymSignupScreen.jsx — 269 · SuperAdminDashboard.jsx — 343 · index.js — 57

api/: _sentry.js — 32 · admin-gym-action.js — 110 · chat.js — 259 · coach-note.js — 108 · create-checkout.js — 89 · monthly-usage-report.js — 101 · parse-cardio.js — 62 (NEW this session) · parse-meal.js — 62 · photo-meal.js — 76 · ping.js — 12 · plan.js — 31 · report-usage.js — 165 · stripe-webhook.js — 161

Nothing near the 3,800-line limit. All files healthy.

Note: between session 4 (Sentry, July 18) and this session, three commits landed that were never written up in a handoff — the rename from Morphiq to Hypergentiq across user-facing screens, and moving weekly-streak/in-progress-workout state from local storage into Supabase. Those are done and live, just not documented in detail anywhere. Flagging so nobody assumes they're still open.

## 2. What was built this session, in order

Manual day picker for multi-day custom plans. Problem: onboarding mid-week always defaulted to Day 1 of a custom split, with no way to jump to Day 2/3/4. Fix: added a row of day-pills on the home screen's "next workout" card (Home screen only, per Bryant's choice over also adding it to the workout screen). Tapping a pill sets selectedDayOverride for that one workout only — it does not change any weekly/database structure.

Day-rotation bug found and fixed the same day. Bryant asked whether overriding to Day 2 would correctly auto-suggest Day 3 the next day. Traced the math — it did not, it would have repeated Day 2 forever. Fixed by adding a real profiles.last_workout_day_index column that persists which day was actually done, and changing the auto-pick formula to (lastWorkoutDayIndex + 1) % totalDays instead of the old weeklyDone % totalDays.

Cardio session tracking — new feature, built end-to-end. Voice or text quick-log mirroring the existing Meals tab UX, AI-estimated calories from free text (new api/parse-cardio.js, Claude haiku, same pattern as parse-meal.js), a new cardio_logs Supabase table (own RLS policies), and cardio sessions counting toward the weekly streak alongside strength workouts.

Custom-plan builder bug fixed: accidental early exit. On a 4-day plan, after adding the 3rd exercise on day 4 it "automatically" tried to save the plan instead of letting a 4th be added. Root cause: not an exercise-count limit (cap is 12/day, no weekly cap) — an accidental-double-tap trap, because the "Add exercise" button is replaced by a full-width "Done with day" button in the exact same screen position right after each add. Fixed with a 600ms cooldown disabling that button right after an add.

Confusing copy fixed. "Search exercise name" → "Search for your next exercise..."

Per-set editor table labeled. Added a persistent "Reps / Weight (lbs)" header row above the editable Set 1-4 grid.

Bonus fix, unrelated to the above. Found sync_issues had RLS enabled with zero policies (a standing 403 error). Added an insert policy (anyone can log a sync issue) and an admin-only select policy.

Test profile reset. Fully reset cafe75designs@gmail.com (profile id 67db3a9a-3d48-414a-a975-2d28ab52172f) to a clean slate — name, goal, sex, height, weight, age, plan, week number, and workout-day tracking all cleared. Preserved historical data: 143 of 145 workout_log rows and all 11 weight_logs kept (only deleted 2 recent test-noise workout logs). Note: this profile's gym_id is demo-gym, not bryant-s-gym — flagged, not fixed.

## 3. Confirmed working

Day picker and rotation fix: logic traced by hand for both cases; not yet clicked through live since the test profile was reset afterward. Cardio logging: built and pushed, builds clean, not yet tested live end-to-end. Double-tap fix, copy fix, column-header fix: small isolated UI changes, each verified with a clean build before pushing. Every commit this session built clean and deployed via git push to main → Vercel auto-deploy.

Not yet spot-checked live: none of this session's shipped features have been walked through in the live app yet. Recommended first step next session: log into the reset cafe75designs@gmail.com account and walk the new onboarding → day picker → cardio log path once, live.

## 4. Standing technical notes

GitHub REST API and raw.githubusercontent.com are both blocked from the sandboxed shell — git clone/git push over an authenticated HTTPS URL is the reliable path. profiles.supabase_user_id (text) is the auth link; profiles.id is the FK target everywhere else — don't confuse them. Fire-and-forget write pattern (.catch(() => {})) used for every new Supabase write. New Supabase objects this session: table cardio_logs (3 RLS policies), 2 new RLS policies on sync_issues, new column profiles.last_workout_day_index.

## 5. Not yet done — prioritized

PRIORITY 1 — decided this session, build first next session: progressive overload for custom multi-day plans.

Current state, confirmed by reading the code: progressPlan() in shared.jsx (the function that auto-advances weight/reps week over week) only ever reads plan.exercises — a flat list used by the old single-day plan type. It has zero awareness of plan.customDays, the structure used by every multi-day custom plan. Separately, even where progressPlan() does run, it only ever adjusts the flat ex.weight field — it never touches ex.setDetails, the actual per-set table the live workout screen renders for anyone using a loading style (ramp up/down/custom). Net effect: progressive overload is currently a silent no-op for every custom multi-day plan, which is now most plans, including anyone using the pyramid/loading-style feature.

Bryant's proposed fix: let the member enter their 6-rep max for an exercise, then back-calculate a full descending pyramid of lighter sets below it using standard strength-training percentage increments (example: 225 lbs @ 6 reps → back-calculated to roughly 200 / 185 / 135 for the lighter sets).

My assessment (owed before this session ended, recorded here): this is a sound idea, worth building. First, it solves a real gap the log-based approach can't — a brand-new custom exercise has no history yet, so pure log-inference can't generate a sensible starting pyramid, but a 6RM input can, immediately. Second, percentage-of-max-based descending pyramids are a standard, well-understood convention in strength programming, so the numbers will look normal to anyone who's lifted before. It should be a complement to, not a replacement for, fixing progressPlan() itself — 6RM back-calculation solves "what numbers do we start with," but ongoing week-over-week progression still needs progressPlan() to understand customDays and regenerate setDetails. Building only the 6RM piece without fixing progressPlan() would leave custom plans generating a good pyramid once, then freezing forever.

Concrete next-session scope (not yet started, no code touched):
1. Add an optional "what's your 6-rep max?" input to the per-exercise setup step in CustomPlanScreen (WorkoutScreen.jsx, the pending exercise config, alongside the existing loadStyle picker).
2. Pick and document a standard percentage table for back-calculating a pyramid from a 6RM (needs a deliberate decision, not a guess).
3. Wire that into buildSetDetails() (WorkoutScreen.jsx, ~line 1632) as a new generation path alongside same/ramp-up/ramp-down/custom.
4. Extend progressPlan() in shared.jsx to walk plan.customDays (not just flat plan.exercises), and to regenerate setDetails on progression, not just bump the flat weight field.
5. Test against the freshly-reset cafe75designs@gmail.com profile once onboarding is redone.

Other open items, roughly in priority order:
- Aesthetics/visual redesign — app "doesn't look like a modern app," wants top-1%-app polish, clean not busy. Explicitly deferred, needs its own session with Bryant sharing screenshots first.
- Live spot-check of everything shipped this session (section 3) — do this before new feature work.
- Confirm identity of duplicate/legacy test rows in profiles (TestUser, VerifyFix, an ambiguous lowercase "bryant" row) — still unresolved from earlier sessions.
- demo-gym vs bryant-s-gym gym_id discrepancy on the cafe75designs@gmail.com profile — flagged this session, not investigated.
- Privacy policy / terms of service — still not started, blocked on Bryant contacting a lawyer.
- Stripe live account activation / decide whether to enforce the paywall (currently wired but not enforced anywhere).
- Fire one real, controlled error on a live backend endpoint to confirm the Sentry backend path works in production (carried forward from session 4).

## 6. Database snapshot

profiles: cafe75designs@gmail.com (id 67db3a9a-3d48-414a-a975-2d28ab52172f) fully reset this session — clean slate for onboarding, 143 workout_log rows and all 11 weight_logs preserved. gym_id on this profile is demo-gym (flagged, not resolved).

New table: cardio_logs — id, user_id (→profiles.id), activity_type, duration_minutes, calories, logged_date, logged_at, RLS enabled, 3 policies (member-owns, gym-owner-views, admin-views).

sync_issues: RLS gap closed — added insert (anyone) and select (admin-only) policies.

profiles: new column last_workout_day_index (integer).

Carried forward, unconfirmed: whether old TestUser/VerifyFix rows still exist under any name.

## 7. Paste this at the start of your next session

Continuing Hypergentiq. Session 5 shipped: a manual day picker for multi-day custom workout plans (home screen only), a fix for the day-rotation math so it correctly advances after a manual override (added profiles.last_workout_day_index), a full new cardio-tracking feature (voice/text quick-log, AI calorie estimate via new api/parse-cardio.js, new cardio_logs table with RLS, counts toward weekly streak), a fix for an accidental-double-tap bug that was cutting custom-plan building short, clearer search-field copy, and labeled columns on the per-set reps/weight editor. Also closed a pre-existing sync_issues RLS gap (was silently 403ing) and did a full clean-slate reset of the cafe75designs@gmail.com test profile (kept all historical workout/weight logs, cleared everything else) so it's ready for fresh onboarding testing.

Nothing shipped this session has been spot-checked live yet — do that first next session, using the reset cafe75designs@gmail.com account, before starting new work.

Top priority for next session, already scoped, not yet built: progressive overload does not work at all for custom multi-day plans — progressPlan() in shared.jsx only reads the old flat plan.exercises structure and only adjusts the flat weight field, never plan.customDays or the per-set setDetails table the live workout screen actually renders. Bryant proposed adding an optional 6-rep-max input per exercise that back-calculates a full descending pyramid using standard percentage increments (e.g. 225 lbs @ 6 reps → ~200/~185/~135) — assessed as a good, standard-practice idea, to be built as a complement to (not instead of) fixing progressPlan() itself, since the 6RM input only solves the starting numbers, not ongoing week-over-week progression. Four-part scope: (1) add the 6RM input to the CustomPlanScreen per-exercise setup step, (2) pick and document a standard percentage table for the back-calculation, (3) wire it into buildSetDetails() in WorkoutScreen.jsx as a new generation path, (4) extend progressPlan() to walk customDays and regenerate setDetails on progression, not just bump flat weight.

After that: the aesthetics/modernization pass (deferred, needs Bryant to share screenshots first — do not start without that), confirming old duplicate test profile rows, the demo-gym vs bryant-s-gym mismatch on the reset test profile, privacy policy/terms (blocked on Bryant/lawyer), Stripe live activation and paywall enforcement decision, and firing one real controlled backend error to confirm Sentry's backend path in production.

Technical notes carried forward: GitHub API/raw content is blocked from the sandbox — always use git clone/git push over authenticated HTTPS. profiles.supabase_user_id is the auth link, profiles.id is the FK used everywhere else — don't confuse them. Use the fire-and-forget .catch(() => {}) pattern for all new Supabase writes.
