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

**Live-tested this session, commits `a133b25` and `c8ab3d5`.** After the first version shipped (`7bc49b6`), got Chrome browser access mid-session and tested it live at 390x844 (a standard phone viewport) instead of waiting for Bryant to report back. Caught two real bugs the static esbuild checks couldn't see:
- The live-timer view's `calc(100dvh - 230px)` fill height was miscalibrated -- it overflowed the actual viewport by ~96px, pushing the bottom nav bar off-screen and requiring a scroll to reach it. Fixed by measuring the real DOM (the app's `.mq-shell` root has both its own `padding-bottom: 5.5rem` AND the footer's separate `margin-bottom: 3.5rem` stacking on top of each other -- 144px of reserved space that isn't obvious from reading the JSX alone) and recalibrating to `calc(100dvh - 326px)`, verified against `shell.scrollHeight === shell.clientHeight` (zero overflow) via a JS console check.
- The activity-picker view (before you tap an activity) had the same black-space problem Bryant originally flagged, just not mentioned explicitly -- it wasn't touched in the first version. Fixed the same way: wrapped it in the same fill-height flex treatment, and bumped its activity buttons up slightly (padding, icon size, label size) since they now sit in more breathing room.

End-to-end verified in the browser: picked Treadmill, started the timer, watched calories climb live, hit Stop, and the new confirmation card (checkmark badge, "Treadmill logged", "1 min · ~5 cal") appeared front-and-center above the activity grid exactly as designed -- zero scroll overflow at every step, confirmed via `shell.scrollHeight - shell.clientHeight === 0` on all three screen states (picker, live timer, post-stop confirmation).

## Session 37, part 2 — Progress screen cleanup: drop the top summary stats, trim Body tab, add a Protein card to Nutrition

Second ask this session, working from the live app: the Progress screen had a "Your Progress" title + 3-stat row (Weight change / Week streak / PBs logged) and a "N weigh-ins logged" line sitting ABOVE the Body/Workouts/Cardio/Nutrition tab selector -- Bryant wanted all of that gone so the tab selector itself is the top of the screen, with everything else living inside whichever tab it actually belongs to. He also flagged the Body tab's "Workout streak" calendar as out of place there (it's workout data, not body data) and asked for it removed outright -- Body should only cover body-specific elements. Workouts and Cardio tabs were both confirmed fine as-is, untouched.

**What changed, commit `cb93493`:**
1. Removed the "Your Progress" title, the weigh-ins-logged subtitle, and the 3-card Weight change / Week streak / PBs logged summary row entirely -- the Body/Workouts/Cardio/Nutrition tab bar is now the first thing rendered on the screen.
2. Removed the Body tab's "Workout streak" section (the `StreakCalendar` component + its legend) -- Body tab now only shows the weight-trend chart and the measurements list. `StreakCalendar` import dropped from `ProgressScreen.jsx` since nothing else in the file used it (component itself untouched in `shared.jsx`, still available if needed elsewhere later).
3. Added a Protein card to the Nutrition tab, directly below the existing Calories card, built the same way: a 14-day trend chart against `plan.protein` as the target line, sourced from the same `byDate` buckets the Calories trend and "Recent days" list already use (so all three always agree). Required generalizing `NutritionTrendChart` (`shared.jsx`) with a `valueKey` prop (defaults to `"calories"` so the original caller needs no changes) instead of duplicating the whole chart component for protein.
4. Per a follow-up request mid-session, both the Calories and Protein card headers were changed from a small 10px uppercase caption ("Calories, last 14 days") into an actual focal-point header: a bold 20px "Calories" / "Protein" title with a smaller "Last 14 days" line underneath, so they read as real section headers rather than a caption easy to skim past.

**Live-tested this session, not just static-checked.** Walked all four Progress tabs in Chrome at a phone viewport: Body (weight chart + measurements only, no streak calendar, confirmed), Workouts (unchanged, confirmed), Cardio (unchanged, confirmed), Nutrition (logged a real test meal -- "Grilled Chicken Breast with Rice", 350 cal / 35g protein -- to get past the empty state, then confirmed both the Calories and Protein cards render with the new bold headers, correct target lines, and matching numbers in "Recent days"). Note: that test meal is now real logged data on the account used for testing (the same "W" test account used for the cardio live-test earlier this session) -- harmless, but worth knowing it's there if that account's nutrition history gets reviewed later.

## Session 37, part 3 — Water intake tracking, now saved to Supabase (new water_logs table)

Third ask this session: Bryant asked whether water intake should get the same trend-card treatment as Calories and Protein. Turned out water was localStorage-only the whole time -- today's count, one device, nothing saved past midnight -- unlike calories/protein which already lived in Supabase via meal_logs. Bryant didn't realize this and, once he understood the gap, wanted it fixed: "that's an important metric, especially for things like weight loss and recovery and general well-being."

**Database change -- new `water_logs` table.** This session is also the first time a Supabase MCP connector was connected mid-session (Bryant connected the official Supabase tool after being told the app's own `sb_publishable_...` key can read/write existing tables but can never create new ones -- that's a Postgres/Supabase permissions distinction, not a workaround). With that connected, created `public.water_logs` directly (migration `create_water_logs`): `id` (uuid, `gen_random_uuid()`), `user_id` (uuid, references `profiles(id)`), `amount_oz` (integer), `logged_date` (date, defaults `CURRENT_DATE`), `logged_at` (timestamptz, defaults `now()`) -- same shape as `weight_logs`, same open/permissive RLS policy (`using (true) / with check (true)`, matching every other log table in this app). Ran `get_advisors` (security) after creating it -- no new issues introduced, only pre-existing unrelated ones (a `leads` table RLS gap, a security-definer view, some auth settings) were surfaced.

Chose event-log style (one row per add/remove tap, `amount_oz` negative for a removal, summed client-side by `logged_date`) over one-row-per-day-upsert, matching `meal_logs`/`cardio_logs`'s pattern rather than `weight_logs`'s -- water is several small taps across a day, not one value logged once.

**App changes, commit `ed1397b`:**
1. `shared.jsx`: new `sb.insertWaterLog(supabaseUserId, amountOz)` and `sb.getWaterLogs(supabaseUserId, daysBack)`, same shape/fire-and-forget pattern as the weight/meal equivalents.
2. `MealScreen.jsx`: `WaterTracker` now writes to Supabase on every add/remove (fire-and-forget, same as everywhere else), and on mount fetches today's real total from Supabase to reconcile against the localStorage-cached value that still paints first for instant UI -- fixes the "logged water on my phone, opened the app on desktop, it says zero" gap pure localStorage could never close.
3. `Morphiq.jsx`: `loadHistoricalData()` now also fetches `sb.getWaterLogs(uid, 35)`, exposed as `historicalData.waterLogs` alongside the existing workout/weight/cardio/meal fetches.
4. `ProgressScreen.jsx`: new Water card on the Nutrition tab, directly below Protein, same bold-header treatment, own `byDate` bucket keyed off `logged_date` (separate from the meal one, since a member can log water without logging food that day), 14-day trend against a 64oz/day target (same goal `WaterTracker` already uses) via the same generalized `NutritionTrendChart` (`valueKey="waterOz"`). Gated on its own "any water logged" check, not on `loggedDates` from meals, with its own empty-state card ("No water logged yet").

**Live-tested end-to-end, not just static-checked.** Logged 16oz on the Meals tab in Chrome, confirmed the write actually landed in `water_logs` via a direct SQL query (not just trusting the UI), then confirmed the new Water card on Progress > Nutrition rendered correctly with the day's bar and the 64oz target line, matching Calories and Protein exactly.

## Files touched this session (final line counts)

**Session 37 (three parts -- cardio screen redesign, Progress screen cleanup, water tracking):**

| File | Before session | After session |
| --- | --- | --- |
| `src/CardioScreen.jsx` | 231 | 234 |
| `src/ProgressScreen.jsx` | 613 | 621 |
| `src/shared.jsx` | 3,478 | 3,526 |
| `src/MealScreen.jsx` | 831 | 854 |
| `src/Morphiq.jsx` | 1,656 | 1,658 |

Plus one new Supabase table this session: `public.water_logs` (not a code file, but part of what changed -- see Session 37 part 3 above). All other files untouched this session (Session 36's table above this line is historical -- re-fetch fresh via `git clone` for current state of every other file, as always).

**Full current file set, all well under the 3,800-line hard limit:** `src/shared.jsx` 3,526 (largest, watch this one), `src/WorkoutScreen.jsx` 2,865, `src/Morphiq.jsx` 1,658, `src/MealScreen.jsx` 854, `src/OnboardingScreen.jsx` 622, `src/ProgressScreen.jsx` 621, `src/SuperAdminDashboard.jsx` 343, `src/ChatScreen.jsx` 300, `src/GymSignupScreen.jsx` 269, `src/CardioScreen.jsx` 234, `src/GymOwnerDashboard.jsx` 927. `api/` files are all small (12-259 lines each), none near any size concern.

## Latest commit

`ed1397b` on `main`. Full Session 37 commit sequence: `7bc49b6` → `a133b25` → `828fc03` (docs) → `c8ab3d5` → `57f418f` (docs) → `cb93493` → `31c9548` (docs) → `ed1397b`.

## Confirmed working vs still open

**Verified this session:** every changed file passes an individual `esbuild` syntax check, and the full app bundles cleanly from `src/index.js` (catches cross-file import/reference mistakes — this caught and fixed one real bug mid-session, `interleaveCardioDays()` accidentally being nested inside `buildPlan()` instead of at module scope). Manual code review confirms `CustomPlanScreen`'s wizard step numbering is fully consistent (all 8 steps present, every `setStep()` target verified), and the Progress screen's tab-condition strings (`body`/`workouts`/`cardio`/`nutrition`) each appear exactly once with no leftover `bests` references.

**NOT live-tested this session — no browser/device access available.** Everything below needs a real pass in the running app before being called done:
- The accent-tinted Log cardio button, and both cardio confirmation banners (live timer + manual quick-log) showing real numbers.
- CustomPlanScreen's new cardio wizard step end-to-end — including a plan with 0 cardio days (should behave exactly as before) and a plan with cardio days that outnumber lifting days (edge case where the interleave algorithm could front-load a cardio day as Day 1 — see `interleaveCardioDays()` comment in `shared.jsx`).
- Progress screen: all three existing tabs after the restructure (especially the relocated "Personal bests" section's tap-to-expand strength chart, now nested one level deeper), plus the brand-new Cardio and Nutrition tabs on an account with real logged data.
- The Nutrition tab specifically has never been exercised against real Supabase data — `getMealLogs()` is new code with no live confirmation yet that the date-bucketing produces sane output against actual `meal_logs` rows.

**Session 37 addition -- live-tested and confirmed working in Chrome at a 390x844 phone viewport:** the cardio screen redesign (paired timer/calorie stat card, screen-fill layout on both the activity picker and the live timer, prominent post-Stop confirmation card). Full start-to-stop flow exercised: pick Treadmill → Start → calories climb live → Stop → confirmation card shows real numbers. Zero scroll overflow confirmed on all three states. Not yet tested on an actual physical phone (only a resized desktop Chrome window) or in Safari/iOS -- worth a real-device glance next time Bryant has the app open, but the DOM-level height math should hold since it's not relying on any desktop-only API.

**Session 37 part 2 addition -- also live-tested and confirmed working:** the Progress screen cleanup (top summary stats removed, Body tab trimmed to weight chart + measurements only, new Protein card on Nutrition with bold focal headers on both Calories and Protein). Walked all four tabs in Chrome; logged a real test meal to get the Nutrition tab past its empty state and confirmed both trend cards render correctly with matching target lines and numbers. Note this left one real test meal log ("Grilled Chicken Breast with Rice", 350 cal / 35g protein) on the test account used this session -- see Session 37 part 2 writeup above.

**Session 37 part 3 addition -- also live-tested and confirmed working:** water intake now saves to a new `water_logs` Supabase table instead of localStorage-only. Logged 16oz on the Meals tab in Chrome, confirmed via a direct SQL query that the row actually landed in the database (not just trusting the UI), then confirmed the new Water card on Progress > Nutrition rendered with the correct bar and 64oz target line, matching Calories and Protein. This also left one real water log (16oz, today) on the same test account.

## Punch list, in priority order

**FIRST — unblock the privacy policy.** Unchanged. Blocked on Bryant forming a real legal business entity.

**SECOND — live-test what remains from Session 36.** Session 36 shipped five things; two are now covered by Session 37's live-testing (the cardio-screen work, and the Progress screen -- though Progress has since been further changed, see below, so test its CURRENT state, not the original Session 36 restructure). Still fully untested: CustomPlanScreen cardio-day scheduling end-to-end, the Nutrition tab's `getMealLogs()` date-bucketing against real data at scale (Session 37 only exercised one single test meal, not multiple days/edge cases), and the two copy nits. Do this before starting new feature work.

**THIRD — no-blocker App Store groundwork.** Unchanged. Capacitor scaffolded/branded, PWA service worker shipped but unverified live. Capgo pipeline not started. Android project has never been opened in Android Studio to confirm it builds.

**FOURTH — the two Session 35 copy nits are now done** (see Session 36 item 1 above) — removed from this list.

**FIFTH — weight-loss/cardio redesign, remaining pieces.** `CustomPlanScreen` cardio support is now done (Session 36 item 2). Still open: wearable sync (Apple HealthKit/Fitbit) remains a deliberately separate, not-yet-scoped future initiative. Voice input on the cardio quick-log and the "Other" activity type haven't been live-tested (lower priority — likely fine, just not click-tested).

**SIXTH through ELEVENTH — unchanged from Session 30/35, still open:** live-test `WarmupTest` full week start-to-finish (partially covered across recent sessions, but not the full original scope — nutrition/rest-timer/stats steps still unverified, and this is now somewhat superseded by the SECOND priority above covering the same account for the newer features); get Bryant's sign-off on the compound/isolation warm-up split; exercise diagrams/animations (deferred); personal trainer market segment (needs its own discussion, see DECISIONS.md Aug 8 2026); expand exercise variety beyond primary/variation binary swap; the weight-loss/cardio redesign's still-undecided open questions from DECISIONS.md Aug 9 2026 that haven't been revisited (whether `lose_fat` should restructure the week itself further, nutrition-screen UI emphasis for that goal specifically).

**LOWER PRIORITY / OPS.** Unchanged: one unidentified blank-named test profile row in Supabase; naming cleanup (GitHub repo, live URL, `Morphiq.jsx`/`function Morphiq()` still carry the retired placeholder name — cosmetic only); WarmupTest's plan is the lose_fat/cardio plan from Session 35's testing — know its current state before reusing it.

## Technical notes carried forward

**Supabase MCP connector now connected (new this session).** The app's own `sb_publishable_...` key (used by the running app itself) can only read/write rows in tables that already exist -- it can never create or alter a table, regardless of how it's used. That's a Postgres/Supabase permissions boundary, not a workaround-able limitation. When Bryant needs a new table going forward, connect/use the official Supabase MCP tool (`mcp__<id>__apply_migration` for schema changes, `execute_sql` for one-off queries, `list_tables` with `verbose: true` to check real column names/types before writing any app code against them, `get_advisors` after any DDL change) instead of asking Bryant to click through the Supabase dashboard by hand -- much faster and no risk of a typo'd column name. Ask Bryant to connect it if it's not already connected in a given session.

**MANDATORY fetch method — git clone only.** `api.github.com` and direct HTTP calls to `github.com`/`raw.githubusercontent.com` are blocked by this environment's proxy allowlist; `raw.githubusercontent.com` via web-fetch can also silently serve stale cached content — this happened again at the start of this session (fetched a Session-10-vintage HANDOFF.md and file set via web-fetch before switching to `git clone`, which correctly showed the real Session 35 state). `git clone`/`git push` over authenticated HTTPS from a plain scratch directory (not the mounted Windows output folder) remains the only trusted fetch method.

**When moving a block of JSX/JS into a new location via multi-line string replacement, verify the destination scope, not just that the anchor text matches.** This session's one real bug: `interleaveCardioDays()` was inserted textually before a comment that turned out to be inside `buildPlan()`'s function body (indentation looked top-level; brace nesting was not). The function became invisible outside `buildPlan()`, caught immediately by the full-bundle esbuild check ("not declared in this file") rather than by the individual per-file syntax check, which passed fine since the code was still syntactically valid JS. The full-bundle check earned its place in the verification routine this session specifically because of this — keep running it after any change that adds a new exported helper.

**When cutting and reassembling large JSX blocks (e.g. the Progress screen tab restructure), slice by 1-indexed line number against the original file content in one pass, not via sequential destructive string replacements.** Off-by-one slice boundaries are easy to introduce and easy to catch early with a quick assert-and-print step before writing — worth doing for any restructuring that moves more than roughly 20-30 lines.

**A feature's own onboarding "restart" option is a legitimate, no-setup way to live-test a flow that's otherwise only reachable at first signup.** (Carried forward from Session 35 — still relevant, not exercised this session since no live testing happened at all.)

`profiles.supabase_user_id` is the auth link, `profiles.id` is the FK used everywhere else. Fire-and-forget `.catch(() => {})` pattern for all new Supabase writes — `getMealLogs()` and the `interleaveCardioDays()` helper both follow this where relevant. `AuthScreen` lives in `Morphiq.jsx`, not `shared.jsx`. The `exercises` table is still just a reference/classification table, not wired into live plan generation.

**No live Node/npm toolchain in this sandbox by default.** `esbuild` (installed standalone via `npx --yes esbuild ...`, no persistent install needed) is the fast syntax/JSX sanity check when code changes — used on every touched file this session, individually and via a full-bundle check from `src/index.js` with `react`/`react-dom`/`@sentry/react`/`web-vitals` externalized.

## Session 37 close-out summary

**Everything built/changed this session, three parts:**

Part 1 -- Cardio screen redesign: timer and calorie estimate merged into one paired stat card, both the live-timer and activity-picker views now fill available phone-screen height, post-Stop confirmation moved to a large front-and-center card. Two live-tested follow-up fixes (a height-fill miscalibration, and extending the fill to the activity-picker view).

Part 2 -- Progress screen cleanup: removed the top-of-screen title + 3-stat summary row and the weigh-ins line (tab bar is now the top of the screen), removed the Body tab's Workout streak calendar, added a Protein trend card to Nutrition matching Calories, bolded/enlarged both card headers.

Part 3 -- Water intake tracking: connected the official Supabase MCP tool for the first time this session (the app's own API key can read/write but never create tables), created a new `water_logs` table matching the shape of the other log tables, wired real Supabase persistence into the existing `WaterTracker` (previously localStorage-only), and added a matching Water trend card to Nutrition below Protein.

**Confirmed working:** esbuild checks (individual files + full bundle) pass clean throughout all three parts. All three were live-tested end-to-end in Chrome at a 390x844 phone viewport, not just statically checked -- including, for water, a direct SQL query confirming the write actually reached the database rather than just trusting what the UI showed.

**Still needs testing:** Session 36's CustomPlanScreen cardio-day scheduling, the two copy nits, and the Nutrition tab's date-bucketing against more than one day of real data. None of Session 37's three parts have been tried on an actual physical phone yet (only a resized desktop Chrome window).

**Next priority task:** live-test the remaining Session 36 items (see punch list SECOND above) and, when convenient, a real-device glance at Session 37's three changes. After that: App Store groundwork (Capacitor Android Studio build check is the next unblocked item), or privacy policy once Bryant has a business entity.

**Final line counts:** see table above — `src/shared.jsx` 3,526 (largest, still well under the 3,800 limit), `src/MealScreen.jsx` 854, `src/ProgressScreen.jsx` 621, `src/Morphiq.jsx` 1,658, `src/CardioScreen.jsx` 234. Plus one new Supabase table (`water_logs`).

**Latest commit:** `ed1397b` on `main`. Full Session 37 commit sequence: `7bc49b6` → `a133b25` → `828fc03` (docs) → `c8ab3d5` → `57f418f` (docs) → `cb93493` → `31c9548` (docs) → `ed1397b`.

## Paste this at the start of your next session

Fetch `HANDOFF.md`, `DECISIONS.md`, and all `src/`/`api/` files fresh via `git clone` (never `raw.githubusercontent.com` -- can silently serve stale cached content; `api.github.com` is also blocked in this environment's sandbox -- `git clone`/`git push` over an authenticated HTTPS URL, e.g. `https://<token>@github.com/Luxurydadbot/Morphiq.git`, from a plain scratch directory is the only method confirmed to work). Report every file's line count before doing anything else; none are near the 3,800-line limit (`shared.jsx` is largest at 3,526, `WorkoutScreen.jsx` next at 2,865). If a new Supabase table is ever needed, connect the official Supabase MCP tool rather than asking Bryant to use the dashboard by hand -- the app's own API key can never create tables, see Technical notes above.

Remind Bryant: three things are live-tested and confirmed working this session (Session 37) -- the cardio-screen redesign, the Progress screen cleanup, and water intake now persisting to a new `water_logs` Supabase table with a matching trend card on Nutrition -- all walked end-to-end in Chrome at a phone viewport (water's write was also confirmed with a direct database query, not just the UI), just not yet on an actual physical device. Still untested from Session 36: CustomPlanScreen's cardio-day scheduling wizard, the two copy nits, and the Nutrition tab's date-bucketing beyond a single test meal. That's the top priority before anything new. After that, the App Store punch list (Capacitor's `android/` project has never been opened in Android Studio) and the privacy policy (blocked on Bryant's business entity) are the standing next chunks of work.
