HYPERGENTIQ — MASTER HANDOFF — July 25, 2026 (session 6: progressive overload for custom plans)

## 1. File state (line counts, verified fresh from GitHub via git clone)

src/: Morphiq.jsx — 1,451 · shared.jsx — 2,221 (was 2,132) · WorkoutScreen.jsx — 2,073 (was 2,090) · MealScreen.jsx — 713 · OnboardingScreen.jsx — 595 · ProgressScreen.jsx — 580 · ChatScreen.jsx — 293 · GymOwnerDashboard.jsx — 849 · GymSignupScreen.jsx — 269 · SuperAdminDashboard.jsx — 343 · index.js — 57

api/: no changes this session. Same 13 files as session 5.

Nothing near the 3,800-line limit. All files healthy.

## 2. What was built this session, in order

Progressive overload for custom multi-day plans — the top priority carried in from session 5's handoff, now built. Two problems were fixed together, since they're interdependent:

**Problem 1 — progressPlan() didn't know custom plans existed.** It only ever read and wrote `currentPlan.exercises`, a flat list that's populated from Day 1 of a custom plan and nothing else. Worse: the live workout screen doesn't even read that flat list once a plan has more than one day — it reads `plan.customDays` instead (confirmed by tracing `Morphiq.jsx` and `WorkoutScreen.jsx`). Net effect: every day past Day 1 of any custom multi-day plan silently never progressed, and even Day 1 only ever got its flat `weight` field bumped, never `setDetails` — the actual per-set table the workout screen renders for any loading style other than plain flat sets. Fixed by refactoring `progressPlan()` (shared.jsx) to run the same progression logic against every day inside `customDays`, not just the flat mirror, and to regenerate `setDetails` whenever weight changes.

A gap was caught and fixed mid-build: at first the setDetails regeneration only covered the two ramp/pyramid styles. But "Same weight" exercises also always carry a populated `setDetails` array (the plan builder generates one for every style, including flat), and the workout screen prefers `setDetails` over the flat weight field whenever it's present — so a flat-style exercise would have kept rendering its old, frozen weight after progressing. Fixed: every style except "Set each one" (custom, hand-edited by the member) now regenerates.

**Problem 2 — a real starting point for brand-new custom exercises.** Bryant's original idea was a 6-rep-max input that back-calculates a descending pyramid. Researched actual evidence before building: standard backoff-set convention is 10–20% lighter for strength goals, 20–30% lighter for hypertrophy goals, applied as one repeated backoff weight (not a different number for every set) paired with a few more reps than the top set — not the same rep count at a lighter load. Also researched how top logging apps (Hevy, Strong) handle this: they deliberately minimize extra input fields rather than adding smart ones.

Built accordingly: the existing "Ramp down" loading style was relabeled "Top set + backoff" and repurposed — the member still types exactly one number (their heaviest weight for that exercise, at their target reps). The app automatically picks the drop percentage from the goal already collected at onboarding (15% for a pure strength goal, 25% for hypertrophy/general-fitness/fat-loss) and bumps the backoff sets' reps up (capped at 20) — no new fields, no percentage ever shown to the member. `buildSetDetails()` (the function that generates per-set weight/rep tables) was moved from WorkoutScreen.jsx into shared.jsx so both the plan builder and `progressPlan()` share one implementation instead of two.

**Explicitly deferred, not built this session:** weight-increment sizing. Every custom exercise currently gets a flat 2.5 lb week-over-week increment regardless of movement pattern — a leg press progresses the same tiny amount as a bicep curl — because custom exercises are free-typed names with no movement-pattern tag (AI-generated plans already handle this correctly via `EXERCISE_LIBRARY`, which does tag squat/hinge patterns for a 5 lb bump). Bryant flagged this as a real gap when asked directly whether the logic holds up to training science. Assessed as bigger and riskier than tonight's build — needs a deliberate decision (ask the member a quick question per exercise, or find/build a way to classify exercise names against the Supabase exercises table) rather than a guess at 11pm. See priority 1 below.

## 3. Confirmed working

`npm run build` succeeded clean — no errors, only pre-existing ESLint warnings unrelated to anything touched this session (unused imports, missing hook deps in other files). Both commits pushed to `main`, Vercel auto-deploys in ~60 seconds from push.

**Not yet spot-checked live** — same as session 5, nothing from either session has been walked through in the live app yet. This is now two sessions of shipped-but-unverified work stacking up. Strongly recommend making the live spot-check the very first thing next session, before any more building.

## 4. Standing technical notes

GitHub REST API and raw.githubusercontent.com are both blocked from the sandboxed shell — git clone/git push over an authenticated HTTPS URL is the reliable path. profiles.supabase_user_id (text) is the auth link; profiles.id is the FK target everywhere else — don't confuse them. Fire-and-forget write pattern (.catch(() => {})) used for every new Supabase write.

Correction to the standing "before every push" safety checklist: it says "src/shared.jsx contains the AuthScreen component" — that's stale. `AuthScreen` actually lives in `Morphiq.jsx` now (confirmed by grep this session), not shared.jsx. Not something broken this session, just flagging so a future check doesn't chase a phantom failure.

No new Supabase objects this session — this was a pure application-logic session (shared.jsx, WorkoutScreen.jsx only), no schema changes.

## 5. Not yet done — prioritized

**PRIORITY 1 — weight-increment sizing for custom exercises.** Every custom exercise progresses at a flat 2.5 lb increment regardless of what it is. Needs a deliberate decision on how to classify a free-typed exercise name into a movement pattern (or whether to ask the member directly) before writing any code — do not guess at this. Check the Supabase `exercises` table schema first (state columns before assuming any exist, per standing DB rules) to see if there's already a usable field.

**PRIORITY 2 — live spot-check everything shipped in sessions 5 and 6**, using the reset cafe75designs@gmail.com account: day picker, day rotation, cardio logging, the double-tap fix, and now the Top set + backoff pyramid and custom-plan progressive overload. Do this before any more new feature work — two full sessions have shipped without a single live walkthrough.

Other open items, unchanged from session 5, roughly in priority order:
- Aesthetics/visual redesign — deferred, needs Bryant to share screenshots first.
- Confirm identity of duplicate/legacy test rows in profiles (TestUser, VerifyFix, an ambiguous lowercase "bryant" row).
- demo-gym vs bryant-s-gym gym_id discrepancy on the reset cafe75designs@gmail.com profile.
- Privacy policy / terms of service — blocked on Bryant contacting a lawyer.
- Stripe live account activation / paywall enforcement decision.
- Fire one real, controlled error on a live backend endpoint to confirm the Sentry backend path works in production.

## 6. Database snapshot

No schema changes this session. Carried forward from session 5 unchanged: cardio_logs table, sync_issues RLS policies, profiles.last_workout_day_index column, cafe75designs@gmail.com reset state (gym_id still demo-gym, unresolved).

## 7. Paste this at the start of your next session

Continuing Hypergentiq. Session 6 shipped progressive overload for custom multi-day plans — the top priority carried in from session 5. Two things were fixed together in progressPlan() (shared.jsx): it now walks every day inside plan.customDays, not just the flat plan.exercises mirror (which is only Day 1's data, and isn't even what the live workout screen reads for multi-day plans — that was the actual bug), and it regenerates setDetails (the real per-set table the workout screen renders) on weight changes for every loading style except the fully hand-edited "custom" one. Also built the 6RM-style feature Bryant proposed: the "Ramp down" loading style is now "Top set + backoff" — member still types exactly one weight, and the app auto-generates a lighter, higher-rep backoff weight for the rest of the sets using a goal-based drop (15% strength / 25% hypertrophy-general-fatloss, pulled from real strength-coaching ranges, not guessed) with zero new input fields. buildSetDetails() moved from WorkoutScreen.jsx into shared.jsx so both the plan builder and progressPlan() share one implementation.

Explicitly NOT built this session, and flagged as next priority: weight-increment sizing. Every custom exercise currently progresses at a flat 2.5 lb bump regardless of movement pattern — a leg press and a bicep curl progress identically — because custom exercises have no movement-pattern tag. This needs a real decision (ask the member, or classify against the Supabase exercises table) before any code gets written.

Nothing shipped in session 5 OR session 6 has been spot-checked live yet. That should be the first thing done next session, using the reset cafe75designs@gmail.com account, before starting anything new — two sessions of shipped work have stacked up unverified.

Also carried forward: AuthScreen actually lives in Morphiq.jsx, not shared.jsx — the standing pre-push checklist referencing shared.jsx for it is stale, not a real failure if it comes up. Aesthetics/modernization pass still deferred pending Bryant's screenshots. Duplicate test profile rows, the demo-gym vs bryant-s-gym mismatch, privacy policy/terms, Stripe paywall enforcement, and a controlled Sentry backend test are all still open, unchanged from session 5.

Technical notes carried forward: GitHub API/raw content is blocked from the sandbox — always use git clone/git push over authenticated HTTPS. profiles.supabase_user_id is the auth link, profiles.id is the FK used everywhere else. Use the fire-and-forget .catch(() => {}) pattern for all new Supabase writes.
