# Hypergentiq — Session 52 master handoff

This file is the handoff. At the start of every session, fetch this file from the repo along with the src/ and api/ files — it replaces pasting a handoff into chat by hand. **MANDATORY fetch method — git clone only, see Technical notes below.**

## STANDING GOAL — App Store + Google Play submission roadmap (carry forward every session, do not delete until fully checked off)

Unchanged this session — this session's work (below) was member-facing feature work, not app-store-roadmap work. Step list: (1) fix PWA gaps — done, Session 30, (2) add Capacitor + generate native projects — done (Session 25), still never opened in Android Studio/Xcode by a human, (3) set up Capgo live-update pipeline — still open, (4) Android path (Bryant needs a Google Play Console account, $25), (5) iOS path (needs a Mac on macOS Sequoia 15.6+ for Xcode 26, or a cloud Mac build service), (6) privacy policy — hard gate for both stores, still blocked on Bryant forming a real legal business entity before it can be finalized and sent to a lawyer, (7) terms of service — same status as privacy policy, (8) account deletion — built Session 46, live-verified working Session 47, (9) store listing assets (icon done, need screenshots + descriptions), (10) confirm no Apple IAP conflict, (11) submit.

## Session 52 — per-exercise recap card (built and pushed, NOT yet live-tested)

The third and last feature from the original Session 49 design batch. Bryant's brief this time, given live in chat rather than as a pre-made mockup: treat it like a "coach's report card" — capture wins/losses, a short positive suggestion, don't make it a lot of reading, and don't auto-dismiss it (needs a real close/continue button).

**Design decisions made this session, confirmed with Bryant before building:**
- **Shows per-exercise, not once at the end of the whole workout.** Right when the last set of an exercise is logged, before moving on to whatever's next — confirmed directly ("I think it should be at the end of each exercise... at the end of benching, the card should show up").
- **One comparison, not a stat dump.** Total weight moved today (sets × reps × weight, standard "volume") vs. the same total from the last time that exercise was logged, plus a personal-record badge if today beat an all-time best on this exercise. Kept to one number + one line, per Bryant's "don't want a ton of reading."
- **Tone matches the app's existing no-guilt-language rule** (already a standing design rule, not a new one): a lighter day than last time is framed gently and forward-looking ("that happens, recovery is part of the process"), never as a failure. A heavier day gets genuine positive reinforcement. First time ever logging an exercise gets a "that's your new baseline" framing instead of a comparison that doesn't exist yet.
- **No auto-dismiss.** A real "Continue" button, stays on screen until tapped — exactly as Bryant asked.

**What was built, in one commit (`7ac9a25`):**
- A new card, shown as its own screen (same pattern as the existing "checkpoint" screen), that appears the instant an exercise's last set is logged. Shows the exercise name, a PR badge if one was hit today, the total weight moved today, a comparison to last time (or "no earlier session yet" the first time), and one short encouraging line — then a "Continue" button that moves on to whatever would have happened next (the next exercise, the exercise-picker checkpoint, or the workout-complete screen — unchanged from before, just delayed until the card is dismissed).
- Respects the per-exercise kg/lbs unit choice from Session 51 — the recap shows in whichever unit that exercise is currently set to, same as the weight card itself, so the numbers never contradict what was just seen set-by-set.
- The personal-record badge costs zero extra database calls — it reuses the exact same check the app already runs after every set to decide whether to show the small in-set "PR" tag, just remembered across the whole exercise instead of reset every set.
- One new small database read was added (no new tables or columns — this only reads existing `workout_logs` rows): `sb.getLastSessionSetsForExercise()`, which fetches the most recent prior session's sets for one exercise so today's totals have something to compare against.

**Files touched, final line counts:** `src/WorkoutScreen.jsx` 3,200 → **3,336** (+136 — the recap card screen, the comparison math, and the small state additions that hook it into the existing "what happens after this exercise" logic, all new code, nothing else in the file touched), `src/shared.jsx` 3,749 → **3,774** (+25 — the one new read-only `getLastSessionSetsForExercise()` function).

**🚨 `shared.jsx` is now at 3,774 / 3,800 hard limit — only ~26 lines of headroom left, full stop.** The very next thing that needs even a small new shared helper should NOT go into `shared.jsx` — it needs to either land in whichever screen file actually uses it, or Bryant needs to decide how to split `shared.jsx` into smaller files first. This is no longer a "worth watching" heads-up — it is functionally full.

**Verified before pushing:** `esbuild` clean parse on both changed files, the new `getLastSessionSetsForExercise` try/catch opens and closes correctly, the full recap screen and the `advanceSet()`/`dismissRecap()` logic were read back after editing to confirm they render and transition correctly, line-count deltas above are intentional (not accidental deletions). Traced through the one subtle timing risk (whether the just-logged final set is actually in `loggedSets` by the time the recap reads it) against how the existing rest-timer/checkpoint code already handles the same timing — confirmed safe by the same pattern, not a new risk. **NOT yet live-tested by Bryant on a real phone or in the running app** — first thing to check next session.

## Session 51 — manual weight entry + per-exercise kg/lbs unit memory (built, pushed, and live-tested — confirmed working)

Bryant approved building the two features Session 49 had designed but not built, in this order: (1) the Workouts-tab chart redesign (turned out to actually be the more recent, correct "last session" — see Session 50 below, which hadn't made it into this file yet), (2) manual weight entry + kg/lbs, (3) a per-exercise recap card (still not started). This session built #2.

**What was built, all in one commit (`0581df5`):**
- **Tap-to-type weight entry.** The big weight number on the "Weight this set" card is now tappable — tapping it swaps it for a real number input (native number keyboard on a phone), styled to match the display state (same size/weight/color, dotted underline). Releasing focus (tap away, or press Enter) commits the typed value. A small caption under the number ("Tap the number to type a weight") hints that it's tappable.
- **Per-exercise kg/lbs switch.** A small LBS/KG pill switch sits right on the same card. Each exercise remembers its own last-used unit independently (confirmed with Bryant back in Session 49: real gyms mix units exercise-to-exercise, sometimes set-to-set) — switching units on Bench press doesn't affect Bicep curl. A brand-new exercise with no remembered unit yet falls back to the member's profile-level default.
- **Storage stays pounds, always.** No change to how weight is stored or logged — the database still only ever holds whole-pound numbers (Bryant's own decision, Session 49). kg is purely a display/typing convenience layered on top: typing or stepping in kg mode converts to the nearest whole pound before it's saved. Switching a set's unit mid-workout never changes the actual logged number, only how it's shown.
- **kg-mode stepper.** The +/- buttons step by a clean 2.5 kg in kg mode (Bryant's choice this session) instead of converting the existing 5 lb step into an odd kg number.
- **Plate-math hidden in kg mode.** The existing barbell plate-math helper (tells a member which plates to load) assumes US 45/25/10/5/2.5 lb plates — converting the stored lb number back to kg and running the same math would recommend plates that don't exist on a metric bar. Rather than build a second, kg-specific plate-math feature, Bryant approved simply hiding the helper when an exercise is in kg mode (lbs mode is unaffected).

**Database change made this session (confirmed with Bryant before writing any code):** checked the live schema first, per the app's own database rules. Found `profiles.unit` already existed (text, default `'imperial'`) but nothing in the app actually read or wrote it — it was hardcoded to `"imperial"` in a few places instead, so it wasn't really wired up yet. Now wired up for real, as the profile-level fallback default. Nothing anywhere tracked a per-exercise remembered unit, so one new column was added: `profiles.exercise_units` (jsonb, default `{}`) — a small map like `{"Barbell squat": "kg"}`, one entry per exercise the member has switched. No existing column, table, or data was touched or removed.

**Files touched, final line counts:** `src/WorkoutScreen.jsx` 3,078 → **3,200** (+122 across two commits — the tap-to-type input, the unit switch, the stepper/rounding logic, and the caption-text fix below, all inline in the existing "Weight this set" card, nothing else in the file touched), `src/shared.jsx` 3,730 → **3,749** (+19 — one new small `sb.saveExerciseUnits()` function, mirrors the existing `sb.updateLastWorkoutDayIndex()` pattern exactly), `src/Morphiq.jsx` 1,755 → **1,755** (net 0 — two single-line edits, carrying the profile's real `unit` and new `exercise_units` value into the app's user object instead of hardcoding `"imperial"`).

**⚠️ `shared.jsx` headroom is getting tight: 3,749 / 3,800 hard limit — only ~51 lines left.** The next feature that needs a new shared helper should go straight to `WorkoutScreen.jsx` (or wherever it's actually used) instead, or Bryant should be asked about a split, before `shared.jsx` gets anywhere near the hard limit.

**Verified before pushing:** `esbuild` clean parse on all changed files each time, the new `saveExerciseUnits` try/catch opens and closes correctly, the full "Weight this set" card was read back after each edit to confirm it renders correctly, line-count deltas above are all intentional (not accidental deletions).

**Live-tested by Bryant the same session — confirmed working, with one bug caught and fixed on the spot:** the small caption lines under the weight number ("Still ramping to X lbs", "+5 lbs from plan", "Warm-up weight · ramping to X lbs") were still always saying "lbs" even in kg mode — they describe the plan's own lb-based target, which hadn't been converted for display. Fixed in a same-session follow-up commit (`b9dec5c`): two new small helper functions, `formatWeightValue()` and `formatWeightDelta()`, convert these captions to the active unit the same way the main number already did. Everything else about the feature (tap-to-type, the unit switch and its memory, the kg stepper, plate-math hidden in kg mode) was confirmed working as designed on Bryant's first live pass — no other issues reported.

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

`7ac9a25` — "Feature: per-exercise recap card comparing today to last time" (`src/WorkoutScreen.jsx`, `src/shared.jsx`). Pushed via the GitHub web-upload workaround (direct git/API push is still blocked this session too).

## Confirmed working vs still open

**Built and pushed this session — NOT yet live-tested in the real running app:**
- The per-exercise recap card. See Session 52 write-up above.

**Built, pushed, AND live-tested/confirmed working:**
- Manual weight entry (tap-to-type) + per-exercise kg/lbs switch with memory, kg-mode stepper, kg-mode plate-math hidden, all caption text now unit-aware too (Session 51). Bryant tested live, caught one caption-text bug, fixed same session.
- Workouts-tab Weight/Reps trend charts with PR stars, real horizontal scroll, and the tap-and-hold value tooltip (Session 50, recorded late — see above). Bryant confirmed on a real device: "Works perfect."

**Confirmed live in prior sessions — unchanged, still true:** the "switch exercise" feature and its checkpoint screen (Session 48), the exercise-breakdown/"This exercise" display fix (Session 48), `api/delete-account.js` and the Danger Zone flow (Session 47), the post-onboarding "Plan ready" screen (Session 47), the weekly detection engine tested against production with synthetic data but not yet a real member's multi-week history (Session 47).

**NOT yet verified / still open:**
- This session's per-exercise recap card (Session 52 — brand new, needs a real-device pass).
- Session 49's nav bar / chat button fix — still carried forward, still nobody has live-tested it.
- The cardio timer real-phone lock-screen test.
- Everything else on the punch list below.

## Punch list, in priority order

**FIRST — live-test this session's per-exercise recap card on a real device.** Finish all the sets of an exercise and confirm the card actually appears before moving to the next exercise (or the checkpoint screen, or the done screen, whichever applies). Confirm the total-weight-today number and the "vs last time" comparison look right, that a genuine PR shows the badge, that the very first time logging a brand-new exercise shows the "new baseline" wording instead of a broken comparison, and that the card only goes away when you actually tap Continue — never on its own.

**SECOND — also still needs a live scroll-through: Session 49's nav bar/chat button fix.** Quick: open the app, scroll down on any screen with enough content, confirm both stay put. This has now been carried forward four sessions in a row without ever actually being clicked through live — worth doing this even briefly before anything else piles on top of it.

**THIRD — unblock the privacy policy and terms of service.** Both drafts exist now. Both are still blocked on Bryant forming a real legal business entity, after which both documents need to go to an actual lawyer together.

**FOURTH — App Store groundwork, next concrete step: open the Android project in real Android Studio at least once.** The GitHub Actions check proves the app compiles and is currently passing, but nobody has run it on a device or emulator yet. Capgo live-update pipeline still not started.

**FIFTH — cardio timer real-phone test.** Session 40's wall-clock fix still hasn't been live-tapped by Bryant with the screen genuinely locking.

**SIXTH — wearable sync (Apple HealthKit/Fitbit).** Unchanged, still not scoped.

**SEVENTH through TENTH — unchanged, still open:** live-test `WarmupTest` full week start-to-finish (tied to `cafe75designs+customtest2@gmail.com`, not Bryant's real email); get Bryant's sign-off on the compound/isolation warm-up split; exercise diagrams/animations (deferred); personal trainer market segment (needs its own discussion, see DECISIONS.md); expand exercise variety beyond primary/variation binary swap; the weight-loss/cardio redesign's still-undecided open questions from DECISIONS.md; voice input on the cardio quick-log and the "Other" activity type haven't been live-tested; the manual/voice cardio-logging path's calorie accuracy (no body weight passed to the AI estimate).

**RULED OUT — do not re-propose without new information:** camera/video-based AI form-checking (Session 44 research).

**LOWER PRIORITY / OPS.** Unchanged: one unidentified blank-named test profile row in Supabase; naming cleanup (GitHub repo, live URL, `Morphiq.jsx`/`function Morphiq()` still carry the retired placeholder name — cosmetic only); the "blank exercise weight saves as 20 lbs instead of staying blank" quirk.

## Technical notes carried forward

**🚨 `shared.jsx` is essentially full: 3,774 / 3,800 hard limit, ~26 lines left.** Do not add anything new to `shared.jsx` next session without either (a) confirming it truly must be shared across multiple screen files and there's no room any other way, or (b) proposing a split to Bryant first, per the app's own file-size rules. A single new helper function with a comment could tip this over the hard limit.

**`loggedSets` (state) vs. `loggedSetsRef.current` (ref) — when each is safe to read.** `WorkoutScreen.jsx` keeps both in sync on every logged set. Code that runs in the SAME synchronous tick as `logSet()` (e.g. `goToRestOrNudge()`, called directly from inside `logSet()`) must read `loggedSetsRef.current`, not the `loggedSets` state — the state update from that same `logSet()` call hasn't been committed to a fresh render yet, so the state closure would still show the OLD list missing the set just logged. Code that only runs later, after at least one more render has happened (rest-timer countdown reaching zero, a button click, `advanceSet()`) can safely read the `loggedSets` state directly, since by then it reflects the latest commit. Session 52's recap card reads the state (not the ref) inside `advanceSet()`, deliberately, after confirming `advanceSet()` is only ever called this "later" way — worth remembering next time something new needs to read what was "just logged."

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

Fetch `HANDOFF.md`, `DECISIONS.md`, and all `src/`/`api/` files fresh via `git clone` (reads work fine even without a working token, since the repo is public; do NOT use WebFetch for repo file contents). Report every file's line count before doing anything else. **`shared.jsx` is now at 3,774 / 3,800 — only ~26 lines of headroom left. Do not add anything new to it without proposing a split to Bryant first — it is essentially full.** **GitHub push access:** still broken (platform-side git-proxy block) — use the Upload-files browser workaround, staging file(s) at `/mnt/user-data/uploads/` specifically (not `/outputs/`). **`api/` is at exactly 12 counted functions — the Vercel Hobby-plan cap.** **Never use a "+" alias on Bryant's real sbcglobal.net address.**

**This session (Session 52) built and pushed the per-exercise recap card** — the third and last feature from the original Session 49 design batch. Shows right when an exercise's sets finish (not at the end of the whole workout — Bryant confirmed this explicitly), comparing today's total weight moved on that exercise to the last time it was logged, with a PR badge when earned, one short encouraging line (never guilt language, matching house rules), and a real "Continue" button — no auto-dismiss. Respects each exercise's kg/lbs unit choice from Session 51. **NOT yet live-tested — this is the first thing to check next session.**

**Also confirmed working and fully done, no action needed:** manual weight entry + per-exercise kg/lbs (Session 51, live-tested and one bug already fixed), and the Workouts-tab trend charts + tap-and-hold tooltip (Session 50, live-tested, "Works perfect").

Next priority: live-test this session's recap card (first thing), then the long-overdue nav-bar scroll-through from Session 49 (still not done, four sessions running). After that, everything designed from the original Session 49 batch is built — next real feature work needs a fresh conversation with Bryant about what's next.

Remind Bryant: the per-exercise recap card is live but untested on a real device — worth finishing an exercise and checking it before considering it done. Also: `shared.jsx` has almost no room left, so the next new feature that needs shared logic may need a file-split conversation first.
