# Hypergentiq — Session 31 master handoff (cardio-day onboarding + scheduling shipped, phase 1 of the weight-loss/cardio redesign)

This file is the handoff. At the start of every session, fetch this file from the repo along with the src/ and api/ files — it replaces pasting a handoff into chat by hand. **MANDATORY fetch method — git clone only, see Technical notes below.**

## STANDING GOAL — App Store + Google Play submission roadmap (carry forward every session, do not delete until fully checked off)

No change this session — untouched. Step list: (1) fix PWA gaps — done, Session 30, (2) add Capacitor + generate native projects — done (Session 25), still not opened/built in Android Studio or Xcode, (3) set up Capgo live-update pipeline — still open, (4) Android path (Bryant needs a Google Play Console account, $25), (5) iOS path (needs a Mac on macOS Sequoia 15.6+ for Xcode 26, or a cloud Mac build service), (6) privacy policy — hard gate for both stores, blocked on Bryant forming a real legal business entity (draft exists, see punch list FIRST), (7) store listing assets (icon done, need screenshots + descriptions), (8) confirm no Apple IAP conflict, (9) submit.

## Session 31 — weight-loss/cardio redesign, phase 1: onboarding cardio-days question + buildPlan() scheduling

**Context:** Session 30 scoped the whole `lose_fat`/cardio redesign in DECISIONS.md but left one open question before any code could start: should cardio-day count be a fixed default (e.g. always 3 lifting + 2 cardio) or member-picked at onboarding? Asked Bryant directly this session — his call: **member picks**, matching his own proposed onboarding shape from the Aug 9 research conversation and the competitive research (Strava/Apple Fitness/Garmin all let flexibility win over a locked default). Logged as a new August 15, 2026 entry in DECISIONS.md.

**What shipped, commit `02dd791`:**
- **`OnboardingScreen.jsx`** — new step 7, shown only when `goal === "lose_fat"`, asks "Days of cardio, on their own?" with the same dial-stepper UI pattern as the existing lifting-days question (0-4 range, defaults 0). Every other goal skips straight past it (step 6's Continue button branches `goal === "lose_fat" ? 7 : 8`). Steps 8-14 renumbered accordingly (rest pref, injuries, equipment, disclaimer, confirm, generating, reveal), progress bar (`progressPct` array, `step < 11` visibility gate) updated to match the new 11-question flow. `cardioDaysPerWeek` plumbed into both `profileForPlan` (goes into `buildPlan()`) and `userData` (saved to the profile), and added as a confirm-screen row when nonzero.
- **`shared.jsx` `buildPlan()`** — new cardio-day scheduling block, gated entirely behind `goal === "lose_fat" && cardioDaysPerWeek > 0` so every existing plan shape (all other goals, and lose_fat with 0 cardio days) is byte-for-byte unaffected. When active: normalizes whatever lifting day-type(s) the existing logic already built (Full Body / Upper-Lower / Push-Pull-Legs) into a `daysPerWeek`-long sequence, then interleaves `cardioDaysPerWeek` cardio-only day objects (`{ dayLabel: "Cardio", isCardio: true, exercises: [] }`) as evenly as possible using a simple even-distribution algorithm (same idea as Bresenham's line algorithm) — verified with a standalone Node test this session: 3 lift + 2 cardio → `Full Body, Cardio, Full Body, Cardio, Full Body` (never adjacent, never clustered). Not pinned to real calendar weekdays — `customDays` entries are worked through in order whenever the member actually trains, same as every other multi-day plan already.
- **`Morphiq.jsx`** — home screen's "Start workout" card now checks `upcomingDay?.isCardio`. On a cardio day it shows a short explainer card instead of the (empty) exercise-preview list, changes the subtext from "N exercises · ~M min" to "Pick your activity when you start", and the button becomes "Log cardio" routing to the Progress screen's existing `CardioQuickLog` instead of `WorkoutScreen` — which still assumes a real, non-empty exercise list (`exIdx`/set logic) and would have broken on a cardio day's empty `exercises: []`.

**Deliberately not built this session** (next steps, see punch list TENTH below): the actual guided cardio-day screen — activity-type picker (treadmill/bike/stepper/rower/outdoor run/other, picked at point of use per the researched Strava/Apple Fitness/Garmin pattern), live start/stop timer, live-updating MET-based calorie estimate. `CustomPlanScreen` (hand-built plans) doesn't get cardio-day support yet either — only AI-generated `lose_fat` plans do so far.

## Session 30 — coach note accuracy, five punch-list items, weight-loss/cardio redesign scoped

See prior handoff detail in git history (`git show 4337c5e:HANDOFF.md`) — coach note day-accuracy fixes, PWA service worker, privacy policy first draft, Body fat est. honest state, Up next/After that readiness fix, grocery custom/recurring items, and the initial weight-loss/cardio redesign scoping that this session built on.

## Files touched this session (final line counts)

- `src/OnboardingScreen.jsx`: 583 → 620 (+37) — new cardio-days step, renumbered steps 8-14, progress bar update
- `src/shared.jsx`: 3,168 → 3,218 (+50) — cardio-day scheduling block in `buildPlan()`
- `src/Morphiq.jsx`: 1,628 → 1,641 (+13) — cardio-day-aware home screen card/button

All files, current full line counts:

| File | Lines |
| --- | --- |
| src/shared.jsx | 3,218 |
| src/WorkoutScreen.jsx | 2,734 |
| src/Morphiq.jsx | 1,641 |
| src/GymOwnerDashboard.jsx | 927 |
| src/MealScreen.jsx | 831 |
| src/OnboardingScreen.jsx | 620 |
| src/ProgressScreen.jsx | 587 |
| src/SuperAdminDashboard.jsx | 343 |
| src/ChatScreen.jsx | 300 |
| src/GymSignupScreen.jsx | 269 |
| api/chat.js | 259 |
| api/report-usage.js | 165 |
| api/stripe-webhook.js | 161 |
| api/coach-note.js | 115 |
| api/admin-gym-action.js | 110 |
| api/monthly-usage-report.js | 101 |
| api/create-checkout.js | 89 |
| api/photo-meal.js | 76 |
| api/parse-meal.js | 62 |
| api/parse-cardio.js | 62 |
| api/plan.js | 31 |
| api/_sentry.js | 32 |
| api/ping.js | 12 |
| src/index.js | 64 |
| src/serviceWorkerRegistration.js | 23 |

All well under the 3,800-line hard limit. `shared.jsx` (3,218) and `WorkoutScreen.jsx` (2,734) remain the two largest, both past the 2,000-line soft target — Bryant has asked to defer any split until he asks; still holding off.

## Latest commit

`02dd791` on `main` ("Feature: weight-loss/cardio redesign, phase 1 -- onboarding cardio-days question + buildPlan() scheduling"), on top of Session 30's `4337c5e` close-out (which itself was 15 commits on `1040a4a`).

## Confirmed working vs still open

**Verified this session:** all three touched files compile clean via `esbuild` (syntax/JSX check only, no bundler warnings). The even-distribution cardio interleave algorithm was pulled out and run standalone in Node against three scenarios (3 lift + 2 cardio, 5-day Push/Pull/Legs + 1 cardio, 4-day Upper/Lower + 3 cardio) — confirmed cardio days never land adjacent to each other and don't cluster at the end in any case. The non-cardio code path (every other goal, and `lose_fat` with 0 cardio days) was not changed at all — the new logic is fully gated behind `goal === "lose_fat" && cardioDaysPerWeek > 0`, so existing plans are unaffected by construction, not just by testing.

**Not live-tested in Chrome this session** — no browser automation was run. Nobody has clicked through the new onboarding step, generated a real `lose_fat` + cardio-days plan, or opened the home screen to see the new "Log cardio" card live. This is the most important thing to spot-check next session before trusting this further.

## Punch list, in priority order

**FIRST — unblock the privacy policy.** Unchanged from Session 30. Still the single highest-leverage blocked item, blocking the whole App Store roadmap. Blocked on Bryant forming a real legal business entity — not a "find a lawyer" step, there's no entity yet for counsel to review anything for. `PRIVACY_POLICY_DRAFT.md` (repo root) has the draft, ready whenever an entity exists.

**SECOND — no-blocker App Store groundwork.** Unchanged from Session 30. Capacitor native projects scaffolded and branded; PWA service worker shipped but not live-verified in a browser yet. Still open: Capgo live-update pipeline, and opening the native `android/` project in Android Studio to confirm it actually builds.

**THIRD — the weight-loss/cardio redesign, phase 2 (new top priority for next session).** Phase 1 (this session) is done: onboarding question + `buildPlan()` scheduling. What's left, in the order it probably needs to happen:
  1. **Live-verify phase 1** — walk a fresh `lose_fat` onboarding with a nonzero cardio-days pick, confirm the plan actually saves and displays correctly, confirm the home screen's cardio-day card/button work as built (this hasn't been clicked once yet, see "Confirmed working" above).
  2. **Build the real cardio-day screen** — this is the bulk of the remaining work and the actual point of the whole redesign: activity-type picker at point of use (treadmill/bike/stepper/rower/outdoor run/other), a live start/stop timer, and a live-updating MET-based calorie estimate (recalculated on an interval off elapsed time, not a one-shot end-of-session calculation — confirmed decision, see DECISIONS.md Aug 9 2026). Standard MET formula: calories = MET value × body weight (kg) × duration (hours). Should log into the existing `cardio_logs` table (already shaped right: `duration_minutes`, `calories`) via the same insert path `CardioQuickLog` already uses in `ProgressScreen.jsx`.
  3. **Wire cardio days into `CustomPlanScreen`** (hand-built plans) — right now only AI-generated `lose_fat` plans get cardio days via `buildPlan()`; hand-built plans have no equivalent yet.
  4. **Wearable sync (Apple HealthKit / Fitbit)** — explicitly phase 2 of phase 2, bigger lift (OAuth/device permissions), scope separately once the core timer experience exists. Not urgent.

**FOURTH through NINTH — unchanged from Session 30, still open, not touched this session:** live-test `WarmupTest` full week start-to-finish; get Bryant's sign-off that the compound/isolation warm-up split is sufficient; exercise diagrams/animations (deferred, needs a licensed library); personal trainer market segment (needs its own discussion before building); expand exercise variety beyond primary/variation binary swap. Full detail in Session 30's version of this file (`git show 4337c5e:HANDOFF.md`).

**LOWER PRIORITY / OPS.** Unchanged: the one unidentified blank-named test profile row in Supabase; naming cleanup (GitHub repo, live URL, `Morphiq.jsx`/`function Morphiq()` still carry the retired placeholder name — cosmetic only).

## Technical notes carried forward

**MANDATORY fetch method — git clone only.** `api.github.com` and direct `curl`/Python HTTP calls to `github.com`/`raw.githubusercontent.com` are blocked outright by this environment's outbound proxy allowlist. The web-fetch tool's access to `raw.githubusercontent.com` can also silently return **stale cached content** instead of erroring — reconfirmed again this session (served a 20-session-old Session-10-era `HANDOFF.md` on the first fetch attempt, before falling back to `git clone` per this same note, which returned the real, current Session 30 file). `git clone`/`git push` over authenticated HTTPS from a plain scratch directory (not the mounted Windows output folder — git lock files don't survive a Windows filesystem mount, use `/tmp` or equivalent) remains the only fetch method to trust by default.

**Verify the real Supabase schema via the Supabase MCP tool before writing any DB code, don't just grep the frontend.** No new tables touched this session (cardio days reuse the existing `cardio_logs` table shape once the real logging screen is built), but the rule stands for phase 2's cardio-day screen work.

**Client-side progress persistence has TWO layers, both must be cleared for a clean test reset.** `localStorage` key (`morphiq_workout_progress_<supabase_user_id>`) and the Supabase `workout_progress` column — always clear both together.

**Native `window.confirm()`/`alert()`/`prompt()` dialogs block Claude-in-Chrome browser automation entirely.** No workaround found — avoid clicks expected to trigger one during automated testing, or be ready to close and reopen the tab.

`profiles.supabase_user_id` is the auth link, `profiles.id` is the FK used everywhere else. Fire-and-forget `.catch(() => {})` pattern for all new Supabase writes. `AuthScreen` lives in `Morphiq.jsx`, not `shared.jsx`. The `exercises` table (91 rows: id, name, muscle_group, pattern, equipment, difficulty, variation_of, is_active) is still just a reference/classification table, not wired into live plan generation.

**No live Node/npm toolchain in this sandbox by default** — `node_modules` isn't checked into the repo. `esbuild` (installed standalone via `npm install --no-save esbuild --prefix /tmp/esbuild-check`) remains the fast syntax/JSX sanity check used in place of a full `react-scripts build`. This session additionally used a standalone Node script to unit-test the new cardio-interleave algorithm in isolation before trusting it inside `buildPlan()`.

**Duplicate logic is the recurring root cause of real bugs in this codebase (carried forward from Session 10, still true).** When adding cardio-day awareness this session, checked every `customDays` consumer in `shared.jsx`, `Morphiq.jsx`, and `WorkoutScreen.jsx` first (via grep) rather than assuming the existing `day.exercises || []` defensive pattern would hold everywhere — it did in `shared.jsx` (progression math, plateau detector, `isMultiDayPlan`, `getAutoWorkoutDayIndex` are all day-count-agnostic already), but `WorkoutScreen.jsx`'s active-workout flow does assume a non-empty `exercises` array, which is exactly why cardio days are routed away from it (to Progress) rather than into it, instead of trying to make `WorkoutScreen.jsx` itself cardio-aware this session.

## Session 31 close-out summary

**Everything built/changed this session:** resolved the one open decision blocking the weight-loss/cardio redesign (member-picks-cardio-days, logged in DECISIONS.md); shipped phase 1 — the onboarding cardio-days question (`OnboardingScreen.jsx`), the `buildPlan()` cardio-day scheduling logic with even-distribution spacing (`shared.jsx`), and cardio-day-aware routing on the home screen so a cardio day never gets sent into `WorkoutScreen` where it would break (`Morphiq.jsx`). One commit, `02dd791`.

**Confirmed working:** all three files compile clean via `esbuild`. The cardio-interleave scheduling algorithm was unit-tested standalone in Node across three plan shapes and confirmed to space cardio days correctly. The change is fully gated behind `goal === "lose_fat" && cardioDaysPerWeek > 0`, so no existing plan shape can regress.

**Still needs testing:** nothing in this session's work has been live-clicked in the running app yet — no Chrome automation was run. Walking a real `lose_fat` onboarding with cardio days picked, confirming the plan saves/displays right, and clicking through the new home-screen cardio-day card are the first things to check next session.

**Next priority task:** phase 2 of the weight-loss/cardio redesign — build the actual cardio-day screen (activity-type picker, live start/stop timer, live MET-based calorie estimate), the real point of this whole initiative. Live-verify phase 1 first if there's a natural moment for it. `CustomPlanScreen` cardio support and wearable sync remain queued behind that. Privacy policy remains blocked on business entity formation (not actionable by Claude). Capacitor `android/` still needs an Android Studio build check.

**Final line counts, all files:** see table above. Nothing near the 3,800-line limit; `shared.jsx` is largest at 3,218.

**Latest commit:** `02dd791` on `main`.

## Paste this at the start of your next session

Fetch `HANDOFF.md`, `DECISIONS.md`, and all `src/`/`api/` files fresh via `git clone` (never `raw.githubusercontent.com` — can silently serve stale cached content, reconfirmed again this session). Report every file's line count before doing anything else; none are near the 3,800-line limit (`shared.jsx` is largest at 3,218).

Remind Bryant of the next priority task: **phase 2 of the weight-loss/cardio redesign — the actual cardio-day screen.** Phase 1 shipped this session (commit `02dd791`): onboarding asks `lose_fat` members how many dedicated cardio days/week they want (0-4), and `buildPlan()` schedules those days evenly into the plan's rotation alongside their lifting days. What's still missing is the real cardio-day *experience*: an activity-type picker at point of use (treadmill/bike/stepper/rower/outdoor run/other — matches the Strava/Apple Fitness/Garmin convention, confirmed via research, DECISIONS.md Aug 9 2026), a live start/stop timer, and a live-updating MET-based calorie estimate (recalculates continuously, not just once at the end — confirmed decision). Should write into the existing `cardio_logs` table via the same path `ProgressScreen.jsx`'s `CardioQuickLog` already uses. Right now a cardio day just shows a placeholder card on the home screen routing to the old manual cardio quick-log — good enough not to break anything, but not the real feature yet.

Also worth doing early next session, since nothing from this session has been live-tested: walk a real `lose_fat` onboarding flow picking nonzero cardio days, confirm the plan builds/saves/displays correctly, and click the new home-screen cardio-day card end to end.

Also still open: the privacy policy (blocked on Bryant forming a real legal business entity, not on finding a lawyer). Capacitor's `android/`/`ios/` native projects are scaffolded and branded but nobody has opened `android/` in Android Studio to confirm it builds. The Capgo live-update pipeline hasn't been started. `CustomPlanScreen` doesn't support cardio days yet (only AI-generated `lose_fat` plans do).
