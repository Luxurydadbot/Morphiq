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

