# Hypergentiq — Session 35 master handoff (cardio work from Sessions 31-32 now live-verified)

This file is the handoff. At the start of every session, fetch this file from the repo along with the src/ and api/ files — it replaces pasting a handoff into chat by hand. **MANDATORY fetch method — git clone only, see Technical notes below.**

## STANDING GOAL — App Store + Google Play submission roadmap (carry forward every session, do not delete until fully checked off)

No change this session — untouched. Step list: (1) fix PWA gaps — done, Session 30, (2) add Capacitor + generate native projects — done (Session 25), still not opened/built in Android Studio or Xcode, (3) set up Capgo live-update pipeline — still open, (4) Android path (Bryant needs a Google Play Console account, $25), (5) iOS path (needs a Mac on macOS Sequoia 15.6+ for Xcode 26, or a cloud Mac build service), (6) privacy policy — hard gate for both stores, blocked on Bryant forming a real legal business entity (draft exists, see punch list FIRST), (7) store listing assets (icon done, need screenshots + descriptions), (8) confirm no Apple IAP conflict, (9) submit.

## Session 35 — no code changes; live-tested all the cardio work from Sessions 31-32, everything passed

**What happened:** With both multi-day resume bugs closed out and verified last session, this session was pure live testing of the cardio feature set on the real production app — no code was touched. Same disposable **WarmupTest** account (identity re-confirmed via the profile screen before starting, consistent with this project's standing rule about verifying accounts before writing test data).

**Test 1 — goal-agnostic reach, on an account NOT set to lose_fat.** WarmupTest's profile was "Get fit & healthy" (not lose_fat) with no scheduled cardio days. Confirmed the persistent "Log cardio" row still appears on Home regardless of goal, opens `CardioScreen` correctly, and the live-timer flow works end to end: picked Treadmill, effort "Moderate," watched the elapsed timer and the estimated-calorie-burn figure both update live (00:09 → 2 cal, 00:40 → 9 cal), stopped after 40 seconds (clear of the 15-second accidental-log guard), got a "Cardio session logged" confirmation.

**Test 2 — manual "log a past session" entry.** Typed "25 minutes of biking yesterday, felt moderate" into the quick-log text box. `/api/parse-cardio` correctly extracted "Cycling · 25 min · ~150 cal" onto a confirm screen; confirmed and it logged successfully.

**Test 3 — Progress weekly/monthly cardio totals.** Progress → Workouts tab showed a new CARDIO card: "26 min · This week · 2 sessions" and the same for "This month" — correctly summing the ~40-second live session (rounds to ~1 min) and the 25-minute manual entry, both counted.

**Test 4 — the actual onboarding question + `buildPlan()` interleaving, on a real lose_fat account.** Used WarmupTest's own "Restart onboarding quiz" option (a real, current, self-service path already in the app — no fake account needed) to redo onboarding as lose_fat, 3 lifting days/week, and this time answered "2" on the cardio-days question. The plan summary before building correctly listed "Cardio days/week: 2×" alongside "Days/week: 3×." After building, Home's week-view tabs read **Full Body, Cardio, Full Body, Cardio, Full Body** — 5 total days, cardio evenly spaced between lifting days exactly as the interleaving algorithm intends (not clumped at the end or start). Tapping the "Cardio" tab showed "Today's a dedicated cardio day — pick your activity when you start" with a correctly-labeled "Start cardio" button (confirming the `isCardio ? "Start cardio" : "Start workout"` label logic), and tapping it opened `CardioScreen` directly, matching Session 32's design.

**Everything tested passed.** No new bugs found this session.

**Two minor copy nits noticed, not bugs, not fixed (flagging for whenever convenient):**
1. The onboarding cardio-days screen's helper text still reads "you can still log cardio anytime from Progress" — it's also now reachable from Home's persistent quick-access row, so the copy is stale, not wrong.
2. The AI's plan-build confirmation message says "3 days a week is the sweet spot for fat loss," referencing only the lifting days and not acknowledging the 2 additional cardio days in the same plan. Not incorrect, just incomplete.

**Side effect worth knowing:** using "Restart onboarding quiz" to test the lose_fat + cardio flow overwrote WarmupTest's previous profile (it had been "Get fit & healthy," Push/Pull/Legs, 5 days/week) with a fresh "Lose fat," Full Body, 3 lifting + 2 cardio days/week plan. This is expected and fine for a disposable test account, but the next session should know WarmupTest's current plan is the lose_fat one, not the old PPL one, if it picks up testing again from here.

## Files touched this session

None — zero code changes. Pure live QA. Line counts are unchanged from Session 34:

| File | Lines |
| --- | --- |
| src/shared.jsx | 3,349 |
| src/WorkoutScreen.jsx | 2,817 |
| src/Morphiq.jsx | 1,654 |
| src/GymOwnerDashboard.jsx | 927 |
| src/MealScreen.jsx | 831 |
| src/OnboardingScreen.jsx | 620 |
| src/ProgressScreen.jsx | 492 |
| src/SuperAdminDashboard.jsx | 343 |
| src/ChatScreen.jsx | 300 |
| src/GymSignupScreen.jsx | 269 |
| src/CardioScreen.jsx | 221 |
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

All well under the 3,800-line hard limit. `WorkoutScreen.jsx` (2,817) is the one to keep an eye on next time it's touched.

## Latest commit

No code commit this session (docs-only). This file's own commit is on top of `00c301b` on `main`.

## Confirmed working vs still open

**Live-verified this session, in the real running app:** onboarding's cardio-days question (correctly gated to lose_fat, correctly captured into the plan-build summary), `buildPlan()`'s even interleaving of cardio days among lifting days (5-day week showed Full Body / Cardio / Full Body / Cardio / Full Body), Home's scheduled-cardio-day card and its correct "Start cardio" label and routing, the persistent Home "Log cardio" quick-access row on a non-lose_fat account, `CardioScreen`'s live timer (elapsed time + calorie estimate both updating live) and its save-on-stop, the manual "log a past session" flow via `/api/parse-cardio` natural-language parsing, and Progress's weekly/monthly cardio totals aggregation. Combined with Sessions 33-34's resume-bug fixes (also live-verified), **the entire weight-loss/cardio feature set built over the last several sessions is now confirmed working end to end.**

**Not yet tested / not in scope this session:** voice input specifically for the cardio quick-log (typed text was tested, not the mic button itself), the "Other" cardio activity type, `CustomPlanScreen` cardio support (doesn't exist yet — see punch list), and cross-device sync of cardio logs (only tested in a single browser session).

## Punch list, in priority order

**FIRST — unblock the privacy policy.** Unchanged. Blocked on Bryant forming a real legal business entity.

**SECOND — no-blocker App Store groundwork.** Unchanged. Capacitor scaffolded/branded, PWA service worker shipped but unverified live. Capgo pipeline not started.

**THIRD — polish the two copy nits found this session (low effort, whenever convenient).** Update the onboarding cardio-days helper text to mention Home, not just Progress. Update the plan-build confirmation message to acknowledge cardio days alongside lifting days.

**FOURTH — weight-loss/cardio redesign, remaining pieces.** `CustomPlanScreen` still doesn't support scheduled cardio days. Wearable sync (Apple HealthKit/Fitbit) remains a deliberately separate, not-yet-scoped future initiative. Voice input on the cardio quick-log and the "Other" activity type haven't been live-tested yet (lower priority — likely fine, just not click-tested).

**FIFTH through TENTH — unchanged from Session 30, still open:** live-test `WarmupTest` full week start-to-finish (partially covered across recent sessions, but not the full original scope — nutrition/rest-timer/stats steps still unverified); get Bryant's sign-off on the compound/isolation warm-up split; exercise diagrams/animations (deferred); personal trainer market segment (needs its own discussion); expand exercise variety beyond primary/variation binary swap. Full detail in Session 30's version of this file (`git show 4337c5e:HANDOFF.md`).

**LOWER PRIORITY / OPS.** Unchanged: one unidentified blank-named test profile row in Supabase; naming cleanup (GitHub repo, live URL, `Morphiq.jsx`/`function Morphiq()` still carry the retired placeholder name — cosmetic only). WarmupTest's plan is now the fresh lose_fat/cardio plan from this session's testing (see note above) — not urgent, just know its current state before reusing it.

## Technical notes carried forward

**MANDATORY fetch method — git clone only.** `api.github.com` and direct HTTP calls to `github.com`/`raw.githubusercontent.com` are blocked by this environment's proxy allowlist; `raw.githubusercontent.com` via web-fetch can also silently serve stale cached content. `git clone`/`git push` over authenticated HTTPS from a plain scratch directory (not the mounted Windows output folder) remains the only trusted fetch method.

**A feature's own onboarding "restart" option is a legitimate, no-setup way to live-test a flow that's otherwise only reachable at first signup.** This session used WarmupTest's existing "Restart onboarding quiz" button (Progress screen, scroll to bottom) to re-run the lose_fat + cardio-days onboarding path without creating a new test account or touching Supabase directly. Worth remembering for any future feature gated behind first-time onboarding.

**Live-testing is worth doing even when a feature "looks done" in code review — it either confirms confidence or catches something a read-through misses.** This session found no new bugs, which is itself useful signal: the cardio feature set, built over two prior sessions, held up under real interaction across goal-agnostic access, live timing, manual entry, aggregation, and the original lose_fat scheduling path it was designed around.

**Verify identity before assuming a live-test account, every time, not just once.** Re-checked WarmupTest's profile name via the UI before starting this session's testing, same as last session — cheap and removes any doubt before writing test data.

**Client-side progress persistence has TWO layers, both must be cleared for a clean test reset.** `localStorage` key (`morphiq_workout_progress_<supabase_user_id>`) and the Supabase `workout_progress` column — always clear both together. Not directly exercised this session (no resume testing), but still a live constraint to remember.

**Native `window.confirm()`/`alert()`/`prompt()` dialogs block Claude-in-Chrome browser automation entirely.** No workaround found. Not hit this session.

`profiles.supabase_user_id` is the auth link, `profiles.id` is the FK used everywhere else. Fire-and-forget `.catch(() => {})` pattern for all new Supabase writes. `AuthScreen` lives in `Morphiq.jsx`, not `shared.jsx`. The `exercises` table is still just a reference/classification table, not wired into live plan generation.

**No live Node/npm toolchain in this sandbox by default.** `esbuild` (installed standalone via `npm install --no-save esbuild --prefix /tmp/esbuild-check`) is the fast syntax/JSX sanity check when code does change. Not needed this session since nothing was touched.

## Session 35 close-out summary

**Everything built/changed this session:** nothing — pure live QA, no commits to app code.

**Confirmed working, live, in the real production app:** the entire cardio feature set from Sessions 31-32 — onboarding question, `buildPlan()` interleaving, Home's scheduled-day card and persistent quick-access row, `CardioScreen`'s live timer and manual entry, and Progress's weekly/monthly totals. Combined with Sessions 33-34's resume-bug fixes, the full recent body of work (multi-day resume correctness + the weight-loss/cardio redesign) is now live-verified end to end.

**Still needs testing:** the cardio quick-log's voice/mic input specifically (typed text was tested), the "Other" activity type, `CustomPlanScreen` cardio support (not built yet), cross-device cardio-log sync.

**Next priority task:** the two low-effort copy nits (onboarding helper text, plan-build confirmation message) whenever convenient, or move on to `CustomPlanScreen` cardio support, or resume the App Store punch list (Capacitor Android Studio build check is the next unblocked item there). Privacy policy remains the overall FIRST priority once Bryant has a business entity.

**Final line counts, all files:** unchanged from Session 34 — see table above.

**Latest commit:** `00c301b` on `main` (last code commit); this file's docs commit sits on top of it.

## Paste this at the start of your next session

Fetch `HANDOFF.md`, `DECISIONS.md`, and all `src/`/`api/` files fresh via `git clone` (never `raw.githubusercontent.com` — can silently serve stale cached content). Report every file's line count before doing anything else; none are near the 3,800-line limit (`shared.jsx` is largest at 3,349, `WorkoutScreen.jsx` next at 2,817).

Remind Bryant: the entire cardio feature set (Sessions 31-32) and both multi-day resume bugs (Sessions 33-34) are now live-verified with no open issues. Two tiny copy nits are flagged in the punch list if there's nothing more pressing. Otherwise the next real chunks of work are: `CustomPlanScreen` cardio support, or picking the App Store punch list back up (privacy policy is blocked on Bryant's business entity; Capacitor's `android/` project has never been opened in Android Studio to confirm it builds — that's the next unblocked step there).

Also note: WarmupTest's account currently has a fresh "Lose fat" plan (3 lifting + 2 cardio days/week) from this session's onboarding test, not its earlier "Get fit & healthy" PPL plan — know this before reusing the account.
