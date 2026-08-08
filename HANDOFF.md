# Hypergentiq — Session 21 master handoff (login-toggle bug fix, gym-logo branding shipped, warm-up + rest-screen fixes live-verified)

This file is the handoff. At the start of every session, fetch this file from the repo along with the src/ and api/ files — it replaces pasting a handoff into chat by hand. **MANDATORY fetch method — git clone only, see Technical notes below.**

## STANDING GOAL — App Store + Google Play submission roadmap (carry forward every session, do not delete until fully checked off)

Untouched this session — carried forward unchanged from Session 20. Bryant wants Hypergentiq submitted to both the Apple App Store and Google Play via Capacitor (not a React Native rewrite). Full step list lives in git history (`git show 0d25354:HANDOFF.md` or earlier); short version: (1) fix PWA gaps (manifest icons, service worker), (2) add Capacitor + generate native projects, (3) set up Capgo live-update pipeline, (4) Android path (Bryant needs a Google Play Console account, $25), (5) iOS path (needs a Mac on macOS Sequoia 15.6+ for Xcode 26, or a cloud Mac build service), (6) privacy policy — hard gate for both stores, still blocked on a lawyer, (7) store listing assets (icon done, need screenshots + descriptions), (8) confirm no Apple IAP conflict, (9) submit. No progress this session.

## Session 21 — what got built/fixed/verified this session, in order

**1. Live-verified the two Session 20 fixes that were only code/build-checked before — both confirmed correct.** Rest-screen "Up next"/"After that" (WorkoutScreen.jsx, commit `2301365` from Session 20): clicked through a real Push-day workout — "Up next" correctly showed each upcoming set's real weight, and "After that" correctly stayed on the same exercise's next set until "Up next" itself moved to a new exercise. Warm-up re-ramp (shared.jsx `reRampWarmups()`, commit `be9dfd3` from Session 20): temporarily raised WarmupTest's Push-day Dumbbell bench press working weight to 90 lbs in Supabase (crosses the 65 lb warm-up-ramp threshold), ran the actual workout, manually bumped warm-up set 1 from its planned 45 lbs to 70 lbs using the in-app stepper, and confirmed on screen that warm-up 2 correctly became 70 lbs (up from its own planned 65) and warm-up 3 correctly stayed at 75 lbs (its own planned number, since 75 > 70) — exactly the fixed behavior, ramp never drops after a bump, stays capped below the 90 lb working weight. Weight reverted to 25 afterward; test log entries deleted from `workout_logs`.

**2. Real, previously-undocumented login bug found and fixed (Bryant, live report after getting stuck testing #1). Commit `4c2b013`.** `AuthScreen.verifyCode()` in `Morphiq.jsx` was ignoring the Member/Owner toggle shown on the login screen entirely — it always looked up whether the entered email owns a gym and routed to the Owner Dashboard if so, no matter which tab was selected. Any dual-role account (owns a gym AND has their own member profile — exactly how Bryant's own test account is set up) could never reach the member view through a fresh login. Fixed: "Gym Owner" mode now always does the owner lookup and shows a clear error if that email doesn't actually own a gym; "I'm a Member" mode always signs in as a member, even if that email also owns a gym. Live-verified in Chrome after deploy — selecting "I'm a Member" now correctly lands on the member home screen instead of the Owner Dashboard.

**3. TOP PRIORITY from Session 20 — gym-logo branding feature finished and live-verified. Commit `e7475ff`.** All groundwork from Session 20 (GymLogo component, `saveGymBranding`/`uploadGymLogo` in shared.jsx, the real Supabase Storage bucket + RLS, demo-gym's real uploaded logo) is now actually wired into the app:
- `gymBranding` React state carries a `logo` field (from `gyms.logo_url`), set at all 4 places branding loads in `Morphiq.jsx`: the default/invite-link fetch, and the 3 identical owner/member sign-in + session-resume call sites.
- `GymOwnerDashboard.jsx`'s existing Branding tab (`OwnerBrandingTab`) got a real logo upload UI: file picker restricted to png/jpg/webp/svg, client-side 2MB + type validation with plain-English errors, a live preview on the actual dark card background, a "Loading screen preview" panel showing exactly what members will see, and a Remove option — all wired through the existing (previously unused) `saveGymBranding` logo parameter, only persisted on "Save changes."
- `LoadingScreen` in `Morphiq.jsx` now renders the gym's real logo plus a small "Powered by Hypergentiq" credit when `gymBranding.logo` is set. A gym with no logo falls back to its plain gym name as text, matching the top bar's own treatment — never the big Hypergentiq mark. The mark only appears because demo-gym's own `logo_url` happens to point at it (real data), not as hardcoded fallback behavior.
- **Live-verified in Chrome**, both cases: logged in as demo-gym's owner, confirmed the real uploaded Hypergentiq logo renders correctly with the small credit beneath it in the Branding tab's live preview; clicked "Remove" (local-only, never saved) and confirmed the preview correctly flips to plain "HYPERGENTIQ GYM" text with no logo; clicked Reset and confirmed via Supabase that demo-gym's real `logo_url` was never touched. **Not separately tested:** an actual member login to a genuinely no-logo gym (no OTP-inbox access to `bryant-s-gym`'s or `test-gym-1`'s owner emails this session) — the preview panel uses the identical `GymLogo` component and conditional logic as the real splash screen, so this is very likely correct, but a real member-side click-through on a no-logo gym would be the fully thorough version if it matters later.

**4. Business discussion — personal trainer market segment, logged for later, not started. Commit `590bc8c`.** Bryant asked whether marketing Hypergentiq to individual personal trainers (not just gyms) is worth it. Assessment: directionally yes — real market size, and the AI-assisted-programming angle is a genuine differentiator from existing solo-trainer tools (Trainerize, TrueCoach, PT Distinction, Everfit all assume the trainer hand-builds every plan) — but it's a second customer segment with its own pricing (current per-active-member model doesn't work at trainer scale, would need a low flat "Solo" tier), positioning (some trainers will resist AI-generated programming — pitch needs to be "AI drafts, you approve," which also makes the still-unbuilt build-your-own-workout/manual-override feature more important for this segment), and go-to-market (self-serve, not the current gym sales motion). Logged in `DECISIONS.md`. Not started — competes for attention with the App Store roadmap.

**5. Real accidental data loss during testing — flagged to Bryant, confirmed low-impact.** While testing #1 and #2 above, `profiles.workout_progress` (a single in-progress-workout slot per profile, NOT namespaced per day) on WarmupTest got overwritten by Push-day test sets, and was later explicitly cleared to `null` during test cleanup. This most likely destroyed the real in-progress Legs-day snapshot Session 19/20 had deliberately preserved (`workout_progress` can only hold one in-progress workout at a time, and no backup of its exact contents was taken before testing began). Bryant confirmed this is low-impact — WarmupTest is his own test account, no other real member data was touched.

## Files touched this session (final line counts)

- `src/Morphiq.jsx`: 1,548 → 1,565 (+17, commit `4c2b013`, login-toggle fix) → 1,586 (+21, commit `e7475ff`, gym-logo state wiring + LoadingScreen). Net this session: 1,548 → 1,586 (+38)
- `src/GymOwnerDashboard.jsx`: 845 → 927 (+82, commit `e7475ff`, logo upload UI + preview panels in `OwnerBrandingTab`)
- `DECISIONS.md`: +13 lines (commit `590bc8c`, personal trainer segment entry)
- `HANDOFF.md`: this file (commit pending as of writing)

All files, current full line counts:

| File | Lines |
| --- | --- |
| src/Morphiq.jsx | 1,586 |
| src/shared.jsx | 3,004 |
| src/WorkoutScreen.jsx | 2,611 |
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

`shared.jsx` is still at 3,004 lines, over the 2,000-line soft target — carried forward from Session 20, no split proposed yet. `GymOwnerDashboard.jsx` grew 82 lines this session (under the 200-line same-session audit threshold, no audit needed) but is worth watching if more owner-facing features land on top of it.

## Latest commits

`e7475ff` (gym-logo branding finished) → `590bc8c` (personal trainer decision logged) → `4c2b013` (login-toggle fix) → `96420e3` (Session 20 handoff) on `main`.

## Confirmed working vs still open

**Live-verified in Chrome this session:** rest-screen Up next/After that (item 1), warm-up re-ramp (item 1), the login-toggle fix (item 2), gym-logo branding for both the with-logo and without-logo cases via the Owner Branding tab's live preview (item 3).

**Not separately live-tested:** gym-logo branding on an actual member-facing splash screen for a genuinely no-logo gym (blocked on not having OTP-inbox access to another gym owner's email this session) — the preview panel used for verification shares the exact same component and logic as the real splash screen, so this is a minor completeness gap, not a real doubt.

**Not started at all yet:** daily readiness check-in, plate-math breakdown display, AI plan staleness audit (all carried forward from Session 20's competitive research), personal trainer market segment (new this session, intentionally not started).

## Punch list, in priority order

**FIRST — the 3 items from Session 20's competitive research, still not built:** a daily readiness check-in (one-tap rough/ok/great nudging that day's volume/intensity, no wearable needed); a visible plate-math breakdown (e.g. "2×45 + 1×10 per side") on working sets, computed client-side; a staleness audit of the AI per-day plan variation over a longer simulated timeline (verification task, not new code, unless an issue turns up).

**SECOND — unblock the privacy policy.** Still the single highest-leverage blocked item — blocks both this punch list and the entire App Store roadmap (STANDING GOAL, step 6). Still blocked on Bryant contacting a lawyer.

**THIRD — no-blocker App Store groundwork.** Capacitor setup and the Capgo live-update pipeline can start anytime.

**FOURTH — optional completeness check on gym-logo branding:** live-test the actual member splash screen (not just the owner preview panel) for a real no-logo gym, if maximum confidence is wanted before considering the feature fully closed out.

**FIFTH — four product/design items from Session 18, still just discussion, nothing built:** a per-category custom/recurring grocery item that persists; the Progress screen's "Workout streak" card (currently shows no real data); whether "Log Cardio" is worth keeping at all; a broader review of what Progress/Nutrition should measure against top fitness apps.

**SIXTH — walk a full week on `WarmupTest` (or a fresh test profile) start-to-finish**, carried forward from Session 19. Note: `WarmupTest`'s in-progress Legs-day snapshot from Session 19 was very likely destroyed this session during warm-up testing (see Technical notes below) — this walkthrough will need to start fresh rather than resume that old snapshot.

**SEVENTH — confirming the warm-up compound/isolation split is sufficient.** Needs a direct decision from Bryant, not code.

**EIGHTH — kettlebell weight-increment refinement.** Deferred, needs its own model.

**NINTH — exercise diagrams/animations.** Deferred, needs a licensed clip library.

**TENTH — personal trainer market segment** (new this session, see DECISIONS.md). Worth a real discussion before any building — pricing, positioning, and go-to-market all need answers first, not just a "should we" decision.

**LOWER PRIORITY / OPS.** `shared.jsx` still at 3,004 lines — propose a split before it grows much further. The one unidentified blank-named test profile row in Supabase. Naming cleanup (GitHub repo, live URL, `Morphiq.jsx`/`function Morphiq()` still carry the retired placeholder name — cosmetic only).

## Technical notes carried forward

**MANDATORY fetch method — git clone only, reconfirmed again this session.** `git clone`/`git push` over authenticated HTTPS from a plain scratch directory worked reliably every time this session (session-start fetch, and 4 separate pushes). `api.github.com` and direct `curl`/Python HTTP calls to `github.com`/`raw.githubusercontent.com` are still blocked outright by this environment's outbound proxy allowlist (`blocked-by-allowlist`, confirmed again this session) — do not attempt them. One new data point: fetching a GitHub **blob page** (`github.com/.../blob/main/HANDOFF.md`, the rendered HTML page, not the raw file or API) via the web-fetch tool did successfully return real, current file content when git wasn't yet available at the very start of this session — worth knowing as a last-resort read-only fallback if git access is ever genuinely unavailable, but `git clone` remains the only method to use by default.

**`profiles.workout_progress` is a single in-progress-workout slot per profile, not namespaced per day.** Starting or logging any set on any day overwrites whatever was previously stored there, with no protection. This is what destroyed WarmupTest's preserved Legs-day snapshot this session (see item 5 above). Before ever starting a test workout on an account whose `workout_progress` needs to be preserved, query and save a copy of the existing value first — don't assume it's safe just because you're testing a different day/exercise.

**Dual-role accounts (same email is both a gym owner and has their own member profile) — now fixed, but worth remembering the pattern exists.** `AuthScreen.verifyCode()` in `Morphiq.jsx` resolves login role by checking `getGymByOwnerEmail()` first; as of this session it correctly also checks the Member/Owner toggle the user selected (see item 2 above). If similar role-resolution bugs turn up elsewhere (e.g. `SUPER_ADMIN_EMAIL` is checked before any gym lookup, same general shape), check this function first.

**Live-testing an app is not the same as reading its code — proven true a third time this session.** Both of Session 20's code/build-verified-only fixes turned out correct once actually clicked through (good outcome this time), but this should never be assumed going in. Budget real Chrome time for anything claimed "verified" by code review alone.

**OTP-gated test logins cost real back-and-forth.** WarmupTest / demo-gym's owner login (`cafe75designs+customtest2@gmail.com`) requires a fresh emailed 6-digit code every time the session is signed out and back in — Bryant has to manually relay the code each time. Budget for this when planning a session with heavy live-testing, and avoid signing test accounts out unless there's a real reason to.

**Duplicate logic root-cause pattern (carried forward, no new instance this session).**

## Paste this at the start of your next session

```
Fetch HANDOFF.md and all src/ and api/ files fresh via git clone (NOT the GitHub API or raw.githubusercontent.com — both are blocked/unreliable in this environment). Report every file's line count before doing anything else. Confirm the plan with me before making any changes.

FIRST: build the 3 items from Session 20's competitive research, still not started — a daily readiness check-in (one-tap rough/ok/great nudging that day's volume), a visible plate-math breakdown on working sets, and a staleness audit of the AI per-day plan variation over a longer simulated timeline.

SECOND: privacy policy is still the single highest-leverage blocked item (blocks the whole App Store roadmap) — still waiting on me to contact a lawyer, not something to build around.

THIRD (optional, low priority): if it matters, live-test the gym-logo branding feature's no-logo fallback on an actual member splash screen (not just the Owner Branding tab's preview panel) — needs OTP-inbox access to a second gym owner's email I haven't given yet.

Note: WarmupTest's old in-progress Legs-day snapshot from Session 19 was very likely wiped during Session 21's warm-up testing (workout_progress is a single slot, not per-day) — don't expect it to still be there.
```
