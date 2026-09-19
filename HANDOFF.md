# Hypergentiq — Session 51 master handoff

This file is the handoff. At the start of every session, fetch this file from the repo along with the src/ and api/ files — it replaces pasting a handoff into chat by hand. **MANDATORY fetch method — git clone only, see Technical notes below.**

## STANDING GOAL — App Store + Google Play submission roadmap (carry forward every session, do not delete until fully checked off)

Unchanged this session — this session's work (below) was member-facing feature work, not app-store-roadmap work. Step list: (1) fix PWA gaps — done, Session 30, (2) add Capacitor + generate native projects — done (Session 25), still never opened in Android Studio/Xcode by a human, (3) set up Capgo live-update pipeline — still open, (4) Android path (Bryant needs a Google Play Console account, $25), (5) iOS path (needs a Mac on macOS Sequoia 15.6+ for Xcode 26, or a cloud Mac build service), (6) privacy policy — hard gate for both stores, still blocked on Bryant forming a real legal business entity before it can be finalized and sent to a lawyer, (7) terms of service — same status as privacy policy, (8) account deletion — built Session 46, live-verified working Session 47, (9) store listing assets (icon done, need screenshots + descriptions), (10) confirm no Apple IAP conflict, (11) submit.

## Session 51 — manual weight entry + per-exercise kg/lbs unit memory (built and pushed, NOT yet live-tested)

Bryant approved building the two features Session 49 had designed but not built, in this order: (1) the Workouts-tab chart redesign (turned out to actually be the more recent, correct "last session" — see Session 50 below, which hadn't made it into this file yet), (2) manual weight entry + kg/lbs, (3) a per-exercise recap card (still not started). This session built #2.

**What was built, all in one commit (`0581df5`):**
- **Tap-to-type weight entry.** The big weight number on the "Weight this set" card is now tappable — tapping it swaps it for a real number input (native number keyboard on a phone), styled to match the display state (same size/weight/color, dotted underline). Releasing focus (tap away, or press Enter) commits the typed value. A small caption under the number ("Tap the number to type a weight") hints that it's tappable.
- **Per-exercise kg/lbs switch.** A small LBS/KG pill switch sits right on the same card. Each exercise remembers its own last-used unit independently (confirmed with Bryant back in Session 49: real gyms mix units exercise-to-exercise, sometimes set-to-set) — switching units on Bench press doesn't affect Bicep curl. A brand-new exercise with no remembered unit yet falls back to the member's profile-level default.
- **Storage stays pounds, always.** No change to how weight is stored or logged — the database still only ever holds whole-pound numbers (Bryant's own decision, Session 49). kg is purely a display/typing convenience layered on top: typing or stepping in kg mode converts to the nearest whole pound before it's saved. Switching a set's unit mid-workout never changes the actual logged number, only how it's shown.
- **kg-mode stepper.** The +/- buttons step by a clean 2.5 kg in kg mode (Bryant's choice this session) instead of converting the existing 5 lb step into an odd kg number.
- **Plate-math hidden in kg mode.** The existing barbell plate-math helper (tells a member which plates to load) assumes US 45/25/10/5/2.5 lb plates — converting the stored lb number back to kg and running the same math would recommend plates that don't exist on a metric bar. Rather than build a second, kg-specific plate-math feature, Bryant approved simply hiding the helper when an exercise is in kg mode (lbs mode is unaffected).

**Database change made this session (confirmed with Bryant before writing any code):** checked the live schema first, per the app's own database rules. Found `profiles.unit` already existed (text, default `'imperial'`) but nothing in the app actually read or wrote it — it was hardcoded to `"imperial"` in a few places instead, so it wasn't really wired up yet. Now wired up for real, as the profile-level fallback default. Nothing anywhere tracked a per-exercise remembered unit, so one new column was added: `profiles.exercise_units` (jsonb, default `{}`) — a small map like `{"Barbell squat": "kg"}`, one entry per exercise the member has switched. No existing column, table, or data was touched or removed.

**Files touched, final line counts:** `src/WorkoutScreen.jsx` 3,078 → **3,183** (+105 — the tap-to-type input, the unit switch, the stepper/rounding logic, all inline in the existing "Weight this set" card, nothing else in the file touched), `src/shared.jsx` 3,730 → **3,749** (+19 — one new small `sb.saveExerciseUnits()` function, mirrors the existing `sb.updateLastWorkoutDayIndex()` pattern exactly), `src/Morphiq.jsx` 1,755 → **1,755** (net 0 — two single-line edits, carrying the profile's real `unit` and new `exercise_units` value into the app's user object instead of hardcoding `"imperial"`).

**⚠️ `shared.jsx` headroom is getting tight: 3,749 / 3,800 hard limit — only ~51 lines left.** The next feature that needs a new shared helper should go straight to `WorkoutScreen.jsx` (or wherever it's actually used) instead, or Bryant should be asked about a split, before `shared.jsx` gets anywhere near the hard limit.

**Verified before pushing:** `esbuild` clean parse on all three changed files, the new `saveExerciseUnits` try/catch opens and closes correctly, the full "Weight this set" card was read back after editing to confirm it renders correctly, line-count deltas above are all intentional (not accidental deletions). **NOT yet live-tested by Bryant on a real phone or in the running app** — this is the very first thing to check next session.

**Known limitation, not addressed this session (worth a follow-up polish pass, not a bug):** a few small caption lines under the weight number ("Still ramping to X lbs", "+5 lbs from plan", etc.) always say "lbs" regardless of which unit is active, since those describe the plan's own lb-based target rather than the number the member is looking at. Left alone this session to keep the change tightly scoped to what was actually designed and approved.

## Session 50 — Workouts-tab progress charts + tap-and-hold value tooltip (fully built, pushed, AND live-tested — confirmed working by Bryant)

**This entire session's work was designed via mockup in an earlier session but never got written into this file** — this file still said "Session 49" and had no record of it at all, which is why there was real confusion at the start of this session about which feature was actually "last session's" work. Recording it properly now so this doesn't happen again.

**What was built, across four commits (`d25937c`, `b78ed71`, `c08f035`, `4fb8eee`):**
- Replaced the old "Total volume lifted" tile on the Progress screen's Workouts tab with a real per-exercise history view: pick any exercise via pills, see two scrollable line charts — Weight over time and Reps over time — each with gold star markers on personal-best days (new all-time-high weight, or first time hitting the rep target at a given weight). Below that, a week-streak tile replaced the old volume tile.
- Charts use a real horizontal scroll once there's enough logged data to exceed the screen width (fixed 34px between points, matching the exact mechanism the existing `WeightChart` component already used elsewhere in the app) — below that threshold, points stretch to fill the available width instead. Bryant initially read the stretch behavior as a bug ("no fixed distance between dates"); confirmed via a live Supabase query that it's the same threshold-based behavior the app already used elsewhere, working as designed — "Seated leg curl" simply didn't have enough logged days yet to cross the threshold.
- Added a tap-and-hold tooltip: pressing and holding a point on either chart shows a bubble with the exact date and value; releasing makes it disappear. Went through two rounds of real-device feedback from Bryant and both were fixed: the bubble was enlarged significantly (font size, bubble size, and clearance from the touch point all increased) after his thumb was covering the text, and the bubble now always appears above the touched point (removed the old logic that sometimes flipped it below) after inconsistent placement was confirmed as the harder-to-read version.
- Confirmed by Bryant on a real device: **"Works perfect."**

**Files touched, final line count:** `src/ProgressScreen.jsx` 657 → **1,001** (+344 — all four commits combined; no other file touched).

## Session 49 recap — carried forward, unchanged

Fixed the bottom nav bar and floating chat button so they stay visible while scrolling (both were using `position:"absolute"` instead of `"fixed"` in `Layout()`, `shared.jsx`) — **still not yet live-tested by Bryant**, unchanged from Session 49, carried forward again this session since nothing has confirmed it live yet.

## Session 48 recap — carried forward, unchanged

Built "switch exercise" (jump to any exercise anytime, including mid-set, via a new "Today's list" sheet), a "checkpoint" screen for when an exercise finishes with others still skipped, and fixed a display bug where the exercise-breakdown and in-workout set counts always showed 0. Live-tested end to end in the real running app. See an earlier version of this file (or `git log`) for full detail if needed.

## Session 47 recap — carried forward, unchanged

Live-tested account deletion end-to-end on the real production app, live-verified the post-onboarding "Plan ready" screen's Session 45 color fix, and built the weekly detection engine (weight-trend plateau + nutrition adherence) wired into both `/api/coach-note` and `/api/chat`. See an earlier version of this file (or `git log`) for full detail if needed.

## Latest commit

`0581df5` — "Feature: manual weight entry + per-exercise kg/lbs unit memory" (`src/WorkoutScreen.jsx`, `src/shared.jsx`, `src/Morphiq.jsx`). Pushed via the GitHub web-upload workaround (direct git/API push is still blocked this session too).

## Confirmed working vs still open

**Built and pushed this session — NOT yet live-tested in the real running app:**
- Manual weight entry (tap-to-type) + per-exercise kg/lbs switch with memory, kg-mode stepper, kg-mode plate-math hidden. See Session 51 write-up above.

**Built, pushed, AND live-tested/confirmed working this session (Session 50, recorded late — see above):**
- Workouts-tab Weight/Reps trend charts with PR stars, real horizontal scroll, and the tap-and-hold value tooltip. Bryant confirmed on a real device: "Works perfect."

**Confirmed live in prior sessions — unchanged, still true:** the "switch exercise" feature and its checkpoint screen (Session 48), the exercise-breakdown/"This exercise" display fix (Session 48), `api/delete-account.js` and the Danger Zone flow (Session 47), the post-onboarding "Plan ready" screen (Session 47), the weekly detection engine tested against production with synthetic data but not yet a real member's multi-week history (Session 47).

**NOT yet verified / still open:**
- This session's weight-entry + kg/lbs feature (Session 51 — brand new, needs a real-device pass).
- Session 49's nav bar / chat button fix — still carried forward, still nobody has live-tested it.
- The cardio timer real-phone lock-screen test.
- Everything else on the punch list below.

## Punch list, in priority order

**FIRST — live-test this session's weight-entry + kg/lbs feature on a real device.** Tap the weight number to type a value, confirm it saves correctly. Flip an exercise to kg, confirm the number converts, the +/- stepper moves in clean 2.5 kg steps, and the plate-math line disappears. Flip back to lbs, confirm the plate-math line reappears and the stepper is back to 5 lb steps. Start a workout on a different day and confirm the exercise you switched to kg is still in kg (the memory persisted), while an exercise you never touched is still in lbs.

**SECOND — also still needs a live scroll-through: Session 49's nav bar/chat button fix.** Quick: open the app, scroll down on any screen with enough content, confirm both stay put. This has now been carried forward three sessions in a row without ever actually being clicked through live — worth doing this even briefly before anything else piles on top of it.

**THIRD — build the per-exercise recap card**, the third and last item from the Session 49 design batch: triggers when a member finishes all the sets of ONE exercise (not the whole workout), comparing that exercise's performance today against the last time it was logged. The app already fetches this exact comparison live during a workout (same data that powers the existing "last time: X lbs × Y reps" line), so this is mostly a new short summary card plus a rollup calculation at the point an exercise finishes — not new data plumbing from scratch. Natural hook point: `resolveNextExercise()` in `WorkoutScreen.jsx`, the single source of truth for "what happens after this exercise's sets run out."

**FOURTH — unblock the privacy policy and terms of service.** Both drafts exist now. Both are still blocked on Bryant forming a real legal business entity, after which both documents need to go to an actual lawyer together.

**FIFTH — App Store groundwork, next concrete step: open the Android project in real Android Studio at least once.** The GitHub Actions check proves the app compiles and is currently passing, but nobody has run it on a device or emulator yet. Capgo live-update pipeline still not started.

**SIXTH — cardio timer real-phone test.** Session 40's wall-clock fix still hasn't been live-tapped by Bryant with the screen genuinely locking.

**SEVENTH — wearable sync (Apple HealthKit/Fitbit).** Unchanged, still not scoped.

**EIGHTH through ELEVENTH — unchanged, still open:** live-test `WarmupTest` full week start-to-finish (tied to `cafe75designs+customtest2@gmail.com`, not Bryant's real email); get Bryant's sign-off on the compound/isolation warm-up split; exercise diagrams/animations (deferred); personal trainer market segment (needs its own discussion, see DECISIONS.md); expand exercise variety beyond primary/variation binary swap; the weight-loss/cardio redesign's still-undecided open questions from DECISIONS.md; voice input on the cardio quick-log and the "Other" activity type haven't been live-tested; the manual/voice cardio-logging path's calorie accuracy (no body weight passed to the AI estimate).

**RULED OUT — do not re-propose without new information:** camera/video-based AI form-checking (Session 44 research).

**LOWER PRIORITY / OPS.** Unchanged: one unidentified blank-named test profile row in Supabase; naming cleanup (GitHub repo, live URL, `Morphiq.jsx`/`function Morphiq()` still carry the retired placeholder name — cosmetic only); the "blank exercise weight saves as 20 lbs instead of staying blank" quirk.

## Technical notes carried forward

**Two "last session" handoffs existed at once going into this session — the cause, and the fix.** Session 50 (the chart redesign) was fully designed, built, live-tested, and confirmed working by Bryant, but its handoff only ever got written to a Claude Project doc (`claude/session-notes-2026-09-18-workouts-tab-redesign.md`), never committed here to `HANDOFF.md`. This file still said "Session 49" at the start of this session, so the two sources disagreed about what "last session" even meant. **Going forward: this file is the only source of truth for session handoffs — a Project doc is fine as working notes mid-session, but the end-of-session commit to this file is mandatory every time, no exceptions, even if a project doc already has the same content.**

**GitHub web-upload workaround.** The file(s) being uploaded must be staged at `/mnt/user-data/uploads/<filename>` specifically — `/mnt/user-data/outputs/` gets silently rejected. Multiple files can be uploaded and committed together in one visit to `github.com/Luxurydadbot/Morphiq/upload/main/<folder>` — this session pushed three changed files in a single commit this way.

**AuthScreen location correction (still true, still not fixed at the source).** `AuthScreen` actually lives in `Morphiq.jsx`, not `shared.jsx` — confirmed again this session (zero matches searching `shared.jsx`). The project's own standing pre-push safety-check instructions still say to look for it in `shared.jsx`; this is a documentation bug in the standing instructions themselves, not in the app. Worth Bryant correcting at the source next time he's updating project instructions.

**"Switch exercise" feature (Session 48, live-verified).** Lives entirely in `src/WorkoutScreen.jsx`. `resolveNextExercise()` is the single source of truth for "what happens after this exercise's sets run out" — keep using it rather than adding a second place that guesses at "what's next," including for the per-exercise recap card (next priority, see punch list).

**AT&T/Yahoo Mail does not support "+" sub-addressing.** Never use a "+" alias on Bryant's real sbcglobal.net address to test anything — use the plain address, or a genuinely separate inbox.

**GitHub push access.** Direct/automatic push still broken (git-proxy error, confirmed again this session). Working method unchanged: Chrome browser tool's "Upload files" page, staging the finished file(s) in `/mnt/user-data/uploads/` first.

**Vercel Hobby plan has a hard cap of 12 serverless functions per deployment.** Unchanged — `api/` is currently at exactly 12 counted functions (plus the `_sentry.js` helper, which doesn't count since it's underscore-prefixed).

**Supabase test-data seeding pattern, useful for future live tests.** The Supabase MCP connector's `execute_sql`/`apply_migration` run with full database access (not the app's own restricted anon key), so they can insert rows or alter schema directly for test setup, and can query `auth.users` directly.

**GitHub Actions Android build check.** `.github/workflows/android-build.yml` runs on every push to `main`. No open concerns.

**WebFetch is not reliable for reading files from this repo.** Never use WebFetch for this repo's file contents — always `git clone` with the token embedded in the HTTPS URL. (Reads via plain `git clone` work even without a valid token, since the repo is public — it's only writes/pushes that are blocked for this session.)

**Supabase MCP connector.** `profiles.supabase_user_id` is the auth link (plain text column holding the auth user's UUID as a string), `profiles.id` is the FK used everywhere else. Never use a narrow `select=id`-only query against `profiles` — it gets rejected by RLS even when the exact same row succeeds with no `select=` at all (confirmed, see `sb.getProfileId()`'s own comment in `shared.jsx`). `api/delete-account.js` uses the service-role key (bypasses RLS), separate from the Supabase MCP connector's own elevated database access.

**Weight is always stored in pounds, database-wide, on principle (Session 49 decision, now actually built on in Session 51).** Any future feature touching weight numbers should keep converting at the display/input edge, never change what's stored.

## Paste this at the start of your next session

Fetch `HANDOFF.md`, `DECISIONS.md`, and all `src/`/`api/` files fresh via `git clone` (reads work fine even without a working token, since the repo is public; do NOT use WebFetch for repo file contents). Report every file's line count before doing anything else. **`shared.jsx` is now at 3,749 / 3,800 — only ~51 lines of headroom left; the next new shared helper should probably land in whichever screen file actually uses it instead, or ask Bryant about a split.** **GitHub push access:** still broken (platform-side git-proxy block) — use the Upload-files browser workaround, staging file(s) at `/mnt/user-data/uploads/` specifically (not `/outputs/`). **`api/` is at exactly 12 counted functions — the Vercel Hobby-plan cap.** **Never use a "+" alias on Bryant's real sbcglobal.net address.**

**This session (Session 51) built and pushed one feature, not yet live-tested:** manual weight entry (tap the number to type it) plus a per-exercise LBS/KG switch that remembers each exercise's own last-used unit, a 2.5 kg stepper step in kg mode, and the plate-math helper hidden in kg mode. Storage never changed — every weight is still saved in pounds. One new database column was added: `profiles.exercise_units` (jsonb), plus the pre-existing but previously-unused `profiles.unit` column is now actually wired up as the profile-level default.

**Also newly recorded this session, but was actually built and live-tested last session (Session 50) — was missing from this file before now:** the Workouts-tab Weight/Reps trend charts with PR stars and the tap-and-hold value tooltip. Bryant confirmed on a real device: "Works perfect." Fully done, nothing further needed here.

Next priority: live-test Session 51's weight-entry + kg/lbs feature (first thing), then the long-overdue nav-bar scroll-through from Session 49, then build the third and last Session-49-designed feature — the per-exercise recap card. Full spec is above under Session 49 recap history and the punch list.

Remind Bryant: the weight-entry + kg/lbs feature is live but untested on a real device — worth checking the tap-to-type, the unit switch memory, and the kg stepper before considering it done. Also gently flag that the nav bar/chat button fix from two sessions ago (Session 49) still hasn't had its live scroll-through either.
