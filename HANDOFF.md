# Hypergentiq — Session 22 master handoff (plate-math breakdown shipped)

This file is the handoff. At the start of every session, fetch this file from the repo along with the src/ and api/ files — it replaces pasting a handoff into chat by hand. **MANDATORY fetch method — git clone only, see Technical notes below.**

## STANDING GOAL — App Store + Google Play submission roadmap (carry forward every session, do not delete until fully checked off)

Untouched this session. Bryant wants Hypergentiq submitted to both the Apple App Store and Google Play via Capacitor (not a React Native rewrite). Full step list lives in git history (`git show 0d25354:HANDOFF.md` or earlier); short version: (1) fix PWA gaps (manifest icons, service worker), (2) add Capacitor + generate native projects, (3) set up Capgo live-update pipeline, (4) Android path (Bryant needs a Google Play Console account, $25), (5) iOS path (needs a Mac on macOS Sequoia 15.6+ for Xcode 26, or a cloud Mac build service), (6) privacy policy — hard gate for both stores, still blocked on a lawyer, (7) store listing assets (icon done, need screenshots + descriptions), (8) confirm no Apple IAP conflict, (9) submit. No progress this session.

## Important correction made at the start of this session

Session-start fetch initially used the web-fetch tool against `raw.githubusercontent.com` for `HANDOFF.md`, which silently returned a **stale, cached Session 10 version** instead of the real current Session 21 file — even though the same tool against the same URL worked correctly for every `src/`/`api/` source file fetched in the same batch. This produced a wrong initial read (thinking plateau detection was still the top priority, when it shipped back in Session 11) before `git clone` was used and caught the discrepancy. Corrected before any duplicate work happened. See Technical notes below — the "git clone only" rule already existed for the API/raw-HTTP block, but this is the first confirmed case of `raw.githubusercontent.com` itself serving stale content through the web-fetch tool specifically (not a hard block, worse: a silent wrong answer). Treat any non-git-clone fetch of this repo as unverified until cross-checked.

## Session 22 — what got built this session

**Plate-math breakdown on barbell working sets.** Commit `92a07d0`. New punch-list item from Session 21's competitive research, picked over the other two (daily readiness check-in, AI plan staleness audit) specifically because it's fully self-contained arithmetic with no interaction with the progression/deload logic that's needed several correction passes historically.

- `shared.jsx`: three new functions — `isBarbellExercise(name)` (name-based, checks for the `"Barbell "` prefix `EXERCISE_LIBRARY` already uses consistently for every real barbell movement, deliberately not the plan-level equipment setting, since even a "barbell" plan mixes in real dumbbell accessory work like "Dumbbell lateral raise" that the plan-level flag can't distinguish), `getPlateBreakdown(totalWeight, barWeight = 45)` (greedy fill over standard plate sizes `[45, 35, 25, 10, 5, 2.5]`, returns `{ plates, perSide, remainder, barOnly }` or `null` below bar weight), and `formatPlateBreakdown(breakdown)` (human-readable line, e.g. `"2×45 + 1×10 per side"` or `"Just the bar (45 lbs)"`). All exported.
- `WorkoutScreen.jsx`: wired into the existing weight tile on the active-set screen — a small caption line shown under the big weight number, for both warm-up and working sets (a member has to load the actual bar either way), gated on `isBarbellExercise(ex.name)` so it never shows for dumbbell/kettlebell/machine exercises.
- **Known simplification, documented in code comments, not a bug:** assumes one standard 45lb Olympic bar for every barbell exercise. Doesn't account for a women's 35lb bar, EZ-curl bar, or trap bar weight. Same spirit as the existing kettlebell-increment placeholder — flagged rather than silently wrong.
- **Verification this session:** `esbuild` used to bundle-check both changed files (no live Node toolchain available in the sandbox to run the real `react-scripts build` — `node_modules` isn't checked into the repo and wasn't installed this session) — both compiled clean, zero syntax/JSX errors. Diff reviewed line-by-line before pushing; both pre-push safety checks passed (`function WorkoutScreen()` present, `export default function Morphiq()` present, line-count deltas exactly matched what was added: `shared.jsx` +61, `WorkoutScreen.jsx` +17). **Not yet live-tested in Chrome** — next session should open a barbell-plan test workout and confirm the breakdown renders correctly and matches real plate math by hand, same as the standing practice for other numeric features in this app.

## Files touched this session (final line counts)

- `src/shared.jsx`: 3,004 → 3,065 (+61)
- `src/WorkoutScreen.jsx`: 2,611 → 2,628 (+17)

All files, current full line counts:

| File | Lines |
| --- | --- |
| src/shared.jsx | 3,065 |
| src/WorkoutScreen.jsx | 2,628 |
| src/Morphiq.jsx | 1,586 |
| src/GymOwnerDashboard.jsx | 927 |
| src/MealScreen.jsx | 724 |
| src/OnboardingScreen.jsx | 583 |
| src/ProgressScreen.jsx | 580 |
| src/ChatScreen.jsx | 300 |
| src/SuperAdminDashboard.jsx | 343 |
| src/GymSignupScreen.jsx | 269 |
| api/chat.js | 259 |
| api/report-usage.js | 165 |
| api/stripe-webhook.js | 161 |
| api/coach-note.js | 108 |
| api/admin-gym-action.js | 110 |
| api/monthly-usage-report.js | 101 |
| api/create-checkout.js | 89 |
| api/photo-meal.js | 76 |
| api/parse-meal.js | 62 |
| api/parse-cardio.js | 62 |
| api/plan.js | 31 |
| api/_sentry.js | 32 |
| api/ping.js | 12 |

`shared.jsx` is now at 3,065 lines, further past the 2,000-line soft target — still no split proposed, but every session that adds to it makes that more overdue. Worth actually proposing a split next time shared.jsx is touched, rather than continuing to note it and move on.

## Latest commit

`92a07d0` (plate-math breakdown) on `main`.

## Confirmed working vs still open

**Verified this session:** both changed files compile clean via `esbuild` (syntax/JSX valid), diff reviewed, pre-push safety checks passed.

**Not yet live-tested:** the plate-math breakdown itself hasn't been clicked through in the real running app yet — do this first next session, on a barbell-equipment test profile, checking a few different weights by hand (including an edge case like exactly-bar-weight and a weight requiring 3+ plate sizes).

## Punch list, in priority order

**FIRST — live-verify plate-math breakdown** (see above) — quick, do it before building anything else so it doesn't join the backlog of code-reviewed-but-not-clicked-through items.

**SECOND — the other 2 items from Session 20's competitive research:** a daily readiness check-in (one-tap rough/ok/great nudging that day's volume/intensity, no wearable needed) and a staleness audit of the AI per-day plan variation over a longer simulated timeline (verification task, not new code, unless an issue turns up).

**THIRD — unblock the privacy policy.** Still the single highest-leverage blocked item — blocks both this punch list and the entire App Store roadmap (STANDING GOAL, step 6). Still blocked on Bryant contacting a lawyer.

**FOURTH — no-blocker App Store groundwork.** Capacitor setup and the Capgo live-update pipeline can start anytime.

**FIFTH — optional completeness check on gym-logo branding** (carried from Session 21): live-test the actual member splash screen (not just the owner preview panel) for a real no-logo gym, if maximum confidence is wanted before considering that feature fully closed out.

**SIXTH — four product/design items from Session 18, still just discussion, nothing built:** a per-category custom/recurring grocery item that persists; the Progress screen's "Workout streak" card (currently shows no real data); whether "Log Cardio" is worth keeping at all; a broader review of what Progress/Nutrition should measure against top fitness apps.

**SEVENTH — walk a full week on `WarmupTest` (or a fresh test profile) start-to-finish**, carried forward from Session 19/21. `WarmupTest`'s in-progress Legs-day snapshot was very likely destroyed during Session 21 testing — this walkthrough needs to start fresh.

**EIGHTH — confirming the warm-up compound/isolation split is sufficient.** Needs a direct decision from Bryant, not code.

**NINTH — kettlebell weight-increment refinement** and **exercise diagrams/animations** — both deferred, both need their own dedicated model/library before starting.

**TENTH — personal trainer market segment** (from Session 21, see DECISIONS.md). Worth a real discussion before any building — pricing, positioning, and go-to-market all need answers first.

**LOWER PRIORITY / OPS.** `shared.jsx` at 3,065 lines — propose a split next time it's touched. The one unidentified blank-named test profile row in Supabase. Naming cleanup (GitHub repo, live URL, `Morphiq.jsx`/`function Morphiq()` still carry the retired placeholder name — cosmetic only).

## Technical notes carried forward

**MANDATORY fetch method — git clone only.** Reconfirmed and *sharpened* this session: it's not just that `api.github.com` and direct `curl`/Python HTTP calls to `github.com`/`raw.githubusercontent.com` are blocked outright by this environment's outbound proxy allowlist (`blocked-by-allowlist`) — the web-fetch tool's access to `raw.githubusercontent.com` (which does succeed, unlike direct curl) can also silently return **stale cached content** instead of erroring, which is worse than a hard block because it looks like a successful, current read. This session it served an 11-session-old `HANDOFF.md`. `git clone`/`git push` over authenticated HTTPS from a plain scratch directory remains the only fetch method to trust by default — confirmed reliable again this session (session-start fetch after catching the stale-cache issue, and the push at the end). If a non-git fetch is ever used for a quick look, treat its content as unverified until cross-checked against a fresh `git clone`.

`profiles.supabase_user_id` is the auth link, `profiles.id` is the FK used everywhere else. Fire-and-forget `.catch(() => {})` pattern for all new Supabase writes. `AuthScreen` lives in `Morphiq.jsx`, not `shared.jsx`. The `exercises` table (91 rows: id, name, muscle_group, pattern, equipment, difficulty, variation_of, is_active) is still just a reference/classification table, not wired into live plan generation.

**No live Node/npm toolchain in this sandbox by default** — `node_modules` isn't checked into the repo, and a full `npm install` for `react-scripts` wasn't attempted this session (network access to the npm registry does work, confirmed by installing `esbuild` standalone for a syntax check). If a future session needs a real `npm run build`, budget time for the full install, or continue using a lightweight bundler like `esbuild` for a fast syntax/JSX sanity check as a lower bar than a full CRA build.
