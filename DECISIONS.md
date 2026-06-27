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
1. **Situational** — affects today's session only (injury, location, time constraint). Handled via AI chat.
2. **Permanent** — changes goal, days per week, or equipment going forward. Preserves history and streak. To be built later.

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

### Decision: Workout logs — ABSOLUTE TOP PRIORITY DATABASE BUILD ⭐
- **Current state (gap):** every set logged is buried inside the plan JSON blob. There is no permanent per-set record.
- **Problem this causes:** strength progression over time is fragile. If exercise names change or plan regenerates, history disconnects. Cannot build reliable progress charts per exercise.
- **What the top 1% apps do (Strong, Whoop, Apple Fitness+):**
  - Every single set is a permanent row in the database forever — no exceptions
  - Personal records detected automatically ("new PR on bench press!")
  - Full history graph for every exercise going back to day one
  - Previous session's exact numbers auto-loaded before each set — member never has to think
  - Advanced apps correlate strength with sleep, recovery, etc. — only possible because every data point is a permanent row
- **What we need to build:**
  - `workout_logs` table — one row per set, forever. Columns: date, user_id, exercise_name, weight, reps, set_number, workout_session_id
  - `exercises` table — canonical exercise library. Columns: id, name, muscle_groups, equipment_needed, difficulty, is_custom
  - `workout_sessions` table — one row per completed workout. Columns: id, user_id, date, duration_minutes, plan_day_name
- **Target features once built:**
  - "Last time you did this: 135lbs × 8 reps" shown automatically before each set
  - Personal record detection and celebration
  - Per-exercise strength chart on the Progress screen
  - AI can say "your bench press has gone up 18lbs in 6 weeks" with real data
- **Decision:** do not scale to multiple paying gyms until this is built. This is the foundation the whole product promise sits on.

---

## Backlog — carried from previous sessions

### Tier 1 — Next up
1. ⭐ Workout logs database (see above — newly elevated to absolute top priority)
2. In-workout AI adjustments via chat (situational swaps — injury, location, time)
3. Plan editability — permanent changes without full re-onboarding
4. AI coach note on home screen — needs real device testing
5. Photo meal logging — needs real device testing

### Tier 2 — Soon
6. Build-your-own workout path
7. Grocery list redesign — flexible food categories instead of hardcoded ingredients
8. Weight chart — daily/weekly toggle

### Tier 3 — Before any paid gyms go live
9. Exercises library table (canonical names, muscle groups, equipment)
10. Self-serve gym signup flow
11. Billing integration (Stripe — Starter $99/mo + $2/active member, Growth $199/mo + $1.75, Scale $399/mo + $1.50, 14-day trial)
12. hypergentiq.com domain — connect Cloudflare DNS to Vercel

---

## Standing technical decisions

- **Single file rule:** everything in Morphiq.jsx until explicitly decided to split. Currently split into Morphiq.jsx, WorkoutScreen.jsx, MealScreen.jsx, GymOwnerDashboard.jsx
- **AI responses:** always 1–2 sentences max in UI. Always forward-looking, no guilt language.
- **Meal log key:** morphiq_meals_v2_ (changed June 2026 — old key was morphiq_meals_)
- **Billing model:** per active member only — members who logged at least one workout that month
- **"Powered by Morphiq"** footer hardcoded on all member screens — cannot be removed by gym owner
- **Tech stack:** React + Supabase + Claude API (claude-sonnet-4-20250514) + Vercel + Expo

