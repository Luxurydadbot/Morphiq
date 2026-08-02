# Hypergentiq — Session 16 master handoff (two punch-list bugs, shipped)

This file is the handoff. At the start of every session, fetch this file from the repo along with the src/ and api/ files — it replaces pasting a handoff into chat by hand.

## Session 16 — macro-wipe bug + flat custom-plan weight increment, both fixed

Bryant asked to knock out the two remaining real bugs from the punch list.

**Bug 1 — edit-plan macro wipe (open since session 7):** `ProfileScreen`'s `saveChanges()` in `Morphiq.jsx` called `buildPlan(updatedUser)` with no second argument. `buildPlan()`'s `existingMacros` param only gets used via `...(existingMacros || {})` at the top of its return object — nothing else in the function sets calories/protein/carbs/fat — so passing nothing meant those four fields silently came back `undefined` on every edit. Changing your goal, days/week, or equipment on the Profile screen wiped your nutrition targets instead of updating them.

Fixed by actually recalculating rather than just preserving the old numbers — a goal change should move your calorie target (surplus for muscle, deficit for fat loss), so preserving stale macros wouldn't have been fully correct either. This surfaced that the Mifflin-St Jeor macro formula existed as two separate copies — one in `OnboardingScreen.jsx`, one in `CustomPlanScreen` (`WorkoutScreen.jsx`) — each with a comment saying it was "kept in sync manually." Collapsed to one shared `calcMacros()` in `shared.jsx`, used by all three call sites now. `ProfileScreen` parses the member's stored `"5′ 10″"` / `"180 lbs"` formatted strings back into numbers to feed it, falling back to preserving the plan's existing macros (never `undefined`) if that parsing fails — e.g. a member who built a custom plan and skipped the optional stats step.

**Bug 2 — flat 2.5lb custom-plan weight increment:** `CustomPlanScreen` hardcoded `weightIncrement: 2.5` for every hand-built exercise regardless of equipment — real gyms essentially never offer a true 2.5lb TOTAL jump (a barbell needs a plate on each side, dumbbells/machines jump in 5s). New shared `getWeightIncrement(equipment)` in `shared.jsx` returns 5 for barbell/dumbbell/machine and 9 for kettlebell — the 9 isn't a guess, it matches the 9-10lb spacing already baked into this file's own kettlebell `STARTING_WEIGHTS` ladder (15→25→35→44→53). Wired into both `CustomPlanScreen` and `buildPlan()` (AI plans previously used a flat 5 for every equipment type, including kettlebell, with a comment admitting that wasn't a real fix — now genuinely equipment-aware everywhere instead of two different half-fixed conventions).

**Verification done this session:** all four changed files pass an `esbuild` parse check. Reimplemented the two OLD inline macro formulas exactly as they were and ran them against 4 scenarios (male/female, all 4 goals, capitalized and lowercase sex input) side by side with the new shared `calcMacros()` — byte-identical output every time, confirming the extraction is a pure refactor with zero behavior change for the two screens that already worked. Confirmed a goal-only change on otherwise-identical body stats now correctly shifts calories (build_muscle 3,029 vs lose_fat 2,429 on the same profile) instead of returning `undefined`. Confirmed the height/weight regex parser recovers the right numbers from the stored format string and produces macros matching a direct call. Confirmed `getWeightIncrement()` returns 9 for kettlebell, 5 for everything else including unknown equipment, and that `buildPlan()`'s exercises now actually carry it. Router/component-name safety checklist intact.

**Still open, unchanged from before:** the session-8 live spot-checks (needs Bryant to run through it, not code), confirming the warm-up compound/isolation split is sufficient, exercise diagrams and kettlebell-specific weight-increment refinement beyond the flat 9 (both still deferred), the one unidentified blank-named test profile row, and privacy policy/terms (blocked on a lawyer).

## Files touched this session

- `src/shared.jsx`: 2,743 → 2,801 (+58) — shared `calcMacros()`, `getWeightIncrement()`
- `src/Morphiq.jsx`: 1,507 → 1,540 (+33) — `ProfileScreen.saveChanges()` now recalculates macros instead of wiping them
- `src/OnboardingScreen.jsx`: 603 → 578 (−25) — calls shared `calcMacros()` instead of its own copy
- `src/WorkoutScreen.jsx`: 2,433 → 2,421 (−12) — calls shared `calcMacros()`; `weightIncrement` now equipment-aware instead of flat 2.5

All well under the 3,800-line hard limit.

## Latest commit

`e0ee7a0` on `main` — Session 16's two bug fixes. `fbabd60` (Session 15b's handoff doc) is the commit before it.

---

# Hypergentiq — Session 15b master handoff (real Push/Pull day exercises, shipped)

This file is the handoff. At the start of every session, fetch this file from the repo along with the src/ and api/ files — it replaces pasting a handoff into chat by hand.

## Session 15b — filled out thin Push/Pull days with real, properly-chosen accessory work

Right after Session 15 shipped real per-day variation for the AI plan splits, Bryant asked directly: should Push and Pull days (2 exercises each) get more work, given Legs day has 4-5? Answer was yes, and he was explicit he wanted this grounded in real fitness programming, not just filled in to look complete.

**What was added:** a `push_secondary` (lateral raise) and `pull_secondary` (bicep curl) exercise for all 4 equipment types in `EXERCISE_LIBRARY`, each with its own independently-calibrated starting-weight table, wired into the Push/Pull/Legs split only (5+ days/week — the 4-day Upper/Lower split's Upper day already had 5 exercises and wasn't the thin one).

**Why those two specific movements, not the existing "accessory" slot:** Push day already gets two pressing angles (primary + variation); lateral raise hits the one shoulder head pressing barely touches, it's low injury risk done light, and it's easy to coach correctly with no supervision. Pull day already gets two rowing angles; "back and biceps" is the standard real-world PPL pairing, and biceps get zero direct work anywhere else in the plan. The existing `accessory` slot was deliberately NOT reused for this — its actual muscle target is inconsistent across equipment (kettlebell's `accessory` is genuinely a leg exercise despite the generic label), so auto-routing it to a day risked landing the wrong movement on the wrong day for some equipment types. That's exactly why it stayed out of the split entirely in Session 15.

**Real programming detail, not just extra entries:** these aren't built through the same `makeEx()` compound path — a new `makeIsolationEx()` gives them 12-15 reps (vs. whatever the member's goal/experience compound rep range is), RPE capped at 7, and shorter rest, matching how isolation accessory work is actually programmed in real training (lighter load, less systemic fatigue, higher reps to protect against using momentum). Starting weights are independently set per exercise rather than copy-pasted — kettlebell in particular does NOT reuse the existing 15/25/35/44/53 ladder every other kettlebell exercise in the table shares, since a 15lb kettlebell lateral raise is too heavy for a beginner.

**Injury handling:** shoulder injury skips the lateral raise entirely rather than substituting — as a bonus isolation exercise (not a primary slot that needs a real replacement), "do less" is the safer call, and lateral raises are one of the more impingement-prone accessory movements. Wrist injury swaps barbell curl for a neutral-grip dumbbell hammer curl — the one curl variant of the four that's actually wrist-stressed; dumbbell/kettlebell/cable curls already allow a wrist-friendly grip without needing a swap.

**Real bug caught and fixed while building this (not part of the original ask):** kettlebell's existing "experienced members get push_exp" logic mutated `pushEx.name` in place while leaving `pushEx.variation` untouched. `push_exp`'s own `.variation` field happens to be the exact same string that was getting written into `.name` — so once Session 15's `makeVariationEx()` started actually building a second push exercise from `.variation`, experienced kettlebell members would have seen "Kettlebell push press" listed twice back-to-back on Push day. Completely invisible before Session 15 since only one push exercise was ever built per plan. Fixed by swapping the whole exercise object (`pushEx = lib.push_exp`) instead of overwriting one field, which correctly leaves `.variation` pointing at the original floor press.

**Verification done this session:** `esbuild` parse check passes. Ran the real `buildPlan()` in Node across all 4 equipment types at 5 days/week — confirmed Push and Pull both now show 3 exercises with sensible weight/rep/rest numbers, confirmed the shoulder-injury skip and wrist-injury swap both fire correctly, confirmed the kettlebell duplicate-exercise bug is gone (now shows "Kettlebell push press" + "Kettlebell floor press", two real distinct exercises). Confirmed the 4-day Upper/Lower and ≤3-day full-body paths are byte-for-byte unchanged — this session touched nothing outside the 5+ day branch except the kettlebell bug fix (which affects all plan shapes, but only changes the corrupted `.variation` field, not which exercise a kettlebell member's push slot shows). Ran the real `progressPlan()` against 2 weeks of synthetic logs on the new lateral-raise exercise specifically — progressed +5lb on schedule, confirming the isolation exercises plug into the exact same progression math as everything else.

**Still NOT done:** same as Session 15 — no live/browser look at the actual rendered Push/Pull/Legs screens yet, everything verified by running the real functions in Node. Also worth knowing: Push and Pull days are 3 exercises now, still one fewer than Legs' 4-5. That's judged as reasonable (real PPL programs vary day-to-day length too), but if it ever feels thin in practice, the next lever is adding a second isolation movement per day (e.g. a triceps exercise on Push, a rear-delt/back-width move on Pull) rather than reaching for the ambiguous `accessory` slot.

## Files touched this session

- `src/shared.jsx`: 2,649 → 2,743 (+94) — `push_secondary`/`pull_secondary` library entries (4 equipment types) + starting weights, `makeIsolationEx()`, kettlebell `push_exp` object-swap bug fix

Well under the 3,800-line hard limit.

## Latest commit

`42b9e77` on `main` — Session 15b's Push/Pull secondary exercises. `bdffc02` (Session 15's handoff doc) is the commit before it.

---

# Hypergentiq — Session 15 master handoff (real per-day AI plan variation, shipped)

This file is the handoff. At the start of every session, fetch this file from the repo along with the src/ and api/ files — it replaces pasting a handoff into chat by hand.

## Housekeeping note first: a documentation gap

Six commits landed after the Session 14 handoff below was written but were never written up: gym-branding fallback placeholder text change (`00628aa`), a contrast boost on WorkoutScreen's weight/target-reps/reps-entered numbers (`ec9b10e`), consolidating the duplicate target-reps display into one badge (`c5dde93`), enlarging the "Weight this set" tile text (`ba2c8c1`), removing the RPE badge and a stray green tint from the "Last time on this exercise" card (`3a04027`), and a fix to the week-complete banner double-counting a single logged set as a full workout day (`bfbf7e2`). All six are small, self-contained UI/logic fixes — commit messages are descriptive and each stands alone in `git log`, but there's no narrative "why" captured here the way other sessions have one. Flagging so this doesn't look like it fell through the cracks.

## Session 15 — punch-list item FIFTH: misleading multi-day AI plan structure, FIXED

Bryant asked to go through the standing punch list by priority and check off what was already done — that pass surfaced that `buildPlan()` had been generating the exact same 5-exercise full-body list every single day regardless of `daysPerWeek`, while `workoutType` confidently labeled it "Upper / Lower" or "Push / Pull / Legs" depending on day count. The label was lying; every day was full body underneath. Bryant chose the real fix (build actual per-day variation) over the cheaper one (just remove the misleading label).

**What changed in `buildPlan()` (`shared.jsx`):**

- **4 days/week** now builds a real **Lower day** (squat + hinge, each paired with its library `variation` exercise as a second movement for volume, plus the core/carry slot for experienced members) and a real **Upper day** (push + pull + their variations, plus slot 5/accessory).
- **5+ days/week** now builds real **Push**, **Pull**, and **Legs** days. Push and Pull each get their pattern's `variation` exercise as a second movement (the exercise library only has one named exercise per pattern per equipment type, so `variation` — already used by `progressPlan()`'s week-to-week post-deload alternation — doubles as the second exercise here). Legs carries squat + hinge + their variations + core.
- **Below 4 days/week is completely unchanged** — still the original single full-body list, verified byte-for-byte identical via a regression test.
- New `makeVariationEx()` and `buildCoreEx()` helpers factor out logic that used to be inlined once; now reused across the full-body, Upper/Lower, and Push/Pull/Legs branches instead of copy-pasted three times.
- Split plans are stored in `plan.customDays` — the **exact same shape** `CustomPlanScreen` already uses for hand-built multi-day plans. This was deliberate: the existing day-rotation UI (Home screen day picker, WorkoutScreen's day-continuation logic), `progressPlan()`'s per-exercise weight progression, and the Session 11 plateau/deload detector all already read `customDays` generically — none of them needed a single change to support AI-generated splits.

**Bug caught and fixed while wiring this up:** `isMultiDayPlan` was duplicated inline in both `Morphiq.jsx` and `WorkoutScreen.jsx` as `plan?.isCustomPlan && Array.isArray(plan?.customDays) && plan.customDays.length > 1`. The `isCustomPlan` flag only ever meant "a member hand-built this in CustomPlanScreen" — gating on it meant AI-generated split plans would have populated `customDays` correctly but the day-rotation UI would never have activated, silently showing only Day 1 forever. Collapsed to one shared `isMultiDayPlan(plan)` function in `shared.jsx` (checks `customDays.length > 1` directly, drops the irrelevant `isCustomPlan` check) and imported it in both files instead of leaving two copies to drift apart — same lesson as the session-10 warm-up bug, explicitly called out in this file's "recurring root cause" note below.

**Design decision worth knowing about:** the exercise library only has one named exercise per pattern (squat/hinge/push/pull) per equipment type, plus one `variation`. That's enough for a correct, honest split — Push day never gets a leg exercise, Legs day never gets a press — but it means Push and Pull days currently have only 2 exercises each (primary + variation), while Legs/Lower days have 4–5. The accessory/slot-5 exercise was deliberately left out of the Push/Pull/Legs split entirely: its target muscle is inconsistent across equipment types (e.g. kettlebell's "accessory" slot is actually a leg-pattern exercise mislabeled generically), so auto-routing it to a specific day risked landing it on the wrong one for some equipment. It's still used normally in the full-body path and the Upper day of the 4-day split. If you want fuller Push/Pull days, the real fix is adding proper secondary push/pull library entries per equipment — deliberately out of scope for this pass.

**Verification done this session:** all three changed files pass an `esbuild` parse check. Built a Node test harness that runs the real `buildPlan()` (extracted straight from the pushed `shared.jsx` via esbuild bundle, not a rewritten copy) across 6 scenarios: 3/4/5/6 days per week, all 4 equipment types, a knee-injury substitution case, and beginner vs. experienced. Confirmed in every case that squat/hinge never appear on an Upper or Push/Pull day and push/pull never appear on a Lower or Legs day, injury swaps correctly flow into whichever day the substituted pattern lands on, and the daysPerWeek ≤ 3 full-body path produces the identical exercise list as before this change. Also ran the real `progressPlan()` against two weeks of synthetic logs across both days of a generated 4-day Upper/Lower plan — every exercise on both days progressed correctly, confirming the customDays-based progression fix from Session 6/11 extends cleanly to AI-generated splits with no separate work needed. Router/component-name safety checklist intact.

**Punch-list audit done this session, for reference (checked against real code, not memory):** plateau/deload trigger, color palette, cardio logging redesign, Stripe paywall enforcement, and Sentry backend monitoring were all confirmed already shipped in earlier sessions. Still open: the custom-plan flat 2.5lb weight increment (SIXTH), the edit-plan macro-wipe bug on ProfileScreen's save (part of SEVENTH — confirmed still live: `buildPlan(updatedUser)` is called there without passing existing macros, silently zeroing calorie/protein/carb/fat targets), kettlebell weight increments and exercise diagrams (both still deferred, EIGHTH), the session-8 live spot-checks (weight stepper math, full custom multi-day plan walkthrough — can't be verified from code, needs Bryant to actually run through it), naming cleanup for internal-only references (file names, console log tags, localStorage key prefixes still say "morphiq" — cosmetic, invisible to users, not touched), and the 2 stray test profile rows in `profiles` (`WarmupTest`, kept on purpose; one blank-named row still unidentified).

**Still NOT done:** no live/browser verification of the new split UI — everything above was verified by extracting and running the real functions in Node, not by actually opening the app and looking at a rendered Upper/Lower or Push/Pull/Legs plan on screen. Worth a real look whenever Bryant has a few minutes, ideally by running through onboarding with 4 and 5+ days/week selected.

## Files touched this session

- `src/shared.jsx`: 2,563 → 2,649 (+86) — real per-day exercise building in `buildPlan()`, new `isMultiDayPlan()` shared helper
- `src/Morphiq.jsx`: 1,506 → 1,507 (+1) — import + use shared `isMultiDayPlan()` instead of inline duplicate
- `src/WorkoutScreen.jsx`: 2,432 → 2,433 (+1) — same

All three well under the 3,800-line hard limit.

## Latest commit

`a653fb1` on `main` — Session 15's real per-day AI plan variation. `bfbf7e2` (the undocumented week-complete-banner fix) is the commit before it.

---

# Hypergentiq — Session 14 master handoff (recurring gym-branding bug, FIXED — root-caused, not yet live-verified)

This file is the handoff. At the start of every session, fetch this file from the repo along with the src/ and api/ files — it replaces pasting a handoff into chat by hand.

## Session 14 — root-caused and fixed the recurring "gym name reverts to Ironforge" bug

Bryant reported a bug that had come up before and kept resurfacing: the gym name at the top of the app would show correctly, then after navigating a few screens and minimizing/reopening the app, it would flip back to "Ironforge Gym" — and he was worried this could be happening to real gyms, not just test data. He asked for root-cause investigation instead of another guess-and-patch.

**What was actually happening — three compounding issues, all in the gym-branding code path (`gymBranding` state in `Morphiq.jsx`, `sb.getGymBranding()` in `shared.jsx`):**

1. **The placeholder default was a real gym's name, not a neutral placeholder.** `gymBranding`'s initial React state (before anything loads) was hardcoded to `{ name: "IronForge Gym", ... }` — a specific real gym's identity used as the fallback. Every time the app fully reloads (which a PWA does routinely when reopened after being backgrounded — mobile browsers evict backgrounded web-app memory more aggressively than people expect), React state resets to this hardcoded default, and the app depends entirely on an async fetch completing successfully to correct it before anyone notices.
2. **That correcting fetch was a single attempt with a silent catch-and-give-up.** `sb.getGymBranding()` had no retry — one failed network request (a very ordinary thing to happen in the first second or two after a phone reconnects from being backgrounded) and the function just returned `null` with no error surfaced anywhere. The caller's `.catch(() => {})` swallowed it completely. gymBranding then stayed on the hardcoded "IronForge Gym" placeholder for the rest of that session, with nothing else ever prompting a retry — until the next full reload happened to get lucky.
3. **A leftover mount-time effect made this worse by design, not just by accident.** A separate `useEffect` ran unconditionally on every single mount, with no check for whether a user was already logged in, and fetched a `"demo-gym"` branding row to use as a default — racing against the real correction happening in parallel. Right now there's no `demo-gym` row in the `gyms` table (confirmed by querying Supabase directly), so this particular effect is currently a no-op, but it was a live landmine: the moment anyone ever adds a demo/preview gym row for marketing purposes, this unconditional fetch would start racing against and sometimes overwriting real members' branding again, exactly like the original bug.

**Confirmation this was already "fixed" once before and didn't stick:** a comment already sitting in `Morphiq.jsx` (session 9) documents catching this exact symptom and adding the session-restore correction fetch as the fix. That fix was directionally right but fragile — a single un-retried attempt — which is exactly why it kept coming back. This session made the correction itself reliable instead of adding another single-shot patch on top.

**Fixed this session (commit `4178f53`):**

- `shared.jsx` — `getGymBranding()` now retries up to 3 times with a 600ms backoff between attempts (same pattern already used by `getProfileWithRetry()` elsewhere in this file), instead of giving up silently on the first hiccup. This is the actual fix — it makes the correction reliable exactly when it's least reliable today (right after the app resumes from the background).
- `Morphiq.jsx` — the hardcoded fallback default changed from a real gym's name/welcome message to a neutral `"Your Gym"` / generic welcome line. If every retry somehow still fails (e.g. a member opens the app while genuinely offline), the app now shows something clearly generic instead of silently impersonating a specific real gym.
- `Morphiq.jsx` — the unconditional `"demo-gym"` mount effect now skips entirely when a saved session already exists (`if (!gymIdFromUrl && savedSession?.uid) return;`). It still runs for a genuinely logged-out visitor or an explicit invite-link `?gym=` param, but it can never again race against or overwrite an already-logged-in member's real branding, including if a demo-gym row gets added to the database in the future.

**Why this should hold for every gym, not just the one Bryant was seeing:** the bug was never gym-specific — "Ironforge" just happened to be whichever real gym's name got hardcoded as the placeholder value during an earlier session. Any gym could have been picked, and every gym was equally exposed to the same silent-fetch-failure/full-reload combination. The fix removes the specific-real-gym fallback entirely and makes the real fetch resilient, so this isn't a per-gym patch — it closes the mechanism for every gym at once, matching what Bryant asked for: the app should always be pulling the name from the `gyms` table, and now the one thing standing between "always" and "usually" (a single un-retried network attempt) has been hardened.

**Verification done this session:** both changed files passed an `esbuild` parse/syntax check. Confirmed via a direct Supabase query that no `demo-gym` row currently exists (so the third fix is precautionary/future-proofing, not papering over currently-live data). Confirmed all three existing call sites of `getGymBranding()` still work unchanged with the new optional `attempts` parameter (backward compatible, default value). Confirmed the router/component safety checklist (`export default function Morphiq()`, `function AuthScreen()`) intact. Re-searched the whole codebase for "ironforge" (case-insensitive) after the fix — zero remaining references anywhere.

**Still NOT done:** this was root-caused and fixed at the code level but not yet watched happen live — the actual test would be logging into a real account, confirming the correct gym name shows, then genuinely backgrounding the phone for a while (long enough for a real network reconnect, not just a quick app-switch) and reopening to confirm it holds. Worth doing before considering this fully closed, especially since the original bug was intermittent by nature and could take a few tries to reproduce even before this fix.

## Session 13 — finished the color-uniformity sweep Session 12 left open

Bryant said "yes" to continuing where Session 12 left off, and separately flagged that WorkoutScreen still needed a cleanup pass. All 5 items Session 12 left open are now done, plus 2 extra strays found along the way:

**Fixed this session (commit `6c90146`):**

1. **Second "Daily Targets" macro widget** in `Morphiq.jsx` (~line 1359, the 4-item Calories/Protein/Carbs/Fat version) — recolored off the old `[a, "#F59E0B", "#818cf8", "#f472b6"]` scheme onto the harmonized family: Calories = accent `a` (headline), Protein = `#7C93B8`, Carbs = `#5FA8E0`, Fat = `#2D5FA8`. No collision with Calories' accent blue anymore.
2. **MealScreen.jsx macro colors shifted to match** — the "Remaining today" protein number and the `MacroBar` component (Protein/Carbs/Fat) were still on the old accent-blue-for-Protein scheme; moved to the same slate/ice/deep mapping (`#7C93B8` / `#5FA8E0` / `#2D5FA8`) so Protein no longer reads identically to a Calories tile anywhere in the app.
3. **All 6 remaining light-purple `#A78BFA` spots removed:**
   - `GymOwnerDashboard.jsx` — "Tokens used" AI-usage stat and "Plan generation" category bar → `#7C93B8` / `#5FA8E0`
   - `GymOwnerDashboard.jsx` — "Plans & pricing" footer button → plain accent blue `#4C8DFF` (this button sits in `GymOwnerDashboard()`, a different function scope than the branded `a` variable — used the literal hex to match how the rest of that scope already does it, rather than referencing an out-of-scope variable)
   - `ProgressScreen.jsx` — "PBs logged" stat → `#5FA8E0`
   - `SuperAdminDashboard.jsx` — the duplicate `scale` tier color in `PLAN_PRICING` (parallel to the already-fixed `plans` array in `GymOwnerDashboard.jsx`) → while in there, also fixed `growth`'s color, which had silently drifted to `#F59E0B` instead of matching `GymOwnerDashboard.jsx`'s `#7C93B8`. All three tiers (`starter`/`growth`/`scale`) now exactly mirror the pricing-page colors: `#4C8DFF` / `#7C93B8` / `#5FA8E0`.
   - `WorkoutScreen.jsx` — RPE badge → neutral gray (`#6E7480` text, `rgba(110,116,128,0.3)` border), since an RPE number is informational, not a warning or a celebration.
4. **All 4 remaining `#60A5FA` spots in `SuperAdminDashboard.jsx`** ("Not locked" stat, the "Total members" chart-line color, "Logged a workout, last 30 days" stat) → `#7C93B8`, the same secondary-blue used everywhere else for "informational, second-tier stat" purposes.
5. **WorkoutScreen.jsx amber re-scoping — the plan from last session, now actually built** (this is the part Bryant flagged directly):
   - **→ GRAY (calm, this is not a working set):** the "not a working set" header label, the warm-up `Pill` (now `variant="gray"` — reused the gray variant that already existed in `shared.jsx`), the warm-up weight number, the warm-up reps number, both warm-up reassurance lines ("aren't meant to feel heavy...", "ramping to X lbs"), and the "This is a warm-up set — take it easy" flame callout (background + border recolored too, not just the text — was `#1A1206`/amber-tinted, now `#1A1A1A`/gray-tinted).
   - **→ GREEN (celebration):** the trophy icon on the "Workout complete!" screen, the "Progressive overload applied" summary badge (background, icon, and text — was amber-tinted `#1A1200`, now green-tinted `#0A1A14`), the PR banner on the rest screen (gradient, border, trophy icon, "New personal record!" text, and the weight sub-text all moved off amber onto `theme.success`), and the inline "Progressive overload applied" note under the weight display.
   - **→ LEFT ALONE, genuine caution (confirmed correct, not touched):** the rest-timer ring and countdown number when ≤15 seconds left, the "save failed" note if a cloud sync fails, and the entire "That's a big jump from today's plan" guardrail card (background, icon, text, and buttons) — all real warnings, not calm/celebration moments.
   - **wasSkipped indicator** ("Set skipped" vs "Logged — X reps") — was amber for the skipped case, now gray, matching the same "informational, not urgency" call made for the RPE badge.
6. **Two extra strays found and fixed while auditing, not on the original list:**
   - `Morphiq.jsx` home screen — the trophy icon on "Week complete!" was still raw `#F59E0B` (same exact pattern as the WorkoutScreen trophy, just missed on a different screen). Moved to `theme.success` to match.
   - `ProgressScreen.jsx` — the "PB" flame badge on each session in the workout history list was amber (`#2D1A00`/`#F59E0B`), but a personal-best count is a celebration, not a caution, same as the PR banner. Moved to green.
7. **Investigated and deliberately left alone** (checked individually, all legitimate): the "Payment wasn't finished" error icon in `GymSignupScreen.jsx` (genuine recoverable-error amber, correct as-is); the `#333` footer text color on "POWERED BY HYPERGENTIQ" (checked all 6 screens that have it — consistent everywhere, not a stray); the `#1A2E2B` blue-tinted surface used for the broadcast panel and chat-bot avatar (consistent, paired correctly with accent-blue borders); the `#0F1A28` weight-stepper +/- button background (intentional neutral UI color, not a semantic status color); the `#1A1010` chat error banner (correctly paired with red, matches `theme.red`); and the `#0a0a0a` `.mq-shell` background in `shared.jsx` (this is the outer letterboxing behind the mobile app frame on wide screens, not an in-app surface — doesn't need to match the theme palette).

**Verification done this session:** all 6 touched files passed an `esbuild` parse/syntax check. Line-count deltas were all exactly 0 — every change was a text-level color-value swap, no lines added or removed, no logic touched. Confirmed the router/component-name safety checklist (`export default function Morphiq()`, `function GymOwnerDashboard()`, `function WorkoutScreen()` all present and unchanged). Caught one real bug before it shipped: an early draft of the "Plans & pricing" button fix referenced the branded accent variable `a`, which isn't in scope in that function (`GymOwnerDashboard()` doesn't destructure it, only its child tab components do) — would have crashed the footer. Caught by checking scope before pushing, fixed to use the literal hex like the rest of that function already does.

**Still NOT done:** an actual look at the rendered app. Every fix this session (and Session 12's) was a precise text-level hex swap verified by reading the code and syntax-checking it, never confirmed against real pixels. This has been true since the original color redesign — worth a real visual pass whenever Bryant has a few minutes to look at the live app, especially the WorkoutScreen warm-up flow and the rest-screen PR banner, since those changed the most this session.

## Session 12 shipped (partial — now completed by Session 13 above)

Bryant asked, after the redesign: "make it uniform... anything not in the color palette, less rainbow." Approved the full plan with "Yes to all." Session 12 made a first pass and checkpointed partial progress (commit `90b495f`): meals input box background, MealScreen macro-bar colors and water tracker, home screen's first Daily Targets widget, ProgressScreen volume-chart colors, WorkoutScreen stray warm-up-text grays and gold PR text, Morphiq.jsx stray grays and sync-error banner, GymOwnerDashboard pricing-tier/avatar/stat-card colors, SuperAdminDashboard status-pill colors. Session 13 (above) finished the rest.

## Session 11 shipped

**Plateau-based deload trigger** (top-priority punch-list item from session 10, scoped and agreed with Bryant, now built). Replaces the old flat "deload every 5 weeks" calendar clock with a real signal:

1. `detectPlateau(logs, sessionsToCheck=4)` in `shared.jsx` — looks at ONE exercise's own working-set history (warm-ups excluded) and flags flat/dropping if the most recent of the last 4 session dates isn't higher than the oldest of those 4, on BOTH top weight lifted AND reps at that weight (adding reps at flat weight is still progress — that's the 2-for-2 rule about to fire, not a plateau, so it's deliberately not flagged).
2. `shouldTriggerDeloadFromPlateau(currentPlan, workoutLogs, nextWeekNum)` in `shared.jsx` — runs `detectPlateau()` across every exercise in the plan (flat mirror + all customDays) and triggers deload once at least half the exercises with enough history (4+ sessions) are flat/dropping. Two safety floors: never re-trigger within 3 weeks of the last deload, and if there still isn't enough clean data after 8+ weeks (new member, sparse logging), fall back to the old calendar behavior rather than risk "never deload."
3. `progressPlan()` now calls this instead of `nextWeekNum % 5 === 0`. Plan objects gained three new persisted fields — `lastDeloadWeek`, `deloadCount`, `isDeloadWeek` — so `isPostDeload` and the primary/variation exercise alternation (previously `floor((week-1)/5)` calendar math) now run off real deload history instead of week-number math. No DB migration needed — these are new keys inside the existing `profiles.plan` jsonb blob, safe/backward-compatible for existing saved plans.
4. Removed the old "Last hard week before recovery" week-4-of-5 warning message, since deload timing is no longer predictable in advance — leaving it in would have shown a stale, misleading heads-up.

**Incidental bug fix, found while building this:** the only place `progressPlan()` was ever fed real data — `checkAndGenerateNextWeek()` in `Morphiq.jsx` — was calling `sb.getWorkoutLogs(uid, 30)`, which has no `set_number` filter at all (warm-up sets were silently mixed into every progression decision, both the new plateau check and the pre-existing 2-for-2 rule) and only a flat 30-row cap across every exercise combined (not enough history once a member has more than a few exercises in rotation). New `sb.getWorkoutLogsForProgression(supabaseUserId, daysBack=70)` in `shared.jsx` fixes both — filters to working sets only (`set_number=gt.0`, same convention as `getLastSetForExercise()`), looks back 70 days, cap raised to 500 rows. `getWorkoutLogs()` itself was left untouched — the Progress screen still wants its simple unfiltered recent-activity behavior.

**Verification done this session:** all four new/changed functions were pulled out and run against 8 hand-built scenarios in Node (flat trend triggers, clear progress never triggers even past the calendar floor, too-soon-since-last-deload blocks re-trigger, insufficient data does/doesn't fall back to calendar correctly, minority vs. majority plateau, rising reps at flat weight isn't flagged) — all 8 passed after one real bug was caught and fixed (the calendar safety net was initially written to override a clear "still progressing" signal once 8 weeks passed, which would have defeated the entire point of this feature; fixed so the calendar fallback only applies when there's genuinely not enough data to judge). Both changed files also passed an `esbuild` parse/syntax check. Line-count deltas were small and additive only (no accidental deletions), all safety-checklist items intact (router exports, component names, etc.).

**Update — real Supabase integration test done (same session, follow-up pass):** seeded 4 weeks of real `workout_logs` rows on the `WarmupTest` profile (flat/plateaued weight and reps on all 6 exercises, plus a deliberately escalating fake warm-up set per session to prove the `set_number=gt.0` exclusion actually holds against real data, not just synthetic). Queried Supabase with the exact filter `getWorkoutLogsForProgression()` uses, confirmed it returns exactly the 28 working-set rows and correctly excludes all 4 warm-up rows. Ran the REAL shipped `progressPlan()` (extracted straight from the pushed `shared.jsx`, not a rewritten copy) against that real data plus the real `WarmupTest` plan row — it triggered `isDeloadWeek: true`, `deloadCount: 1`, correct 60%-of-current weights on every exercise (135→80, 115→70, 95→55, 85→50, 20→10), RPE capped at 6, and the new "leveled off" copy. Re-ran the same real plan/exercises with a second, clearly-progressing set of logs (weight and reps climbing every session) through the same real function — correctly did NOT trigger a deload and progressed weights normally instead. Then wrote the deload result back to `profiles.plan` via SQL (mirroring exactly what `sb.upsertProfile()` sends) and read it back to confirm it persists correctly.

**`WarmupTest` is currently LEFT in this real deload state on purpose** — Bryant can open the app, log into `WarmupTest`, and see an actual data-triggered deload week live (60% weights, RPE 6 cap, "leveled off" copy) without needing me to drive a login. The seeded `workout_logs` rows are still in the table too, so Progress-screen history for that profile will show the flat trend that caused it. Say the word and it'll get reset back to a clean week 1.

**Still NOT independently verified by me:** the actual browser → PostgREST → RLS network round-trip (this session's testing went through Supabase directly rather than a real signed-in browser session, since that requires an OTP email code only Bryant can receive) and the literal on-screen rendering. The query shape and RLS pattern are identical to `getLastSetForExercise()`, which already works live in production, so this is low-risk — but a real look at the actual screen is still the cleanest way to fully close this out, whenever Bryant wants to take a look.

## Files touched this session (Session 14)

- `src/shared.jsx`: 2,549 → 2,563 (+14) — `getGymBranding()` now retries 3x with backoff instead of one silent attempt
- `src/Morphiq.jsx`: 1,481 → 1,494 (+13) — neutral placeholder default instead of a real gym's name, mount-effect race guard, updated stale comment

Both deltas are small and purely additive (retry loop + explanatory comments) — no logic removed, nothing near the 3,800-line hard limit.

## Files touched in Session 13, for reference (final line counts — all net 0, values-only swaps)

- `src/Morphiq.jsx`: 1,481 → 1,481 — daily-targets macro colors + "Week complete!" trophy
- `src/MealScreen.jsx`: 720 → 720 — macro-bar and "remaining today" protein colors
- `src/GymOwnerDashboard.jsx`: 845 → 845 — AI-usage stat colors, Plans & pricing button, undefined-variable bug caught and fixed before push
- `src/ProgressScreen.jsx`: 580 → 580 — "PBs logged" stat color, PB flame badge → green
- `src/SuperAdminDashboard.jsx`: 343 → 343 — pricing tier colors unified, 4x `#60A5FA` stat colors
- `src/WorkoutScreen.jsx`: 2,426 → 2,426 — full amber re-scoping (12 distinct spots), RPE badge

## Latest commit

`4178f53` on `main` — Session 14's gym-branding fix. `344952f`/`6c90146` (Session 13, color sweep) are the two commits before it.

## Punch list, in priority order

**TOP PRIORITY — live-verify the gym-branding fix (Session 14).** Log in, confirm the correct gym name shows, genuinely background the phone long enough for a real network reconnect (not just a quick app-switch), reopen, and confirm the name holds. This was root-caused and fixed at the code level but the original bug was intermittent, so it may take more than one try to feel confident it's actually closed.

**SECOND — visual QA on Session 12/13's color changes.** Nobody has looked at the actual rendered app since either color-sweep session — both were precise text-level hex swaps verified by reading code and running syntax checks, never confirmed against real pixels. Most important screens to check: WorkoutScreen's warm-up flow (should now read as calm/gray instead of urgent/amber) and the rest-screen PR banner (should now read as a green celebration instead of amber).

**THIRD — take a real look at the plateau/deload trigger in the live app, then reset `WarmupTest`.** The data-level integration test is done (see Session 11 notes above) — real Supabase data, the real shipped functions, both branches confirmed, write-back confirmed. What's left is just opening the app, logging into `WarmupTest`, and eyeballing that the deload week (already sitting there right now: 60% weights, RPE 6 cap, "leveled off" copy) actually renders correctly on screen. Also still unconfirmed: that `isPostDeload`'s variation-exercise swap fires correctly on the week after a deload — would need one more progression cycle on top of the current state to see. Once confirmed, reset `WarmupTest` back to a clean week 1 (Bryant asked to be consulted before any changes to that profile, but he's aware it's disposable test data).

**FOURTH — still-unconfirmed live spot-check from session 8.** The original weight stepper / increment / progression math walkthrough has still never been explicitly confirmed start-to-finish, though a lot of adjacent stuff (autoregulation, warm-up ramp, guardrail) has now been live-tested as a side effect of chasing specific bugs. Also still unverified: a full multi-day custom plan walked start-to-finish, and the session-7 stats/rest-timer steps.

**FIFTH — cardio logging.** Remove or redesign; Bryant dislikes the current implementation and its placement (buried in Progress → Workouts → Recent sessions). No direction chosen yet.

**SIXTH — misleading multi-day AI plan structure.** AI-generated plans give the identical 5-exercise routine every day regardless of `daysPerWeek`, but show a split-sounding label ("Upper/Lower," "Push/Pull/Legs") that implies real day-to-day variety. Needs a decision: build real per-day variation, or fix/remove the misleading label. Custom hand-built plans are unaffected.

**SEVENTH — custom-plan weight-increment sizing.** Flat 2.5 lbs for every hand-built exercise regardless of equipment — same bug already fixed for AI-generated plans, not yet ported to `CustomPlanScreen`. Needs an equipment question in the custom-plan flow or a lookup against the Supabase `exercises` table.

**EIGHTH — warm-up sets, partially open.** Session 9's compound-vs-isolation split (isolation gets one light set or none) substantially addresses the original ask to skip unnecessary warm-ups, but hasn't been explicitly confirmed as sufficient — don't mark fully resolved without checking with Bryant. Unrelated and still open: the edit-plan macro-wipe bug (changing goal/days/equipment in-app silently wipes calorie/macro targets instead of recalculating, open since session 7).

**NINTH — deferred.** Exercise diagrams/animations (needs a licensed clip library, deferred until after the redesign); kettlebell weight-increment problem (flat 5 lb placeholder, not plate-based, needs its own model); muscle-recovery-aware exercise selection (Fitbod-style, would use the already-populated-but-unused `muscle_group` column) and a daily readiness check-in — both explicitly deferred past the redesign. Wearable/HRV integration (Whoop-style) stays out of scope entirely.

**LOWER PRIORITY / OPS.** Naming cleanup (GitHub repo, live URL, `Morphiq.jsx`/`function Morphiq()` still carry the retired placeholder name — cosmetic only); duplicate/legacy test profile rows (one blank-named row still unidentified, plus the "WarmupTest" row from session 10's live testing); privacy policy/terms (blocked on a lawyer); Stripe paywall enforcement (`plan_tier` exists but nothing blocks unpaid use); a controlled Sentry backend test.

## Technical notes carried forward

GitHub REST API and raw.githubusercontent.com are blocked from the sandboxed shell's `curl`/direct HTTP — `git clone`/`git push` over authenticated HTTPS works fine and is the reliable path (raw.githubusercontent.com IS reachable via a plain URL-fetch tool if one is available, just not via shell curl). `profiles.supabase_user_id` is the auth link; `profiles.id` is the FK used everywhere else. Fire-and-forget `.catch(() => {})` pattern for all new Supabase writes. `AuthScreen` lives in `Morphiq.jsx`, not `shared.jsx`. `workout_logs` columns: `id, user_id, exercise_name, set_number, reps, weight, workout_date, logged_at` — warm-up sets are tagged `set_number=0`, working sets `set_number>0`; several existing functions already filter on `set_number=gt.0` (`getLastSetForExercise`) and the new `getWorkoutLogsForProgression` now does too. The `exercises` table (91 rows: id, name, muscle_group, pattern, equipment, difficulty, variation_of, is_active) is a reference/classification table, still not wired into live plan generation — relevant for punch-list items FIFTH (cardio, unrelated) and SEVENTH, and for the deferred muscle-recovery-aware programming feature.

**Duplicate logic is the recurring root cause of real bugs in this codebase.** Sessions 9 and 10's major bugs, the warm-up-pollution bug found in session 11, Session 13's `growth` pricing-tier color drift in `SuperAdminDashboard.jsx` (a second copy of the `plans` array that quietly went out of sync), and this session's gym-branding bug all trace back to the same shape of mistake: two copies of near-identical logic living in different places, or a single fetch with no resilience sitting on the critical path of something that MUST succeed, and when it silently doesn't, nothing catches it. When fixing or building something that touches data or values defined in more than one place — or that depends on a single network call always succeeding — check for a second copy, a missing retry, or a swallowed error before considering it done.

**A silent `.catch(() => {})` is not the same as "handled."** Session 14's gym-branding bug looked fixed once before (session 9's comment says so) because the code path existed and worked most of the time. It kept resurfacing because "most of the time" isn't good enough for something that runs on every single app open, and a bare catch that gives up after one attempt has no way to tell the difference between "this gym genuinely doesn't exist" and "the network hiccuped for 200ms." When a fetch result gets shown directly to the user (not just logged or retried elsewhere), and a wrong/stale value is worse than a slightly slower correct one, it's worth 2-3 retries with a short backoff rather than one shot and silence — this codebase already had the right pattern in `getProfileWithRetry()`, it just hadn't been applied to `getGymBranding()` yet.

**Watch for variable name collisions across the same file, even across different scopes.** This session's near-miss: the `a` (branded accent color) variable exists in some functions of `GymOwnerDashboard.jsx` but not the top-level `GymOwnerDashboard()` function itself — referencing it there would have thrown a runtime crash on that screen's footer. Caught before pushing by checking the function scope, not just copy-pasting the pattern used elsewhere in the same file. Grep for a name's actual scope before reusing it, don't assume it's globally available just because it's used nearby.

**Rule-based trend math, not AI calls, for anything that's really just number comparison.** The plateau detector follows the same reasoning as `isBigWeightJump()` and the existing 2-for-2 rule: instant, free, deterministic, same answer every time. AI stays reserved for things that actually need language (chat, coach notes).
