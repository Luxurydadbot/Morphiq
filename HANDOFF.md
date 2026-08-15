# Hypergentiq — Session 33 master handoff (live bug fixed: multi-day workouts could silently swap days)

This file is the handoff. At the start of every session, fetch this file from the repo along with the src/ and api/ files — it replaces pasting a handoff into chat by hand. **MANDATORY fetch method — git clone only, see Technical notes below.**

## STANDING GOAL — App Store + Google Play submission roadmap (carry forward every session, do not delete until fully checked off)

No change this session — untouched. Step list: (1) fix PWA gaps — done, Session 30, (2) add Capacitor + generate native projects — done (Session 25), still not opened/built in Android Studio or Xcode, (3) set up Capgo live-update pipeline — still open, (4) Android path (Bryant needs a Google Play Console account, $25), (5) iOS path (needs a Mac on macOS Sequoia 15.6+ for Xcode 26, or a cloud Mac build service), (6) privacy policy — hard gate for both stores, blocked on Bryant forming a real legal business entity (draft exists, see punch list FIRST), (7) store listing assets (icon done, need screenshots + descriptions), (8) confirm no Apple IAP conflict, (9) submit.

## Session 33 — live bug report: multi-day workout silently swapped to a different day mid-session

**Bryant's live report, verbatim scenario:** started his Day 4 workout (incline bench press), logged roughly 4 sets successfully, then noticed the screen was showing seated leg curls — a completely different day's exercise. Follow-up detail that cracked the root cause: he'd closed and reopened the app partway through, and it came back on Day 3 instead of Day 4, requiring a manual switch back. Bryant's explicit ask: the app should always resume the exact day he was last on, not re-derive a guess.

**Root cause, found by reading (not guessing):** `activeDayIdx` (which day of a multi-day plan is currently active) was a plain `const` in `WorkoutScreen.jsx`, recomputed fresh on every render from a priority chain — explicit day pick (`selectedDayOverride`) → same-day local saved progress → `getAutoWorkoutDayIndex()` auto-pick. `selectedDayOverride` is deliberately cleared back to `null` moments after mount (a documented "one-time nudge" so a manual day pick from Home doesn't stick around forever). Once it cleared, later renders' `activeDayIdx` expression could fall through to a *different* source than whichever one determined which exercises actually got loaded into React state at mount. The `exercises` array itself is frozen in state at mount (a `useState` lazy initializer, not re-derived), so it correctly kept showing the right day for the rest of that live session — Bryant's 4 sets on incline bench press were genuinely fine. But every progress-persist write after that (there's a `useEffect` that saves `{ ...progress, dayIndex: activeDayIdx }` to localStorage + Supabase every time a set is logged) silently saved the *drifted*, wrong day index alongside the correct set data. That mismatch was invisible during the live session — it only surfaced the next time the app reopened, rebuilt the exercise list fresh from that wrongly-persisted day, and landed on a totally different day's (correctly-logged-progress-position but wrong-exercise-list) session.

**Fix, commit `33cd01f`:** `activeDayIdx` is now pinned into real React state (`useState`), computed once at mount using the exact same priority order as before, instead of being a live-recomputed `const`. It's now *only* ever changed by the two places in the code that legitimately switch days mid-session — the cross-device cloud-resume branch, and `continueOldWorkout()` (the "continue my unfinished day" conflict-resolution handler) — and both of those now call `setActiveDayIdx(...)` explicitly, right alongside the `setExercises(...)` call that changes the displayed exercise list, so the two values can never drift apart again. Also added `activeDayIdx` to the progress-persist effect's dependency list for correctness now that it's real state.

**Verified this session:** `esbuild` on the individual file and the full cross-file bundle (from `Morphiq.jsx`). Manually diffed the fixed file against its pre-fix version line by line — confirmed exactly the three intended change sites, nothing else touched, the one `try/catch` block near the edit is intact and unmodified.

**Not verified:** this is a live-usage bug fix for real logged workout data, and it has not been live-clicked yet. Combined with Sessions 31-32's un-tested cardio work, there are now three sessions of un-live-tested changes stacked up. This should be the very next thing done, and this particular fix (multi-day resume correctness) is arguably the highest-stakes of the three to verify, since it touches real workout logging for every multi-day-plan member, not just cardio.

## Files touched this session (final line counts)

- `src/WorkoutScreen.jsx`: 2,734 → 2,761 (+27) — `activeDayIdx` pinned into state, two explicit sync points added

All files, current full line counts:

| File | Lines |
| --- | --- |
| src/shared.jsx | 3,349 |
| src/WorkoutScreen.jsx | 2,761 |
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

All well under the 3,800-line hard limit. `WorkoutScreen.jsx` (2,761) still has headroom before the ~3,000-line watch point noted in earlier sessions. `shared.jsx` (3,349) unchanged this session.

## Latest commit

`33cd01f` on `main` ("Fix: multi-day workout could silently swap to a different day's exercises"), on top of Session 32's `7ad436d`.

## Confirmed working vs still open

**Verified this session:** `esbuild` compile (individual + full cross-file bundle) on `WorkoutScreen.jsx`. Full line-by-line diff review against the pre-fix file confirmed the change is scoped to exactly the three intended sites.

**Not live-tested — now three sessions deep:** Session 31 (onboarding cardio-days + `buildPlan()` scheduling), Session 32 (the cardio-logging screen), and this session's multi-day-resume fix have all shipped without a live click-through. Recommend testing this session's fix specifically first, since it's a correctness fix for real workout data already in production use, not a new feature nobody's touched yet.

## Punch list, in priority order

**FIRST — unblock the privacy policy.** Unchanged. Blocked on Bryant forming a real legal business entity.

**SECOND — no-blocker App Store groundwork.** Unchanged. Capacitor scaffolded/branded, PWA service worker shipped but unverified live. Capgo pipeline not started.

**THIRD — live-verify three sessions' worth of changes (new top priority, supersedes the old THIRD).** In priority order:
  1. **This session's multi-day resume fix.** Start a multi-day plan's Day 2 or 3 (not Day 1), log a couple of sets, then actually close and reopen the app (not just navigate within it) — confirm it resumes on the *same* day with the *same* exercises, matching what's shown in the persisted `dayIndex`. This is the exact scenario Bryant hit live.
  2. **Sessions 31-32's cardio work.** Onboard a test member as `lose_fat` with nonzero cardio days → confirm the plan builds/displays correctly including the scheduled cardio day on Home → tap into it, confirm `CardioScreen` opens and a live session logs correctly → separately tap the persistent "Log cardio" row on Home as a non-cardio-day / different-goal member → confirm it's reachable and works → check Progress's weekly/monthly cardio totals reflect what was logged → try the "Log a past session" manual toggle.

**FOURTH — weight-loss/cardio redesign, remaining pieces.** `CustomPlanScreen` still doesn't support scheduled cardio days. Wearable sync (Apple HealthKit/Fitbit) remains a deliberately separate, not-yet-scoped future initiative.

**FIFTH through TENTH — unchanged from Session 30, still open:** live-test `WarmupTest` full week start-to-finish; get Bryant's sign-off on the compound/isolation warm-up split; exercise diagrams/animations (deferred); personal trainer market segment (needs its own discussion); expand exercise variety beyond primary/variation binary swap. Full detail in Session 30's version of this file (`git show 4337c5e:HANDOFF.md`).

**LOWER PRIORITY / OPS.** Unchanged: one unidentified blank-named test profile row in Supabase; naming cleanup (GitHub repo, live URL, `Morphiq.jsx`/`function Morphiq()` still carry the retired placeholder name — cosmetic only).

## Technical notes carried forward

**MANDATORY fetch method — git clone only.** `api.github.com` and direct HTTP calls to `github.com`/`raw.githubusercontent.com` are blocked by this environment's proxy allowlist; `raw.githubusercontent.com` via web-fetch can also silently serve stale cached content. `git clone`/`git push` over authenticated HTTPS from a plain scratch directory (not the mounted Windows output folder — git lock files don't survive that mount; use `/tmp` or equivalent) remains the only trusted fetch method.

**When a value needs to survive across renders unchanged except at specific, intentional moments, it belongs in `useState`, not a plain `const` re-derived from other reactive values.** This session's bug is the general shape to watch for: a `const` computed from a priority-fallback chain (explicit choice → saved state → auto-derived default) looks stable but silently re-evaluates on every render — if any of its *inputs* change for reasons unrelated to the value it's supposed to represent (here, `selectedDayOverride` clearing itself out as a deliberate one-time nudge), the derived value can drift out from under state that WAS correctly pinned (here, `exercises`), with no error, no crash, just a quietly wrong persisted value. When two pieces of state need to always agree with each other, prefer explicit, paired `set` calls at the few legitimate transition points over letting one re-derive from live inputs and hoping it lands on the same answer.

**Reuse existing logging paths instead of building parallel ones.** Session 32's `CardioQuickLog` reuse still stands as the pattern to follow.

**Verify the real Supabase schema via the Supabase MCP tool before writing any DB code, don't just grep the frontend.** No DB schema changes this session.

**Client-side progress persistence has TWO layers, both must be cleared for a clean test reset.** `localStorage` key (`morphiq_workout_progress_<supabase_user_id>`) and the Supabase `workout_progress` column — always clear both together. Directly relevant this session: the bug lived in exactly this persistence path.

**Native `window.confirm()`/`alert()`/`prompt()` dialogs block Claude-in-Chrome browser automation entirely.** No workaround found — avoid clicks expected to trigger one during automated testing, or be ready to close and reopen the tab.

`profiles.supabase_user_id` is the auth link, `profiles.id` is the FK used everywhere else. Fire-and-forget `.catch(() => {})` pattern for all new Supabase writes. `AuthScreen` lives in `Morphiq.jsx`, not `shared.jsx`. The `exercises` table is still just a reference/classification table, not wired into live plan generation.

**No live Node/npm toolchain in this sandbox by default.** `esbuild` (installed standalone via `npm install --no-save esbuild --prefix /tmp/esbuild-check`) is the fast syntax/JSX sanity check. A full cross-file bundle built from `Morphiq.jsx` (not externalizing local imports) catches export/import name mismatches a per-file check misses — worth doing whenever a session adds a new shared export or cross-file import, and cheap enough to just always do.

## Session 33 close-out summary

**Everything built/changed this session:** investigated and fixed a live bug Bryant hit mid-workout — a multi-day plan's active day could silently drift out of sync with its own persisted progress, surfacing as the wrong exercises loading on app reopen. Root cause traced to `activeDayIdx` being a live-recomputed `const` instead of pinned state; fixed by converting it to `useState` with two explicit, paired sync points. One commit, `33cd01f`.

**Confirmed working:** `esbuild` compile (individual + full cross-file bundle). Manual diff review confirmed the fix is scoped to exactly three sites, nothing else touched, the nearby `try/catch` intact.

**Still needs testing:** this fix, plus Sessions 31 and 32's cardio work — none of it has been live-clicked. See punch list THIRD for the exact order and steps.

**Next priority task:** live-verify this session's resume fix first (highest stakes — real workout data), then the cardio work from Sessions 31-32. After that: `CustomPlanScreen` cardio support, wearable sync. Privacy policy remains blocked on business entity formation. Capacitor `android/` still needs an Android Studio build check.

**Final line counts, all files:** see table above. Nothing near the 3,800-line limit; `shared.jsx` is largest at 3,349.

**Latest commit:** `33cd01f` on `main`.

## Paste this at the start of your next session

Fetch `HANDOFF.md`, `DECISIONS.md`, and all `src/`/`api/` files fresh via `git clone` (never `raw.githubusercontent.com` — can silently serve stale cached content). Report every file's line count before doing anything else; none are near the 3,800-line limit (`shared.jsx` is largest at 3,349).

Remind Bryant of the next priority task: **live-verify what's shipped over the last three sessions, starting with the multi-day workout resume fix.** Session 33 fixed a real bug he hit live — closing and reopening the app mid-workout could land on the wrong day with the wrong exercises, because the app's internal "which day is active" tracking could silently drift from what was actually being displayed and logged. The fix pins that value in state instead of letting it re-derive. Test it exactly the way it broke: start a non-Day-1 workout on a multi-day plan, log a couple of sets, actually close and reopen the app (not just navigate within it), and confirm it resumes the same day with the same exercises. After that, walk through Sessions 31-32's cardio work (onboarding cardio-days question, `buildPlan()` scheduling, the live-timer `CardioScreen`, the Home quick-access button, Progress's weekly/monthly totals) — full checklist in the punch list THIRD entry.

Also still open: the privacy policy (blocked on Bryant forming a real legal business entity, not on finding a lawyer). Capacitor's `android/`/`ios/` native projects are scaffolded and branded but nobody has opened `android/` in Android Studio to confirm it builds. The Capgo live-update pipeline hasn't been started. `CustomPlanScreen` doesn't support cardio days yet. Wearable sync (Apple HealthKit/Fitbit) is a deliberately separate, not-yet-scoped future initiative.
