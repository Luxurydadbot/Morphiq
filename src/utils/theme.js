// ─── MORPHIQ DESIGN TOKENS ────────────────────────────────────────────────────
export const theme = {
  accent: "#00D4B1", accentDim: "rgba(0,212,177,0.10)", accentBorder: "rgba(0,212,177,0.25)",
  bg: "#0F0F0F", surface: "#161616", border: "#242424", borderSubtle: "#1E1E1E",
  text: "#E8E8E8", textMuted: "#888", textDim: "#555", textFaint: "#333",
  success: "#1D9E75", amber: "#F59E0B", amberDim: "rgba(245,158,11,0.12)",
  red: "#F87171", card: "#1A2332", card2: "#0D1623",
  ob: {
    bg: "#080E1A", surface: "#111827", card: "#1A2332", card2: "#0D1623",
    teal: "#00D4B1", tealDk: "#003D35", border: "#1E2D42",
    white: "#E8EDF2", body: "#9BB3C8", muted: "#6B7A8D",
    font: "'DM Sans', system-ui, sans-serif",
  },
};

export const css = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  .mq-fade{animation:mqFade .3s ease;}
  @keyframes mqFade{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
  .mq-pop{animation:mqPop .3s cubic-bezier(.2,1.4,.5,1);}
  @keyframes mqPop{from{transform:scale(0);}to{transform:scale(1);}}
  .mq-spin{animation:mqSpin .8s linear infinite;}
  @keyframes mqSpin{to{transform:rotate(360deg);}}
  .mq-pulse-ring{animation:mqPulse 2s ease-out infinite;pointer-events:none;}
  @keyframes mqPulse{0%{transform:scale(1);opacity:.5;}100%{transform:scale(1.7);opacity:0;}}
  .mq-mic-pulse{animation:micPulse 1.2s infinite;}
  @keyframes micPulse{0%{box-shadow:0 0 0 0 rgba(0,212,177,0.4);}70%{box-shadow:0 0 0 14px rgba(0,212,177,0);}100%{box-shadow:0 0 0 0 rgba(0,212,177,0);}}
  .mq-wave span{display:inline-block;width:3px;border-radius:2px;background:#00D4B1;animation:wv .9s infinite ease-in-out;}
  .mq-wave span:nth-child(1){height:5px;animation-delay:0s}
  .mq-wave span:nth-child(2){height:12px;animation-delay:.1s}
  .mq-wave span:nth-child(3){height:20px;animation-delay:.2s}
  .mq-wave span:nth-child(4){height:12px;animation-delay:.3s}
  .mq-wave span:nth-child(5){height:7px;animation-delay:.15s}
  .mq-wave span:nth-child(6){height:16px;animation-delay:.25s}
  @keyframes wv{0%,100%{transform:scaleY(0.5)}50%{transform:scaleY(1.2)}}
  @keyframes spin{to{transform:rotate(360deg);}}
  .mq-ring-fill{stroke-dasharray:220;transition:stroke-dashoffset 1s linear;}
  .mq-meal-tap:active{transform:scale(0.97);}
  .mq-shell{width:100%;height:100vh;height:100dvh;overflow:hidden;overflow-y:auto;background:#0a0a0a;position:relative;}
  .mq-shell > *{min-height:100vh;min-height:100dvh;}
`;

export const GOAL_OPTIONS = [
  { id: "lose_fat",      icon: "🔥", label: "Lose fat",        sub: "Burn calories, drop weight" },
  { id: "build_muscle",  icon: "💪", label: "Build muscle",     sub: "Get stronger, gain size" },
  { id: "get_fit",       icon: "⚡", label: "Get fit & healthy", sub: "More energy, feel better" },
  { id: "strength",      icon: "🏋️", label: "Get stronger",     sub: "Build power, hit PRs" },
];

export const MOCK_RETURNING_PLAN = {
  calories: 1800, protein: 140, carbs: 160, fat: 55,
  workoutDays: ["Monday","Wednesday","Friday"], workoutType: "Full Body",
  workoutDuration: 40, weeklyFocus: "Build your movement foundation.",
  exercises: [
    { name: "Goblet Squat",       sets: 3, reps: 12, weight: 25, muscle: "Quads / Glutes" },
    { name: "Dumbbell Row",       sets: 3, reps: 10, weight: 30, muscle: "Back / Biceps" },
    { name: "Incline Press",      sets: 3, reps: 10, weight: 35, muscle: "Chest / Shoulders" },
    { name: "Romanian Deadlift",  sets: 3, reps: 10, weight: 65, muscle: "Hamstrings" },
    { name: "Shoulder Press",     sets: 3, reps: 10, weight: 25, muscle: "Shoulders" },
  ],
  tip: "Consistency over perfection — show up, even on hard days.",
};

export const DEFAULT_USER = {
  name: "", goal: null, sex: null, height: "", weight: "",
  age: "", unit: "imperial", restTimerSecs: 60,
};

export const SESSION_KEY   = "morphiq_session";
export const BRANDING_KEY  = "morphiq_branding";

export function getCachedBranding() {
  try { const r = localStorage.getItem(BRANDING_KEY); if (r) return JSON.parse(r); } catch {}
  return null;
}
export function cacheBranding(b) {
  try { localStorage.setItem(BRANDING_KEY, JSON.stringify(b)); } catch {}
}
