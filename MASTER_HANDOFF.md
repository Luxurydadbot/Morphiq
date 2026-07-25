HYPERGENTIQ — MASTER HANDOFF — July 25, 2026 (session 6: progressive overload for custom plans + first live click-through)

## 1. File state (line counts, verified fresh from GitHub via git clone)

src/: Morphiq.jsx — 1,451 · shared.jsx — 2,221 (was 2,132) · WorkoutScreen.jsx — 2,097 (was 2,090) · MealScreen.jsx — 713 · OnboardingScreen.jsx — 595 · ProgressScreen.jsx — 580 · ChatScreen.jsx — 293 · GymOwnerDashboard.jsx — 849 · GymSignupScreen.jsx — 269 · SuperAdminDashboard.jsx — 343 · index.js — 57

api/: no changes this session. Same 13 files as session 5.

Nothing near the 3,800-line limit. All files healthy.

## 2. What was built this session, in order

**Progressive overload for custom multi-day plans** — the top priority carried in from session 5. Two problems fixed together in `progressPlan()` (shared.jsx), since they're interdependent:

`progressPlan()` only ever read/wrote the flat `currentPlan.exercises` mirror, which is populated from Day 1 of a custom plan only — and the live workout screen doesn't even read that mirror once a plan has more than one day (it reads `plan.customDays` instead). Every day past Day 1 silently never progressed, and even Day 1 only got its flat `weight` bumped, never `setDetails` (the actual per-set table the workout screen renders). Fixed: `progressPlan()` now walks every day inside `customDays`, and regenerates `setDetails` on weight changes for every loading style except "Type in every set" (hand-edited, left alone — including "Same every set," which needed the fix too, since it also always carries a populated `setDetails` array that the workout screen prefers over the flat weight field).

Also built the 6RM-style pyramid Bryant proposed, after researching actual backoff-set conventions (10–20% lighter for strength goals, 20–30% for hypertrophy, one repeated backoff weight with slightly higher reps — not a different number per set) and how top logging apps (Hevy, Strong) minimize input fields. The old "Ramp down" style is now "Top set + backoff": member types one weight, the app auto-picks the drop % from their goal (already on file, invisible to them) and bumps backoff reps up a few (capped at 20). `buildSetDetails()` moved from WorkoutScreen.jsx into shared.jsx so the plan builder and `progressPlan()` share one implementation.

**Terminology and sequencing pass**, prompted by Bryant clicking through live and finding it confusing:
- All four loading-style buttons now have a plain-English one-line hint underneath (previously only "Top set + backoff" did) — Bryant tapped "Ramp up" and couldn't tell anything had happened.
- Button labels renamed to describe the mechanism, not just name it: "Same weight" → "Same every set," "Ramp up" → "Warm up to top set," "Set each one" → "Type in every set." ("Top set + backoff" unchanged.)
- The loading-style section (buttons + hint + the per-set table it unlocks) now stays hidden behind a short italic placeholder until Sets, Reps, and Weight are all filled in — Bryant felt seeing the styles immediately tempted people to skip ahead and hand-fill the table instead of following the intended flow. Weight allows "0" for bodyweight exercises; only a truly blank field blocks it. Editing an already-added exercise is unaffected (its fields are already filled, so the section shows immediately, correctly).

**Two more gaps found during the live click-through, NOT yet fixed — this is next session's work (see priority 1):**

1. **Custom-plan macros never populate correctly.** On the review step, "Daily calories" and "Protein" are blank optional manual inputs — fine as far as they go. But carbs and fat have no input field at all and are hardcoded to `null` in `savePlan()` (WorkoutScreen.jsx) regardless of what the member does. Root cause is bigger than a missing field: the AI-plan path calculates all four (calories/protein/carbs/fat) automatically via a real Mifflin-St Jeor BMR/TDEE formula (OnboardingScreen.jsx) using height, weight, sex, and age — but the custom-plan path never collects any of those. Tapping "I have my own routine" jumps straight from entering your name to building workout days; there's no body-stat step at all in that branch. So even reusing the formula as-is has nothing to calculate from.

2. **No rest-timer question in the custom-plan flow.** It silently defaults by goal (`GOAL_REP_RANGES[goal].rest`: lose fat 60s, general fitness 90s, build muscle 120s, build strength 180s) with zero UI, zero member choice, and zero indication this happened. The AI-plan path already has a clean, built 3-option rest picker (1 min / 2 min / 3 min, each with a sublabel) that could be reused as-is.

Bryant wants both fixed next session by adding a couple of quick, skippable questions to the custom-plan flow (height/weight/sex/age for the macro formula, and the existing rest-timer picker), reusing UI/formulas that already exist rather than building new ones — not by patching macros as manual-only fields. See priority 1.

3. **No way to skip per-exercise warm-up sets.** Traced this carefully with Bryant since he initially described it as a custom-plan gap — it isn't. There are two separate "warm-up" concepts in this app. The whole-workout warm-up routine (dynamic stretches/cardio, its own screen, has a working "Skip warm-up" button) genuinely doesn't exist for custom plans (`savePlan()` hardcodes `plan.warmup: []`), so that screen never shows — nothing to skip, already silently absent. Separately, every exercise (custom AND AI-generated alike) auto-generates up to 3 warm-up sets via a fallback ramp (roughly 50%/70%/85% of the working weight, computed in WorkoutScreen.jsx wherever `ex.warmupSets` is empty) that the member must click/log through one at a time before reaching their actual working sets — e.g. "Sets: 3" means 3 warm-up taps + 3 working-set taps, six total, with zero skip option. This is a real, universal gap (not custom-plan-specific) — worth fixing regardless of which plan type someone's on.

## 3. Confirmed working

`npm run build` succeeded clean after every change tonight — no errors, only pre-existing ESLint warnings unrelated to anything touched this session.

**Partial live spot-check happened this session** (a first, after two sessions of nothing being clicked through): Bryant walked through adding a custom exercise (leg press) live, tried "Same weight" with no style tapped (confirmed it defaults correctly), tried "Ramp up" (found the missing-hint problem, now fixed), and reached the macros/review step (found the carbs/rest-timer gaps above). Not yet clicked through: saving a full multi-day plan and opening the actual workout screen to confirm setDetails render correctly there, the day picker, or cardio logging from session 5.

## 4. Standing technical notes

GitHub REST API and raw.githubusercontent.com are both blocked from the sandboxed shell — git clone/git push over an authenticated HTTPS URL is the reliable path. profiles.supabase_user_id (text) is the auth link; profiles.id is the FK target everywhere else — don't confuse them. Fire-and-forget write pattern (.catch(() => {})) used for every new Supabase write.

Correction to the standing "before every push" safety checklist: it says "src/shared.jsx contains the AuthScreen component" — that's stale. `AuthScreen` actually lives in `Morphiq.jsx` now, not shared.jsx. Not something broken, just flagging so a future check doesn't chase a phantom failure.

No new Supabase objects this session — pure application-logic session (shared.jsx, WorkoutScreen.jsx only), no schema changes.

`routeChoice` state in OnboardingScreen.jsx (null/'ai'/'custom') is dead code — never read anywhere. The actual AI-vs-custom fork happens immediately after the name step via a direct `navigate("custom_plan")` call, bypassing the rest of OnboardingScreen's step sequence (goal, height/weight/sex/age, rest preference, etc.) entirely. This is *why* the custom-plan path is missing body stats and rest preference — worth knowing before touching that branch next session.

## 5. Not yet done — prioritized

**PRIORITY 1 (Bryant's explicit request, start here) — custom-plan macros + rest timer.** Add a small set of quick, skippable questions to the custom-plan flow (`CustomPlanScreen` in WorkoutScreen.jsx): height, weight, sex, age (feeds the existing Mifflin-St Jeor calculation already built in OnboardingScreen.jsx — reuse it, don't rewrite it) so calories/protein/carbs/fat all populate automatically instead of only two of the four being manual and two (carbs, fat) being permanently null. Also add the rest-timer question, reusing the existing 3-option picker UI from OnboardingScreen.jsx (1 min / 2 min / 3 min with sublabels) instead of the current silent goal-based default. Keep everything skippable/optional, matching the existing "Daily targets (optional)" pattern — don't force new required steps. Decide where in the CustomPlanScreen step sequence these questions best fit before writing code.

**PRIORITY 2 — add a way to skip per-exercise warm-up sets.** Applies to every plan type, not just custom. Each exercise auto-generates up to 3 warm-up sets (~50/70/85% of working weight) that must be logged one at a time before working sets — no skip option exists. Needs a "skip to working sets" control somewhere in the active-set logging screen (WorkoutScreen.jsx, the `isWarmupSet` render branch). Small, contained, low-risk — good candidate to knock out early next session.

**PRIORITY 3 — weight-increment sizing for custom exercises.** Every custom exercise progresses at a flat 2.5 lb increment regardless of movement pattern (AI plans already get 5 lb bumps for squat/hinge patterns via `EXERCISE_LIBRARY`; custom exercises have no such tag). Needs a deliberate decision on how to classify a free-typed exercise name into a movement pattern, or whether to just ask the member directly — check the Supabase `exercises` table schema first to see if there's already a usable field before assuming.

**PRIORITY 4 — finish the live spot-check.** Save a full multi-day custom plan and open the actual workout screen to confirm setDetails render correctly for every loading style, check the session-5 day picker, and check cardio logging. None of these three has been walked through live yet.

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

Continuing Hypergentiq. Session 6 shipped progressive overload for custom multi-day plans: progressPlan() (shared.jsx) now walks every day inside plan.customDays instead of only the flat plan.exercises mirror (which the live workout screen doesn't even read for multi-day plans — that was the actual bug), and regenerates setDetails on weight changes for every loading style except hand-edited "custom." Also shipped the 6RM-style feature: the old "Ramp down" style is now "Top set + backoff" — one weight typed in, goal-based drop % (15% strength / 25% hypertrophy-general-fatloss) and a slight rep bump on backoff sets, both invisible/automatic. buildSetDetails() moved into shared.jsx so the builder and progressPlan() share one implementation. Then, prompted by Bryant clicking through live for the first time in two sessions: added an explanatory hint under all four loading-style buttons (not just one), renamed the buttons to describe what they do, and gated the whole loading-style section behind Sets/Reps/Weight being filled in so it can't be seen prematurely.

Two more gaps surfaced during that live click-through and are explicitly NOT built yet — this is where to start:

TOP PRIORITY: custom-plan macros and rest timer. Carbs and fat are hardcoded to null in savePlan() (WorkoutScreen.jsx) with no input field at all; calories and protein are blank manual-only fields. Root cause: the AI-plan path calculates all four automatically via a real Mifflin-St Jeor formula (OnboardingScreen.jsx) using height/weight/sex/age, but the custom-plan path ("I have my own routine") skips straight from the name step to building workout days and never collects any body stats — routeChoice state exists but is dead code, the fork is a direct navigate() call. Same root problem for rest timer: it silently defaults by goal (60/90/120/180 sec) with a built 3-option picker UI sitting unused in OnboardingScreen.jsx that could be reused as-is. Bryant wants both fixed by adding a few quick, skippable questions to CustomPlanScreen, reusing the existing formula and picker UI rather than rebuilding anything, keeping everything optional like the current "Daily targets (optional)" step.

SECOND PRIORITY: add a way to skip per-exercise warm-up sets. Every exercise (custom AND AI-generated) auto-generates up to 3 warm-up sets (~50/70/85% of working weight) that must be logged one at a time with no skip option — traced this with Bryant and confirmed it's universal, not custom-plan-specific (the separate whole-workout warm-up routine screen genuinely doesn't exist for custom plans and that's fine, nothing to fix there — this is about the per-exercise ramp sets). Small, contained fix in WorkoutScreen.jsx's isWarmupSet render branch.

THIRD PRIORITY: weight-increment sizing for custom exercises — still a flat 2.5 lbs for everything regardless of movement pattern, needs a real classification decision before any code gets written (check the Supabase exercises table schema first).

FOURTH PRIORITY: finish the live spot-check — saving a full multi-day plan and confirming setDetails render correctly on the actual workout screen, the session-5 day picker, and cardio logging are all still unverified live.

After that: aesthetics/modernization pass (deferred, needs Bryant's screenshots), duplicate test profile rows, the demo-gym vs bryant-s-gym mismatch, privacy policy/terms (blocked on Bryant/lawyer), Stripe paywall enforcement, and a controlled Sentry backend test — all unchanged from session 5.

Technical notes carried forward: GitHub API/raw content is blocked from the sandbox — always use git clone/git push over authenticated HTTPS. profiles.supabase_user_id is the auth link, profiles.id is the FK used everywhere else. Use the fire-and-forget .catch(() => {}) pattern for all new Supabase writes. AuthScreen lives in Morphiq.jsx, not shared.jsx (the standing pre-push checklist referencing shared.jsx for it is stale).
