MORPHIQ — MASTER HANDOFF — July 18, 2026 (session 4, Sentry error monitoring)

## 1. File state (line counts, verified fresh from GitHub via `git clone`)

**src/:** Morphiq.jsx — 1,403 · shared.jsx — 1,987 · WorkoutScreen.jsx — 1,902 · MealScreen.jsx — 713 · OnboardingScreen.jsx — 595 · ProgressScreen.jsx — 424 · ChatScreen.jsx — 293 · GymOwnerDashboard.jsx — 849 · GymSignupScreen.jsx — 269 · SuperAdminDashboard.jsx — 343 · index.js — 57 (changed this session, was 6)

**api/:** _sentry.js — 32 (NEW this session) · admin-gym-action.js — 110 (was 107) · chat.js — 259 (was 256) · coach-note.js — 108 (was 105) · create-checkout.js — 89 (was 86) · monthly-usage-report.js — 101 (was 98) · parse-meal.js — 62 (was 58) · photo-meal.js — 76 (was 73) · ping.js — 12 (was 9) · plan.js — 31 (was 28) · report-usage.js — 165 (was 162) · stripe-webhook.js — 161 (was 158)

Nothing near the 3,800-line limit. Every api/ file grew by only 2-3 lines (just the Sentry import + export wrap) — no accidental deletions. `package.json` also changed: added `@sentry/react` and `@sentry/node` (both ^10.66.0) as dependencies.

Files touched this session: all 11 files in api/, plus the new api/_sentry.js, plus src/index.js, plus package.json / package-lock.json. Nothing in src/Morphiq.jsx, shared.jsx, or any other screen file was touched — those are exactly as they were at the end of session 3.

## 2. What was built this session, in order

**Sentry account and project created.** Bryant already had a Sentry account under GitHub login with an existing org called "hypergentiq" (matches the admin@hypergentiq.com email domain). Created a new project inside it: platform React, slug `morphiq`. Default alert settings kept (alert on high-priority issues, email notifications on). This gives a DSN (a public-safe key, not a secret — Sentry DSNs are meant to be embedded in browser bundles) that both the frontend and backend now use to report errors:
`https://7811704e1155a293d134d6061a15c948@o4511757569425408.ingest.us.sentry.io/4511757583450112`

**Backend: one shared wrapper instead of 11 copies of the same code.** Built `api/_sentry.js`, which initializes Sentry once (guarded so it only runs once per cold start) and exports `withSentry(handler)`. Every one of the 11 files in api/ now imports this and wraps its existing handler: `export default withSentry(handler);` (or `module.exports = withSentry(handler);` for the one file, parse-meal.js, that used CommonJS instead of ES module syntax). The wrapper catches any error the handler doesn't already handle itself, sends it to Sentry, waits for the send to actually complete (`Sentry.flush(2000)` — serverless functions can otherwise exit before the error report finishes sending), and returns a clean `500 { error: "Something went wrong. Our team has been notified." }` instead of a raw crash. Existing internal error handling in each file (files that already catch their own errors and return specific messages) is untouched — the wrapper only catches what would otherwise escape uncaught.

**Frontend: Sentry.init plus a real fallback screen.** `src/index.js` now calls `Sentry.init()` before rendering, using `REACT_APP_SENTRY_DSN` (Create React App requires that exact prefix for a variable to be embedded in the browser build). The whole app is wrapped in `<Sentry.ErrorBoundary>` with a fallback component styled to match the app (dark background, teal accent, DM Sans) showing "Something went wrong" and a Reload button, instead of a blank white screen if the app crashes completely.

**Verified locally before pushing anything.** Ran `npm install` and a full `react-scripts build` in a clean clone — succeeded (only pre-existing lint warnings unrelated to this change, no new errors). Ran `node --check` on all 11 api/ files to confirm valid syntax. Tested the `withSentry` wrapper directly in Node for both code paths: a normal handler response passes through untouched, and a thrown error gets caught, reported, and turned into the clean 500 — confirmed both before deploying.

**Pushed and deployed.** Commit `bfde672` — "Feature: add Sentry error monitoring (frontend + all API functions)" — pushed to `main`, built successfully on Vercel, reached Ready.

**Bryant added the two environment variables in Vercel** (`REACT_APP_SENTRY_DSN` and `SENTRY_DSN`, same value) and triggered a redeploy, since the frontend key needs to be baked in at build time and the first deploy went out before the variable existed.

**Live end-to-end verification, not just local tests.** After the redeploy went Ready, threw a real test error in the live site's browser console (not just locally) and confirmed via the Chrome network panel that it posted successfully (`200`) to Sentry's ingest endpoint. Confirmed it landed in the Sentry dashboard as issue MORPHIQ-1 within seconds, then resolved that test issue so it doesn't clutter the feed. Backend error path was tested locally/at the unit level only — did not intentionally force an error on a live endpoint like the Stripe webhook or admin action endpoint, since those are sensitive; the code is identical to what was unit-tested, so risk is low, but it hasn't been fired for real in production.

## 3. Confirmed working (tested live this session)

Frontend Sentry: confirmed end-to-end — a real error thrown in the live browser reached the Sentry dashboard within seconds, correctly tagged with the "morphiq" project. Error boundary fallback screen exists in code but has not been visually confirmed live (would require an actual render-breaking bug to trigger it, which wasn't deliberately caused).

Backend Sentry: wrapper logic confirmed correct in local Node tests (both success and failure paths) and the deployed code is identical. Not yet fired for real on a live serverless function — reasonable confidence but genuinely unverified in production.

Build/deploy: local build succeeded, live Vercel deployment reached Ready twice (once on push, once on redeploy after the env vars were added).

Noticed but not investigated: while checking network traffic on the live site, a call to Supabase's `sync_issues` table returned a 403. Unrelated to this session's work, not looked into — flagging for next session.

Nothing else in the app was touched — no regressions expected, but the usual member-login / workout-logging / meal-logging / admin-dashboard spot-checks were not re-run since no code affecting those paths changed.

## 4. Standing technical notes (new this session)

Sentry org: **hypergentiq**. Project: **morphiq**. Dashboard: hypergentiq.sentry.io/issues/. Alerts go to Bryant's email by default (email notification was left on during project creation).

The DSN is not a secret — it's designed to be public (Sentry docs confirm a DSN can only send events in, it can't be used to read data out), so its presence in the browser bundle is expected and fine, unlike the Supabase or Stripe keys.

Backend pattern going forward: any new file added to api/ should follow the same pattern as the other 11 — `import { withSentry } from './_sentry.js';`, define the handler as a plain (non-exported) function, and end the file with `export default withSentry(handler);`. Don't duplicate Sentry.init anywhere else.

CRA env var rule reconfirmed: any frontend env var must start with `REACT_APP_` or Create React App won't embed it in the build at all — silently, with no error. This bit nothing this session (got it right), but worth remembering for any future frontend env var.

## 5. Not yet done — full path to shipping this for real gyms

**Must-do before onboarding real (non-test) gyms:**
- Privacy policy / terms of service — still not started, still nowhere in the codebase. This is the single biggest remaining gap given the app now handles real health data (workouts, meals, body stats) through a fully-secured, monitored database. Needed before any gym beyond the two test/beta accounts signs up for real.
- Decide whether to turn on real per-member Stripe billing enforcement for test-gym-1. Right now `plan_tier` exists as a column but nothing in the app actually blocks a gym from using the product without paying — no paywall is enforced anywhere. This is a product/business decision waiting on Bryant, not a coding task, but it needs a decision before this can be called "billing-live" rather than "billing-wired-but-not-enforced."
- Gym invite-link self-serve signup flow — still needs an actual real-world test (a real second gym owner going through morphiq-nine.vercel.app/?join=gym end to end). Waiting on Bryant to run this.

**Should-do soon, lower urgency than the above:**
- Confirm whether the two old test profiles (TestUser, VerifyFix) mentioned back in session 2 still exist in the `profiles` table. Never confirmed either way — as of session 2's check there were only 3 rows and neither name was among them, but it was never explicitly ruled out that they exist under different names or were added since.
- Fire a real (intentional, controlled) error on a live backend endpoint to confirm the Sentry backend path works in production, not just locally. Pick a low-stakes endpoint (not the Stripe webhook or admin-gym-action) for this test.

**Cosmetic/polish, no urgency:**
- Two small wording bugs on the plan-ready confirmation screen: singular/plural issue ("1 exercises" instead of "1 exercise"), and a duration estimate that looks like a placeholder rather than a real calculated number.
- Admin dashboard login persistence — deliberately on hold per Bryant's earlier decision. Do not touch without him raising it first.

**Longer-term product backlog (lowest priority, untouched across all sessions):**
- Permanent plan changes (letting a member's workout plan evolve rather than stay fixed after onboarding)
- PR (personal record) detection and celebration moments
- Per-exercise strength chart over time

## 6. Database snapshot (carried forward from session 3, unchanged this session — no database work happened in session 4)

`gyms`: exactly two real gyms — test-gym-1 and bryant-s-gym (beta-exempt). test-gym-1.is_suspended is false.
`profiles`: 3 rows as of last check (Bryant, bryant lowercase, one unnamed profile from July 17). TestUser/VerifyFix status still unconfirmed — see section 5.
`workout_sessions`: 0 rows, RLS enforced with the standard 3-policy pattern (closed in session 3).
`workout_logs`: real, actively written to, unchanged.

## 7. Paste this at the start of your next session

Continuing Morphiq. Session 4 added Sentry error monitoring across the entire app, closing out the "error monitoring" item that was the top priority coming out of the July 18 security audit (sessions 2-3, which had already closed every RLS gap and locked down gym suspend/admin-notes writes at both the API and database level).

What's live now: a new shared helper, `api/_sentry.js`, wraps all 11 backend functions in api/ so any uncaught error gets reported to Sentry and turned into a clean 500 instead of a raw crash — verified with local unit tests (both success and failure paths) before deploying, but not yet fired for real on a live production endpoint. The frontend (`src/index.js`) now initializes Sentry and wraps the whole app in an error boundary with a branded fallback screen instead of blank white on a fatal crash — verified fully live: a real browser error reached the Sentry dashboard (org "hypergentiq", project "morphiq") within seconds. Two Vercel env vars were added (`REACT_APP_SENTRY_DSN`, `SENTRY_DSN`, same DSN value) and a redeploy picked them up.

Everything from the security audit (sessions 2-3) remains fully closed: every table's RLS policies were checked and fixed, and gym suspend/admin-notes writes are hard-enforced both at the API layer (a locked-down endpoint that verifies the caller via Supabase's own auth API) and at the Postgres level (a fail-closed trigger on the gyms table).

Top priority now: privacy policy / terms of service — still nowhere in the codebase, and now the clearest remaining gap given real health data flows through a secured, monitored database. After that: decide on enforcing real per-member Stripe billing for test-gym-1 (billing is wired but nothing currently blocks unpaid use), and get the gym invite-link signup flow tested end-to-end with a real second gym (both waiting on Bryant). Also worth doing: fire one real, controlled error on a live (low-stakes) backend endpoint to confirm the Sentry backend path works in production, not just in local tests. Still open, unconfirmed, low urgency: whether the old TestUser/VerifyFix test profiles still exist, two cosmetic wording bugs on the plan-ready screen, and admin-dashboard login persistence (deliberately on hold, don't touch without Bryant raising it).

Noticed but not investigated this session: a `sync_issues` Supabase call returned a 403 on the live site during unrelated network-traffic checking — worth a look.

Technical notes carried forward: GitHub REST API is blocked from the sandboxed shell — use `git clone`/`git push` over an authenticated HTTPS URL instead. Double-check Name vs Value fields when adding any new Vercel secret. Any new api/ file should follow the withSentry(handler) pattern already used in the other 11 files rather than reinitializing Sentry separately.
