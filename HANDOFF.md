# Hypergentiq — Session 46 master handoff

This file is the handoff. At the start of every session, fetch this file from the repo along with the src/ and api/ files — it replaces pasting a handoff into chat by hand. **MANDATORY fetch method — git clone only, see Technical notes below.**

## STANDING GOAL — App Store + Google Play submission roadmap (carry forward every session, do not delete until fully checked off)

Real progress this session: two of the store-submission hard gates moved forward. Account deletion (Apple Guideline 5.1.1(v), required before Apple will even review the app) is now built, deployed, and live. Terms of Service — previously entirely missing — now has a full first draft, mirroring the existing Privacy Policy draft. Step list otherwise unchanged: (1) fix PWA gaps — done, Session 30, (2) add Capacitor + generate native projects — done (Session 25), still never opened in Android Studio/Xcode by a human, (3) set up Capgo live-update pipeline — still open, (4) Android path (Bryant needs a Google Play Console account, $25), (5) iOS path (needs a Mac on macOS Sequoia 15.6+ for Xcode 26, or a cloud Mac build service), (6) privacy policy — hard gate for both stores, draft reviewed this session (see below), still blocked on Bryant forming a real legal business entity before it can be finalized and both documents sent to an actual lawyer, (7) terms of service — same status as privacy policy, drafted this session for the first time, (8) account deletion — **DONE this session**, was a real gap, now closed, (9) store listing assets (icon done, need screenshots + descriptions), (10) confirm no Apple IAP conflict, (11) submit.

## Session 46 — reviewed the privacy policy draft, built and shipped in-app account deletion, drafted Terms of Service, and worked around a real Vercel platform limit along the way

**Bryant asked directly whether the app could go into the Android store right now.** Gave an honest gap check rather than assuming readiness: confirmed via GitHub that the Android build still compiles (the Session 45 GitHub Actions check), but flagged that "compiles" isn't "ready to submit" — nobody has opened the project in Android Studio or run it on a real device/emulator yet, and more importantly the privacy policy is still just an unreviewed draft with no real business entity behind it, and there was no in-app account deletion and no Terms of Service at all. Those last two are concrete Apple/Play Store blockers, not nice-to-haves.

**Reviewed `PRIVACY_POLICY_DRAFT.md` as a thorough non-lawyer checklist pass, not as legal advice.** Bryant asked for a review "as though you are a lawyer... without holding you liable for it" — declined that specific framing (can't pretend to be a lawyer or waive liability), but offered a real alternative: a careful, code-verified review checking the draft's claims against what the app's actual code does, flagging gaps against Apple/Google's real store requirements, and noting where a real lawyer's input is still needed. Bryant said yes. Delivered as a docx (`Hypergentiq_Privacy_Policy_Review_Notes.docx`), verified by rendering it to PDF and visually checking the pages before sending. This review is what surfaced both the missing account-deletion feature and the missing Terms of Service as concrete gaps — not hypothetical, both are things Apple/Google actually check for.

**Built and shipped in-app account deletion — closes an Apple App Store Guideline 5.1.1(v) requirement.** Apple requires apps that support account creation to also let a member delete their own account from inside the app, not just by emailing support. This didn't exist before this session.

- New backend file `api/delete-account.js`: verifies the member's login token with Supabase, looks up their `profiles` row, then deletes their data across every table that references them — `ai_usage`, `cardio_logs`, `grocery_custom_items`, `water_logs`, `gym_messages`, `workout_logs`, `meal_logs`, `weight_logs`, `sync_issues`, then `profiles` itself, then `user_settings`, and finally removes their actual login (Supabase Auth user). The deletion order was not guessed — queried the database's real foreign-key rules directly (`information_schema.referential_constraints` and, for one stubborn case, `pg_constraint` directly) to confirm which tables would block a delete if done in the wrong order, and ordered the deletes to match. Uses the same "service role key bypasses row-level security" pattern already used in `api/admin-gym-action.js`, so nothing new was invented here — it's the established pattern applied to a new use case.
- Frontend changes in `src/Morphiq.jsx`'s `ProfileScreen()`: added a "Delete my account" button in the existing Danger Zone section, with a confirm-are-you-sure step (explains this permanently erases workouts, meals, weight history, and progress, and can't be undone) before it actually calls the delete, and a loading/error state so a failed delete shows a plain message and lets the member try again rather than silently failing.
- Frontend changes in `src/shared.jsx`: added a `deleteAccount()` helper that calls the new backend endpoint and reports success/failure back to the screen.
- **Real snag hit mid-build, and how it was resolved:** adding this 9th backend file (well, 13th counting all of `api/`) pushed the count of Vercel serverless functions over the Hobby (free) plan's hard cap of 12 functions per deployment — the deploy failed outright. This wasn't visible in Vercel's build logs, which showed a totally clean build; had to check the specific failed deployment's error fields directly (`get_deployment`, not just `get_deployment_build_logs`) to see the real reason: `exceeded_serverless_functions_per_deployment`. Presented Bryant with the real choice — pay $20/month for Vercel Pro (removes the cap) versus combine two low-traffic backend files into one for free — and he chose the free option. **Fix:** merged `api/monthly-usage-report.js` and `api/report-usage.js` (both billing-report tools Bryant visits by hand in a browser, never called by the app itself) into one new file, `api/usage-report.js`, which does exactly what both old files did, just behind one URL with two modes chosen by whether `?gym_id=` is in the address. Old URLs are gone; new ones are `/api/usage-report` (all-gyms preview, same as old `monthly-usage-report.js`) and `/api/usage-report?gym_id=X` or `&confirm=yes` (single-gym preview/live report, same as old `report-usage.js`). Nothing about what these tools do changed — only their address. The two old files were deleted from GitHub. This brought the function count back to 12 and the deploy succeeded.

**Drafted `TERMS_OF_SERVICE_DRAFT.md` — did not exist at all before this session.** Mirrors the Privacy Policy draft's structure, tone, and disclaimers exactly (same "DRAFT, not legal advice, send to a real lawyer" framing). Covers: acceptance and the existing 13+ age gate (reused the exact consent text already shown on the onboarding screen, word for word, so the two documents don't contradict each other), what the service is, gym owner accounts and billing (the real, live pricing — Starter $99+$2/member, Growth $199+$1.75/member, Scale $399+$1.50/member, the real 14-day Stripe trial — checked directly against `api/create-checkout.js` rather than assumed), member accounts including the new account-deletion feature, the health/fitness/AI-content disclaimer, acceptable use, intellectual property, standard disclaimers/liability limits/indemnification/termination/governing law/changes/contact, plus an appendix of the same kind of bracketed placeholders (business name, state of incorporation, contact address) the privacy policy already has. Delivered as a docx (`Hypergentiq_Terms_of_Service_DRAFT.docx`), same PDF-render verification step as the privacy review.

**Both documents remain blocked on the same real-world step: Bryant forming an actual registered business entity.** Neither draft can be finalized or safely relied on until that happens and a real lawyer reviews both — this was true before this session for the privacy policy and is now true for the terms too. This is Bryant's task, not a coding task.

## Session 45 recap — carried forward, unchanged

Live-verified Session 44's fixes, fixed a real Meals-screen gap (missing Calories stat), unified nutrition macro colors to the single gym-branded accent across Home/Meals/Profile/plan-ready screen, and stood up a GitHub Actions check that automatically verifies the Android app still compiles on every push (first-ever confirmed successful Android build, real installable debug APK produced). See prior version of this file (or `git log`) for full detail if needed.

## Files touched this session (final line counts)

| File | Before session | After session |
| --- | --- | --- |
| `src/Morphiq.jsx` | 1,690 | 1,742 |
| `src/shared.jsx` | 3,693 | 3,716 |
| `api/delete-account.js` | (new file) | 138 |
| `api/usage-report.js` | (new file, replaces two deleted files) | 218 |
| `api/monthly-usage-report.js` | 90 (approx) | DELETED |
| `api/report-usage.js` | 130 (approx) | DELETED |
| `TERMS_OF_SERVICE_DRAFT.md` | (new file) | 299 |

**Full current file set, all well under the 3,800-line hard limit:** `src/shared.jsx` 3,716 (largest, watch this one), `src/WorkoutScreen.jsx` 2,865, `src/Morphiq.jsx` 1,742, `src/GymOwnerDashboard.jsx` 927, `src/MealScreen.jsx` 869, `src/ProgressScreen.jsx` 657, `src/OnboardingScreen.jsx` 622, `src/SuperAdminDashboard.jsx` 343, `src/ChatScreen.jsx` 300, `src/CardioScreen.jsx` 295, `src/GymSignupScreen.jsx` 269. `api/` now has 12 files (was 13 before the merge, would have been over Vercel's Hobby-plan cap) — none near any size concern individually.

## Latest commit

Terms of Service draft push, commit `1fdda5e` — "Feature: add Terms of Service draft" (final commit of this session, before the closing docs commit this file is part of). Before that, in order: the two backend-merge/delete commits for `api/usage-report.js` and the removal of the two old files (`2bf2bc6`, `4ceea52`), and the account-deletion feature commits across `api/delete-account.js`, `src/Morphiq.jsx`, and `src/shared.jsx`. Previous latest before this session was `3a12993` (Session 45's final Android-workflow fix).

## Confirmed working vs still open

**Confirmed via code review, syntax verification (esbuild), and a successful Vercel production deployment (`state: READY`) this session:**
- `api/delete-account.js` — deletion order matches the database's real foreign-key rules, syntax-checked, deployed live.
- `api/usage-report.js` — both old tools' logic preserved verbatim, just combined; deployed live; old URLs removed, new URLs documented in the file's own header comment.
- Account-deletion frontend flow in `src/Morphiq.jsx` (confirm step, loading state, error handling) — code-reviewed against the project's own safety checks (router still intact, `AuthScreen` still present, line-count delta reasonable).
- Vercel deployment is back under the 12-function Hobby-plan cap and deploying successfully.

**NOT yet verified live — this is the single most important open item:**
- **Nobody has actually clicked "Delete my account" on a real test account and confirmed the Supabase rows and the login itself are genuinely gone.** Everything so far is code review plus a clean deploy, not a live end-to-end test. This should be the very first thing done next session, using a disposable test account, not Bryant's real one.

**NOT yet verified / still open from prior sessions (unchanged):**
- The post-onboarding "Plan ready" screen's color/Fat-tile fix from Session 45 — still only code-reviewed, not walked through live.
- The weight chart real-phone swipe test.
- The cardio timer real-phone lock-screen test.
- Everything else on the punch list below.

## Punch list, in priority order

**FIRST — live-test the new account-deletion feature end-to-end.** Create a disposable test account, delete it through the real app, then confirm in Supabase that its rows are actually gone from every table listed above and that its login no longer works. This is the one piece of this session's work that hasn't been proven outside of code review.

**SECOND — unblock the privacy policy and terms of service.** Both drafts exist now (privacy policy reviewed and terms of service newly drafted this session). Both are still blocked on Bryant forming a real legal business entity, after which both documents need to go to an actual lawyer together.

**THIRD — walk through the post-onboarding "Plan ready" screen live** (carried from Session 45) to confirm its color/Fat-tile fix looks right in practice.

**FOURTH — design and build the weekly detection engine.** Unchanged — scoped, not started. Needs Bryant's input on exact plateau/macro-adherence thresholds before any code gets written.

**FIFTH — App Store groundwork, next concrete step: open the Android project in real Android Studio at least once.** The GitHub Actions check proves the app compiles, but nobody has run it on a device or emulator yet. Capgo live-update pipeline still not started.

**SIXTH — an actual finger-swipe test on a real phone for the weight chart** (Bryant's own task, waiting on him logging more days).

**SEVENTH — cardio timer real-phone test.** Session 40's wall-clock fix still hasn't been live-tapped by Bryant with the screen genuinely locking.

**EIGHTH — wearable sync (Apple HealthKit/Fitbit).** Unchanged, still not scoped.

**NINTH through TWELFTH — unchanged, still open:** live-test `WarmupTest` full week start-to-finish; get Bryant's sign-off on the compound/isolation warm-up split; exercise diagrams/animations (deferred); personal trainer market segment (needs its own discussion, see DECISIONS.md Aug 8 2026); expand exercise variety beyond primary/variation binary swap; the weight-loss/cardio redesign's still-undecided open questions from DECISIONS.md Aug 9 2026; voice input on the cardio quick-log and the "Other" activity type haven't been live-tested; the manual/voice cardio-logging path's calorie accuracy (no body weight passed to the AI estimate).

**RULED OUT — do not re-propose without new information:** camera/video-based AI form-checking (Session 44 research).

**LOWER PRIORITY / OPS.** Unchanged: one unidentified blank-named test profile row in Supabase; naming cleanup (GitHub repo, live URL, `Morphiq.jsx`/`function Morphiq()` still carry the retired placeholder name — cosmetic only); the "blank exercise weight saves as 20 lbs instead of staying blank" quirk.

## Technical notes carried forward

**GitHub push access.** Direct/automatic push still broken this session (identical git-proxy error, both via `git push` and the GitHub REST API directly). Working method unchanged: Chrome browser tool's "Upload files" page (`github.com/OWNER/REPO/upload/main/<folder>`), staging finished file(s) in `/mnt/user-data/outputs/` first — **confirmed again this session that this exact path is required**; files staged elsewhere (e.g. `/mnt/user-data/working/`) are rejected by the browser upload tool. **New this session: deleting a file from GitHub** uses the direct URL pattern `github.com/OWNER/REPO/delete/main/<path>`, which opens GitHub's own delete-confirmation page directly — used to remove the two old usage-report files.

**Vercel Hobby plan has a hard cap of 12 serverless functions per deployment.** Confirmed directly this session by hitting it. The error is `exceeded_serverless_functions_per_deployment` and it does **not** show up in `get_deployment_build_logs`, even with a full (non-`errorsOnly`) read — the build itself looks completely clean. It only shows up by calling `get_deployment` on the specific failed deployment ID and checking its error fields directly. **Lesson for future sessions: if a deployment shows `state: ERROR` but the build logs look clean, check `get_deployment`'s own error fields before assuming the logs are lying or re-trying the same push.** If a future feature needs a 13th backend file, either combine two more low-traffic files or Bryant will need to decide on Vercel Pro ($20/mo) at that point.

**Foreign key delete-rule discovery.** `mcp__Supabase__list_tables` with `verbose: true` shows foreign key constraints but does NOT show their `delete_rule` (CASCADE vs NO ACTION) — that requires direct SQL. `information_schema.referential_constraints` worked for most tables; one case (`user_settings` → `auth.users`) didn't show up there for unclear reasons (possibly a schema-visibility quirk on cross-schema foreign keys) and required querying `pg_constraint` directly instead. Worth remembering if any future feature needs to know delete/update behavior between tables.

**GitHub Actions Android build check (Session 45, still standing).** `.github/workflows/android-build.yml` runs on every push to `main` and compiles a debug APK on GitHub's own servers. Check `github.com/Luxurydadbot/Morphiq/actions` any time to confirm the Android app still builds — untouched this session, no reason to expect it broke.

**Vercel MCP connector.** Use `list_teams` → `list_projects` (project `morphiq`, id `prj_0KL9CirNTdNMnXEO34o3pdwd5wSM`, team `team_Iiv1x067TLmgX2XdP5mXO06v`) → `list_deployments` to check `state` (`READY` vs `ERROR`) after every push. If `ERROR`, check both `get_deployment_build_logs` AND `get_deployment` directly — see the function-cap lesson above, logs alone are not always enough.

**`npm run build` behaves differently depending on `CI` environment variable.** Unchanged from Session 45 — Vercel and this sandbox build with `CI` unset (warnings don't fail the build); GitHub Actions sets `CI=true` automatically unless a step explicitly overrides it, which `android-build.yml` already does.

**WebFetch is not reliable for reading files from this repo — reconfirmed dangerous again this session.** Returned a fully fabricated "Session 10" handoff that does not exist in real project history when fetched via `raw.githubusercontent.com`. Caught only by cross-checking against a real `git clone`. This is now confirmed dangerous across at least two separate sessions. **Never use WebFetch for this repo's file contents — always `git clone` with the token embedded in the HTTPS URL.**

**Supabase MCP connector.** The app's own `sb_publishable_...` key can only read/write rows in tables that already exist and respects row-level security; the new `api/delete-account.js` uses the service-role key (bypasses RLS) via `process.env.SUPABASE_SERVICE_ROLE_KEY`, same pattern as `api/admin-gym-action.js`. `profiles.supabase_user_id` is the auth link, `profiles.id` is the FK used everywhere else. Fire-and-forget `.catch(() => {})` pattern for all new Supabase writes.

## Paste this at the start of your next session

Fetch `HANDOFF.md`, `DECISIONS.md`, and all `src/`/`api/` files fresh via `git clone` (reads work fine; do NOT use WebFetch for repo file contents — confirmed dangerous twice now). Report every file's line count before doing anything else; none are near the 3,800-line limit (`shared.jsx` is largest at 3,716). **GitHub push access:** still broken (platform-side git-proxy block) — use the Upload-files browser workaround, staging files in `/mnt/user-data/outputs/` specifically. **After any push, check the Vercel MCP connector's `list_deployments`** for `state: READY`, and if it shows `ERROR`, check `get_deployment` directly, not just build logs — the Hobby plan's 12-function cap doesn't show up in logs. **`api/` is now at exactly 12 files — the Vercel Hobby-plan cap — so any new backend feature needs either a merge of two more low-traffic files or a decision from Bryant on Vercel Pro.**

Remind Bryant: this session reviewed the privacy policy draft (delivered as a docx, checklist-style, not a substitute for a real lawyer), built and deployed in-app account deletion (closes a real Apple App Store requirement — members can now permanently delete their own account and data from the Profile screen), and drafted a full Terms of Service for the first time (also delivered as a docx). Along the way, hit and fixed a real Vercel platform limit (the free plan's 12-function cap) by merging two low-traffic billing-report tools into one file, at no cost, which Bryant chose over paying for Vercel Pro. **The single most important thing to do next session is to actually test the account-deletion feature live** with a throwaway test account — it's been built and deployed but never actually clicked and confirmed end-to-end. Both legal documents remain blocked on Bryant forming a real business entity before they can be finalized and sent to a lawyer.
