# Hypergentiq — Session 37 master handoff

This file is the handoff. At the start of every session, fetch this file from the repo along with the src/ and api/ files — it replaces pasting a handoff into chat by hand. **MANDATORY fetch method — git clone only, see Technical notes below.**

## STANDING GOAL — App Store + Google Play submission roadmap (carry forward every session, do not delete until fully checked off)

No change this session — untouched. Step list: (1) fix PWA gaps — done, Session 30, (2) add Capacitor + generate native projects — done (Session 25), still not opened/built in Android Studio or Xcode, (3) set up Capgo live-update pipeline — still open, (4) Android path (Bryant needs a Google Play Console account, $25), (5) iOS path (needs a Mac on macOS Sequoia 15.6+ for Xcode 26, or a cloud Mac build service), (6) privacy policy — hard gate for both stores, blocked on Bryant forming a real legal business entity (draft exists, see punch list FIRST), (7) store listing assets (icon done, need screenshots + descriptions), (8) confirm no Apple IAP conflict, (9) submit.

## Session 36 — copy nits, CustomPlanScreen cardio, cardio visibility pass, Progress screen restructure, Nutrition tab

Five pieces of work, all shipped, none live-tested yet in the running app (this session had no browser/device access — every change was verified with esbuild syntax checks on each touched file plus a full app bundle check from `src/index.js`, which catches cross-file import/reference errors but not runtime/UI behavior).

**1. Two copy nits (Session 35's THIRD priority item), commit `d4218c0`.** Onboarding's cardio-days helper text now says "Home or Progress" instead of just "Progress" (cardio logging is also reachable from Home now). The lose_fat plan-build confirmation message now credits cardio days alongside lifting days when `cardioDaysPerWeek > 0`, instead of only ever mentioning lifting days regardless of plan.

**2. CustomPlanScreen cardio-day scheduling (Session 35's FOURTH priority item), commit `b33e277`.** Hand-built plans can now add 0-4 dedicated cardio days/week via a new wizard step (dial picker, mirrors OnboardingScreen's cardio question) between the days-per-week and rest-preference steps. Goal-agnostic by design — unlike the AI path (`buildPlan()`, still lose_fat-only), any custom-plan member can add cardio days. The even-distribution interleave math was pulled out of `buildPlan()` into a new shared `interleaveCardioDays()` (`shared.jsx`) so both paths call one copy instead of two. Wizard renumbered: steps 3-5 shifted to 4-6 (rest/exercises/review), total step count 6→7. Review screen shows a cardio summary line when cardio days are added.

**3. Cardio visibility pass, commit `939db84`.** Bryant felt the Home screen's "Log cardio" row blended in next to "Start workout." Shown a 3-way visual mockup before writing code; picked the accent-tinted middle ground (tinted background/border, solid-accent icon circle, bolder 14px label) over matching Start Workout's solid fill exactly — two identical solid buttons would compete as "the" primary action for the day. Also: both cardio logging paths (live timer in `CardioScreen.jsx`, manual quick-log `CardioQuickLog` in `shared.jsx`) now show real minutes + calories in their post-save confirmation instead of just a checkmark. New `CardioWeeklyChart` (`shared.jsx`) — 6-week cardio-minutes bar chart — added to Progress's cardio section (at the time, still a Workouts subsection). Recent-cardio list expanded from 5 to 12 entries.

**4. Progress screen restructured, commit `d6a23f1`.** Bryant asked for competitive research before deciding the shape. Findings applied (full detail in DECISIONS.md, Aug 15 continued section): Fitbod/Hevy/GainFrame give body comp and strength progress their own focused views rather than one broad tab; Google Health's redesign crammed more onto fewer screens and drew a 65x spike in negative layout reviews; Strong keeps PRs findable without giving them equal nav billing. Cardio promoted from a buried Workouts subsection to its own top-level tab (Body / Workouts / Cardio, was Body / Workouts / Bests). "Bests" is no longer a tab — its full content (current-bests list with expandable strength charts, volume-this-month bars) now lives as a "Personal bests" section at the bottom of the Workouts tab. Nothing was deleted, only relocated.

**5. Nutrition tab, commit `2b662fb`.** Fourth Progress tab. Bryant explicitly asked for the scope to be decided from research into top apps and their reviews, not picked directly. Findings applied: MacroFactor (~4.8/19,500 App Store ratings, repeatedly named best-in-class 2026) combines trend charts + adherence percentages together, not one or the other; MyFitnessPal's complaints trace to paywalls and extra-click redesigns, not to that combination. Built the fuller shape (matches the Cardio tab's own pattern): avg-calories-this-week and days-hit-protein-target stat cards, a 14-day calorie trend chart with a dashed target line (new `NutritionTrendChart`, `shared.jsx`), and a recent-days list. Required one new backend piece: `sb.getMealLogs()` (`shared.jsx`), date-bounded (35-day window) since a member can log several food entries a day — wired into `loadHistoricalData()` (`Morphiq.jsx`) alongside the existing workout/weight/cardio fetches, exposed as `historicalData.mealLogs`.

## Session 37 — Cardio screen redesign: timer/calorie pairing, screen fill, prominent stop confirmation

Bryant's ask, working from the live app on his phone: on the live cardio-timer screen (`CardioScreen.jsx`), the timer felt too small, the calorie estimate looked like an afterthought next to it instead of an equally important number, there was noticeable black space below the "Powered by Hypergentiq" footer on his phone screen, and the "session logged" confirmation after tapping Stop was a small, easy-to-miss bar buried at the bottom.

**What changed, commit `7bc49b6`.** Four things, all in the `mode === "live" && activity` view of `CardioScreen.jsx`:
1. Timer and calorie estimate are now a single paired stat card (`#0A1628` background, matches the app's existing dark-card style) with a vertical divider -- both numbers at the same 54px/700-weight size, tabular-nums, timer on the left labeled "Time," calories on the right labeled "Calories" with a small flame icon. Replaces the old setup where the timer stood alone at 44px and calories were a small 22px line inside a separate "Estimated burn" box.
2. That stat card sits inside a flex container (`flex: 1, justifyContent: 'center'`) inside an outer wrapper with `minHeight: calc(100dvh - 230px)`, so the live-timer view now stretches to fill the available phone-screen height between the header and the bottom nav instead of leaving it short.
3. The post-Stop confirmation (activity name + minutes + calories) moved from a small 12px-font bar squeezed below the Stop button to a large, bordered, accent-colored card (44px checkmark badge, 30px bold numbers) that now appears at the *top* of the activity-picker screen the moment you're taken back to it after stopping -- first thing visible, not last.
4. Start/Stop buttons got a small bump too (padding .85rem→1rem, font 13-14px→14-15px) so they read proportionally with the bigger card above them.

**NOT live-tested this session -- no browser/device access available from this environment.** Verified with `npx esbuild` on the individual file and the full `src/index.js` bundle (catches cross-file reference errors) -- both passed clean, no errors. Bryant was about to live-test on the treadmill right after this ships; next session should confirm his read on it before doing anything further here.

## Files touched this session (final line counts)

**Session 37:**

| File | Before | After |
| --- | --- | --- |
| `src/CardioScreen.jsx` | 231 | 232 |

All other files untouched this session (Session 36's table above this line is historical -- re-fetch fresh via `git clone` for current state of every other file, as always).

**Full current file set (fetched fresh via git clone at the start of Session 37, all well under the 3,800-line hard limit):** `src/shared.jsx` 3,478 (largest, watch this one), `src/WorkoutScreen.jsx` 2,865, `src/Morphiq.jsx` 1,656, `src/MealScreen.jsx` 831, `src/OnboardingScreen.jsx` 622, `src/ProgressScreen.jsx` 613, `src/SuperAdminDashboard.jsx` 343, `src/ChatScreen.jsx` 300, `src/GymSignupScreen.jsx` 269, `src/CardioScreen.jsx` 232, `src/GymOwnerDashboard.jsx` 927. `api/` files are all small (12-259 lines each), none near any size concern.

## Latest commit

`7bc49b6` on `main`. Full commit sequence this session: `7bc49b6` (only commit this session, on top of Session 36's `2b662fb`).

## Confirmed working vs still open

**Verified this session:** every changed file passes an individual `esbuild` syntax check, and the full app bundles cleanly from `src/index.js` (catches cross-file import/reference mistakes — this caught and fixed one real bug mid-session, `interleaveCardioDays()` accidentally being nested inside `buildPlan()` instead of at module scope). Manual code review confirms `CustomPlanScreen`'s wizard step numbering is fully consistent (all 8 steps present, every `setStep()` target verified), and the Progress screen's tab-condition strings (`body`/`workouts`/`cardio`/`nutrition`) each appear exactly once with no leftover `bests` references.

**NOT live-tested this session — no browser/device access available.** Everything below needs a real pass in the running app before being called done:
- The accent-tinted Log cardio button, and both cardio confirmation banners (live timer + manual quick-log) showing real numbers.
- CustomPlanScreen's new cardio wizard step end-to-end — including a plan with 0 cardio days (should behave exactly as before) and a plan with cardio days that outnumber lifting days (edge case where the interleave algorithm could front-load a cardio day as Day 1 — see `interleaveCardioDays()` comment in `shared.jsx`).
- Progress screen: all three existing tabs after the restructure (especially the relocated "Personal bests" section's tap-to-expand strength chart, now nested one level deeper), plus the brand-new Cardio and Nutrition tabs on an account with real logged data.
- The Nutrition tab specifically has never been exercised against real Supabase data — `getMealLogs()` is new code with no live confirmation yet that the date-bucketing produces sane output against actual `meal_logs` rows.

**Session 37 addition -- also not live-tested:** the cardio screen redesign (paired timer/calorie stat card, screen-fill layout, prominent post-Stop confirmation card). Static checks (esbuild individual + full bundle) passed clean; needs a real phone pass, ideally right after this ships since Bryant was mid-session on the treadmill when this was built.

## Punch list, in priority order

**FIRST — unblock the privacy policy.** Unchanged. Blocked on Bryant forming a real legal business entity.

**SECOND — live-test everything from Session 36 AND Session 37.** Top priority — six features/changes now shipped with only static verification (esbuild + bundle check), zero live-testing: Session 36's five items plus Session 37's cardio-screen redesign. See "Confirmed working vs still open" above for the specific list. Do this before starting new feature work.

**THIRD — no-blocker App Store groundwork.** Unchanged. Capacitor scaffolded/branded, PWA service worker shipped but unverified live. Capgo pipeline not started. Android project has never been opened in Android Studio to confirm it builds.

**FOURTH — the two Session 35 copy nits are now done** (see Session 36 item 1 above) — removed from this list.

**FIFTH — weight-loss/cardio redesign, remaining pieces.** `CustomPlanScreen` cardio support is now done (Session 36 item 2). Still open: wearable sync (Apple HealthKit/Fitbit) remains a deliberately separate, not-yet-scoped future initiative. Voice input on the cardio quick-log and the "Other" activity type haven't been live-tested (lower priority — likely fine, just not click-tested).

**SIXTH through ELEVENTH — unchanged from Session 30/35, still open:** live-test `WarmupTest` full week start-to-finish (partially covered across recent sessions, but not the full original scope — nutrition/rest-timer/stats steps still unverified, and this is now somewhat superseded by the SECOND priority above covering the same account for the newer features); get Bryant's sign-off on the compound/isolation warm-up split; exercise diagrams/animations (deferred); personal trainer market segment (needs its own discussion, see DECISIONS.md Aug 8 2026); expand exercise variety beyond primary/variation binary swap; the weight-loss/cardio redesign's still-undecided open questions from DECISIONS.md Aug 9 2026 that haven't been revisited (whether `lose_fat` should restructure the week itself further, nutrition-screen UI emphasis for that goal specifically).

**LOWER PRIORITY / OPS.** Unchanged: one unidentified blank-named test profile row in Supabase; naming cleanup (GitHub repo, live URL, `Morphiq.jsx`/`function Morphiq()` still carry the retired placeholder name — cosmetic only); WarmupTest's plan is the lose_fat/cardio plan from Session 35's testing — know its current state before reusing it.

## Technical notes carried forward

**MANDATORY fetch method — git clone only.** `api.github.com` and direct HTTP calls to `github.com`/`raw.githubusercontent.com` are blocked by this environment's proxy allowlist; `raw.githubusercontent.com` via web-fetch can also silently serve stale cached content — this happened again at the start of this session (fetched a Session-10-vintage HANDOFF.md and file set via web-fetch before switching to `git clone`, which correctly showed the real Session 35 state). `git clone`/`git push` over authenticated HTTPS from a plain scratch directory (not the mounted Windows output folder) remains the only trusted fetch method.

**When moving a block of JSX/JS into a new location via multi-line string replacement, verify the destination scope, not just that the anchor text matches.** This session's one real bug: `interleaveCardioDays()` was inserted textually before a comment that turned out to be inside `buildPlan()`'s function body (indentation looked top-level; brace nesting was not). The function became invisible outside `buildPlan()`, caught immediately by the full-bundle esbuild check ("not declared in this file") rather than by the individual per-file syntax check, which passed fine since the code was still syntactically valid JS. The full-bundle check earned its place in the verification routine this session specifically because of this — keep running it after any change that adds a new exported helper.

**When cutting and reassembling large JSX blocks (e.g. the Progress screen tab restructure), slice by 1-indexed line number against the original file content in one pass, not via sequential destructive string replacements.** Off-by-one slice boundaries are easy to introduce and easy to catch early with a quick assert-and-print step before writing — worth doing for any restructuring that moves more than roughly 20-30 lines.

**A feature's own onboarding "restart" option is a legitimate, no-setup way to live-test a flow that's otherwise only reachable at first signup.** (Carried forward from Session 35 — still relevant, not exercised this session since no live testing happened at all.)

`profiles.supabase_user_id` is the auth link, `profiles.id` is the FK used everywhere else. Fire-and-forget `.catch(() => {})` pattern for all new Supabase writes — `getMealLogs()` and the `interleaveCardioDays()` helper both follow this where relevant. `AuthScreen` lives in `Morphiq.jsx`, not `shared.jsx`. The `exercises` table is still just a reference/classification table, not wired into live plan generation.

**No live Node/npm toolchain in this sandbox by default.** `esbuild` (installed standalone via `npx --yes esbuild ...`, no persistent install needed) is the fast syntax/JSX sanity check when code changes — used on every touched file this session, individually and via a full-bundle check from `src/index.js` with `react`/`react-dom`/`@sentry/react`/`web-vitals` externalized.

## Session 37 close-out summary

**Everything built/changed this session:** `CardioScreen.jsx` live-timer view redesigned -- timer and calorie estimate merged into one equally-weighted paired stat card (54px, matching size/weight, side by side with a divider), that card's wrapper now fills available phone-screen height instead of leaving black space below the footer, and the post-Stop "session logged" confirmation moved from a small easy-to-miss bar to a large accent-colored card shown front-and-center at the top of the activity-picker screen.

**Confirmed working:** individual-file and full-app-bundle esbuild checks both pass clean, no syntax or cross-file reference errors.

**Still needs testing — nothing from Session 36 or Session 37 has been live-tested in the running app.** This remains the single most important thing for the next session to know.

**Next priority task:** live-test Session 36's five features AND Session 37's cardio-screen redesign (Bryant was about to test the redesign on a treadmill right after this shipped -- check with him first). After that: App Store groundwork (Capacitor Android Studio build check is the next unblocked item), or privacy policy once Bryant has a business entity.

**Final line counts:** see table above — `src/CardioScreen.jsx` now 232 (was 231). `shared.jsx` still largest at 3,478, `WorkoutScreen.jsx` next at 2,865, both well under the 3,800 limit. All other files unchanged from Session 36.

**Latest commit:** `7bc49b6` on `main`.

## Paste this at the start of your next session

Fetch `HANDOFF.md`, `DECISIONS.md`, and all `src/`/`api/` files fresh via `git clone` (never `raw.githubusercontent.com` -- can silently serve stale cached content; `api.github.com` is also blocked in this environment's sandbox -- `git clone`/`git push` over an authenticated HTTPS URL, e.g. `https://<token>@github.com/Luxurydadbot/Morphiq.git`, from a plain scratch directory is the only method confirmed to work). Report every file's line count before doing anything else; none are near the 3,800-line limit (`shared.jsx` is largest at 3,478, `WorkoutScreen.jsx` next at 2,865).

Remind Bryant: Session 36 shipped five things (copy nits, CustomPlanScreen cardio, cardio button/confirmation/chart polish, Progress screen restructure into Body/Workouts/Cardio, Nutrition tab) and Session 37 shipped a cardio-screen visual redesign (paired timer/calorie card, screen-fill layout, prominent stop confirmation) -- **none of it has been live-tested yet**, only static syntax/bundle checks. That's the top priority for the next session before anything new: walk through each feature in the real running app, starting with the Session 37 cardio redesign since Bryant was mid-test on a treadmill when it shipped. After that, the App Store punch list (Capacitor's `android/` project has never been opened in Android Studio) and the privacy policy (blocked on Bryant's business entity) are the standing next chunks of work.
