# Hypergentiq — Session 47 master handoff

This file is the handoff. At the start of every session, fetch this file from the repo along with the src/ and api/ files — it replaces pasting a handoff into chat by hand. **MANDATORY fetch method — git clone only, see Technical notes below.**

## STANDING GOAL — App Store + Google Play submission roadmap (carry forward every session, do not delete until fully checked off)

Real progress this session: the single most important open item from Session 46 is now closed. Account deletion (Apple Guideline 5.1.1(v)) was built and deployed last session but never actually clicked and confirmed — this session did that, live, end-to-end, on the real production app, with a real throwaway test account, and it fully works. Step list otherwise unchanged: (1) fix PWA gaps — done, Session 30, (2) add Capacitor + generate native projects — done (Session 25), still never opened in Android Studio/Xcode by a human, (3) set up Capgo live-update pipeline — still open, (4) Android path (Bryant needs a Google Play Console account, $25), (5) iOS path (needs a Mac on macOS Sequoia 15.6+ for Xcode 26, or a cloud Mac build service), (6) privacy policy — hard gate for both stores, still blocked on Bryant forming a real legal business entity before it can be finalized and sent to a lawyer, (7) terms of service — same status as privacy policy, (8) account deletion — **built Session 46, live-verified working this session (47)**, (9) store listing assets (icon done, need screenshots + descriptions), (10) confirm no Apple IAP conflict, (11) submit.

## Session 47 — live-tested account deletion end-to-end on the real production app; it fully works

**Bryant asked for the account-deletion feature (built and deployed last session, but never actually clicked) to be tested completely, hands-off.** This was Session 46's #1 punch-list item. Did the whole thing live against the real production app and the real production database — no shortcuts, no simulation.

**How the test account was created — hit a real snag, worked through it:**
- First tried a disposable test email using a "+" tag on Bryant's real address (`bcarbonell+hgdeletetest0822@sbcglobal.net`), so a throwaway signup wouldn't need a separate inbox. The sign-in code never arrived after ~8 minutes of checking Primary, All, and Spam. **Root cause: AT&T/Yahoo Mail does not support "+" sub-addressing the way Gmail does** — the email silently never delivered. Not an app bug.
- Switched to Bryant's plain real address (`bcarbonell@sbcglobal.net`). Confirmed first via a direct database query that this address wasn't already tied to any existing profile (it wasn't — the pre-existing "WarmupTest" profile in this browser's saved session turned out to be tied to a completely different email, `cafe75designs+customtest2@gmail.com`, so no collision risk). Resent the code, it arrived in under 10 seconds this time, and Bryant independently relayed the same 6-digit code back in chat as a cross-check — both matched.
- Signed out of the pre-existing "WarmupTest" login first and left it completely untouched (it's still there for the still-open "live-test WarmupTest full week" punch-list item) before starting the new signup, so this test didn't clobber other in-progress test data.

**Built a real member profile through the actual onboarding flow** — name "DeleteTestAcct" (deliberately obvious so it could never be mistaken for a real account), full onboarding questions answered, a real AI-generated plan built. This created a genuine `profiles` row exactly the way a real new member's does.

**Seeded one row into every other table `api/delete-account.js` is supposed to clean up**, via direct database insert, all tagged with the word "test" or "delete_test_seed" so they'd be unmistakable if anything went wrong: `ai_usage`, `cardio_logs`, `grocery_custom_items`, `water_logs`, `gym_messages`, `workout_logs`, `meal_logs`, and `sync_issues` (all previously untouched by onboarding — `weight_logs` already had one row from onboarding's starting-weight capture). Also seeded `user_settings`, which points at the login record directly rather than the profile. **Captured an exact before-count: 1 row in every one of 11 tables, plus 1 matching login record in Supabase's own login table (`auth.users`) — 12 confirmed data points before deletion.**

**Clicked through the real Profile screen's Danger Zone in the actual live app** — "Delete my account" → the real confirm-are-you-sure step (correct warning copy) → "Yes, permanently delete" → watched the button switch to a genuine "Deleting…" loading state → the app automatically signed out and dropped back to the sign-in screen on success, exactly as designed.

**Re-ran the exact same 12-point count immediately after. Every single one came back at zero.** All 11 data tables empty for this user, and the login record itself gone from `auth.users` too — meaning the account cannot be signed back into ever again, not just that its data was wiped. This is the strongest possible proof: it's not a UI message claiming success, it's a direct database check confirming the real result.

**Bottom line: the account-deletion feature works correctly, end-to-end, with no gaps found.** Apple Guideline 5.1.1(v) is now genuinely satisfied, not just "probably fine based on code review."

## Session 46 recap — carried forward, unchanged

Reviewed the privacy policy draft as a non-lawyer checklist pass, built and shipped in-app account deletion (the feature verified live this session), drafted Terms of Service for the first time, and worked around Vercel's Hobby-plan 12-function cap by merging two low-traffic billing-report tools into one file (`api/usage-report.js`). See prior version of this file (or `git log`) for full detail if needed.

## Session 45 recap — carried forward, unchanged

Live-verified Session 44's fixes, fixed a real Meals-screen gap, unified nutrition macro colors, and stood up a GitHub Actions check that verifies the Android app still compiles on every push. See `git log` for detail if needed.

## Files touched this session (final line counts)

No code files were changed this session — this was a live test only. Only `HANDOFF.md` was updated. File sizes are unchanged from Session 46: `src/shared.jsx` 3,716 (largest, watch this one), `src/WorkoutScreen.jsx` 2,865, `src/Morphiq.jsx` 1,742, `src/GymOwnerDashboard.jsx` 927, `src/MealScreen.jsx` 869, `src/ProgressScreen.jsx` 657, `src/OnboardingScreen.jsx` 622, `src/SuperAdminDashboard.jsx` 343, `src/ChatScreen.jsx` 300, `src/CardioScreen.jsx` 295, `src/GymSignupScreen.jsx` 269. `api/` still has 12 files (the Vercel Hobby-plan cap) — none near any size concern individually.

## Latest commit

Unchanged from Session 46: `2778f85` — "Docs: Session 46 handoff -- account deletion built, ToS drafted, Vercel function-cap fix". This session's own commit (this file) follows it.

## Confirmed working vs still open

**Confirmed live, this session, via direct database verification (not just code review or a clean deploy):**
- `api/delete-account.js` — deletes every table it's supposed to, in the correct order, with no foreign-key errors, and removes the actual Supabase Auth login record too. Tested against a real account with real data seeded in every relevant table.
- The Profile screen's Danger Zone UI flow — button, confirm-are-you-sure step, loading state, and post-success sign-out — all work exactly as designed.
- The account-deletion feature as a whole is now **fully live-verified**, not just code-reviewed.

**Two small unrelated items noticed in passing this session (not investigated, not part of this session's task, flagging for next session):**
- Two "Android build check failed" GitHub Actions emails arrived in Bryant's inbox today (commits `c338427` and `3a12993`) — worth a look next session to see if the Android build is currently broken on `main`.
- A "Failed production deployment" email from Vercel landed in Bryant's **Spam** folder today around 12:35 PM — easy to miss there. Worth checking `list_deployments` next session to see what failed and why, and possibly checking why Vercel's notification emails are landing in spam at all.

**NOT yet verified / still open from prior sessions (unchanged):**
- The post-onboarding "Plan ready" screen's color/Fat-tile fix from Session 45 — still only code-reviewed, not walked through live.
- The weight chart real-phone swipe test.
- The cardio timer real-phone lock-screen test.
- Everything else on the punch list below.

## Punch list, in priority order

**FIRST — check the two failed Android build emails and the spam-folder Vercel deploy-failure email** (all noticed today, none investigated yet — see above).

**SECOND — unblock the privacy policy and terms of service.** Both drafts exist now. Both are still blocked on Bryant forming a real legal business entity, after which both documents need to go to an actual lawyer together.

**THIRD — walk through the post-onboarding "Plan ready" screen live** (carried from Session 45) to confirm its color/Fat-tile fix looks right in practice.

**FOURTH — design and build the weekly detection engine.** Unchanged — scoped, not started. Needs Bryant's input on exact plateau/macro-adherence thresholds before any code gets written.

**FIFTH — App Store groundwork, next concrete step: open the Android project in real Android Studio at least once.** The GitHub Actions check proves the app compiles (when it's passing — see FIRST above), but nobody has run it on a device or emulator yet. Capgo live-update pipeline still not started.

**SIXTH — an actual finger-swipe test on a real phone for the weight chart** (Bryant's own task, waiting on him logging more days).

**SEVENTH — cardio timer real-phone test.** Session 40's wall-clock fix still hasn't been live-tapped by Bryant with the screen genuinely locking.

**EIGHTH — wearable sync (Apple HealthKit/Fitbit).** Unchanged, still not scoped.

**NINTH through TWELFTH — unchanged, still open:** live-test `WarmupTest` full week start-to-finish (this profile is untouched and still available — tied to `cafe75designs+customtest2@gmail.com`, not Bryant's real email); get Bryant's sign-off on the compound/isolation warm-up split; exercise diagrams/animations (deferred); personal trainer market segment (needs its own discussion, see DECISIONS.md Aug 8 2026); expand exercise variety beyond primary/variation binary swap; the weight-loss/cardio redesign's still-undecided open questions from DECISIONS.md Aug 9 2026; voice input on the cardio quick-log and the "Other" activity type haven't been live-tested; the manual/voice cardio-logging path's calorie accuracy (no body weight passed to the AI estimate).

**RULED OUT — do not re-propose without new information:** camera/video-based AI form-checking (Session 44 research).

**LOWER PRIORITY / OPS.** Unchanged: one unidentified blank-named test profile row in Supabase; naming cleanup (GitHub repo, live URL, `Morphiq.jsx`/`function Morphiq()` still carry the retired placeholder name — cosmetic only); the "blank exercise weight saves as 20 lbs instead of staying blank" quirk.

## Technical notes carried forward

**AT&T/Yahoo Mail does not support "+" sub-addressing — new finding, this session.** A "+" tag on an sbcglobal.net/AT&T/Yahoo address (e.g. `name+tag@sbcglobal.net`) silently fails to deliver — no bounce, no error, it just never arrives. Confirmed directly: waited 8+ minutes, checked Primary/All/Spam, nothing. Switching to the plain address without any tag delivered in under 10 seconds. **Lesson for future sessions: never use a "+" alias on Bryant's real sbcglobal.net address to test anything — use the plain address, or a genuinely separate inbox.**

**GitHub push access.** Direct/automatic push still broken (identical git-proxy error, both via `git push` and the GitHub REST API directly). Working method unchanged: Chrome browser tool's "Upload files" page (`github.com/OWNER/REPO/upload/main/<folder>`), staging finished file(s) in `/mnt/user-data/outputs/` first — this exact path is required; files staged elsewhere are rejected by the browser upload tool.

**Vercel Hobby plan has a hard cap of 12 serverless functions per deployment.** Unchanged from Session 46 — `api/` is currently at exactly 12 files. Any new backend feature needs either a merge of two more low-traffic files or a decision from Bryant on Vercel Pro ($20/mo).

**Supabase test-data seeding pattern, useful for future live tests.** The Supabase MCP connector's `execute_sql` runs with full database access (not the app's own restricted anon key), so it can insert rows directly into any table — including tables normally reached only through specific app actions — for test setup, and can query `auth.users` directly to check whether a login record exists. Used this session to seed one row per table before testing deletion, and to get an exact before/after row count instead of relying on the app's UI to say "success." This is a reliable pattern for any future "does deletion/cleanup really work" test.

**GitHub Actions Android build check.** `.github/workflows/android-build.yml` runs on every push to `main`. Two failure emails arrived today for commits `c338427` and `3a12993` — not investigated this session (out of scope for the account-deletion test), flagged as next session's first item.

**Vercel MCP connector.** Use `list_teams` → `list_projects` (project `morphiq`, id `prj_0KL9CirNTdNMnXEO34o3pdwd5wSM`, team `team_Iiv1x067TLmgX2XdP5mXO06v`) → `list_deployments` to check `state`. A "Failed production deployment" email arrived in Bryant's Spam folder today around 12:35 PM — not investigated this session, flagged as next session's first item.

**WebFetch is not reliable for reading files from this repo — confirmed dangerous in multiple prior sessions.** Never use WebFetch for this repo's file contents — always `git clone` with the token embedded in the HTTPS URL.

**Supabase MCP connector.** `profiles.supabase_user_id` is the auth link (plain text column holding the auth user's UUID as a string), `profiles.id` is the FK used everywhere else. `api/delete-account.js` uses the service-role key (bypasses RLS) via `process.env.SUPABASE_SERVICE_ROLE_KEY` on the backend — separate and different from the Supabase MCP connector's own elevated database access used for this session's testing.

## Paste this at the start of your next session

Fetch `HANDOFF.md`, `DECISIONS.md`, and all `src/`/`api/` files fresh via `git clone` (reads work fine; do NOT use WebFetch for repo file contents). Report every file's line count before doing anything else; none are near the 3,800-line limit (`shared.jsx` is largest at 3,716). **GitHub push access:** still broken (platform-side git-proxy block) — use the Upload-files browser workaround, staging files in `/mnt/user-data/outputs/` specifically. **`api/` is at exactly 12 files — the Vercel Hobby-plan cap** — any new backend feature needs either a merge of two more low-traffic files or a decision from Bryant on Vercel Pro. **Never use a "+" alias on Bryant's real sbcglobal.net address** — AT&T/Yahoo Mail silently drops it; use the plain address for any test that needs to receive real email.

Remind Bryant: this session live-tested the account-deletion feature end-to-end on the real production app — created a real throwaway test account, seeded it with data in every relevant table, deleted it through the actual Profile screen button, and confirmed via direct database check that every single row (11 tables) and the login itself were completely gone afterward. **It fully works — this closes out Session 46's #1 open item.** Two small unrelated things turned up along the way and are flagged for next session: two failed Android-build emails today, and a Vercel deployment-failure email that landed in Bryant's Spam folder. Both legal documents (privacy policy, terms of service) remain blocked on Bryant forming a real business entity before they can be finalized and sent to a lawyer.
