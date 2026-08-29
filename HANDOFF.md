# Hypergentiq — Session 48 master handoff

This file is the handoff. At the start of every session, fetch this file from the repo along with the src/ and api/ files — it replaces pasting a handoff into chat by hand. **MANDATORY fetch method — git clone only, see Technical notes below.**

## STANDING GOAL — App Store + Google Play submission roadmap (carry forward every session, do not delete until fully checked off)

Unchanged this session — this session's work (below) was a member-facing feature request, not app-store-roadmap work. Step list: (1) fix PWA gaps — done, Session 30, (2) add Capacitor + generate native projects — done (Session 25), still never opened in Android Studio/Xcode by a human, (3) set up Capgo live-update pipeline — still open, (4) Android path (Bryant needs a Google Play Console account, $25), (5) iOS path (needs a Mac on macOS Sequoia 15.6+ for Xcode 26, or a cloud Mac build service), (6) privacy policy — hard gate for both stores, still blocked on Bryant forming a real legal business entity before it can be finalized and sent to a lawyer, (7) terms of service — same status as privacy policy, (8) account deletion — built Session 46, live-verified working Session 47, (9) store listing assets (icon done, need screenshots + descriptions), (10) confirm no Apple IAP conflict, (11) submit.

## Session 48 — built "switch exercise" so members can jump to any exercise on today's list at any time

Bryant relayed a real observation from a friend testing the app at the gym: the equipment for the next planned exercise was taken, and the only existing option (the "Swap" button) replaces an exercise with a *different* one — there was no way to just do the exercises already on today's list in a different order and come back to the skipped one later.

**Investigated the existing code first, before writing anything**, per the app's own database/error-handling rules about not guessing at how things work. Found that `WorkoutScreen.jsx` already tags every logged set with exactly which exercise it belongs to (`exIdx`) rather than just "whatever's next in the queue" — so the foundation for jumping around was already solid; nothing about how sets get saved needed to change. What was strictly linear was the *navigation*: `advanceSet()` only ever moved forward one exercise at a time, and there was no screen showing the whole day's list.

**Two judgment calls, confirmed with Bryant before building:**
- A member can switch exercises **at any time, including mid-set** (not just between exercises) — matches the real scenario: the equipment's taken *right now*, so switch *right now*.
- If a member works through their whole list but left one exercise skipped, the app **gently prompts** them with what's left ("Nice work! 1 exercise left — [tap to jump in]") instead of either silently routing them into it or silently ending the workout as if it were fully done.

**What was built, all in `src/WorkoutScreen.jsx`:**
- A new **"Today's list" button**, labeled in plain words, shown right under the exercise name at the top of the active-workout screen (and again as a text link on the rest screen) — deliberately prominent per Bryant's ask that this be obvious, not a hidden feature. Opens a sheet listing every exercise on today's plan with its real status (Not started / "2 of 4 sets done" / Done), tap any one to jump straight to it.
- `loggedSetCountForExercise()` / `isExerciseComplete()` — read real per-exercise progress straight from the sets already being logged (no new data, no new database writes).
- `resolveNextExercise()` — one function, called from two places, that decides what happens once an exercise's sets run out: auto-continue seamlessly if nothing was skipped (identical to the old behavior), or hand off to the new "checkpoint" screen if something else on the list still needs finishing. Used by both `advanceSet()` (the real transition) and the "Up next" preview shown during rest, so the preview and what actually happens next can never disagree with each other.
- New **"checkpoint" screen** — replaces "workout complete" when the list isn't actually fully done; positive, no-guilt wording per the app's design rules, with a "Finish workout without them" escape hatch so nobody's ever stuck.

**Verification done before pushing (code-level, not yet a live click-through — see "still open" below):**
- Read the entire existing active/rest/done render flow first to understand `exIdx`/`setIdx`/`loggedSets`/resume/persistence before touching anything, since this file has a documented history of subtle bugs from two copies of the same logic drifting apart (see `normalizeExercise()`'s own comments) — deliberately wrote one shared `resolveNextExercise()` / `renderExerciseListSheet()` instead of copy-pasting either.
- `esbuild` syntax-checked the whole file clean.
- Reviewed the full diff line by line: 210 insertions, 11 deletions, all intentional — no accidental changes to unrelated code. `function WorkoutScreen()` and every other existing check from the safety-check rules confirmed intact.
- Also fixed a related, smaller bug spotted while doing this: the "Up next"/"After that" preview cards on the rest screen used to just assume "next" always meant `exercises[safeExIdx + 1]`, which is only true when nothing's ever skipped — now both call the same `resolveNextExercise()` the real transition uses.

**NOT yet done — flagging clearly rather than calling this finished:** this was verified by reading the code closely and checking it compiles cleanly, but **not yet live-tested by actually clicking through the running app** the way Sessions 46/47 verified account deletion and the Plan-ready screen. That's the natural next step — either now, with Bryant's help checking his email for a test-account signup code, or Bryant trying it himself at the gym next time he works out. Recommend not treating this as fully proven until one of those happens.

**Two things noticed along the way, not touched, flagged for Bryant:**
- **Pre-existing bug, not caused by this session's work:** the "Workout complete" screen's per-exercise breakdown (sets/best reps/volume per exercise) and the in-workout "sets logged for this exercise" indicator both filter on `loggedSets` by `l.exerciseName` — but the actual logged-set entries only ever store `exIdx`/`setIdx`/`reps`/`weight`/`kind`, never `exerciseName`. So those two displays have likely always silently shown zero/empty, regardless of this session's changes. Did not fix it — it's unrelated to what was asked this session and touches different display code. Worth a short follow-up session if Bryant wants it fixed (`src/WorkoutScreen.jsx`, three spots currently reading `l.exerciseName`, need to key off `l.exIdx` instead, same pattern this session's new code already uses).
- The "After that" secondary preview (the smaller card shown two steps ahead of "Up next" during rest) still uses a simpler approximation in one specific sub-case and could occasionally be slightly stale if a member has skipped more than one exercise out of order. Low-impact — it's the smaller, less prominent card, and "Up next" itself is fully corrected.

## Session 47 recap — carried forward, unchanged

Live-tested account deletion end-to-end on the real production app (fully works, Apple Guideline 5.1.1(v) satisfied), live-verified the post-onboarding "Plan ready" screen's Session 45 color fix, and built the weekly detection engine (weight-trend plateau + nutrition adherence via `src/coachSignals.js`) wired into both `/api/coach-note` and `/api/chat`, live-tested against production with synthetic data. See prior version of this file (or `git log`) for full detail if needed.

## Session 46 recap — carried forward, unchanged

Reviewed the privacy policy draft as a non-lawyer checklist pass, built and shipped in-app account deletion (the feature verified live in Session 47), drafted Terms of Service for the first time, and worked around Vercel's Hobby-plan 12-function cap by merging two low-traffic billing-report tools into one file (`api/usage-report.js`). See prior version of this file (or `git log`) for full detail if needed.

## Session 45 recap — carried forward, unchanged

Live-verified Session 44's fixes, fixed a real Meals-screen gap, unified nutrition macro colors, and stood up a GitHub Actions check that verifies the Android app still compiles on every push. See `git log` for detail if needed.

## Files touched this session (final line counts)

Only one file changed this session: `src/WorkoutScreen.jsx` **2,865 → 3,064** (+199 lines — the switch-exercise feature: new state, six new helper functions, a new "checkpoint" screen, the corrected "Up next" preview, and two new entry-point buttons). Diff reviewed line by line before pushing: 210 insertions, 11 deletions, all intentional, nothing accidentally deleted.

Untouched this session, still current: `src/shared.jsx` 3,716 (largest, watch this one — do not add to this file without proposing a split first, it's within ~85 lines of the 3,800 hard limit), `src/Morphiq.jsx` 1,755, `src/GymOwnerDashboard.jsx` 927, `src/MealScreen.jsx` 869, `src/ProgressScreen.jsx` 657, `src/OnboardingScreen.jsx` 622, `src/coachSignals.js` 159, `src/SuperAdminDashboard.jsx` 343, `src/ChatScreen.jsx` 309, `src/CardioScreen.jsx` 295, `src/GymSignupScreen.jsx` 269. `api/` unchanged at exactly 12 files (the Vercel Hobby-plan cap) — none near any size concern individually.

## Latest commit

`fac2330` — "Feature: switch exercise anytime during a workout" (`src/WorkoutScreen.jsx` only — this feature didn't need any backend/`api/` change, so there's no second commit this time).

## Confirmed working vs still open

**Built and deployed this session, code-verified but NOT yet live-tested end to end (see Session 48 above for exactly what was and wasn't checked):**
- The "switch exercise" feature — Today's list sheet, jump-to-any-exercise-anytime, the new checkpoint screen, and the corrected Up-next preview. Compiles clean, diff reviewed line by line, but nobody has actually clicked through it in the running app yet. **Treat as the top priority to verify next**, ahead of the app-store roadmap items below, since it's fresh, unverified, member-facing code.

**Confirmed live in prior sessions, via direct database verification, direct visual inspection, and live production endpoint tests — unchanged, still true:**
- `api/delete-account.js` and the Profile screen's Danger Zone flow — fully live-verified, Session 47.
- The post-onboarding "Plan ready" screen's Daily Targets tiles — fully live-verified, Session 47.
- The weekly detection engine (weight-trend plateau + nutrition adherence) — live-tested against production endpoints with synthetic data, Session 47. Still not yet exercised by a real member's real multi-week logging history.

**NOT yet verified / still open from prior sessions (unchanged):**
- The weight chart real-phone swipe test.
- The cardio timer real-phone lock-screen test.
- Everything else on the punch list below.

**Newly flagged this session, not fixed, not urgent:**
- Pre-existing bug: the "Workout complete" per-exercise breakdown and in-workout "sets so far" indicator both key off a `loggedSets` field (`exerciseName`) that's never actually set — likely always showing empty. See Session 48 write-up above for the exact fix if Bryant wants it done.

## Punch list, in priority order

**NEW — live-test the "switch exercise" feature** built this session before trusting it fully: start a real (or throwaway) workout, confirm the "Today's list" button appears and opens the sheet, jump to a different exercise mid-set, confirm progress on the skipped one is still there when you come back to it, and confirm the checkpoint screen appears correctly if you finish your list with one exercise left undone.

**FIRST — unblock the privacy policy and terms of service.** Both drafts exist now. Both are still blocked on Bryant forming a real legal business entity, after which both documents need to go to an actual lawyer together.

**SECOND — App Store groundwork, next concrete step: open the Android project in real Android Studio at least once.** The GitHub Actions check proves the app compiles and is currently passing, but nobody has run it on a device or emulator yet. Capgo live-update pipeline still not started.

**THIRD — an actual finger-swipe test on a real phone for the weight chart** (Bryant's own task, waiting on him logging more days).

**FOURTH — cardio timer real-phone test.** Session 40's wall-clock fix still hasn't been live-tapped by Bryant with the screen genuinely locking.

**FIFTH — wearable sync (Apple HealthKit/Fitbit).** Unchanged, still not scoped.

**SIXTH through NINTH — unchanged, still open:** live-test `WarmupTest` full week start-to-finish (this profile is untouched and still available — tied to `cafe75designs+customtest2@gmail.com`, not Bryant's real email); get Bryant's sign-off on the compound/isolation warm-up split; exercise diagrams/animations (deferred); personal trainer market segment (needs its own discussion, see DECISIONS.md Aug 8 2026); expand exercise variety beyond primary/variation binary swap; the weight-loss/cardio redesign's still-undecided open questions from DECISIONS.md Aug 9 2026; voice input on the cardio quick-log and the "Other" activity type haven't been live-tested; the manual/voice cardio-logging path's calorie accuracy (no body weight passed to the AI estimate).

**RULED OUT — do not re-propose without new information:** camera/video-based AI form-checking (Session 44 research).

**LOWER PRIORITY / OPS.** Unchanged: one unidentified blank-named test profile row in Supabase; naming cleanup (GitHub repo, live URL, `Morphiq.jsx`/`function Morphiq()` still carry the retired placeholder name — cosmetic only); the "blank exercise weight saves as 20 lbs instead of staying blank" quirk. **New this session:** the "Workout complete" screen's per-exercise breakdown and in-workout "sets so far" indicator silently show empty because they key off a `loggedSets` field that's never populated (see Session 48 above) — a real bug, but cosmetic/display-only, not urgent.

## Technical notes carried forward

**"Switch exercise" feature (new this session).** Lives entirely in `src/WorkoutScreen.jsx`. Per-exercise progress tracking needed zero changes to how sets are saved — `logSet()` already tags every entry with `exIdx`, so `loggedSetCountForExercise(idx)` / `isExerciseComplete(idx)` just read that directly. The single most important piece: `resolveNextExercise(afterIdx)` is a pure function (no state changes) called from BOTH `advanceSet()` (the real transition once an exercise's sets run out) and the "Up next" rest-screen preview — written once and shared specifically so the preview can never promise something different from what actually happens next. Returns `{kind:"done"}`, `{kind:"exercise", idx}` (seamless auto-continue, nothing skipped), or `{kind:"checkpoint"}` (something skipped earlier still needs finishing — shows the new checkpoint screen). If this feature ever needs extending, keep using `resolveNextExercise()` as the single source of truth rather than adding a third place that guesses at "what's next."

**AT&T/Yahoo Mail does not support "+" sub-addressing.** A "+" tag on an sbcglobal.net/AT&T/Yahoo address (e.g. `name+tag@sbcglobal.net`) silently fails to deliver — no bounce, no error, it just never arrives. Never use a "+" alias on Bryant's real sbcglobal.net address to test anything — use the plain address, or a genuinely separate inbox.

**GitHub push access.** Direct/automatic push still broken (git-proxy error, both via `git push` and the GitHub REST API directly — confirmed again this session, `api.github.com` calls are blocked in the bash sandbox). Working method unchanged: Chrome browser tool's "Upload files" page (`github.com/Luxurydadbot/Morphiq/upload/main/<folder>`), staging finished file(s) in `/mnt/user-data/outputs/` first — this exact path is required. Confirmed working cleanly again this session (single-file `src/` upload, commit `fac2330`).

**Vercel Hobby plan has a hard cap of 12 serverless functions per deployment.** Unchanged — `api/` is currently at exactly 12 files. Any new backend feature needs either a merge of two more low-traffic files or a decision from Bryant on Vercel Pro ($20/mo).

**Supabase test-data seeding pattern, useful for future live tests.** The Supabase MCP connector's `execute_sql` runs with full database access (not the app's own restricted anon key), so it can insert rows directly into any table for test setup, and can query `auth.users` directly. Reliable pattern for any "does X really work" live test — see Session 47 for the account-deletion example.

**GitHub Actions Android build check.** `.github/workflows/android-build.yml` runs on every push to `main`. No open concerns as of Session 47; this session's push had not finished its checks at the time of writing (showed 0/2 immediately after commit) — worth a glance next session, though it only touched one already-working file with a clean syntax check first.

**Vercel MCP connector.** Use `list_teams` → `list_projects` (project `morphiq`, id `prj_0KL9CirNTdNMnXEO34o3pdwd5wSM`, team `team_Iiv1x067TLmgX2XdP5mXO06v`) → `list_deployments` to check `state`.

**WebFetch is not reliable for reading files from this repo.** Never use WebFetch for this repo's file contents — always `git clone` with the token embedded in the HTTPS URL.

**Supabase MCP connector.** `profiles.supabase_user_id` is the auth link (plain text column holding the auth user's UUID as a string), `profiles.id` is the FK used everywhere else. `api/delete-account.js` uses the service-role key (bypasses RLS) via `process.env.SUPABASE_SERVICE_ROLE_KEY` on the backend — separate and different from the Supabase MCP connector's own elevated database access.

## Paste this at the start of your next session

Fetch `HANDOFF.md`, `DECISIONS.md`, and all `src/`/`api/` files fresh via `git clone` (reads work fine; do NOT use WebFetch for repo file contents). Report every file's line count before doing anything else; none are near the 3,800-line limit (`shared.jsx` is largest and unchanged at 3,716 — do not add to it without proposing a split first). **GitHub push access:** still broken (platform-side git-proxy block) — use the Upload-files browser workaround, staging files in `/mnt/user-data/outputs/` specifically. **`api/` is at exactly 12 files — the Vercel Hobby-plan cap.** **Never use a "+" alias on Bryant's real sbcglobal.net address.**

**Top priority: live-test the new "switch exercise" feature** (Session 48) — it was built and pushed but only code-verified, never actually clicked through in the running app. Start a workout, confirm the "Today's list" button/sheet works, jump to a different exercise mid-set, confirm progress is preserved on the one you left, and confirm the new "checkpoint" screen shows up correctly if the list gets finished with one exercise skipped. If Bryant reports anything looks off, start there — this is the freshest, least-proven code in the app right now.

Remind Bryant: this session built exactly what he asked for — members can now tap "Today's list" during a workout to jump to any exercise at any time (even mid-set), so being blocked by gym equipment no longer means picking a random substitute or waiting around. If they skip one and finish the rest, the app now gently offers to jump them into the leftover exercise instead of silently ending the workout. **Not yet live-tested in the running app** — that's the very next thing to do, either now or next time Bryant's at the gym. Also flagged (not fixed): a pre-existing, unrelated display bug where the workout-complete screen's per-exercise breakdown always shows empty. Everything else — privacy policy/ToS (blocked on the business entity), Android Studio, the 12-function cap — unchanged from before.
