# Hypergentiq — Session 29 master handoff (home nutrition card copy fixed)

This file is the handoff. At the start of every session, fetch this file from the repo along with the src/ and api/ files — it replaces pasting a handoff into chat by hand. **MANDATORY fetch method — git clone only, see Technical notes below.**

## STANDING GOAL — App Store + Google Play submission roadmap (carry forward every session, do not delete until fully checked off)

Progress this session on step (2): Capacitor installed and both native projects (`android/`, `ios/`) generated and committed. Full step list lives in git history (`git show 0d25354:HANDOFF.md` or earlier); short version: (1) fix PWA gaps (manifest icons, service worker) — still open, (2) add Capacitor + generate native projects — **started this session, see Session 25 below**, (3) set up Capgo live-update pipeline, (4) Android path (Bryant needs a Google Play Console account, $25), (5) iOS path (needs a Mac on macOS Sequoia 15.6+ for Xcode 26, or a cloud Mac build service — this sandbox has no Xcode, confirmed via `npx cap doctor`), (6) privacy policy — hard gate for both stores, still blocked on a lawyer, (7) store listing assets (icon done, need screenshots + descriptions), (8) confirm no Apple IAP conflict, (9) submit.

## Session 26 — branded native app icons and splash screens

Continuation of Session 25's Capacitor work. The `android/` and `ios/` projects scaffolded last session had Capacitor's generic default icon (a plain placeholder graphic, not Hypergentiq's logo) — this session replaced every icon and splash screen in both native projects with the real logo.

**What was built:**
- Generated a 1024x1024 icon source and a 2732x2732 splash source from the app's existing `public/logo512.png` (the same logo already used on the web app).
- Tried the official `@capacitor/assets` tool first to auto-generate everything — it depends on the `sharp` image library, whose install tries to download a binary from GitHub's release CDN, which this sandbox's network allowlist blocks. The failed install also wiped out `node_modules` entirely (a `npm install` quirk, not an app problem) — recovered with a plain `npm install`, no lasting damage, confirmed by a clean rebuild afterward.
- Since the official tool couldn't run, hand-built all the required files directly with Python's image library (Pillow), matching Capacitor's exact expected filenames and pixel dimensions for both platforms: iOS's single 1024x1024 app icon and three (identical, as Capacitor expects) 2732x2732 splash images; Android's 5 icon densities × 3 icon variants each (legacy square, round, and the adaptive "foreground" layer) plus 11 splash images across portrait/landscape/density combinations.
- Updated Android's adaptive-icon background color from the default white to the app's real dark theme color (`#121316`).
- Verified every single generated file against the original placeholder's exact dimensions before overwriting anything, then rebuilt the web app and re-ran `npx cap sync` to confirm both platforms still compile cleanly with the new assets in place.

**Known limitation, worth a follow-up:** `logo512.png` is the full logo — background color plus wordmark baked into one flat image, not a clean icon-only mark on a transparent background. That's fine for a splash screen (which is literally supposed to look like that) but not ideal for the small app-icon sizes, especially Android's adaptive icon, where a proper icon-only mark with safe-zone padding would look sharper and survive being cropped to a circle/squircle by different phone launchers more gracefully. This is a design-asset gap, not a code gap — the right fix is a simplified icon-only version of the logo (just the mark, transparent background, sized so it doesn't touch the edges) whenever Bryant wants to invest in that, not something to build from code alone.

**Verified this session:** every generated PNG's dimensions checked file-by-file against Capacitor's own defaults before commit (all matched exactly — no size mismatches that could break either platform's build). `npm run build` succeeded before and after. `npx cap sync` completed cleanly for both platforms with no errors. Diff reviewed before pushing — exactly the 30 image files plus the one background-color XML changed, nothing else touched.

**Latest commit:** `d50e9f4` (branded icons/splash) on `main`.

**No app source code was touched this session** — `src/` and `api/` are unchanged, line counts identical to prior sessions.

## Session 29 — home screen nutrition card overclaimed

Bryant flagged the "Nutrition today" card on the home screen: once you'd logged anything at all, it said "All meals logged today — Great job hitting your nutrition targets," even mid-day and even if calories logged were nowhere near the goal. Confirmed in code (`Morphiq.jsx`, `HomeDashboardScreen`): `nextMeal` only ever checks whether the day's log has any entries at all (`saved.length === 0`), never actually compares calories against `calGoal`. The wording claimed something the code never verified.

**Fix (commit `51885a3`):** copy-only change. "All meals logged today" → "Logged today"; "Great job hitting your nutrition targets." → "Add more anytime — every meal counts toward today's goal." No logic changed — still shows once anything's been logged, same as before, just doesn't overclaim completion or goal-hitting. Bryant reviewed and approved the exact wording before it shipped.

## Session 28 — workout streak calendar showed nothing despite real data

Bryant reported the Progress screen's "Workout streak" grid had the M-T-W-T-F-S-S header row but every cell looked empty, despite him having real logged workout history. Asked whether the underlying data was even real.

**Verified the data first:** queried `workout_logs` directly for Bryant's own profile -- genuine logged sets going back to late June, including that same day. Not test/dummy data. This was a pure display bug.

**Root cause, found in `StreakCalendar` (`shared.jsx`):** each grid cell computed its date with `cell.toISOString().slice(0,10)` -- which reads the UTC calendar date, not the member's local date. `workout_date` in the database is written via `localDateStr()` (actual local date -- see the log-set save in `shared.jsx`). The two can disagree by a full day: any time local evening hours have already rolled past UTC midnight (roughly 5pm PDT / 8pm EDT onward), every cell's computed date was one day off from what's actually stored, so `dateSet.has(iso)` almost never matched and real workout days never lit up. This is the exact bug `localDateStr()`'s own comment already documents finding and fixing once before, for the meal-tracking day rollover -- just never applied to this second, separate piece of code that had the same mistake.

**Fix (commit `bbcd795`):** one line, `cell.toISOString().slice(0,10)` → `localDateStr(cell)`, plus a comment explaining why so this doesn't drift back apart from the already-correct version elsewhere. Net +11 lines (comment only).

**Verified live, not just by reading code:** inserted one real test row for today via SQL on the WarmupTest account, confirmed it lit up correctly post-deploy, then discovered (after first querying with the wrong id column and getting a false "no data" read) that WarmupTest actually already had real historical workout dates going back to July that the grid was silently failing to show -- all of them lit up correctly once the fix deployed, exactly matching the database. Removed the one test-inserted row afterward; WarmupTest's own genuine historical data was left untouched.

**No other files touched this session.** Line counts unchanged except `shared.jsx` (+11, comment-only besides the one-line fix).

## Session 27 — live bug report: day-conflict/readiness screen redesigned, loading-screen wordmark fixed

Bryant reported two things live, from actually using the app, not from code review: (1) picking a different workout day while another day was left unfinished let him tap through without ever answering "how are you feeling today," and (2) the loading screen still wasn't showing his real logo despite the demo-gym branding work done earlier.

**Bug 1 — day-conflict banner stacked on top of the readiness check-in.** Traced the exact repro Bryant described (start Day A, back out unfinished, pick Day B, hit the conflict prompt) live on the WarmupTest test account, not just by reading code. Confirmed the underlying resume/day-swap logic was already correct -- "Continue" and "Start [new day]" both landed on the right day with the right exercises, nothing was silently corrupted. The real problem, which Bryant correctly diagnosed after I proposed a weaker band-aid (a tap-cooldown delay) and he pushed back: the conflict banner and the readiness card were two separate decisions rendered stacked in the same screen. Dismissing the banner instantly reflowed the readiness buttons into the same on-screen position, so a reflexive second tap right after choosing Continue/Start could land on Rough/OK/Great before it was consciously seen or chosen.

**Fix (commit `951a823`):** the day-conflict prompt is now its own full screen (`WorkoutScreen.jsx`) -- resolving which day to do is a separate, deliberate step from anything else, exactly like every other transition in the phase machine. Only after `continueOldWorkout()`/`startNewWorkout()` clears the conflict does the normal warm-up/readiness/active/cooldown flow render, one screen at a time, same as starting any other day. Removed the old shared `dayConflictBanner` snippet that had been inlined into four separate phase branches. Net +7 lines. Verified: `npm run build` clean before and after, then re-tested the exact same live repro on WarmupTest post-deploy -- conflict now shows alone, resolving it transitions cleanly to warm-up/readiness with nothing left over. Test data (workout_progress, both Supabase and localStorage) cleaned up afterward both times.

**Bug 2 — loading screen wordmark.** Bryant's real complaint: the splash was showing plain text ("HYPERGENTIQ GYM" in the browser's default serif font, not the app's real font) instead of an actual logo image, and after we found a logo file for his own gym in the database, it still wasn't showing his actual two-tone wordmark. Root cause had two layers: (1) the gym-branding fetch is deliberately fire-and-forget and can resolve after the screen has already moved on from "loading" to "home," so the splash frequently shows its pre-fetch default state regardless of what's in the database; (2) whatever image was uploaded to demo-gym's `logo_url` wasn't rendering as Bryant's actual wordmark (network restrictions in this sandbox meant it couldn't be inspected directly to confirm why). Bryant clarified he specifically meant the two-tone wordmark logo (gray "hypergentiq" + blue "IQ") -- the same mark already used elsewhere in the app as the inline SVG inside `PoweredByHypergentiq` (`shared.jsx`), not `public/logo512.png` (confirmed by viewing it -- that file is a single-color heartbeat/pulse icon mark, a plausible app-icon symbol but not the wordmark, and NOT what was used for the loading screen).

**Fix (commit `69a8c59`, `Morphiq.jsx`):** `LoadingScreen` now renders the real compiled-in wordmark (`<PoweredByHypergentiq hideLabel logoHeight="42px" />` -- pure inline SVG, no network fetch, so it can never race against the branding load or fail to load) whenever the account is recognizably Hypergentiq's own (no `gymId` yet, or `gymId === "demo-gym"`) and has no gym-specific logo image set. A real third-party gym with no logo uploaded still only ever sees its own plain gym name -- the white-label protection from earlier sessions is untouched; this only changes the fallback for Hypergentiq's own account. Verified live post-deploy: reloaded the splash and the actual two-tone "hypergentIQ" mark rendered correctly.

**Flagged, not changed:** the Capacitor native app icons/splash screens branded last session use `public/logo512.png` (the heartbeat/pulse symbol), not the wordmark -- that's very likely correct as-is, since a wide text wordmark doesn't work well shrunk into a small square app icon (most apps use a compact symbol mark for the icon and a wordmark for text/splash contexts). Not changed without confirming that's actually the intended app-icon symbol -- flagging it here rather than assuming.

**No app source lines changed beyond the two fixes above.** Current line counts: `WorkoutScreen.jsx` 2,718 (+7 from the day-conflict fix), `Morphiq.jsx` 1,596 (+10 from the wordmark fix, net of the old comment being trimmed). Both still well under the 3,800 hard limit.

## Session 25 — Capacitor groundwork (native android/ and ios/ projects added)

Bryant asked to start on the Capacitor step of the App Store roadmap, with a heads-up that his session budget was nearly out — so this was scoped to one clean, safely-committable chunk rather than the full multi-step Capacitor pipeline.

**What was built:**
- Added `@capacitor/core`, `@capacitor/android`, `@capacitor/ios` as real dependencies and `@capacitor/cli` as a dev dependency in `package.json` (all pinned to the current latest, 8.5.0).
- Added `capacitor.config.json` at the repo root — app ID `com.hypergentiq.app`, app name "Hypergentiq", `webDir` set to `build` (the existing Create React App output folder, no build config changes needed), background color matched to the app's dark theme (`#121316`).
- Ran `npx cap add android` and `npx cap add ios` — this generated two full native project folders, `android/` (a real Android Studio/Gradle project) and `ios/` (a real Xcode project, using Capacitor 8's newer Swift Package Manager setup — no CocoaPods dependency, which matters because CocoaPods can only run on a Mac and this sandbox is Linux).
- Ran `npx cap sync` so both native projects have the current built web app copied in as their starting content.
- Added Capacitor-specific entries to `.gitignore` (local Android Studio files, Xcode user state, build output folders) so future sessions don't accidentally commit machine-specific junk.
- Added three convenience scripts to `package.json`: `npm run cap:sync`, `npm run cap:android`, `npm run cap:ios` (each rebuilds the web app, syncs it into the native project, and opens the native IDE — the last step, `cap open`, will only work on a machine that actually has Android Studio or Xcode installed).

**Verified this session:** `npm run build` succeeded cleanly both before and after the dependency changes (only pre-existing lint warnings, no new errors). `npx cap doctor` confirmed both platforms are correctly wired up — "Android looking great," iOS reported "Xcode is not installed" which is expected and correct for this Linux sandbox, not a problem with the setup itself. Diff reviewed before pushing: `package.json`/`package-lock.json` changes are exactly the four new dependencies plus the three new scripts, nothing else touched.

**What this does NOT mean yet:** the native projects exist as real, valid starting points, but nobody has actually opened them in Android Studio or Xcode and built a real app on a device or emulator yet. That's the next concrete step whenever Bryant is ready to continue — Android can be done on a normal Windows PC with Android Studio installed; iOS genuinely needs a Mac (or a cloud Mac build service), per the standing goal's step 5.

**No app source code was touched this session** — `src/` and `api/` are unchanged, so the file line counts below are identical to Session 23/24's numbers.

**Latest commit:** `a3461c7` (Capacitor groundwork) on `main`.

## Session 23 — what got built this session

**Daily readiness check-in.** Commit `ba7a3bd` (feature), commit `1a07899` (bug fix found during live testing). The second of the two remaining items from Session 20's competitive research (plate-math breakdown shipped Session 22; the staleness audit is still open, now first on the punch list).

- `shared.jsx`: one new export, `applyReadinessToWeight(weight, readiness, increment)` — a simple multiplier (`rough: 0.9`, `ok: 1`, `great: 1.05`) rounded to the nearest weight increment with a floor at one increment. Deliberately applies only to the *display* weight of working sets, never warm-ups and never the underlying plan/progression logic, so a rough day nudges what's shown on screen without corrupting the app's actual progression history.
- `WorkoutScreen.jsx`: a new "readiness" phase inserted into the existing phase state machine, between the warm-up phase and the first working set — a one-tap Rough / OK / Great check-in screen. The choice is persisted the same way as everything else in the phase machine (both `localStorage` and Supabase `workout_progress`), so it survives a page reload without re-prompting. The working-set weight tile's caption line was extended to say "Lightened today — you checked in rough" or "Bumped up today — you checked in great" when the readiness adjustment changed the number, plain "Today's target" when it didn't (OK, or plate-math-only with no readiness effect).

**Live-verified in Chrome this session**, same test-account/SQL-staging method as prior sessions (`WarmupTest` profile, direct Supabase edits to set up a working weight, click through the real deployed app):
- Rough → 200 lb working set displayed as 180 lb, caption read "Lightened today — you checked in rough," plate math recalculated correctly for 180.
- Great → same 200 lb base displayed as 210 lb, caption "Bumped up today — you checked in great," plate math correct for 210.
- OK → unchanged at 200 lb, plain "Today's target" caption, no readiness language.
- Reload-persistence confirmed: after choosing a readiness level, reloading the page resumed at the correct phase with the same choice already applied — did not re-prompt.

**Real bug found and fixed during this testing pass.** `exercises[exIdx]` had no bounds-checking, unlike `setIdx` which was already clamped via `safeSetIdx = Math.min(setIdx, totalSetsInPlan - 1)`. Stale saved progress pointing past the end of a since-changed exercises array (this surfaced from leftover `localStorage` state from an earlier test session — see Technical notes) crashed the whole workout screen with `TypeError: Cannot read properties of undefined (reading 'warmupSets')`. Fixed with the same clamp pattern already established for `setIdx`: added `const safeExIdx = Math.min(exIdx, exercises.length - 1)` and used it everywhere `ex`/`nextEx`/the "after that" preview exercise are read. This is a genuine defensive-coding gap that could in principle affect a real member (any time a plan is regenerated with fewer exercises than a stale in-progress session expected), not just a testing artifact — worth having fixed regardless of how it was found. Commit `1a07899`. Verified via `esbuild` syntax check and a reviewed diff (net +6 lines) before pushing.

**Minor known gap found, not fixed — low priority.** The "Up next" / "After that" rest-screen preview cards show the plan's raw, unadjusted weight (e.g. 200) rather than the readiness-adjusted weight (e.g. 210) a member will actually see once they get there. Only the main active-set screen's weight tile was wired to the readiness adjustment this session; the preview cards read a different, earlier computation that wasn't touched. Cosmetic/informational only — the actual working weight used and logged is correct, it's only the forward-looking preview number that's stale. Worth a quick follow-up pass next time this file is touched, not urgent enough to justify a separate session on its own.

**Test-data cleanup performed after verification:** stray `workout_logs` rows created during testing were identified by exercise name and current-date and deleted, `WarmupTest`'s exercise/plan data was restored, `workout_progress` was nulled in Supabase, and `localStorage` was cleared in the browser before closing the tab.

## Session 23 — AI plan staleness audit (code-review verification, real issue found)

The last remaining item from Session 20's competitive research. JuggernautAI's #1 complaint in 2026 reviews was auto-programming settling into repetitive cycles over time — the question was whether Hypergentiq's per-day AI plan variation (shipped Session 15) actually stays fresh over a longer timeline, or quietly repeats the same exercises forever once the initial plan is built.

**Method:** traced `buildPlan()` and `progressPlan()` (`shared.jsx`) end to end by hand rather than running a full simulated-timeline harness — the exercise-selection logic turned out to be a small number of clean boolean gates, not numeric edge cases, so the answer was conclusive from direct code reading without needing to build a simulation script.

**What was confirmed working:** `buildPlan()` correctly builds a real, distinct exercise list per training day (Push/Pull/Legs or Upper/Lower, depending on `daysPerWeek`) — this was Session 15's fix and it still holds. Within a week, Push day never shows a squat and Legs day never shows a bench press.

**The real finding:** week-over-week, after the initial plan is built, exercise *selection* only ever changes for one narrow user segment — members whose `trainingHistory` resolves to the `"experienced"` tier AND whose age is under 40. For that segment, a data-driven deload (or, worst case, a calendar fallback that's guaranteed to fire by week 8) flips every exercise to its single paired "variation" movement, then back, each time a deload triggers — real rotation, but only ever a 2-way alternation between one primary and one variation per slot (a known, already-documented Session 15 library limitation, not new).

**For every other segment — beginners, "some" training history, "returning," and anyone 40 or older, regardless of experience — exercise selection never changes again after the plan is first built.** `progressPlan()`'s deload/variation logic is gated entirely behind `isExperienced && !isOver40`; every other combination hits the `{ shouldDeload: false, reason: "not_eligible" }` fallback with no substitute rotation mechanism anywhere else in the file. Week 1's exercise list is byte-for-byte week 52's exercise list for these members — only the weight and rep numbers move. This is worth flagging clearly: Hypergentiq's stated target user is "busy beginners," and beginners (`trainingHistory === "new"`) are the exact segment with zero exercise rotation, ever. This is precisely the pattern JuggernautAI's reviewers complained about, not a hypothetical.

**Not fixed this session — this is a product/scope decision, not a quick bug fix**, consistent with Bryant's standing instruction to confirm any real change with him before writing it. A fix would mean either building out real per-exercise variation pools for every equipment type (the library currently has exactly one `variation` per slot, by design, per Session 15) or adding a separate non-deload-linked rotation schedule for the excluded segments — both are real feature work, not a one-line patch. Flagged as the new top punch-list item pending Bryant's direction on scope.

## Session 23 — plan-staleness gap fixed (age-40 exclusion removed, research-backed beginner runway added)

Bryant reviewed the staleness audit finding and pushed back on the age-40 exclusion specifically: no reason someone over 40 should be locked out of exercise variety forever, and if anything the opposite. Asked for a second pass researching how top fitness apps (Fitbod, JuggernautAI) and the periodization/motor-learning literature actually handle exercise rotation timing, then to implement whatever that research supported.

**Research findings:** neither Fitbod nor JuggernautAI gate exercise rotation by age anywhere — Fitbod rotates continuously based on a "variability" setting plus logged preferences/history, JuggernautAI's exercise selection is driven by identifying individual weak points. What both tie rotation cadence to is training experience. Separately, the injury-prevention literature points the opposite direction from the old code's assumption: older adults have naturally lower movement-coordination variability day to day, which raises (not lowers) the risk of overuse injury from repeating one exact resistance-training pattern — so purposeful variation is arguably more valuable for older lifters, not something to withhold from them. On beginner pacing specifically, strength-coaching sources converge on 4-6 weeks of consistent exercises before introducing variation, to let the nervous system groove a stable motor pattern first (novice linear-progression phases run long, but the "add a couple of new exercises" guidance clusters at 4-6 weeks).

**What changed in `progressPlan()` (`shared.jsx`, commit `4a2a395`):** the `isOver40` check was deleted from both the deload-eligibility gate and the post-deload exercise-swap gate — age no longer affects whether or when someone's exercises rotate anywhere in this file. Every experience tier is now eligible for the same plateau-driven deload/rotation cycle that only "experienced" members got before. A true beginner (`trainingHistory === "new"`) gets a 6-week floor before their first plateau check can fire (`minWeeksSinceLastDeload: 6`, the upper end of the research-backed 4-6 week runway, favoring technique-building since this is a coaching app for people learning the movements); every other tier keeps the existing 3-week floor unchanged. Nothing about *how* a deload/rotation is judged changed (still the same plateau-detection majority-rule logic from Session 11) — only *who's eligible* and *how soon a beginner's first one can trigger*.

**Verification done this session:** `esbuild` syntax check passed clean. Diff reviewed line-by-line (net +27 lines, entirely the age-40 removal plus explanatory comments and the one new `minWeeksSinceLastDeload` line — no unrelated changes). Given a real multi-week live walkthrough isn't practical to run in one sitting, verified the actual logic change by extracting the real, pushed `shouldTriggerDeloadFromPlateau()` function (not a rewritten copy — same method Session 15 used to verify `buildPlan()`) into a standalone Node script and running it against synthetic plateaued workout logs: confirmed a beginner's deload/rotation check correctly refuses to fire at week 4 (`too_soon_since_last_deload`) and correctly fires at week 7 (`plateau_detected`) against identical data, and confirmed a non-beginner still uses the original 3-week floor unchanged (blocked at week 2, fires at week 4). All four cases matched the intended behavior exactly.

**Still open:** this fixes *eligibility and pacing* — it does not expand the exercise variety pool itself. Every rotation is still a binary swap between one primary exercise and its single paired "variation" (the Session 15 library limitation noted in the audit above). A member who rotates will now actually get that swap regardless of age or tier, but the swap itself is still just two states alternating, not a larger rotating pool. That's still a real feature-scope item if Bryant wants deeper variety later, not something this fix addresses.

## Files touched this session (final line counts)

- `src/shared.jsx`: 3,065 → 3,108 (+43: +24 readiness feature, +19 age-40 exclusion removal/beginner runway)
- `src/WorkoutScreen.jsx`: 2,628 → 2,711 (+83 net: +77 readiness feature, +6 exIdx bug fix)

All files, current full line counts:

| File | Lines |
| --- | --- |
| src/shared.jsx | 3,108 |
| src/WorkoutScreen.jsx | 2,711 |
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

`shared.jsx` (3,108) and `WorkoutScreen.jsx` (2,711) are both well past the 2,000-line soft target and `WorkoutScreen.jsx` in particular is creeping toward the 3,800-line hard limit faster than `shared.jsx` is. Bryant raised this concern directly this session and asked to defer any split for now (not a housekeeping session) — explicitly hold off starting a split until he asks, but flag it again if `WorkoutScreen.jsx` crosses roughly 3,000 lines.

## Latest commit

`51885a3` (nutrition card copy fix) on `main`. Also recent: `bbcd795` (streak calendar timezone fix), `69a8c59` (loading-screen wordmark), `951a823` (day-conflict screen redesign).

## Confirmed working vs still open

**Verified this session:** both changed files compile clean via `esbuild` (syntax/JSX valid), diffs reviewed, pre-push safety checks passed on both commits.

**Live-verified this session:** the daily readiness check-in (Rough/OK/Great, all three paths, plus reload-persistence) — see above, all correct.

**Verified this session (logic, not live browser):** the age-40 exclusion removal and 6-week beginner runway — confirmed via a Node harness running the real, pushed `shouldTriggerDeloadFromPlateau()` against synthetic plateaued logs (see above). Real live confirmation would require walking a test account through 6+ simulated weeks, impractical in one sitting — worth doing opportunistically if `WarmupTest`'s plan/logs ever get built out that far for other testing.

**Known open item, not urgent:** "Up next"/"After that" preview cards don't reflect the readiness-adjusted weight (see above).

## Punch list, in priority order

**Session 24 code audit note:** Bryant asked to verify all nine items against the actual code before doing more work. Three items turned out to be stale — code for them already shipped in earlier sessions but the punch-list wording hadn't caught up. Corrections are inlined below (FOURTH, SIXTH, SEVENTH); the other six were confirmed genuinely still open.

**FIRST — unblock the privacy policy.** Still the single highest-leverage blocked item — blocks both this punch list and the entire App Store roadmap (STANDING GOAL, step 6). A prior draft Bryant remembered making could not be found anywhere (this repo, HANDOFF.md/MASTER_HANDOFF.md history, or the project's synced docs/files) and is presumed lost. A new draft now exists at `PRIVACY_POLICY_DRAFT.md` in the repo root (also handed to Bryant as a formatted .docx in the same session) -- written from a direct code audit of what the app actually collects, with every fact only Bryant/counsel can supply left as a highlighted placeholder. Real blocker updated: Bryant does not yet have a registered legal business entity for Hypergentiq, so there is no lawyer step to take yet -- this is blocked on business formation, not just "find a lawyer." Once a legal entity exists, resolve the placeholders and send `PRIVACY_POLICY_DRAFT.md` to counsel.

**SECOND — no-blocker App Store groundwork.** **Capacitor is started and the native projects are now branded** (Sessions 25-26): `capacitor.config.json` exists, `@capacitor/core`/`android`/`ios` are real dependencies, both native `android/`/`ios/` projects are scaffolded, and every icon/splash screen in both uses the real Hypergentiq logo instead of Capacitor's generic placeholder (a proper icon-only mark asset would look sharper than the current full-logo crop — noted as a design follow-up, not a code gap). **PWA service worker added this session** (`public/service-worker.js` + `src/serviceWorkerRegistration.js`, registered from `src/index.js`): deliberately network-first (never precache-everything) to avoid the classic bug where members get stuck on an old cached version after a deploy; explicitly skips `/api/` and cross-origin requests so no dynamic/user data is ever cached as static. Verified with a real `npm install` + `CI=false npm run build` in-session, not just a syntax check -- build succeeded, service-worker.js landed correctly in the build output. Still open under this item: the Capgo live-update pipeline, and actually opening/building the native projects in Android Studio (doable on Bryant's Windows PC) or Xcode (needs a Mac).

**THIRD — optional completeness check on gym-logo branding** (carried from Session 21): live-test the actual member splash screen (not just the owner preview panel) for a real no-logo gym, if maximum confidence is wanted before considering that feature fully closed out. Confirmed via code audit: the no-logo fallback code itself is already in place (`Morphiq.jsx`, Session 21 — a gym with no logo set falls back to its plain gym name as text). This item was only ever asking for a *live* verification pass, not missing code.

**FOURTH — three product/design items from Session 18, still just discussion, nothing built:** a per-category custom/recurring grocery item that persists (confirmed still open — the grocery list rebuilds fresh from the plan every week in `MealScreen.jsx`, nothing persists a custom item across weeks); whether "Log Cardio" is worth keeping at all (confirmed it's a fully built, actively-used feature end to end — `ProgressScreen.jsx`'s `CardioQuickLog`, `api/parse-cardio.js`, folded into streak/PB calculations in `Morphiq.jsx` — so this is purely a product call now, not a build question); a broader review of what Progress/Nutrition should measure against top fitness apps (still open, no code change either way). ~~The Progress screen's "Workout streak" card (currently shows no real data)~~ — **corrected by Session 24 code audit: this is already wired to real data.** `ProgressScreen.jsx`'s `useRealWorkoutData` gate feeds real Supabase workout dates into `StreakCalendar`; it is not a stub. (Note: the "Body fat est." row a few lines above it in the same Measurements card was a separate, real placeholder-data gap -- fixed same session as this note was corrected: see below.)

**FIFTH — walk a full week on `WarmupTest` (or a fresh test profile) start-to-finish**, carried forward from Session 19/21/22. Not code-verifiable — live-testing item, confirmed still outstanding.

**SIXTH — confirming the warm-up compound/isolation split is sufficient.** Needs a direct decision from Bryant, not code. Code audit clarification: the split itself is already fully built (`COMPOUND_LIFT_PATTERN` regex in `shared.jsx`, separate rep schemes/rest/warm-up ramps for compound vs. isolation, well-commented). Nothing missing in code — this item is purely waiting on Bryant's sign-off that the existing implementation is sufficient.

**SEVENTH — exercise diagrams/animations** — deferred, needs its own dedicated model/library before starting. Confirmed via code audit: no video/gif/diagram exercise-demonstration content exists anywhere in the app (only unrelated CSS loading/pulse animations). ~~Kettlebell weight-increment refinement~~ — **corrected by Session 24 code audit: this was already done in Session 16.** `getWeightIncrement()` in `shared.jsx` already returns a real 9lb kettlebell ladder (grounded in the app's own 15→25→35→44→53 `STARTING_WEIGHTS` spacing) instead of guessing a flat 5lb barbell-style jump. Well-commented, not a stub.

**EIGHTH — personal trainer market segment** (from Session 21, see DECISIONS.md). Worth a real discussion before any building — pricing, positioning, and go-to-market all need answers first. Confirmed via code audit: `DECISIONS.md` explicitly logs this as "flagged for later, not started"; no solo pricing tier, no build-your-own-workout override exists in code.

**NINTH — expand exercise variety beyond the binary primary/variation swap** (new, see the rotation fix above). Every rotation-eligible member (now everyone, paced by experience tier) still only ever alternates between exactly one primary exercise and one paired variation per slot — real deeper variety would mean building out proper variation pools per equipment/pattern. Not urgent, but the natural next step if Bryant wants richer rotation later. Confirmed via code audit: every exercise slot in `shared.jsx` still carries exactly one `.variation` field — genuinely unaddressed.

**LOWER PRIORITY / OPS.** `WorkoutScreen.jsx` at 2,711 lines and `shared.jsx` at 3,108 lines — Bryant is aware and wants to defer a split; do not start one without asking again. The "Up next"/"After that" preview cards not reflecting readiness adjustment (see above). The one unidentified blank-named test profile row in Supabase. Naming cleanup (GitHub repo, live URL, `Morphiq.jsx`/`function Morphiq()` still carry the retired placeholder name — cosmetic only). ~~The "Body fat est." row on the Progress screen's Measurements card is still hardcoded to "21%" regardless of the member's real data (found during the Session 24 audit, not previously tracked).~~ **Fixed:** there's no real body-fat data source anywhere in the app (no input field, no log, no column), so rather than invent a formula, it now honestly reads "Not tracked yet" in a muted style instead of a fake number.

## Technical notes carried forward

**MANDATORY fetch method — git clone only.** `api.github.com` and direct `curl`/Python HTTP calls to `github.com`/`raw.githubusercontent.com` are blocked outright by this environment's outbound proxy allowlist. The web-fetch tool's access to `raw.githubusercontent.com` can also silently return **stale cached content** instead of erroring — confirmed in Session 22 (served an 11-session-old `HANDOFF.md`). `git clone`/`git push` over authenticated HTTPS from a plain scratch directory remains the only fetch method to trust by default.

**Client-side progress persistence has TWO layers, both must be cleared for a clean test reset.** Learned the hard way this session: a stale `localStorage` key (`morphiq_workout_progress_<supabase_user_id>`) left over from an *earlier* test session survived a cleanup pass that only nulled the Supabase `workout_progress` column, and caused a crash on the next test run (the same crash the `exIdx` bug fix above addresses defensively, but the stale state was the trigger). Always clear both the Supabase column and the browser's `localStorage` together, not just one.

**Native `window.confirm()`/`alert()`/`prompt()` dialogs block Claude-in-Chrome browser automation entirely.** Any click that triggers one hangs all subsequent tool calls (click, screenshot, get_page_text) with 30-45s timeouts, because the dialog blocks the page's JS thread and the automation's synchronous script injection can't reach past it. No workaround found — key presses sent via the automation tools don't reach native dialogs either. If a live-test click is expected to trigger a `window.confirm()` (e.g. the "Start over from set 1" button in `WorkoutScreen.jsx`), either avoid that click during automated testing or be ready to close the stuck tab and open a fresh one to recover. This is a testing-tool limitation, not an app bug.

`profiles.supabase_user_id` is the auth link, `profiles.id` is the FK used everywhere else. Fire-and-forget `.catch(() => {})` pattern for all new Supabase writes. `AuthScreen` lives in `Morphiq.jsx`, not `shared.jsx`. The `exercises` table (91 rows: id, name, muscle_group, pattern, equipment, difficulty, variation_of, is_active) is still just a reference/classification table, not wired into live plan generation.

**No live Node/npm toolchain in this sandbox by default** — `node_modules` isn't checked into the repo. `esbuild` (installed standalone via `npm install --no-save esbuild --prefix /tmp/esbuild-check`) remains the fast syntax/JSX sanity check used in place of a full `react-scripts build`.

## Session 23 close-out summary

**Everything built/changed this session:** plate-math breakdown was Session 22 — this session started with (1) the daily readiness check-in (Rough/OK/Great, `shared.jsx` + `WorkoutScreen.jsx`), (2) a real crash-bug fix found while testing it (`exIdx` bounds-check), (3) the AI plan-staleness audit (code-review verification, no code), and (4) a real fix in response to that audit — removed the age-40 exclusion from exercise rotation and added a research-backed 6-week beginner runway, so rotation eligibility is now paced by training experience only, never age.

**Confirmed working:** readiness check-in — live-verified in Chrome (Rough/OK/Great, plate-math integration, reload-persistence). exIdx crash fix — `esbuild` + diff review. Age-40 removal / beginner runway — logic-verified via a standalone Node harness against the real, pushed `shouldTriggerDeloadFromPlateau()` function (beginner correctly blocked at week 4 / fires at week 7; non-beginner unchanged at the 3-week floor).

**Still needs testing:** a real live multi-week walkthrough of the age-40/beginner-runway rotation fix (not practical to run in one sitting — would need `WarmupTest` or a fresh profile carried through 6+ simulated weeks with plateaued logs). The "Up next"/"After that" preview cards still show the pre-readiness-adjustment weight (cosmetic, low priority). The exIdx fix and readiness feature are otherwise fully verified.

**Next priority task:** punch list FIRST is now the privacy policy (blocked on Bryant/a lawyer, not actionable by Claude). The next actually-startable item is SECOND — no-blocker App Store/Capacitor groundwork (PWA manifest/service-worker gaps, then Capacitor install) — or Bryant may want to talk through the NINTH item (deeper exercise-variety pools beyond the binary primary/variation swap) before that's built.

**Final line counts, all files:**

| File | Lines |
| --- | --- |
| src/shared.jsx | 3,108 |
| src/WorkoutScreen.jsx | 2,711 |
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

All files well under the 3,800-line hard limit. `shared.jsx` and `WorkoutScreen.jsx` remain past the 2,000-line soft target — split still deferred at Bryant's request, flag again if `WorkoutScreen.jsx` crosses ~3,000 lines.

**Latest commit:** `897fb7b` on `main`.

## Paste this at the start of your next session

Fetch HANDOFF.md and all src/ and api/ files fresh via `git clone` (never `raw.githubusercontent.com` — can silently serve stale cached content, confirmed Session 22). Report every file's line count before doing anything else; stop and propose a split if any file exceeds 3,800 lines (none do currently — `shared.jsx` is the largest at 3,108).

Remind Bryant of the next priority task: the privacy policy is still the highest-leverage blocked item (needs him to contact a lawyer — not actionable by Claude). Bryant was asked (end of Session 27) to pick a next no-Mac-needed priority from: finishing the PWA service-worker gap, drafting a privacy policy for lawyer review, store listing assets/screenshots, or Capgo live-update setup -- he hasn't picked yet, got pulled into two more live bug reports instead (Session 28: streak calendar; Session 27: day-conflict screen + loading wordmark). That question is still open for next session. Capacitor groundwork is started and branded (Sessions 25-26) — `android/` and `ios/` native projects exist, are committed, and use the pulse/heartbeat icon mark (`logo512.png`) for icons/splash, but nobody has opened/built them yet; next concrete step is opening `android/` in Android Studio on his Windows PC to confirm it builds (iOS needs a Mac, not attempted). PWA manifest/service-worker gaps are still open too. Flagged, not resolved: confirm with Bryant whether the pulse/heartbeat icon mark is actually the intended app-icon symbol before touching the Capacitor icons again. He may also want to discuss punch-list item NINTH — building real exercise-variety pools beyond the current one-primary/one-variation-per-slot swap — before more rotation work happens.

Current state: daily readiness check-in and the plate-math breakdown are both shipped and live-verified. The AI plan-staleness gap Bryant flagged (age-40 exclusion from exercise rotation) is fixed and logic-verified — every experience tier now rotates, beginners get a 6-week runway first, age plays no role anywhere in the rotation/deload gate. A minor cosmetic gap remains: the "Up next"/"After that" rest-screen preview cards don't reflect the readiness-adjusted weight yet. Capacitor is installed, configured, and both native projects are scaffolded, committed, and branded with the pulse/heartbeat icon mark for icons/splash screens (Sessions 25-26). The day-conflict/unfinished-workout prompt now gets its own screen instead of stacking over the readiness check-in, and the loading screen shows the real two-tone wordmark for Hypergentiq's own account (Session 27). The Progress screen's workout streak calendar now correctly lights up real logged workout days -- it was comparing UTC dates against locally-stored dates and so almost always looked empty regardless of real activity (Session 28). All three of the last sessions were live bug reports from Bryant using the real app, not planned roadmap work, and all three were live-verified fixed post-deploy on the WarmupTest account with test data cleaned up after.
