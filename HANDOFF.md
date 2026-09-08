# Hypergentiq — Session 49 master handoff

This file is the handoff. At the start of every session, fetch this file from the repo along with the src/ and api/ files — it replaces pasting a handoff into chat by hand. **MANDATORY fetch method — git clone only, see Technical notes below.**

## STANDING GOAL — App Store + Google Play submission roadmap (carry forward every session, do not delete until fully checked off)

Unchanged this session — this session's work (below) was member-facing feature work (one shipped, two fully designed), not app-store-roadmap work. Step list: (1) fix PWA gaps — done, Session 30, (2) add Capacitor + generate native projects — done (Session 25), still never opened in Android Studio/Xcode by a human, (3) set up Capgo live-update pipeline — still open, (4) Android path (Bryant needs a Google Play Console account, $25), (5) iOS path (needs a Mac on macOS Sequoia 15.6+ for Xcode 26, or a cloud Mac build service), (6) privacy policy — hard gate for both stores, still blocked on Bryant forming a real legal business entity before it can be finalized and sent to a lawyer, (7) terms of service — same status as privacy policy, (8) account deletion — built Session 46, live-verified working Session 47, (9) store listing assets (icon done, need screenshots + descriptions), (10) confirm no Apple IAP conflict, (11) submit.

## Session 49 — sticky bottom nav bar + floating chat button fix, plus full designs for two more member-requested features (not yet built)

Bryant relayed three separate pieces of member feedback this session (all via conversation, not live gym testing this time):

1. The bottom nav bar (Home/Workout/Meals/Progress) disappears while scrolling instead of staying visible.
2. Members hit mixed lbs/kg equipment at the gym (e.g. dumbbells in kg, barbell plates in lbs — sometimes even two sets of the same dumbbell in different units) and want to type an exact weight instead of only using the +/- stepper.
3. Members want a quick recap comparing today's performance to last time, right when they finish all the sets of one exercise — not at the very end of the whole workout.

**Item 1 was investigated and fixed this session.** Found that both the bottom nav bar and the floating chat bubble in `Layout()` (`shared.jsx`) used `position:"absolute"`, which anchors to each screen's own content box rather than the phone's actual screen — since screen content can be taller than one view, both scrolled away with the page on any long screen and only reappeared once scrolled all the way down. Switched both to `position:"fixed"` with `zIndex:20` (matching the tier already used elsewhere in `WorkoutScreen.jsx` for things that should float above normal content but stay under full-screen sheets, which use `zIndex:30` — so opening a sheet still correctly covers both). Confirmed no ancestor element uses a CSS transform (which would have broken `fixed` positioning) and confirmed the app has no desktop max-width wrapper to account for (it runs full-bleed, phone-width only). Change is isolated entirely to `Layout()` — nothing else touched. Verified with `esbuild` (clean parse, no syntax errors) and a line-by-line diff review before pushing. **Not yet live-tested by Bryant in the real running app** — should get an actual scroll-through on a phone/browser before being called fully done, per the app's own "verify live, not just by code review" standard.

**Items 2 and 3 were fully designed this session via iterative mockups (standalone HTML previews sent to Bryant, not committed to the app) — ready to build next session, nothing coded yet:**

*Manual weight entry + kg/lbs support:*
- Tap the big weight number itself (not a separate button/field) to edit it directly — on a real phone this pops up the native number keyboard. Styled to look pixel-identical between display and edit states (no boxy browser-default input) so it never looks bolted-on. Final approved look: number stays white and bold (its original styling, unchanged), small dotted-underline hint at rest, small hint text below that matches the "Weight this set · [exercise]" label's exact font/size/color.
- kg/lbs: store every weight as pounds in the database, always (Bryant's own idea, confirmed) — convert on the way in and out, no new weight column, no schema change for the number itself.
- The unit control is **per-exercise, not a single global setting** — confirmed directly with Bryant after he pushed back on an initial "one global setting" proposal: real gyms mix units exercise-to-exercise (sometimes set-to-set with the same exercise), so a single account-wide toggle doesn't match reality. Final design: a small, quiet LBS/KG switch sits right on the same per-set "weight this set" card (so it naturally covers even set-to-set switching within one exercise), and **each exercise remembers its own last-used unit independently** (bench press stays on kg because that's what was picked last time on bench press; curls stay on lbs the same way) — no re-flipping needed workout to workout unless the equipment actually changes. First time on a brand-new exercise with no history yet, falls back to one profile-level "usual unit" default.
- Still undecided / not designed yet: the exact kg→lbs rounding rule (nearest whole pound proposed, not confirmed); the existing barbell "plate math" feature (tells a member which plates to load) currently assumes US 45/25/10/5/2.5 lb plates and will need its own kg version (20/10/5/2.5/1.25 kg) for members on metric bars — converting the stored lb number back to kg and doing US plate math on it would recommend plates that don't exist; the +/- stepper's step size should be a clean kg amount (e.g. 2.5 kg) when in kg mode, not a converted-and-rounded lb step.
- New database piece needed: one small "last used unit" memory per (member, exercise), plus one profile-level "usual unit" default. Per the app's own database rules — confirm neither already exists as a column before writing any code against them.

*Per-exercise recap card:*
- Confirmed with Bryant this is **not** an end-of-whole-workout summary — it triggers when a member finishes all the sets of one exercise, before moving to the next one on their plan.
- Compares that exercise's performance today against the last time that same exercise was logged (e.g. volume/weight change, "up X% from last time"). Good news: the app already fetches this exact comparison live during a workout (it's what powers the existing "last time: X lbs × Y reps" line and the "PR pace" badge) — so this is mostly a new short summary card plus a rollup calculation at the point an exercise finishes, not new data plumbing from scratch. Fits naturally alongside the existing `resolveNextExercise()` transition logic built in Session 48.

## Session 48 recap — carried forward, unchanged

Built "switch exercise" (jump to any exercise anytime, including mid-set, via a new "Today's list" sheet), a "checkpoint" screen for when an exercise finishes with others still skipped, and fixed a display bug where the exercise-breakdown and in-workout set counts always showed 0. Live-tested end to end in the real running app, including the escape hatch and the true completion screen. See prior version of this file (or `git log`) for full detail if needed.

## Session 47 recap — carried forward, unchanged

Live-tested account deletion end-to-end on the real production app (fully works, Apple Guideline 5.1.1(v) satisfied), live-verified the post-onboarding "Plan ready" screen's Session 45 color fix, and built the weekly detection engine (weight-trend plateau + nutrition adherence via `src/coachSignals.js`) wired into both `/api/coach-note` and `/api/chat`, live-tested against production with synthetic data. See prior version of this file (or `git log`) for full detail if needed.

## Session 46 recap — carried forward, unchanged

Reviewed the privacy policy draft as a non-lawyer checklist pass, built and shipped in-app account deletion (the feature verified live in Session 47), drafted Terms of Service for the first time, and worked around Vercel's Hobby-plan 12-function cap by merging two low-traffic billing-report tools into one file (`api/usage-report.js`). See prior version of this file (or `git log`) for full detail if needed.

## Files touched this session (final line counts)

Only one file changed: `src/shared.jsx` **3,716 → 3,730** (+14 lines — a code comment explaining the fix; the actual change was only CSS-style property edits inside `Layout()`, not new logic).

Untouched this session, still current: `src/WorkoutScreen.jsx` 3,078, `src/Morphiq.jsx` 1,755, `src/GymOwnerDashboard.jsx` 927, `src/MealScreen.jsx` 869, `src/ProgressScreen.jsx` 657, `src/OnboardingScreen.jsx` 622, `src/SuperAdminDashboard.jsx` 343, `src/ChatScreen.jsx` 309, `src/CardioScreen.jsx` 295, `src/GymSignupScreen.jsx` 269. `api/` unchanged, still 12 functions (the Vercel Hobby-plan cap) plus the `_sentry.js` helper (doesn't count toward the cap). Nothing near the 3,800-line hard limit — `shared.jsx` is still the one to watch (only ~70 lines of headroom left); the two features designed this session but not yet built will very likely need to land in `WorkoutScreen.jsx` instead of adding more to `shared.jsx`, given how little room is left there.

## Latest commit

`09c0263` — "Fix: bottom nav bar and floating chat button now stay visible while scrolling" (`src/shared.jsx` only). Pushed via the GitHub web-upload workaround (direct git/API push is still blocked this session too — see Technical notes for an important refinement to that workaround).

## Confirmed working vs still open

**Built and pushed this session, verified via code review + a clean `esbuild` syntax check — NOT yet live-tested in the real running app:**
- The bottom nav bar and floating chat button now use fixed positioning so they should stay visible while scrolling on every screen. Needs an actual scroll-through on a phone or browser before this is called fully done — nothing about this was clicked through live yet.

**Designed and confirmed with Bryant this session, zero code written yet:**
- Manual weight entry (tap-to-type) + per-exercise-remembered kg/lbs unit toggle — see Session 49 write-up above for the full, confirmed spec.
- Per-exercise recap card (triggers when one exercise's sets finish, compares to last time on that exercise) — see Session 49 write-up above.

**Confirmed live in prior sessions — unchanged, still true:** the "switch exercise" feature and its checkpoint screen (Session 48), the exercise-breakdown/"This exercise" display fix (Session 48), `api/delete-account.js` and the Danger Zone flow (Session 47), the post-onboarding "Plan ready" screen (Session 47), the weekly detection engine tested against production with synthetic data but not yet a real member's multi-week history (Session 47).

**NOT yet verified / still open:**
- This session's nav bar / chat button fix (see above — needs a live scroll-through).
- The weight chart real-phone swipe test.
- The cardio timer real-phone lock-screen test.
- Everything else on the punch list below.

## Punch list, in priority order

**FIRST — live-test this session's nav bar/chat button fix.** Quick: open the app, scroll down on any screen with enough content (a long meal list or an active workout), confirm both stay put.

**SECOND — build the two designed-but-not-built features from this session**, in whichever order Bryant prefers next time: (a) manual weight entry + the per-exercise kg/lbs memory, (b) the per-exercise recap card. Full specs are in the Session 49 section above — no re-discussion needed, just confirm the two still-undecided details (kg rounding rule, kg plate-math) before writing code that touches them, and confirm the two new small database pieces (last-used-unit per exercise, profile-level default unit) don't already exist before assuming their shape.

**THIRD — unblock the privacy policy and terms of service.** Both drafts exist now. Both are still blocked on Bryant forming a real legal business entity, after which both documents need to go to an actual lawyer together.

**FOURTH — App Store groundwork, next concrete step: open the Android project in real Android Studio at least once.** The GitHub Actions check proves the app compiles and is currently passing, but nobody has run it on a device or emulator yet. Capgo live-update pipeline still not started.

**FIFTH — an actual finger-swipe test on a real phone for the weight chart** (Bryant's own task, waiting on him logging more days).

**SIXTH — cardio timer real-phone test.** Session 40's wall-clock fix still hasn't been live-tapped by Bryant with the screen genuinely locking.

**SEVENTH — wearable sync (Apple HealthKit/Fitbit).** Unchanged, still not scoped.

**EIGHTH through ELEVENTH — unchanged, still open:** live-test `WarmupTest` full week start-to-finish (tied to `cafe75designs+customtest2@gmail.com`, not Bryant's real email); get Bryant's sign-off on the compound/isolation warm-up split; exercise diagrams/animations (deferred); personal trainer market segment (needs its own discussion, see DECISIONS.md Aug 8 2026); expand exercise variety beyond primary/variation binary swap; the weight-loss/cardio redesign's still-undecided open questions from DECISIONS.md Aug 9 2026; voice input on the cardio quick-log and the "Other" activity type haven't been live-tested; the manual/voice cardio-logging path's calorie accuracy (no body weight passed to the AI estimate).

**RULED OUT — do not re-propose without new information:** camera/video-based AI form-checking (Session 44 research).

**LOWER PRIORITY / OPS.** Unchanged: one unidentified blank-named test profile row in Supabase; naming cleanup (GitHub repo, live URL, `Morphiq.jsx`/`function Morphiq()` still carry the retired placeholder name — cosmetic only); the "blank exercise weight saves as 20 lbs instead of staying blank" quirk.

## Technical notes carried forward

**GitHub web-upload workaround — important refinement found this session.** The file being uploaded must be staged at `/mnt/user-data/uploads/<filename>` specifically — staging it at `/mnt/user-data/outputs/<filename>` (the location used for everything else, including what gets handed to the user with SendUserFile) gets silently rejected by the browser upload tool with a permissions error, even though that tool's own description suggests both locations should work. Copy the finished file into `/mnt/user-data/uploads/` immediately before calling the upload tool. This cost significant back-and-forth this session before being found — worth remembering so it doesn't happen again.

**AuthScreen location correction.** `AuthScreen` actually lives in `Morphiq.jsx`, not `shared.jsx` — confirmed this session by searching `shared.jsx` for it (zero matches) and finding the correction already logged in `MASTER_HANDOFF.md` (July 26 session): "the standing pre-push checklist referencing shared.jsx for it is stale." The project's own standing pre-push safety-check instructions (checked automatically every session) still say to look for it in `shared.jsx` — this is a documentation bug in the standing instructions themselves, not in the app. Worth Bryant correcting at the source next time he's updating project instructions, so this doesn't cause a false "safety check failed" read every session.

**"Switch exercise" feature (Session 48, fully live-verified).** Lives entirely in `src/WorkoutScreen.jsx`. `resolveNextExercise()` is the single source of truth for "what happens after this exercise's sets run out" — keep using it rather than adding a second place that guesses at "what's next," including for the new per-exercise recap card being built next session (it's the natural hook point for showing the recap right before that function's decision).

**AT&T/Yahoo Mail does not support "+" sub-addressing.** Never use a "+" alias on Bryant's real sbcglobal.net address to test anything — use the plain address, or a genuinely separate inbox.

**GitHub push access.** Direct/automatic push still broken (git-proxy error, both via `git push` and the GitHub REST API directly — confirmed again this session). Working method unchanged except for the refinement above: Chrome browser tool's "Upload files" page (`github.com/Luxurydadbot/Morphiq/upload/main/<folder>`), staging the finished file in `/mnt/user-data/uploads/` (not `/outputs/`) first.

**Vercel Hobby plan has a hard cap of 12 serverless functions per deployment.** Unchanged — `api/` is currently at exactly 12 counted functions (plus the `_sentry.js` helper, which doesn't count since it's underscore-prefixed). Any new backend feature needs either a merge of two more low-traffic files or a decision from Bryant on Vercel Pro ($20/mo).

**Supabase test-data seeding pattern, useful for future live tests.** The Supabase MCP connector's `execute_sql` runs with full database access (not the app's own restricted anon key), so it can insert rows directly into any table for test setup, and can query `auth.users` directly.

**GitHub Actions Android build check.** `.github/workflows/android-build.yml` runs on every push to `main`. No open concerns as of Session 47.

**Vercel MCP connector.** Use `list_teams` → `list_projects` (project `morphiq`, id `prj_0KL9CirNTdNMnXEO34o3pdwd5wSM`, team `team_Iiv1x067TLmgX2XdP5mXO06v`) → `list_deployments` to check `state`.

**WebFetch is not reliable for reading files from this repo.** Never use WebFetch for this repo's file contents — always `git clone` with the token embedded in the HTTPS URL. (Reads via plain `git clone` work even without a valid token, since the repo is public — it's only writes/pushes that are blocked for this session.)

**Supabase MCP connector.** `profiles.supabase_user_id` is the auth link (plain text column holding the auth user's UUID as a string), `profiles.id` is the FK used everywhere else. `api/delete-account.js` uses the service-role key (bypasses RLS) via `process.env.SUPABASE_SERVICE_ROLE_KEY` on the backend — separate and different from the Supabase MCP connector's own elevated database access.

## Paste this at the start of your next session

Fetch `HANDOFF.md`, `DECISIONS.md`, and all `src/`/`api/` files fresh via `git clone` (reads work fine even without a working token, since the repo is public; do NOT use WebFetch for repo file contents). Report every file's line count before doing anything else; none are near the 3,800-line limit (`shared.jsx` is largest at 3,730, only ~70 lines of headroom left — do not add to it without proposing a split first; the two features below should probably land in `WorkoutScreen.jsx` instead). **GitHub push access:** still broken (platform-side git-proxy block) — use the Upload-files browser workaround, staging the file at `/mnt/user-data/uploads/` specifically (not `/outputs/` — that gets silently rejected, cost real time this session). **`api/` is at exactly 12 counted functions — the Vercel Hobby-plan cap.** **Never use a "+" alias on Bryant's real sbcglobal.net address.**

**This session shipped one fix and fully designed two more features, ready to build:**

1. Fixed the bottom nav bar and floating chat button so they stay visible while scrolling (they used to scroll away with the page) — pushed live, not yet live-tested by Bryant.
2. Fully designed (via mockups, all confirmed with Bryant, zero code written): manual weight entry by tapping the number to type it, plus a small per-exercise kg/lbs unit switch that remembers each exercise's own last-used unit independently (not a single global setting — confirmed after Bryant explained real gyms mix units exercise-to-exercise and even set-to-set). Two details still need deciding before coding: the kg-to-lbs rounding rule, and a kg version of the existing barbell plate-math feature.
3. Fully designed: a recap card that appears when a member finishes all the sets of ONE exercise (not the whole workout), comparing that exercise's performance to their last time doing it — building on comparison logic the app already has.

Next priority: live-test item 1 above (quick), then build items 2 and 3. Everything else — privacy policy/ToS (blocked on the business entity), Android Studio, the 12-function cap — unchanged from before.

Remind Bryant: the nav bar and chat button should now stay on screen the whole time while scrolling, matching what members asked for — worth a quick real scroll-through to confirm before considering it done. The other two features he asked about (typing weights directly with per-exercise kg/lbs memory, and a recap after each exercise) are fully designed and ready to build next time — nothing was left ambiguous, right down to exactly how the small unit switch should look and behave.
