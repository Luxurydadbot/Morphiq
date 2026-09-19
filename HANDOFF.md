# Hypergentiq — Session 52 master handoff (v2)

This file is the handoff. At the start of every session, fetch this file from the repo along with the src/ and api/ files — it replaces pasting a handoff into chat by hand. **MANDATORY fetch method — git clone only, see Technical notes below.**

## STANDING GOAL — App Store + Google Play submission roadmap (carry forward every session, do not delete until fully checked off)

Unchanged this session — this session's work (below) was member-facing feature work, not app-store-roadmap work. Step list: (1) fix PWA gaps — done, Session 30, (2) add Capacitor + generate native projects — done (Session 25), still never opened in Android Studio/Xcode by a human, (3) set up Capgo live-update pipeline — still open, (4) Android path (Bryant needs a Google Play Console account, $25), (5) iOS path (needs a Mac on macOS Sequoia 15.6+ for Xcode 26, or a cloud Mac build service), (6) privacy policy — hard gate for both stores, still blocked on Bryant forming a real legal business entity before it can be finalized and sent to a lawyer, (7) terms of service — same status as privacy policy, (8) account deletion — built Session 46, live-verified working Session 47, (9) store listing assets (icon done, need screenshots + descriptions), (10) confirm no Apple IAP conflict, (11) submit.

## Session 52 v2 — per-exercise recap card redesigned + mid-week weight sync fix (built and pushed, NOT yet live-tested)

Bryant saw the first version of the recap card (commit `7ac9a25`, described below under "Session 52 v1") and asked for real changes before calling it done. This session rebuilt it based on that feedback, using the established mockup-first workflow (a standalone HTML preview, `recap-card-preview.html`, iterated three times with Bryant's sign-off before any real code was touched), plus a second, related fix Bryant asked for in the same conversation.

**Feedback that drove this rebuild:**
- The aggregate-only total wasn't enough — Bryant asked to see the actual per-set breakdown, today vs. last time, set by set.
- The icon at the top ("I don't know what the battery icon is for") was the clipboard icon — confusing at small size. This existed in the real app too, not just the mockup.
- The single encouragement line ("Nice increase — keep that momentum going") had "really no value." Bryant asked for tips with the quality "a real trainer that is certified, that is a top 1% trainer might give."
- Bryant asked the app to watch for **plateauing** across recent sessions on an exercise and say something when it notices one.
- Bryant asked for a one-sentence explainer of what "total volume" means, since the number is shown without context.
- **Hard requirement on the tips:** rule-based (not AI-generated, for cost/speed) is fine, but **"as long as it doesn't feel like you're getting the same message over and over again — that will be very discouraging and impersonal."**
- Separately, Bryant flagged a real behavior gap: if he manually drops a weight mid-week (his example: 85 → 75 lbs), the next time he opens the app it should suggest starting at 75, not silently reverting to 85 — unless he's actually earned an increase back up. Confirmed the weekly `progressPlan()` engine already handles this correctly **at the week boundary**; the real gap was the days in between.

**What was built, in one commit (`6d76ff6`):**
- **Fixed the icon.** The clipboard icon at the top of the card is now a circular checkmark badge (built from the existing `Icon` component's "check" icon inside a colored circle) — unambiguous at a glance.
- **Real per-set breakdown table.** Today's sets vs. last time's sets, matched set-by-set (set 1 vs. set 1, etc.), each row showing today's weight × reps, last time's weight × reps, and the delta — reusing the existing `formatWeightValue()`/`formatWeightDelta()` helpers so it respects kg/lbs the same way the rest of the app does.
- **Volume explainer.** A one-line sentence ("Total volume = weight × reps, added up across today's sets") directly under the total, addressing Bryant's mid-turn request.
- **Plateau detection.** Looks at the exercise's recent session history (reusing `sb.getExerciseHistory()`, already built for the progress chart — no new Supabase call) and flags a plateau only when today's top weight matches the 3 confirmed prior sessions before it (4 flat sessions total). Gets its own amber "Holding steady a few sessions" badge, visually distinct from the blue PR badge. Deliberately conservative on the data-race side: today's own set-save is fire-and-forget, so the most recent history row can't be trusted to reliably include today's session yet — the check always drops that row and compares today's already-known-locally weight against the 3 sessions before it, rather than trusting a possibly-incomplete "today" entry from the database.
- **Trainer-voice tip bank, not one canned line.** A `TIP_BANK` with 2-4 distinct phrasings per situation (new PR, weight up, flat/steady, mixed sets, weight down, plateau, first time on this exercise) — real coaching value (e.g. the plateau tip suggests backing off ~10% for a session, not just noting the plateau), always forward-looking, no guilt language on a lighter day (the app's own design rule).
- **Anti-repetition, without literal randomness.** Bryant's hard requirement — the tip variant shown is picked by hashing the exercise name + today's date, not randomly. Same exercise, same day → same tip (stable if the card is somehow seen twice the same day); different day → very likely a different variant. No coin-flip risk of showing the exact same line back-to-back, and no AI call needed.
- **Mid-week weight sync (the second, related fix).** A new `syncMidWeekWeights()` function in `Morphiq.jsx`, called every time the app checks plan progression but the week boundary hasn't hit yet (previously that check did nothing at all in between weeks). It only ever pulls a stored exercise's weight **down** to match the most recently logged actual weight — never up. Raising the weight is still exclusively `progressPlan()`'s job (the 2-for-2 rule), so this can never hand out an unearned increase; it only fixes the "silently reverts to the higher number" problem Bryant described. Reuses `sb.getExerciseHistory()` again — zero new Supabase code, which mattered given `shared.jsx`'s near-zero headroom (see below).

**Files touched, final line counts:** `src/WorkoutScreen.jsx` 3,336 → **3,493** (+157 — the rebuilt recap card: per-set table, plateau detection, TIP_BANK + deterministic picker, icon fix, volume explainer), `src/Morphiq.jsx` 1,755 → **1,828** (+73 — `syncMidWeekWeights()` and the one-line change to `checkAndGenerateNextWeek()` that calls it, plus adding the already-exported `buildSetDetails` to the import list). **`src/shared.jsx` untouched this session — still 3,774 / 3,800.** Both new pieces of work were deliberately designed to reuse existing `sb` functions (`getExerciseHistory`, `getLastSessionSetsForExercise`, `upsertProfile`) rather than add anything new there, specifically because of the near-full hard limit.

**Verified before pushing:** `esbuild` clean parse on both changed files, both new try/catch blocks (`syncMidWeekWeights`, and the reshaped `checkAndGenerateNextWeek`) read back and confirmed opening/closing correctly, the full recap render block and `advanceSet()`/`dismissRecap()` logic read back after editing, line-count deltas above are intentional (not accidental deletions), `function WorkoutScreen()` and `export default function Morphiq()` both confirmed still present after edits. **NOT yet live-tested by Bryant on a real phone or in the running app — first thing to check next session.** In particular, nothing has confirmed live yet: the per-set table renders correctly, the plateau badge actually fires on a real 4-session-flat exercise, the tip variants actually differ day to day, and the mid-week weight sync actually kicks in and lowers a stored weight after a manual mid-session drop.

### Session 52 v1 — superseded, kept for history only

The first version (commit `7ac9a25`) showed one aggregate total-volume comparison and a single canned encouragement line, with the clipboard icon at the top. Bryant reviewed it, asked for the changes listed above, and it was never live-tested before being replaced — no need to test v1 specifically, only v2 (above).

## Session 51 — manual weight entry + per-exercise kg/lbs unit memory (built, pushed, and live-tested — confirmed working)

Bryant approved building the two features Session 49 had designed but not built, in this order: (1) the Workouts-tab chart redesign (turned out to actually be the more recent, correct "last session" — see Session 50 below, which hadn't made it into this file yet), (2) manual weight entry + kg/lbs, (3) a per-exercise recap card. This session built #2.

**What was built, all in one commit (`0581df5`):**
- **Tap-to-type weight entry.** The big weight number on the "Weight this set" card is now tappable — tapping it swaps it for a real number input (native number keyboard on a phone), styled to match the display state (same size/weight/color, dotted underline). Releasing focus (tap away, or press Enter) commits the typed value. A small caption under the number ("Tap the number to type a weight") hints that it's tappable.
- **Per-exercise kg/lbs switch.** A small LBS/KG pill switch sits right on the same card. Each exercise remembers its own last-used unit independently (confirmed with Bryant back in Session 49: real gyms mix units exercise-to-exercise, sometimes set-to-set) — switching units on Bench press doesn't affect Bicep curl. A brand-new exercise with no remembered unit yet falls back to the member's profile-level default.
- **Storage stays pounds, always.** No change to how weight is stored or logged — the database still only ever holds whole-pound numbers (Bryant's own decision, Session 49). kg is purely a display/typing convenience layered on top: typing or stepping in kg mode converts to the nearest whole pound before it's saved. Switching a set's unit mid-workout never changes the actual logged number, only how it's shown.
- **kg-mode stepper.** The +/- buttons step by a clean 2.5 kg in kg mode (Bryant's choice this session) instead of converting the existing 5 lb step into an odd kg number.
- **Plate-math hidden in kg mode.** The existing barbell plate-math helper (tells a member which plates to load) assumes US 45/25/10/5/2.5 lb plates — converting the stored lb number back to kg and running the same math would recommend plates that don't exist on a metric bar. Rather than build a second, kg-specific plate-math feature, Bryant approved simply hiding the helper when an exercise is in kg mode (lbs mode is unaffected).

**Database change made this session (confirmed with Bryant before writing any code):** checked the live schema first, per the app's own database rules. Found `profiles.unit` already existed (text, default `'imperial'`) but nothing in the app actually read or wrote it — it was hardcoded to `"imperial"` in a few places instead, so it wasn't really wired up yet. Now wired up for real, as the profile-level fallback default. Nothing anywhere tracked a per-exercise remembered unit, so one new column was added: `profiles.exercise_units` (jsonb, default `{}`) — a small map like `{"Barbell squat": "kg"}`, one entry per exercise the member has switched. No existing column, table, or data was touched or removed.

**Files touched, final line counts:** `src/WorkoutScreen.jsx` 3,078 → **3,200** (+122 across two commits — the tap-to-type input, the unit switch, the stepper/rounding logic, and the caption-text fix below, all inline in the existing "Weight this set" card, nothing else in the file touched), `src/shared.jsx` 3,730 → **3,749** (+19 — one new small `sb.saveExerciseUnits()` function, mirrors the existing `sb.updateLastWorkoutDayIndex()` pattern exactly), `src/Morphiq.jsx` 1,755 → **1,755** (net 0 — two single-line edits, carrying the profile's real `unit` and new `exercise_units` value into the app's user object instead of hardcoding `"imperial"`).

**Live-tested by Bryant the same session — confirmed working, with one bug caught and fixed on the spot:** the small caption lines under the weight number ("Still ramping to X lbs", "+5 lbs from plan", "Warm-up weight · ramping to X lbs") were still always saying "lbs" even in kg mode. Fixed in a same-session follow-up commit (`b9dec5c`): `formatWeightValue()` and `formatWeightDelta()` now convert these captions to the active unit too. Everything else about the feature was confirmed working as designed on Bryant's first live pass.

## Session 50 — Workouts-tab progress charts + tap-and-hold value tooltip (fully built, pushed, AND live-tested — confirmed working by Bryant)

**What was built, across four commits (`d25937c`, `b78ed71`, `c08f035`, `4fb8eee`):** Replaced the old "Total volume lifted" tile with a real per-exercise history view (pick an exercise, see Weight-over-time and Reps-over-time charts with PR star markers), added a week-streak tile, real horizontal scroll once there's enough data, and a tap-and-hold tooltip showing exact date/value. Confirmed by Bryant on a real device: **"Works perfect."**

**Files touched, final line count:** `src/ProgressScreen.jsx` 657 → **1,001** (+344).

## Session 49 recap — carried forward, unchanged

Fixed the bottom nav bar and floating chat button so they stay visible while scrolling (both were using `position:"absolute"` instead of `"fixed"` in `Layout()`, `shared.jsx`) — **still not yet live-tested by Bryant**, carried forward again this session since nothing has confirmed it live yet.

## Session 48 recap — carried forward, unchanged

Built "switch exercise" (jump to any exercise anytime via a "Today's list" sheet), a "checkpoint" screen for when an exercise finishes with others still skipped, and fixed a display bug where exercise-breakdown/in-workout set counts always showed 0. Live-tested end to end. See an earlier version of this file (or `git log`) for full detail if needed.

## Session 47 recap — carried forward, unchanged

Live-tested account deletion end-to-end on production, live-verified the post-onboarding "Plan ready" screen's color fix, and built the weekly detection engine (weight-trend plateau + nutrition adherence) wired into `/api/coach-note` and `/api/chat`. See an earlier version of this file (or `git log`) for full detail if needed.

## Latest commit

`6d76ff6` — "Feature: per-exercise recap card v2 (per-set breakdown, plateau detection, varied trainer tips) + mid-week weight sync fix" (`src/WorkoutScreen.jsx`, `src/Morphiq.jsx`). Pushed via the GitHub web-upload workaround (direct git/API push is still blocked this session too — confirmed again, still returns 403).

## Confirmed working vs still open

**Built and pushed this session — NOT yet live-tested in the real running app:**
- The redesigned per-exercise recap card (per-set breakdown, plateau detection, varied tips, fixed icon, volume explainer). See Session 52 v2 write-up above. (The original v1 version was never tested and is now superseded — no need to test it separately.)
- The mid-week weight sync fix (`syncMidWeekWeights()`), built alongside it.

**Built, pushed, AND live-tested/confirmed working:**
- Manual weight entry (tap-to-type) + per-exercise kg/lbs switch with memory, kg-mode stepper, kg-mode plate-math hidden, all caption text now unit-aware too (Session 51).
- Workouts-tab Weight/Reps trend charts with PR stars, real horizontal scroll, and the tap-and-hold value tooltip (Session 50). Bryant confirmed: "Works perfect."

**Confirmed live in prior sessions — unchanged, still true:** the "switch exercise" feature and its checkpoint screen (Session 48), the exercise-breakdown/"This exercise" display fix (Session 48), `api/delete-account.js` and the Danger Zone flow (Session 47), the post-onboarding "Plan ready" screen (Session 47), the weekly detection engine tested against production with synthetic data but not yet a real member's multi-week history (Session 47).

**NOT yet verified / still open:**
- This session's redesigned recap card and the mid-week weight sync fix — both brand new, need a real-device pass.
- Session 49's nav bar / chat button fix — still carried forward, still nobody has live-tested it.
- The cardio timer real-phone lock-screen test.
- Everything else on the punch list below.

## Punch list, in priority order

**FIRST — live-test this session's rebuilt recap card and the mid-week weight sync, on a real device.** For the recap card: finish an exercise and confirm the per-set breakdown table looks right (today vs. last time, per set), the volume explainer sentence reads clearly, the new checkmark badge (not the old clipboard icon) shows, a genuine PR still shows its badge, and — if possible — repeat an exercise enough times at the same weight to see the plateau badge and its amber styling actually fire. Also check the tip text on a couple of different exercises/days if possible, to sanity-check the variety. For the weight sync: manually drop a weight mid-session on an exercise, then reopen the app before a full week passes and confirm the next suggested starting weight reflects the lower number instead of reverting.

**SECOND — also still needs a live scroll-through: Session 49's nav bar/chat button fix.** Quick: open the app, scroll down on any screen with enough content, confirm both stay put. Carried forward five sessions in a row now without ever actually being clicked through live.

**THIRD — unblock the privacy policy and terms of service.** Both drafts exist now. Both are still blocked on Bryant forming a real legal business entity, after which both documents need to go to an actual lawyer together.

**FOURTH — App Store groundwork, next concrete step: open the Android project in real Android Studio at least once.** The GitHub Actions check proves the app compiles and is currently passing, but nobody has run it on a device or emulator yet. Capgo live-update pipeline still not started.

**FIFTH — cardio timer real-phone test.** Session 40's wall-clock fix still hasn't been live-tapped by Bryant with the screen genuinely locking.

**SIXTH — wearable sync (Apple HealthKit/Fitbit).** Unchanged, still not scoped.

**SEVENTH through TENTH — unchanged, still open:** live-test `WarmupTest` full week start-to-finish (tied to `cafe75designs+customtest2@gmail.com`, not Bryant's real email); get Bryant's sign-off on the compound/isolation warm-up split; exercise diagrams/animations (deferred); personal trainer market segment (needs its own discussion, see DECISIONS.md); expand exercise variety beyond primary/variation binary swap; the weight-loss/cardio redesign's still-undecided open questions from DECISIONS.md; voice input on the cardio quick-log and the "Other" activity type haven't been live-tested; the manual/voice cardio-logging path's calorie accuracy (no body weight passed to the AI estimate).

**RULED OUT — do not re-propose without new information:** camera/video-based AI form-checking (Session 44 research).

**LOWER PRIORITY / OPS.** Unchanged: one unidentified blank-named test profile row in Supabase; naming cleanup (GitHub repo, live URL, `Morphiq.jsx`/`function Morphiq()` still carry the retired placeholder name — cosmetic only); the "blank exercise weight saves as 20 lbs instead of staying blank" quirk.

## Technical notes carried forward

**🚨 `shared.jsx` is essentially full: 3,774 / 3,800 hard limit, ~26 lines left — unchanged this session, and this session's work was deliberately designed to avoid touching it at all (both new pieces reused existing `sb` functions).** Do not add anything new to `shared.jsx` next session without either (a) confirming it truly must be shared across multiple screen files and there's no room any other way, or (b) proposing a split to Bryant first.

**Plateau detection and the fire-and-forget write race (Session 52 v2).** A set's Supabase write happens fire-and-forget (`sb.insertWorkoutLog(...).then(...)`, not awaited) — so by the time the recap card's `advanceSet()` fires right after the last set of an exercise, that very last write may or may not have landed yet. `detectPlateau()` in `WorkoutScreen.jsx` handles this by never trusting the most recent row from `sb.getExerciseHistory()` — it always drops it and compares today's weight (already known locally, no network needed) against the 3 CONFIRMED prior sessions before it. Worth remembering for any future feature that wants to react to "today's" data via a history read right after logging it.

**Deterministic (not random) variant selection for the tip bank (Session 52 v2).** `pickTipVariant()` in `WorkoutScreen.jsx` hashes `category:exerciseName:dateStr` to pick a `TIP_BANK` entry — same day always shows the same variant, different days usually differ. This was Bryant's explicit, hard requirement (rule-based tips must not feel repetitive/impersonal) — if a future feature needs a similar "varied but not jarring" text selection, reuse this same pattern rather than inventing a new one.

**Mid-week weight sync only ever lowers, never raises (Session 52 v2).** `syncMidWeekWeights()` in `Morphiq.jsx` is deliberately narrow — it is NOT a more-frequent call to `progressPlan()` (that also advances `weekNumber` and the deload timer, which must only happen at a real week boundary). It only pulls a stored exercise weight down to match the most recent actual logged weight. Raising a weight stays exclusively `progressPlan()`'s job via the 2-for-2 rule at the weekly boundary. Any future change here should preserve that asymmetry — an accidental mid-week auto-increase would be a real regression, not just cosmetic.

**`loggedSets` (state) vs. `loggedSetsRef.current` (ref) — when each is safe to read.** `WorkoutScreen.jsx` keeps both in sync on every logged set. Code that runs in the SAME synchronous tick as `logSet()` (e.g. `goToRestOrNudge()`) must read `loggedSetsRef.current`, not the `loggedSets` state. Code that only runs later, after at least one more render (rest-timer countdown, a button click, `advanceSet()`) can safely read the `loggedSets` state directly. The recap card's `advanceSet()` reads the state, deliberately, confirmed safe by this same rule.

**GitHub web-upload workaround.** The file(s) being uploaded must be staged at `/mnt/user-data/uploads/<filename>` specifically — `/mnt/user-data/outputs/` gets silently rejected. Multiple files can be uploaded and committed together in one visit to `github.com/Luxurydadbot/Morphiq/upload/main/<folder>`.

**AuthScreen location correction (still true, still not fixed at the source).** `AuthScreen` actually lives in `Morphiq.jsx`, not `shared.jsx`. The project's own standing pre-push safety-check instructions still say to look for it in `shared.jsx`; this is a documentation bug in the standing instructions themselves, not in the app.

**"Switch exercise" feature (Session 48, live-verified).** Lives entirely in `src/WorkoutScreen.jsx`. `resolveNextExercise()` is the single source of truth for "what happens after this exercise's sets run out" — keep using it rather than adding a second place that guesses at "what's next."

**AT&T/Yahoo Mail does not support "+" sub-addressing.** Never use a "+" alias on Bryant's real sbcglobal.net address to test anything — use the plain address, or a genuinely separate inbox.

**GitHub push access.** Direct/automatic push still broken (git-proxy error, confirmed again this session — a plain GET to the GitHub API also returns 403 now, not just writes). Working method unchanged: Chrome browser tool's "Upload files" page, staging the finished file(s) in `/mnt/user-data/uploads/` first.

**Vercel Hobby plan has a hard cap of 12 serverless functions per deployment.** Unchanged — `api/` is currently at exactly 12 counted functions (plus the `_sentry.js` helper, which doesn't count since it's underscore-prefixed).

**Supabase test-data seeding pattern, useful for future live tests.** The Supabase MCP connector's `execute_sql`/`apply_migration` run with full database access (not the app's own restricted anon key), so they can insert rows or alter schema directly for test setup, and can query `auth.users` directly.

**GitHub Actions Android build check.** `.github/workflows/android-build.yml` runs on every push to `main`. No open concerns.

**WebFetch is not reliable for reading files from this repo.** Never use WebFetch for this repo's file contents — always `git clone` with the token embedded in the HTTPS URL. (Reads via plain `git clone` work even without a valid token, since the repo is public — it's only writes/pushes that are blocked for this session.)

**Supabase MCP connector.** `profiles.supabase_user_id` is the auth link (plain text column holding the auth user's UUID as a string), `profiles.id` is the FK used everywhere else. Never use a narrow `select=id`-only query against `profiles` — it gets rejected by RLS even when the exact same row succeeds with no `select=` at all. `api/delete-account.js` uses the service-role key (bypasses RLS), separate from the Supabase MCP connector's own elevated database access.

**Weight is always stored in pounds, database-wide, on principle (Session 49 decision, now actually built on in Session 51).** Any future feature touching weight numbers should keep converting at the display/input edge, never change what's stored.

## Paste this at the start of your next session

Fetch `HANDOFF.md`, `DECISIONS.md`, and all `src/`/`api/` files fresh via `git clone` (reads work fine even without a working token, since the repo is public; do NOT use WebFetch for repo file contents). Report every file's line count before doing anything else. **`shared.jsx` is at 3,774 / 3,800 — only ~26 lines of headroom left. Do not add anything new to it without proposing a split to Bryant first — it is essentially full.** **GitHub push access:** still broken (platform-side git-proxy block, confirmed again — even a plain GET now returns 403) — use the Upload-files browser workaround, staging file(s) at `/mnt/user-data/uploads/` specifically (not `/outputs/`). **`api/` is at exactly 12 counted functions — the Vercel Hobby-plan cap.** **Never use a "+" alias on Bryant's real sbcglobal.net address.**

**This session (Session 52 v2) rebuilt the per-exercise recap card** based on Bryant's direct feedback on the first version: added a real per-set breakdown table (today vs. last time), fixed the confusing clipboard/"battery" icon to a clear checkmark badge, added plateau detection (amber badge, 4 flat sessions triggers it), replaced the single canned encouragement line with a trainer-voice `TIP_BANK` (several phrasings per situation, picked deterministically by exercise+date so it never feels repetitive — Bryant's explicit hard requirement), and added a one-line volume explainer. **Also built a related, separate fix Bryant asked for in the same conversation:** `syncMidWeekWeights()`, which corrects the "silently reverts to the old higher weight" problem mid-week by pulling a stored exercise weight down (never up) to match the most recent actual logged weight. **NEITHER has been live-tested yet — this is the first thing to check next session.**

**Also confirmed working and fully done, no action needed:** manual weight entry + per-exercise kg/lbs (Session 51), and the Workouts-tab trend charts + tap-and-hold tooltip (Session 50, "Works perfect").

Next priority: live-test this session's rebuilt recap card and the mid-week weight sync (first thing), then the long-overdue nav-bar scroll-through from Session 49 (still not done, five sessions running). After that, everything designed from the original Session 49 batch is built — next real feature work needs a fresh conversation with Bryant about what's next.

Remind Bryant: the rebuilt recap card and the mid-week weight sync are both live but untested on a real device — worth finishing an exercise (and ideally repeating one a few times to see the plateau badge) before considering either done. Also: `shared.jsx` has almost no room left, so the next new feature that needs shared logic may need a file-split conversation first.
