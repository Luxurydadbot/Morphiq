# Hypergentiq — Session 38 master handoff

This file is the handoff. At the start of every session, fetch this file from the repo along with the src/ and api/ files — it replaces pasting a handoff into chat by hand. **MANDATORY fetch method — git clone only, see Technical notes below.**

## STANDING GOAL — App Store + Google Play submission roadmap (carry forward every session, do not delete until fully checked off)

No change this session — untouched. Step list: (1) fix PWA gaps — done, Session 30, (2) add Capacitor + generate native projects — done (Session 25), still not opened/built in Android Studio or Xcode, (3) set up Capgo live-update pipeline — still open, (4) Android path (Bryant needs a Google Play Console account, $25), (5) iOS path (needs a Mac on macOS Sequoia 15.6+ for Xcode 26, or a cloud Mac build service), (6) privacy policy — hard gate for both stores, blocked on Bryant forming a real legal business entity (draft exists, see punch list FIRST), (7) store listing assets (icon done, need screenshots + descriptions), (8) confirm no Apple IAP conflict, (9) submit.

## Session 38 — Water card now visually matches the Log a Meal card, "Log Water" header

Bryant's ask: on the Meals page, the Water card looked like a smaller, secondary element next to the "Log a meal" card above it. Wanted it to match that card's look and carry a real "Log Water" header instead of the small "Water" label it had.

**What changed, commit `0f06f9e`, `src/MealScreen.jsx` only (854 → 855 lines, +1 net).**
1. Container styling now matches "Log a meal" exactly: `background: "#212429"`, `border: "1px solid " + theme.borderSubtle`, `borderRadius: 14`, `padding: "14px"`, `marginBottom: 12` (was `theme.surface` background, 12px radius, `10px 12px` padding, 14px bottom margin — a visibly smaller/lighter card before).
2. Header replaced: the old 12px/600-weight "Water" label (with a small water-drop icon and inline glasses count) is now a 17px/700-weight "Log Water" title, sized to match "Log a meal"'s own 17px/700 header. Kept the water-drop icon and the "done" checkmark next to the title, and kept the live glasses-count + "+Xoz" flash indicator on the right side of the same header row (unchanged behavior, just restyled).
3. Added a subtitle line directly under the header, same pattern as "Log a meal"'s "Say it, snap it, or type it in" line: "Tap a size, or enter your own" at 12px, `theme.textDim`, `marginBottom: 12`.

No logic changed — `addWater()`, `removeWater()`, `submitCustom()`, the Supabase read/write via `sb.getWaterLogs`/`sb.insertWaterLog`, and the localStorage caching all untouched. This was a styling/header change only.

**Verified this session: static checks only, no browser access.** Individual `esbuild` syntax check on `src/MealScreen.jsx` passes clean, and the full-bundle check from `src/index.js` (react/react-dom/@sentry/react/web-vitals externalized) also passes clean — confirms no cross-file breakage. **Not live-tested in the running app this session** — needs a look on the actual Meals page (ideally at a phone viewport, matching how every other visual change this project has been confirmed) to eyeball that the new "Log Water" header and matching card styling read correctly next to "Log a meal," and that nothing about the header restyle affects tap targets on the quick-add buttons below it.

## Session 37 recap (three parts — cardio screen redesign, Progress screen cleanup, water tracking) — carried forward, unchanged this session

**Part 1 — Cardio screen redesign (`CardioScreen.jsx`, commit `7bc49b6`, live-tested fixes `a133b25`/`c8ab3d5`).** Timer + calorie estimate merged into one paired stat card; both the live-timer and activity-picker views fill available phone-screen height; post-Stop confirmation moved to a large front-and-center card. Live-tested end-to-end in Chrome at 390x844, zero scroll overflow confirmed on all three states.

**Part 2 — Progress screen cleanup (`ProgressScreen.jsx`, commit `cb93493`).** Removed the top "Your Progress" title + 3-stat summary row and the weigh-ins line (tab bar is now the top of the screen); removed the Body tab's Workout streak calendar; added a Protein trend card to Nutrition matching Calories; bolded/enlarged both card headers. Live-tested — all four tabs walked in Chrome, a real test meal logged to exercise the Nutrition tab's empty state.

**Part 3 — Water intake tracking (`shared.jsx`, `MealScreen.jsx`, `Morphiq.jsx`, commit `ed1397b`).** New Supabase `water_logs` table (event-log style, same shape as other log tables), `WaterTracker` now writes to Supabase on every add/remove instead of localStorage-only, new Water trend card added to Progress > Nutrition. Live-tested — a direct SQL query confirmed the write landed in the database, not just the UI.

## Files touched this session (final line counts)

| File | Before session | After session |
| --- | --- | --- |
| `src/MealScreen.jsx` | 854 | 855 |

All other files untouched this session. **Full current file set, all well under the 3,800-line hard limit:** `src/shared.jsx` 3,526 (largest, watch this one), `src/WorkoutScreen.jsx` 2,865, `src/Morphiq.jsx` 1,658, `src/MealScreen.jsx` 855, `src/OnboardingScreen.jsx` 622, `src/ProgressScreen.jsx` 621, `src/GymOwnerDashboard.jsx` 927, `src/SuperAdminDashboard.jsx` 343, `src/ChatScreen.jsx` 300, `src/GymSignupScreen.jsx` 269, `src/CardioScreen.jsx` 234. `api/` files are all small (12-259 lines each), none near any size concern.

## Latest commit

`0f06f9e` on `main` (Session 38). Prior latest was `ed1397b` (end of Session 37).

## Confirmed working vs still open

**Verified this session:** `src/MealScreen.jsx` individual esbuild check + full-bundle check from `src/index.js` both pass clean after the Water card restyle.

**NOT live-tested this session — no browser/device access available.** Adds to the existing untested list below:
- Session 38's Water card restyle (new "Log Water" header, card now matches "Log a meal" visually) — needs a real look on the Meals page.
- Everything already carried forward from Session 37 (see that recap above) that still needs a live pass: the accent-tinted Log cardio button and both cardio confirmation banners; CustomPlanScreen's cardio wizard step end-to-end (0-cardio-day and cardio-outnumbers-lifting-day edge cases); the Progress screen's relocated "Personal bests" tap-to-expand section; the Nutrition tab against real multi-day Supabase data (only ever exercised against one single test meal so far).

## Punch list, in priority order

**FIRST — unblock the privacy policy.** Unchanged. Blocked on Bryant forming a real legal business entity.

**SECOND — live-test what remains from Session 36, plus Session 38's Water card restyle.** Still fully untested: CustomPlanScreen cardio-day scheduling end-to-end, the Nutrition tab's `getMealLogs()` date-bucketing against real data at scale, the two copy nits, and now Session 38's "Log Water" header/card-match change. Do this before starting new feature work.

**THIRD — no-blocker App Store groundwork.** Unchanged. Capacitor scaffolded/branded, PWA service worker shipped but unverified live. Capgo pipeline not started. Android project has never been opened in Android Studio to confirm it builds.

**FOURTH through NINTH — unchanged from Session 30/35/37, still open:** live-test `WarmupTest` full week start-to-finish; get Bryant's sign-off on the compound/isolation warm-up split; exercise diagrams/animations (deferred); personal trainer market segment (needs its own discussion, see DECISIONS.md Aug 8 2026); expand exercise variety beyond primary/variation binary swap; the weight-loss/cardio redesign's still-undecided open questions from DECISIONS.md Aug 9 2026 (whether `lose_fat` should restructure the week itself further, nutrition-screen UI emphasis for that goal specifically); wearable sync (Apple HealthKit/Fitbit) remains a deliberately separate, not-yet-scoped future initiative; voice input on the cardio quick-log and the "Other" activity type haven't been live-tested.

**LOWER PRIORITY / OPS.** Unchanged: one unidentified blank-named test profile row in Supabase; naming cleanup (GitHub repo, live URL, `Morphiq.jsx`/`function Morphiq()` still carry the retired placeholder name — cosmetic only); WarmupTest's plan is the lose_fat/cardio plan from Session 35's testing — know its current state before reusing it.

## Technical notes carried forward

**Supabase MCP connector.** The app's own `sb_publishable_...` key (used by the running app itself) can only read/write rows in tables that already exist — it can never create or alter a table, regardless of how it's used. When Bryant needs a new table going forward, connect/use the official Supabase MCP tool (`apply_migration` for schema changes, `execute_sql` for one-off queries, `list_tables` with `verbose: true` to check real column names/types before writing any app code against them, `get_advisors` after any DDL change) instead of asking Bryant to click through the Supabase dashboard by hand.

**MANDATORY fetch method — git clone only.** `api.github.com` and direct HTTP calls to `github.com`/`raw.githubusercontent.com` are blocked by this environment's proxy allowlist; `raw.githubusercontent.com` via web-fetch can also silently serve stale cached content (confirmed again at the very start of this session — a web-fetch pull of `HANDOFF.md` returned a Session-10-vintage file before switching to `git clone`, which correctly returned the real Session 37 state). `git clone`/`git push` over authenticated HTTPS from a plain scratch directory (not the mounted Windows output folder) remains the only trusted fetch method.

**When moving a block of JSX/JS into a new location via multi-line string replacement, verify the destination scope, not just that the anchor text matches.** (Session 37's one real bug — `interleaveCardioDays()` accidentally nested inside `buildPlan()`. Caught by the full-bundle esbuild check, not the per-file check. Keep running both after any change that adds a new exported helper.)

**When cutting and reassembling large JSX blocks, slice by 1-indexed line number against the original file content in one pass, not via sequential destructive string replacements**, for any restructuring that moves more than roughly 20-30 lines.

`profiles.supabase_user_id` is the auth link, `profiles.id` is the FK used everywhere else. Fire-and-forget `.catch(() => {})` pattern for all new Supabase writes. `AuthScreen` lives in `Morphiq.jsx`, not `shared.jsx`. The `exercises` table is still just a reference/classification table, not wired into live plan generation.

**No live Node/npm toolchain in this sandbox by default.** `esbuild` (installed standalone via `npx --yes esbuild ...`, no persistent install needed) is the fast syntax/JSX sanity check when code changes — used this session on `src/MealScreen.jsx` individually and via the full-bundle check from `src/index.js` with `react`/`react-dom`/`@sentry/react`/`web-vitals` externalized. Note the correct flags: no `--loader=jsx` (that only applies reading from stdin) and no `--bundle=false`; for the full bundle check use `--loader:.js=jsx` since screen files import each other as `.jsx` but the entry point is `.js`.

## Session 38 close-out summary

**What changed:** the Water card on the Meals page (`WaterTracker` in `src/MealScreen.jsx`) now visually matches the "Log a meal" card above it — same dark card background, border, radius, and padding, plus a real "Log Water" header at the same 17px/700-weight size "Log a meal" uses, with a matching subtitle line underneath. No logic changed; the glasses-count display, "+Xoz" flash, quick-add buttons, custom-amount entry, and Supabase read/write all work exactly as before, just restyled.

**Confirmed working:** esbuild syntax checks (individual file + full bundle) pass clean.

**Still needs testing:** a live look at the Meals page to confirm the restyle reads correctly — no browser/device access was available this session. This joins the existing Session 36/37 untested list (see punch list SECOND).

**Next priority task:** live-test the accumulated backlog (Session 36's CustomPlanScreen cardio scheduling and copy nits, the Nutrition tab against real multi-day data, and now Session 38's Water card restyle) before starting new feature work — see punch list SECOND. After that: App Store groundwork (Capacitor Android Studio build check is the next unblocked item), or privacy policy once Bryant has a business entity.

**Final line counts:** `src/shared.jsx` 3,526 (largest, still well under the 3,800 limit), `src/WorkoutScreen.jsx` 2,865, `src/Morphiq.jsx` 1,658, `src/MealScreen.jsx` 855 (touched this session), `src/ProgressScreen.jsx` 621, `src/CardioScreen.jsx` 234.

**Latest commit:** `0f06f9e` on `main`.

## Paste this at the start of your next session

Fetch `HANDOFF.md`, `DECISIONS.md`, and all `src/`/`api/` files fresh via `git clone` (never `raw.githubusercontent.com` — can silently serve stale cached content; `api.github.com` is also blocked in this environment's sandbox — `git clone`/`git push` over an authenticated HTTPS URL, e.g. `https://<token>@github.com/Luxurydadbot/Morphiq.git`, from a plain scratch directory is the only method confirmed to work). Report every file's line count before doing anything else; none are near the 3,800-line limit (`shared.jsx` is largest at 3,526, `WorkoutScreen.jsx` next at 2,865). If a new Supabase table is ever needed, connect the official Supabase MCP tool rather than asking Bryant to use the dashboard by hand — the app's own API key can never create tables, see Technical notes above.

Remind Bryant: Session 38 restyled the Water card on the Meals page to match "Log a meal" (dark card, matching border/radius/padding, real "Log Water" header) — static-checked clean but not yet seen live in the browser. Before that, three things from Session 37 are live-tested and confirmed working — the cardio-screen redesign, the Progress screen cleanup, and water intake persisting to the `water_logs` Supabase table with a matching Nutrition trend card. Still untested from Session 36: CustomPlanScreen's cardio-day scheduling wizard, the two copy nits, and the Nutrition tab's date-bucketing beyond a single test meal. That's the top priority before anything new. After that, the App Store punch list (Capacitor's `android/` project has never been opened in Android Studio) and the privacy policy (blocked on Bryant's business entity) are the standing next chunks of work.
