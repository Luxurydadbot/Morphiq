# Morphiq — Product Decisions Log

A living record of every important product and technical decision made during development.
Updated automatically at the end of every session. Never delete entries — append only.

---

## June 26, 2026

### Decision: In-workout AI adjustments via floating chat button
- Members can adjust their workout mid-session by talking to the AI through the existing floating chat button
- No new button or UI needed — the chat IS the interface
- Three scenarios handled naturally through conversation:
  - Injury mid-workout → AI swaps affected exercises for the rest of today's session only
  - "I'm at home / no equipment today" → AI swaps to bodyweight alternatives for today only
  - "I only have 15 minutes" → AI trims remaining sets down
- These are **situational (today only)** changes — they do not permanently alter the plan

### Decision: Two types of plan changes defined
1. **Situational** — affects today's session only (injury, location, time constraint). Handled via AI chat. ✅ BUILT
2. **Permanent** — changes goal, days per week, or equipment going forward. Preserves history and streak. To be built.

### Decision: Build-your-own workout path
- Some members will arrive with their own existing routine and won't want AI-generated workouts
- These members should be able to fully customize exercises on the fly
- AI-plan members get AI-driven swaps; self-directed members get full manual control
- **Not yet built** — flagged as a future feature before scaling

### Decision: Exercise library — build properly before scaling
- Custom exercise names (e.g. "Hammer Strength Overhead Press") are supported by AI chat today
- BUT: if names vary slightly across sessions, weight history won't connect reliably
- **Long term requirement:** a proper `exercises` table with canonical names, muscle groups, equipment needed, and difficulty rating
- **Decision:** use current JSON blob approach now, build the exercises library before scaling to multiple gyms or adding build-your-own-workout

### Decision: Workout logs database — foundational infrastructure
- Top 1% apps (Strong, Whoop, Apple Fitness+) store every single set as a permanent row forever
- This enables: "Last time: 135lbs × 8 reps" before each set, PR detection, per-exercise progress charts, AI insights
- **Tables created this session:** workout_logs (one row per set) and workout_sessions (one row per completed workout)
- **Already wired:** every set logged in WorkoutScreen writes to workout_logs in Supabase
- **Already live:** "Last time: X lbs × Y reps" display before each working set
- **Still needed:** PR detection and celebration, per-exercise strength chart on Progress screen
- **Still needed:** exercises library table for canonical names before scaling

---

## August 8, 2026

### Decision: Personal trainer market — flagged for later, not started
- Bryant raised marketing Hypergentiq to individual/solo personal trainers, not just gyms, and asked directly whether it's a good idea.
- **Assessment:** directionally yes, but it's a second customer segment with its own economics, not a pricing tweak on the existing product.
  - **Pricing:** the per-active-member model works for gyms spreading a $99+/mo base across hundreds of members; it doesn't work for a trainer with a handful of clients. Would need a low flat "Solo" tier (e.g. ~$29-39/mo covering up to 10-15 clients) before per-member fees kick in.
  - **Positioning:** some trainers will resist AI-generated programming since programming is part of what they sell. Pitch needs to be "AI drafts, you approve/edit," not "AI replaces your programming" — makes the still-unbuilt build-your-own-workout / full manual override feature (see build-your-own workout path decision above, June 26 2026 — not yet built) more important for this segment than for gym members.
  - **Go-to-market:** gyms are a slower B2B sale; trainers need frictionless self-serve signup, likely a free trial, and influencer/referral-driven growth — a different motion than the current gym sales approach.
  - **Competition:** Trainerize, TrueCoach, PT Distinction, Everfit already serve solo trainers, but all assume the trainer hand-builds every plan. AI-assisted programming is a real differentiator if positioned as time-saved, not replaced expertise.
- **Decision:** worth pursuing later. Not started — competes for attention with the App Store roadmap and in-flight punch list items. Revisit once current priorities clear.

---

## August 9, 2026

### Decision: Weight-loss goal path needs a real redesign — not started
- Bryant flagged that the app has been built and tested almost entirely around strength/muscle-building goals, and asked directly whether the `lose_fat` goal is actually a strong, complete experience or just a variant of the same strength-training plan.
- **Code audit confirmed the concern is real.** `buildPlan()` in `shared.jsx` treats `lose_fat` as the same squat/hinge/push/pull structure as every other goal, with three differences only: higher rep ranges (10-15 vs strength's 3-8), shorter rest periods, and one exercise slot out of five ("slot 5") swapping from a strength accessory to a "finisher" movement. That finisher is inconsistent by equipment: barbell/dumbbell/kettlebell users get another *weighted* movement (kettlebell swings, thrusters, a barbell complex) — not cardio at all — while only the "machine" equipment path gets real cardio (rowing machine, bike, stairmaster, jump rope). Three of the four equipment paths a member can pick at onboarding never touch cardio in their generated plan at all.
- **No true no-equipment/bodyweight-only path exists.** Onboarding's four equipment options (barbell, dumbbell, kettlebell/bodyweight, machine) don't include a real "just my body, no gear" path — "Kettlebells & bodyweight" is a kettlebell path in practice.
- **Real cardio logging exists but is disconnected from goal.** The Progress screen's cardio quick-log is fully built and works, but it's entirely manual/opt-in — a member who picks `lose_fat` isn't steered toward it, reminded to use it, or given cardio sessions as part of their actual generated plan.
- **Nutrition math is already correct per goal** — confirmed via `calcMacros()`: real ~350-calorie deficit for `lose_fat` vs. a surplus for `build_muscle`, protein/fat ratios adjusted per goal, grounded in cited research. What's missing is UI emphasis: the nutrition screen looks identical regardless of goal, even though nutrition carries more of the outcome for a weight-loss goal than for a strength goal (where progressive overload matters more).
- **Competitive context:** Ladder (closest direct comparison) just shipped AI-powered nutrition tracking specifically because members wanted workout and nutrition connected, not siloed — see Session-of-2026-08-09 competitive research on macro tracking. A weight-loss path that genuinely combines real cardio-integrated workouts with more-prominent nutrition tracking would be a real differentiator, not a cosmetic tweak.
- **Bryant's stated goal:** the weight-loss path should be genuine "real value add for people who truly want to lose weight the right way" — both workout and nutrition together, with cardio as "probably a huge part of that." Not interested in a token gesture (e.g. just relabeling the existing finisher slot).
- **Open questions, need Bryant's decisions before any of this gets built:**
  - Should `lose_fat` plans restructure the week itself (e.g., dedicated cardio days, more full-body/conditioning days) rather than just adjusting rep ranges within the existing squat/hinge/push/pull structure?
  - Should real cardio (running, cycling, rowing, incline walking, etc.) become a first-class, AI-generated part of the plan for this goal, distinct from today's grab-bag "finisher" slot?
  - Does onboarding need a real no-equipment/bodyweight path, and/or a separate "what cardio equipment or space do you have" question (treadmill, bike, outdoor space, none)?
  - Should the nutrition screen/home dashboard surface nutrition more prominently for `lose_fat` members specifically (e.g., leading with the nutrition card, more frequent nudges), rather than treating every goal identically in the UI?
- **Decision:** worth building for real, not started yet. Scoped as its own initiative (touches onboarding, `buildPlan()`, and the nutrition UI at once) rather than a quick fix — needs Bryant's answers to the open questions above before implementation starts.

### Follow-up research: how top apps actually structure cardio, and current gaps
- Bryant asked specifically whether top apps blend cardio into strength workout days or keep them separate, and whether the logging interface is duration-based instead of rep-based.
- **Researched (Edge, Peloton, Fitbod, Hevy+Strava, Nike, Freeletics comparisons, 2026):** the top-rated pattern is **separate cardio sessions/days, deliberately scheduled apart from heavy lifting days** (e.g. a hard leg day never lands next to a hard run day) — "integration" in the best apps means coordinating recovery and total training stress *across* the two, not merging them into one session. A few apps (Peloton's bootcamp classes, Freeletics) DO blend both into single HIIT-style sessions, but that's a different training philosophy than progressive-overload lifting, which is what Hypergentiq already does. Confirms real cardio programming needs dedicated days, not a slot bolted onto lift days.
- **Confirmed: cardio logging interface in top apps is duration/type/pace-based, not rep-based** — sessions are categorized (easy / tempo / interval / long) with duration and/or distance and effort, never sets and reps. This matches Bryant's instinct and, usefully, already matches how Hypergentiq's own `cardio_logs` table is shaped (`duration_minutes`, `calories`) — the data model doesn't need to change, only the logging *experience* and its connection to the actual plan.
- **Current app state, confirmed via code:** `CardioQuickLog` (`ProgressScreen.jsx`) only logs cardio *after the fact* — voice or text description ("ran 5k") parsed by AI into type/duration/an estimated calorie burn. There is no live timer, no start/stop tracking during the session, and no wearable integration; the component's own comment already flags this: "No GPS/heart-rate -- that needs a connected wearable this app doesn't integrate with yet."
- **Bryant's proposed direction:** a simple live start/stop timer for cardio days -- start it, do the activity, stop it -- with an optional pace/speed input so calorie burn can be estimated (standard MET-based formula: calories = MET value for the activity × body weight in kg × duration in hours -- well-established exercise-science math, no new research needed to implement), and optionally sync with a wearable (Apple Watch/Fitbit/Apple Health) for a real measured calorie burn instead of an estimate.
- **Assessment:** this is a genuinely new capability, not an extension of the existing quick-log -- it's a live in-session experience, not an after-the-fact description. Two clear phases: (1) a MET-based estimate from a live timer + optional pace input, buildable without any external integration; (2) real wearable sync (Apple HealthKit / Fitbit API), a materially bigger lift requiring OAuth/device permissions, best scoped separately once the core cardio-day experience exists.
- **Still open:** none of this is scheduled yet -- folded into the same not-started initiative above. Needs Bryant's decision on how many dedicated cardio days a `lose_fat` week should include before any of this gets built.

### Follow-up: onboarding flow shape and where cardio TYPE gets picked
- Bryant proposed a concrete onboarding shape: ask lifting days/week (existing question) as normal, then a new, separate "how many days of cardio, by themselves?" question -- e.g. 3 lifting + 2 cardio = 5 total training days/week. `buildPlan()` would then be responsible for spacing the cardio days sensibly around the lifting days (per the recovery-management research above -- not next to the heaviest leg day).
- He initially considered also asking cardio *type* (treadmill, bike, etc.) at onboarding, then reversed himself: gym equipment availability is unpredictable day-to-day (the treadmill might be taken, so someone grabs the stepper instead), so type should be picked "at the point of use," not locked in weeks ahead. Asked for this to be benchmarked against top apps.
- **Researched and confirmed: this is the universal pattern.** Strava, Apple Fitness/Watch, and Garmin all use the same UX -- the member picks their activity type right before starting to record (a short list: Run, Ride, Row, Stair-stepper, Elliptical, etc.), never as something pre-assigned days in advance. Apple Watch adds auto-detection as a bonus on top of that, but picking-at-start is the baseline standard everywhere.
- **This also matches a design principle Hypergentiq already has**, not a new one: the June 26, 2026 decision above (in-workout AI adjustments) already established that "today only" / situational choices belong at the point of use (e.g. "I'm at home, no equipment today" swaps exercises for that session only, doesn't rewrite the plan). Letting cardio type be picked when a cardio day is actually opened is the same principle applied to cardio.
- **How this could fit together with the live-timer idea above:** opening a cardio day could start with a short type-picker (treadmill / bike / stepper / rower / outdoor run / other) -- matching the Strava/Apple Fitness pattern -- then the live start/stop timer, then the optional pace/speed input for the MET-based calorie estimate. `buildPlan()` only needs to decide *which days* are cardio and space them correctly; it never needs to guess *what* the member will actually do that day.
- **Still open:** exact onboarding question wording/flow, and whether cardio day count follows the same 3-4 strength / 2-4 cardio ranges noted in the earlier competitive research, or something else. Not built -- folded into the same not-started initiative.

### Follow-up: calorie estimate updates live, not just at session end
- Showed Bryant a quick mockup of the cardio-day screen (type picker, start/stop timer, optional pace field, live calorie estimate, matching the app's real dark theme and bottom nav). He confirmed he wants the estimated-calories number to climb in real time while the timer runs, not calculate once at the end.
- **Decision: live-updating estimate confirmed.** Also the more accurate approach, not just the more engaging one -- recalculating continuously off elapsed time means a pace change mid-session gets credited to the time it actually happened during, instead of an end-of-session calculation having to guess which pace applied to which stretch of the workout. Implementation-wise: same MET-based formula from the entry above, just re-evaluated on a running interval (e.g. every second) using elapsed time so far, rather than a single one-shot calculation on stop.
- Mockup itself not committed anywhere (chat-only visual, not app code) -- this entry is the record of the decision it produced.

---

## Standing technical decisions

- **File structure:** Morphiq.jsx (3,714 lines), WorkoutScreen.jsx (1,421 lines), MealScreen.jsx (585 lines), GymOwnerDashboard.jsx (separate)
- **File size limit:** 3,800 lines soft cap, 4,000 hard limit — propose split if exceeded
- **AI responses:** always 1–2 sentences max in UI. Always forward-looking, no guilt language.
- **Meal log key:** morphiq_meals_v2_ (changed June 2026 — old key was morphiq_meals_)
- **Billing model:** per active member only — members who logged at least one workout that month
- **"Powered by Morphiq"** footer hardcoded on all member screens — cannot be removed by gym owner
- **Tech stack:** React + Supabase + Claude API (claude-sonnet-4-6) + Vercel
- **AI proxy endpoints:** /api/chat.js, /api/plan.js, /api/parse-meal.js, /api/ping.js, /api/coach-note.js, /api/photo-meal.js
- **Foreign keys:** always use profiles.id not auth.users.id
- **Supabase writes:** always fire-and-forget (.catch(() => {})) — a failed save must never crash the UI

