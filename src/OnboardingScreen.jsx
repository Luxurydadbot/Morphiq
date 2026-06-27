import { useState, useEffect } from "react";
import {
  useApp, theme, sb,
  GOAL_OPTIONS, GOAL_ICONS,
  Pill, Spinner,
  buildPlan,
} from "./shared.jsx";

function OnboardingScreen() {
  const { navigate, setUser, setPlan, plan, gymBranding, supabaseUser, supabaseUserIdRef } = useApp();
  const ob = theme.ob;
  const a = gymBranding.accent || ob.teal;
  const [step, setStep] = useState(0);
  const [planError, setPlanError] = useState("");
  const [name, setName] = useState("");
  const [goal, setGoal] = useState(null);
  const [sex, setSex] = useState(null);
  const [unit] = useState("imperial");
  const [heightFt, setHeightFt] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [weight, setWeight] = useState("");
  const [age, setAge] = useState("");
  const [daysPerWeek, setDaysPerWeek] = useState(3);
  const [injuries, setInjuries] = useState("");
  const [equipment, setEquipment] = useState(null);
  const [trainingHistory, setTrainingHistory] = useState(null);
  const [recentActivity, setRecentActivity] = useState(null);
  const [restPref, setRestPref] = useState(120);
  const [routeChoice, setRouteChoice] = useState(null); // null=not chosen, 'ai'=build for me, 'custom'=own routine
  const [checklist, setChecklist] = useState([false, false, false, false]);
  // Tracks whether each checklist item is visible yet (fades in before turning teal)
  const [checklistVisible, setChecklistVisible] = useState([false, false, false, false]);
  const [revealStep, setRevealStep] = useState(0); // 0=hidden, 1=header, 2=ai msg, 3=workouts, 4=targets, 5=button

  // When step 13 (plan reveal) is reached, stagger in each section for a celebration feel
  useEffect(() => {
    if (step !== 13) { setRevealStep(0); return; }
    setRevealStep(0);
    const delays = [120, 380, 640, 900, 1180];
    const timers = delays.map((d, i) => setTimeout(() => setRevealStep(i + 1), d));
    return () => timers.forEach(clearTimeout);
  }, [step]);

  useEffect(() => {
    if (step !== 12) return;
    let cancelled = false;
    [0,1,2,3].forEach(i => {
      // Item appears (fades in) first, then turns teal shortly after
      setTimeout(() => { if(!cancelled) setChecklistVisible(v => v.map((x,idx) => idx<=i ? true : x)); }, i*550+100);
      setTimeout(() => { if(!cancelled) setChecklist(c => c.map((v,idx) => idx<=i ? true : v)); }, i*550+300);
    });

    async function generatePlan() {
      const historyMap = { new: "beginner with no training history", some: "intermediate, 6 months to 2 years experience", years: "experienced lifter, several years of training" };
      const activityMap = { returning: "returning after a long break (treat as rebuilding, use 60-70% of experienced weights)", consistent: "moderately active, some consistency recently", active: "currently training regularly" };
      const fitnessProfile = `${historyMap[trainingHistory] || "beginner"}, ${activityMap[recentActivity] || "just starting out"}`;

      // Mifflin-St Jeor BMR — convert imperial to metric first
      const weightKg = parseFloat(weight) / 2.205;
      const heightCm = ((parseInt(heightFt) * 12) + parseInt(heightIn || 0)) * 2.54;
      const ageNum = parseInt(age);
      const bmrCalc = sex === "male"
        ? Math.round((10 * weightKg) + (6.25 * heightCm) - (5 * ageNum) + 5)
        : Math.round((10 * weightKg) + (6.25 * heightCm) - (5 * ageNum) - 161);
      const activityMult = daysPerWeek >= 4 ? 1.55 : 1.375;
      const tdeeCalc = Math.round(bmrCalc * activityMult);
      const goalAdj = goal === "build_muscle" ? 250 : goal === "lose_fat" ? -350 : 0; // Research: 350 cal deficit = ~0.7lb/week loss, maximizes fat loss while preserving muscle
      const minCals = sex === "male" ? 1600 : 1400;
      const targetCals = Math.max(minCals, tdeeCalc + goalAdj);

      const proteinPer = goal === "general_fitness" ? 0.8 : 1.0; // Research: 0.7g/lb is minimum; 0.8-1.0g/lb optimal for body recomposition at any goal
      const fatPer = goal === "build_muscle" ? 0.4 : goal === "lose_fat" ? 0.3 : 0.35; // Fat loss: slightly lower fat to create deficit room for protein
      const targetProtein = Math.round(parseFloat(weight) * proteinPer);
      const targetFat = Math.round(parseFloat(weight) * fatPer);
      const targetCarbs = Math.round((targetCals - (targetProtein * 4) - (targetFat * 9)) / 4);

      // Build plan locally — deterministic, code-driven, no prompt engineering needed
      const profileForPlan = {
        goal, sex, age, trainingHistory, recentActivity,
        daysPerWeek, equipment, injuries,
        restPref, // Fix (June 2026): restPref was captured in onboarding but never passed to buildPlan — rest times were always calculated from age/goal, ignoring the user's choice
      };
      const macrosForPlan = {
        calories: targetCals, protein: targetProtein,
        carbs: targetCarbs, fat: targetFat,
        bmr: bmrCalc, tdee: tdeeCalc, goalAdjustment: goalAdj,
      };

      try {
        const parsed = buildPlan(profileForPlan, macrosForPlan);
        if (!cancelled) {
          const userData = { name, goal, sex, height: `${heightFt}′ ${heightIn || "0"}″`, weight: `${weight} lbs`, age, daysPerWeek, injuries, equipment, unit, trainingHistory, recentActivity, restPref, fitnessLevel: trainingHistory === "new" ? "Beginner" : trainingHistory === "some" ? "Intermediate" : recentActivity === "returning" ? "Rebuilding" : "Advanced" };
          // Cache plan locally FIRST so it's never lost, even if the save below fails —
          // this is a safety net, not a substitute for confirming the cloud save succeeded.
          const _saveUid = supabaseUserIdRef?.current || supabaseUser?.id;
          try { localStorage.setItem("mq_cached_plan_" + (_saveUid || "anon"), JSON.stringify({ plan: parsed, user: userData })); } catch {}

          // Fix (June 2026): previously the app showed the plan and moved on to step 13
          // on a fixed 400ms timer, WITHOUT waiting to see if the database save actually
          // succeeded. If upsertProfile failed (e.g. a Supabase timeout), the member saw
          // their full plan with nothing saved behind it, and the very next action that
          // needed a profile row (like logging a workout set) would fail with no clear
          // explanation. Now we wait for the save to genuinely confirm before advancing,
          // and show a real retry screen if it fails, instead of guessing it worked.
          if (_saveUid) {
            const saveOk = await sb.upsertProfile(_saveUid, userData, parsed);
            if (!cancelled && !saveOk) {
              setPlanError("Your plan was built, but we couldn't save it — your connection or our database may have had a hiccup. Tap to try again.");
              return;
            }
            // Profile row now exists — safe to write the starting weight
            const startingWeight = parseFloat(weight);
            if (startingWeight > 0) {
              sb.insertWeightLog(_saveUid, startingWeight).catch(() => {});
            }
          }

          if (!cancelled) {
            setUser(userData);
            setPlan(parsed);
            setTimeout(() => { if (!cancelled) setStep(13); }, 400);
          }
        }
      } catch (planErr) {
        console.error("[Morphiq] Plan build failed:", planErr.message);
        if (!cancelled) {
          setPlanError("Plan generation failed — " + (planErr.message || "unknown error") + ". Tap to try again.");
        }
      }
    }

    if (step === 12) generatePlan();
    return () => { cancelled = true; };
  }, [step]);

  const bodyValid = heightFt && parseInt(heightFt) > 0 && parseInt(heightFt) < 9 && weight && parseFloat(weight) > 0;
  const ageValid = age && parseInt(age) >= 13 && parseInt(age) <= 100;
  const progressPct = [10, 18, 26, 34, 44, 54, 62, 70, 78, 86, 93, 100, 100][step] || 10;
  const goalLabel = GOAL_OPTIONS.find(g => g.id === goal)?.label || "";

  const s = {
    root: { background: ob.bg, borderRadius: 20, minHeight: "100dvh", display: "flex", flexDirection: "column", fontFamily: ob.font, color: ob.white, position: "relative", overflow: "hidden" },
    inner: { flex: 1, padding: "10px 14px 10px", display: "flex", flexDirection: "column" },
    aiBubble: { background: ob.card, borderRadius: "12px 12px 12px 4px", padding: "9px 11px", fontSize: 12, lineHeight: 1.55, color: ob.body, marginBottom: 8 },
    tealBtn: (disabled) => ({ width: "100%", background: a, color: ob.tealDk, border: "none", borderRadius: 10, padding: 9, fontSize: 11, fontWeight: 600, cursor: "pointer", marginTop: 8, fontFamily: ob.font, opacity: disabled ? 0.35 : 1 }),
    outlineBtn: { background: "transparent", border: `1px solid rgba(255,255,255,0.12)`, borderRadius: 10, padding: "7px 10px", fontSize: 10, color: ob.muted, cursor: "pointer", fontFamily: ob.font },
    numInput: { background: ob.card, border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 8, padding: "7px 10px", fontSize: 12, color: ob.white, outline: "none", fontFamily: ob.font, width: "100%" },
    goalCard: (sel) => ({ background: sel ? ob.tealDk : ob.card, border: `1.5px solid ${sel ? a : "rgba(255,255,255,0.08)"}`, borderRadius: 10, padding: "9px 10px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 6 }),
    label: { fontSize: 9, color: ob.muted, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 4 },
  };

  const AiAvatar = () => (
    <div style={{ width: 28, height: 28, borderRadius: "50%", background: ob.tealDk, border: `2px solid ${a}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 10, color: a, fontWeight: 700 }}>AI</div>
  );

  const EQUIP_LABELS = { barbell: "Barbells & racks", dumbbell: "Dumbbells & cables", kettlebell: "Kettlebells & bodyweight", machine: "Machines mostly" };
  const HISTORY_LABELS = { new: "New to working out", some: "Some experience (6m–2yr)", years: "Several years training" };
  const ACTIVITY_LABELS = { returning: "Getting back into it", consistent: "Pretty consistent", active: "Training regularly" };
  const REST_LABELS = { 60: "1 min", 120: "2 min", 180: "3 min" };
  const confirmRows = [
    ["Name", name], ["Goal", goalLabel], ["Sex", sex || "—"],
    ["Height", `${heightFt}′ ${heightIn || "0"}″`], ["Weight", `${weight} lbs`],
    ["Age", age ? `${age} yrs` : "—"], ["Experience", HISTORY_LABELS[trainingHistory] || "—"],
    ["Recent activity", ACTIVITY_LABELS[recentActivity] || "—"],
    ["Days/week", daysPerWeek ? `${daysPerWeek}×` : "—"],
    ["Rest between sets", REST_LABELS[restPref] || "2 min"],
    ["Equipment", EQUIP_LABELS[equipment] || "—"],
    ["Injuries", injuries.trim() || "None"],
  ];

  return (
    <div style={s.root}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 20, height: 20, borderRadius: "50%", background: ob.tealDk, border: `2px solid ${a}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: a }}>M</div>
          <span style={{ fontSize: 13, fontWeight: 600, color: a }}>{gymBranding.name}</span>
        </div>
        <span style={{ fontSize: 9, color: ob.muted }}>Powered by Hypergentiq</span>
      </div>
      {step < 10 && (
        <div style={{ padding: "8px 14px 0", flexShrink: 0 }}>
          <div style={{ height: 3, background: ob.card, borderRadius: 2 }}>
            <div style={{ height: 3, background: a, borderRadius: 2, width: `${progressPct}%`, transition: "width .5s ease" }} />
          </div>
        </div>
      )}
      <div style={s.inner}>
        {step === 0 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ textAlign: "center", margin: "16px 0 20px" }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: ob.tealDk, border: `2px solid ${a}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px", fontSize: 22, fontWeight: 700, color: a }}>
              {gymBranding.name?.[0]?.toUpperCase() || "M"}
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: ob.white }}>{gymBranding.name}</div>
            <div style={{ fontSize: 10, color: ob.muted, marginTop: 2 }}>Powered by Hypergentiq</div>
          </div>
          <div style={{ background: ob.card, borderRadius: "12px 12px 12px 4px", padding: "12px 14px", fontSize: 13, lineHeight: 1.6, color: ob.body, marginBottom: 20 }}>
            I'll build a training plan personal to you in about 2 minutes. Let's start with your name.
          </div>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && name.trim().length >= 2 && setStep('choose')} placeholder="Your first name..." style={{ background: ob.card, border: `1.5px solid ${name.trim().length >= 2 ? a : "rgba(255,255,255,0.08)"}`, borderRadius: 12, padding: "12px 14px", fontSize: 16, color: ob.white, outline: "none", fontFamily: ob.font, width: "100%", transition: "border-color .2s" }} maxLength={30} />
          <button onClick={() => name.trim().length >= 2 && setStep('choose')} disabled={name.trim().length < 2} style={{ ...s.tealBtn(name.trim().length < 2), marginTop: 12, padding: 12, fontSize: 13 }}>
            Let's go, {name.trim() || "..."} →
          </button>
        </div>}

        {step === 'choose' && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 4 }}>Your plan</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: ob.white }}>How would you like to train?</div>
            <div style={{ fontSize: 11, color: ob.muted, marginTop: 3 }}>Both paths track your progress and adjust your weights automatically</div>
          </div>
          <button onClick={() => { setRouteChoice("ai"); setStep(1); }}
            style={{ background: ob.tealDk, border: `1.5px solid ${a}`, borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", marginBottom: 10, width: "100%" }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(0,212,177,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 22 }}>🤖</div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: a }}>Build my plan for me</div>
              <div style={{ fontSize: 11, color: ob.muted, marginTop: 2 }}>AI creates a personalised program from scratch based on your goal and level</div>
            </div>
          </button>
          <button onClick={() => navigate("custom_plan")}
            style={{ background: ob.card, border: "1.5px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: "14px 16px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", width: "100%" }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 22 }}>📋</div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: ob.white }}>I have my own routine</div>
              <div style={{ fontSize: 11, color: ob.muted, marginTop: 2 }}>Enter your exercises, sets, reps, and starting weights — we handle the rest</div>
            </div>
          </button>
        </div>}

        {step === 1 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 4 }}>Your goal</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: ob.white }}>What do you want to achieve?</div>
            <div style={{ fontSize: 11, color: ob.muted, marginTop: 3 }}>No judgment — pick the one that fits best</div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            {GOAL_OPTIONS.map(g => (
              <button key={g.id} onClick={() => { setGoal(g.id); setTimeout(() => setStep(2), 180); }}
                style={{ background: goal === g.id ? ob.tealDk : ob.card, border: `1.5px solid ${goal === g.id ? a : "rgba(255,255,255,0.07)"}`, borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", transition: "all .15s" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: goal === g.id ? `rgba(0,212,177,0.15)` : "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: goal === g.id ? a : ob.muted }}>
                  {GOAL_ICONS[g.id]}
                </div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: goal === g.id ? a : ob.white }}>{g.label}</div>
                  <div style={{ fontSize: 10, color: ob.muted, marginTop: 1 }}>{g.sub}</div>
                </div>
                {goal === g.id && <div style={{ marginLeft: "auto", width: 18, height: 18, borderRadius: "50%", background: a, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: ob.tealDk, fontWeight: 700, flexShrink: 0 }}>✓</div>}
              </button>
            ))}
          </div>
        </div>}

        
        {step === 2 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 4 }}>Your background</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: ob.white }}>How long have you been training?</div>
            <div style={{ fontSize: 11, color: ob.muted, marginTop: 3 }}>Helps us set the right starting point</div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { id: "new", label: "New to working out", sub: "Just getting started", icon: "🌱" },
              { id: "some", label: "Some experience", sub: "6 months to 2 years, on and off", icon: "📈" },
              { id: "years", label: "Several years of training", sub: "I know my way around a gym", icon: "🏋️" },
            ].map(opt => (
              <button key={opt.id} onClick={() => { setTrainingHistory(opt.id); setTimeout(() => setStep(3), 180); }}
                style={{ background: trainingHistory === opt.id ? ob.tealDk : ob.card, border: `1.5px solid ${trainingHistory === opt.id ? a : "rgba(255,255,255,0.07)"}`, borderRadius: 14, padding: "14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", transition: "all .15s" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: trainingHistory === opt.id ? "rgba(0,212,177,0.15)" : "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 20 }}>{opt.icon}</div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: trainingHistory === opt.id ? a : ob.white }}>{opt.label}</div>
                  <div style={{ fontSize: 10, color: ob.muted, marginTop: 1 }}>{opt.sub}</div>
                </div>
                {trainingHistory === opt.id && <div style={{ marginLeft: "auto", width: 18, height: 18, borderRadius: "50%", background: a, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: ob.tealDk, fontWeight: 700, flexShrink: 0 }}>✓</div>}
              </button>
            ))}
          </div>
        </div>}

        {step === 3 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 4 }}>Right now</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: ob.white }}>How active have you been lately?</div>
            <div style={{ fontSize: 11, color: ob.muted, marginTop: 3 }}>No judgment — this calibrates your starting weights</div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { id: "returning", label: "Just getting back into it", sub: "Been a while — starting fresh", icon: "🔄" },
              { id: "consistent", label: "Pretty consistent", sub: "Training here and there recently", icon: "⚡" },
              { id: "active", label: "Training regularly right now", sub: "Already in a routine", icon: "🔥" },
            ].map(opt => (
              <button key={opt.id} onClick={() => { setRecentActivity(opt.id); setTimeout(() => setStep(4), 180); }}
                style={{ background: recentActivity === opt.id ? ob.tealDk : ob.card, border: `1.5px solid ${recentActivity === opt.id ? a : "rgba(255,255,255,0.07)"}`, borderRadius: 14, padding: "14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", transition: "all .15s" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: recentActivity === opt.id ? "rgba(0,212,177,0.15)" : "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 20 }}>{opt.icon}</div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: recentActivity === opt.id ? a : ob.white }}>{opt.label}</div>
                  <div style={{ fontSize: 10, color: ob.muted, marginTop: 1 }}>{opt.sub}</div>
                </div>
                {recentActivity === opt.id && <div style={{ marginLeft: "auto", width: 18, height: 18, borderRadius: "50%", background: a, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: ob.tealDk, fontWeight: 700, flexShrink: 0 }}>✓</div>}
              </button>
            ))}
          </div>
        </div>}

        {step === 4 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 4 }}>About you</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: ob.white }}>Biological sex</div>
            <div style={{ fontSize: 11, color: ob.muted, marginTop: 3 }}>Used to calculate accurate calorie targets</div>
          </div>
          <div style={{ display: "flex", gap: 10, flex: 1, alignItems: "flex-start" }}>
            {[["Male", (<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="10" cy="14" r="5"/><path d="M19 5l-5.5 5.5M19 5h-4M19 5v4"/></svg>)], ["Female", (<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="9" r="5"/><path d="M12 14v6M9 17h6"/></svg>)]].map(([label, icon]) => (
              <button key={label} onClick={() => { setSex(label); setTimeout(() => setStep(5), 180); }}
                style={{ flex: 1, background: sex === label ? ob.tealDk : ob.card, border: `1.5px solid ${sex === label ? a : "rgba(255,255,255,0.07)"}`, borderRadius: 16, padding: "24px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, cursor: "pointer", transition: "all .15s" }}>
                <div style={{ color: sex === label ? a : ob.muted }}>{icon}</div>
                <span style={{ fontSize: 14, fontWeight: 600, color: sex === label ? a : ob.white }}>{label}</span>
                {sex === label && <div style={{ width: 16, height: 16, borderRadius: "50%", background: a, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: ob.tealDk, fontWeight: 700 }}>✓</div>}
              </button>
            ))}
          </div>
        </div>}

        {step === 5 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 4 }}>Your stats</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: ob.white }}>Quick measurements</div>
            <div style={{ fontSize: 11, color: ob.muted, marginTop: 3 }}>Used to set accurate calorie and weight targets</div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={s.label}>Height</div>
            <div style={{ display: "flex", gap: 8 }}>
              <div style={{ flex: 1 }}><input value={heightFt} onChange={e => setHeightFt(e.target.value)} placeholder="ft" style={{ ...s.numInput }} type="number" min="3" max="8" /></div>
              <div style={{ flex: 1 }}><input value={heightIn} onChange={e => setHeightIn(e.target.value)} placeholder="in" style={{ ...s.numInput }} type="number" min="0" max="11" /></div>
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={s.label}>Weight (lbs)</div>
            <input value={weight} onChange={e => setWeight(e.target.value)} placeholder="e.g. 175" style={s.numInput} type="number" min="80" max="500" />
          </div>
          <div style={{ marginBottom: 10 }}>
            <div style={s.label}>Age</div>
            <input value={age} onChange={e => setAge(e.target.value)} placeholder="e.g. 32" style={s.numInput} type="number" min="13" max="100" />
          </div>
          <button onClick={() => setStep(6)} disabled={!bodyValid || !ageValid} style={{ ...s.tealBtn(!bodyValid || !ageValid), marginTop: "auto" }}>Continue →</button>
        </div>}

        {step === 6 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 4 }}>Training frequency</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: ob.white }}>How often can you train?</div>
            <div style={{ fontSize: 11, color: ob.muted, marginTop: 3 }}>3–4 days is ideal for most beginners</div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
            {/* Circular dial ring */}
            <div style={{ position: "relative", width: 140, height: 140 }}>
              <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform: "rotate(-90deg)" }}>
                <circle cx="70" cy="70" r="58" fill="none" stroke={ob.card} strokeWidth="12"/>
                <circle cx="70" cy="70" r="58" fill="none" stroke={a} strokeWidth="12" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 58}
                  strokeDashoffset={2 * Math.PI * 58 * (1 - (daysPerWeek - 2) / 5)}
                  style={{ transition: "stroke-dashoffset .35s cubic-bezier(.4,0,.2,1)" }}
                />
              </svg>
              <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center" }}>
                <div style={{ fontSize: 38, fontWeight: 700, color: ob.white, lineHeight: 1 }}>{daysPerWeek}</div>
                <div style={{ fontSize: 10, color: ob.muted, marginTop: 2 }}>days/week</div>
              </div>
            </div>
            {/* +/− buttons */}
            <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
              <button onClick={() => setDaysPerWeek(d => Math.max(2, d - 1))} style={{ width: 44, height: 44, borderRadius: "50%", background: ob.card, border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: ob.muted, cursor: "pointer", fontFamily: ob.font, lineHeight: 1 }}>−</button>
              <div style={{ fontSize: 11, color: ob.muted }}>adjust</div>
              <button onClick={() => setDaysPerWeek(d => Math.min(7, d + 1))} style={{ width: 44, height: 44, borderRadius: "50%", background: ob.tealDk, border: `1px solid rgba(0,212,177,0.3)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: a, cursor: "pointer", fontFamily: ob.font, lineHeight: 1 }}>+</button>
            </div>
            <div style={{ fontSize: 11, color: ob.muted, marginTop: 4, textAlign: "center", lineHeight: 1.5 }}>Do them any day that works for you — the app always shows your next workout.</div>
          </div>
          <button onClick={() => setStep(7)} style={{ ...s.tealBtn(false), marginTop: 8, padding: 12, fontSize: 13 }}>Continue →</button>
        </div>}

        
        {step === 7 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 4 }}>Rest preference</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: ob.white }}>How long to rest between sets?</div>
            <div style={{ fontSize: 11, color: ob.muted, marginTop: 3 }}>You can always change this mid-workout</div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" }}>
            {[[60, "1 minute", "High intensity, keep the burn going", "🔥"], [120, "2 minutes", "Balanced — works for most people", "⚡"], [180, "3 minutes", "Full recovery, lift heavier", "💪"]].map(([secs, label, sub, icon]) => (
              <button key={secs} onClick={() => { setRestPref(secs); setTimeout(() => setStep(8), 180); }}
                style={{ background: restPref === secs ? ob.tealDk : ob.card, border: `2px solid ${restPref === secs ? a : "rgba(255,255,255,0.07)"}`, borderRadius: 16, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, cursor: "pointer", transition: "all .15s" }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: restPref === secs ? "rgba(0,212,177,0.15)" : "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 24 }}>{icon}</div>
                <div style={{ textAlign: "left", flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: restPref === secs ? a : ob.white }}>{label}</div>
                  <div style={{ fontSize: 11, color: ob.muted, marginTop: 2 }}>{sub}</div>
                </div>
                {restPref === secs && <div style={{ width: 20, height: 20, borderRadius: "50%", background: a, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: ob.tealDk, fontWeight: 700, flexShrink: 0 }}>✓</div>}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: ob.muted, textAlign: "center", marginTop: 12 }}>This is your default — tap during rest to adjust on the fly</div>
        </div>}

        {step === 8 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 4 }}>Injuries & limits</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: ob.white }}>Anything to avoid?</div>
            <div style={{ fontSize: 11, color: ob.muted, marginTop: 3 }}>Tap all that apply — your plan will work around these</div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {["Lower back","Knees","Shoulders","Wrists","Neck","Hips","Ankles","Elbows"].map(area => {
              const sel = injuries.includes(area);
              return (
                <button key={area} onClick={() => setInjuries(prev => sel ? prev.replace(area, "").replace(/,\s*,/g,",").replace(/^,|,$/g,"").trim() : prev ? `${prev}, ${area}` : area)}
                  style={{ background: sel ? ob.tealDk : ob.card, border: `1.5px solid ${sel ? a : "rgba(255,255,255,0.08)"}`, borderRadius: 20, padding: "7px 14px", fontSize: 12, color: sel ? a : ob.body, cursor: "pointer", fontFamily: ob.font, transition: "all .15s" }}>
                  {area}
                </button>
              );
            })}
          </div>
          <textarea value={injuries} onChange={e => setInjuries(e.target.value)} placeholder="Or type anything else (e.g. no overhead pressing)..." style={{ ...s.numInput, minHeight: 64, resize: "none", lineHeight: 1.5, fontSize: 12 }} maxLength={200} />
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button onClick={() => { setInjuries(""); setStep(9); }} style={{ ...s.outlineBtn, flex: 1 }}>None →</button>
            <button onClick={() => setStep(9)} style={{ ...s.tealBtn(false), flex: 2, marginTop: 0, padding: 10 }}>Continue →</button>
          </div>
        </div>}




        {step === 9 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, color: a, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: 4 }}>Equipment</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: ob.white }}>What will you be training with?</div>
            <div style={{ fontSize: 11, color: ob.muted, marginTop: 3 }}>Your plan is built around your available equipment</div>
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            {[
              { id: "barbell", label: "Barbells & racks", sub: "Powerlifting-style, free weights", icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 4v16M18 4v16M3 8h3M15 8h6M3 16h3M15 16h6M6 12h12"/></svg>) },
              { id: "dumbbell", label: "Dumbbells & cables", sub: "Most commercial gyms", icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 8v8M18 8v8M3 10h3M18 10h3M3 14h3M18 14h3M9 12h6"/></svg>) },
              { id: "kettlebell", label: "Kettlebells & bodyweight", sub: "Functional, explosive training", icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 3a3 3 0 0 1 3 3c0 1.5-1 2.5-2 3l2 9H9l2-9c-1-.5-2-1.5-2-3a3 3 0 0 1 3-3z"/><path d="M9 18h6"/></svg>) },
              { id: "machine", label: "Machines mostly", sub: "Guided equipment, great for beginners", icon: (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="6" width="4" height="12" rx="1"/><rect x="17" y="6" width="4" height="12" rx="1"/><path d="M7 12h10"/></svg>) },
            ].map(eq => (
              <button key={eq.id} onClick={() => { setEquipment(eq.id); setTimeout(() => setStep(10), 180); }}
                style={{ background: equipment === eq.id ? ob.tealDk : ob.card, border: `1.5px solid ${equipment === eq.id ? a : "rgba(255,255,255,0.07)"}`, borderRadius: 14, padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer", transition: "all .15s" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: equipment === eq.id ? `rgba(0,212,177,0.15)` : "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: equipment === eq.id ? a : ob.muted }}>
                  {eq.icon}
                </div>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: equipment === eq.id ? a : ob.white }}>{eq.label}</div>
                  <div style={{ fontSize: 10, color: ob.muted, marginTop: 1 }}>{eq.sub}</div>
                </div>
                {equipment === eq.id && <div style={{ marginLeft: "auto", width: 18, height: 18, borderRadius: "50%", background: a, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: ob.tealDk, fontWeight: 700, flexShrink: 0 }}>✓</div>}
              </button>
            ))}
          </div>
        </div>}

        {step === 10 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", gap: 7, marginBottom: 10 }}><AiAvatar /><div style={s.aiBubble}>Before I build your plan, please review the health disclaimer below. Your safety comes first.</div></div>
          <div style={{ background: ob.card, borderRadius: 12, padding: "12px 14px", marginBottom: 10, flex: 1, overflowY: "auto" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: ob.white, marginBottom: 6 }}>⚠️ Health & Fitness Disclaimer</div>
            <div style={{ fontSize: 11, color: ob.body, lineHeight: 1.65 }}>
              The fitness and nutrition plans provided by Hypergentiq are for <span style={{ color: ob.white, fontWeight: 600 }}>informational and educational purposes only</span> and do not constitute medical advice.<br /><br />
              Before starting any new exercise or nutrition program, consult a qualified healthcare provider — especially if you have a medical condition, injury, or concern.<br /><br />
              You agree to exercise within your own limits and accept responsibility for your health and safety during all workouts. Morphiq and its licensees are not liable for any injury, illness, or adverse outcome.<br /><br />
              By tapping "I agree", you confirm you are at least 13 years old and accept these terms.
            </div>
          </div>
          <button onClick={() => setStep(11)} style={{ ...s.tealBtn(false), marginTop: 6 }}>I agree — build my plan ✦</button>
          <div style={{ textAlign: "center", marginTop: 8 }}>
            <button onClick={() => navigate("auth")} style={{ fontSize: 10, color: ob.muted, background: "none", border: "none", cursor: "pointer", fontFamily: ob.font }}>Decline — go back</button>
          </div>
        </div>}

        {step === 11 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", gap: 7, marginBottom: 8 }}><AiAvatar /><div style={s.aiBubble}>Perfect, {name}. {goalLabel}, {daysPerWeek} days a week, {restPref === 60 ? "1-min" : restPref === 180 ? "3-min" : "2-min"} rest{injuries.trim() ? `, noting: ${injuries.trim()}` : ""}. Building your 4-week plan now.</div></div>
          <div style={{ background: ob.card, borderRadius: 10, padding: "6px 10px", marginBottom: 8 }}>
            {confirmRows.map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ color: ob.muted }}>{k}</span>
                <span style={{ color: ob.white, fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>
          <button onClick={() => { setChecklist([false, false, false, false]); setChecklistVisible([false, false, false, false]); setStep(12); }} style={{ ...s.tealBtn(false), marginTop: "auto" }}>Build my plan ✦</button>
          <button onClick={() => setStep(0)} style={{ ...s.outlineBtn, width: "100%", marginTop: 6 }}>Start over</button>
        </div>}

        {step === 12 && <div className="mq-fade" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
          {planError ? (
            <>
              <div style={{ fontSize: 13, color: "#F87171", textAlign: "center", fontWeight: 600 }}>Something went wrong</div>
              <div style={{ fontSize: 11, color: ob.muted, textAlign: "center", padding: "0 20px" }}>{planError}</div>
              <button onClick={() => { setPlanError(""); setStep(11); }} style={{ background: a, border: "none", borderRadius: 10, padding: "10px 24px", fontSize: 12, color: ob.tealDk, fontWeight: 600, cursor: "pointer", fontFamily: ob.font, marginTop: 8 }}>Try again</button>
            </>
          ) : (
            <>
              <Spinner size={40} color={a} trackColor={ob.card} />
              <div style={{ fontSize: 12, fontWeight: 600, color: ob.white }}>Building your plan</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%", marginTop: 4 }}>
                {["Analyzing your goal", "Selecting best exercises", "Building your meal guide", "Personalizing week one..."].map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: checklist[i] ? a : ob.muted, padding: "3px 0", opacity: checklistVisible[i] ? 1 : 0, transform: checklistVisible[i] ? "translateY(0)" : "translateY(6px)", transition: "opacity .35s ease, transform .35s ease, color .3s" }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: checklist[i] ? a : ob.card, flexShrink: 0, transition: "background .3s" }} />{item}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>}

        {step === 13 && plan && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>

          {/* ── Celebration header — fades in first ── */}
          <div style={{ opacity: revealStep >= 1 ? 1 : 0, transform: revealStep >= 1 ? "translateY(0)" : "translateY(-10px)", transition: "opacity .4s ease, transform .4s ease" }}>
            <div style={{ textAlign: "center", marginBottom: 14 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: ob.tealDk, border: `1px solid ${a}`, borderRadius: 20, padding: "5px 14px", marginBottom: 10 }}>
                <span style={{ fontSize: 13 }}>✦</span>
                <span style={{ fontSize: 10, color: a, fontWeight: 600, letterSpacing: 1, textTransform: "uppercase" }}>Your plan is ready</span>
                <span style={{ fontSize: 13 }}>✦</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: ob.white, letterSpacing: "-0.3px" }}>{name}&apos;s {goalLabel} Plan</div>
              <div style={{ fontSize: 10, color: ob.muted, marginTop: 2 }}>Built by Hypergentiq AI · Week 1</div>
            </div>
          </div>

          {/* ── Personalised AI message — slides in second ── */}
          <div style={{ opacity: revealStep >= 2 ? 1 : 0, transform: revealStep >= 2 ? "translateY(0)" : "translateY(8px)", transition: "opacity .4s ease, transform .4s ease", marginBottom: 12 }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: ob.tealDk, border: `1.5px solid ${a}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: a, fontWeight: 700, flexShrink: 0 }}>AI</div>
              <div style={{ background: ob.card, borderRadius: "12px 12px 12px 4px", padding: "9px 12px", fontSize: 13, color: ob.body, lineHeight: 1.55, flex: 1 }}>
                {goal === "lose_fat"
                  ? `${name}, you're all set. ${daysPerWeek} days a week is the sweet spot for fat loss — enough to burn, enough rest to recover. Here's exactly what week one looks like.`
                  : goal === "build_muscle"
                  ? `${name}, your muscle-building plan is locked in. ${daysPerWeek} training days with progressive overload built in from day one. This is how size gets built. Let's go.`
                  : `${name}, your plan is ready. ${daysPerWeek} days a week, balanced workouts, and nutrition targets tailored to you. Everything adjusts as you progress.`}
              </div>
            </div>
          </div>

          {/* ── Workout days card — slides in third ── */}
          <div style={{ opacity: revealStep >= 3 ? 1 : 0, transform: revealStep >= 3 ? "translateY(0)" : "translateY(8px)", transition: "opacity .4s ease, transform .4s ease", marginBottom: 8 }}>
            <div style={{ background: ob.card, borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: ob.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Workouts — {plan.workoutType}</div>
              {(plan.workoutDays || []).map((day, i, arr) => (
                <div key={day} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 0", borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <span style={{ fontSize: 13, color: ob.white }}>{day}</span>
                  <Pill>{plan.workoutType} · {plan.workoutDuration} min</Pill>
                </div>
              ))}
            </div>
          </div>

          {/* ── Daily targets grid — slides in fourth ── */}
          <div style={{ opacity: revealStep >= 4 ? 1 : 0, transform: revealStep >= 4 ? "translateY(0)" : "translateY(8px)", transition: "opacity .4s ease, transform .4s ease", marginBottom: 8 }}>
            <div style={{ background: ob.card, borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: ob.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Daily targets</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {[["Calories", `${plan.calories?.toLocaleString()}`, "cal / day"], ["Protein", `${plan.protein}g`, "per day"], ["Carbs", `${plan.carbs}g`, "per day"], ["Fat", `${plan.fat}g`, "per day"]].map(([label, val, unit]) => (
                  <div key={label} style={{ background: "#0A1628", borderRadius: 10, padding: "12px 10px" }}>
                    <div style={{ fontSize: 10, color: ob.muted, marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: a, lineHeight: 1 }}>{val}</div>
                    <div style={{ fontSize: 10, color: ob.muted, marginTop: 3 }}>{unit}</div>
                  </div>
                ))}
              </div>
            </div>
            {plan.bmr && plan.tdee && (
              <div style={{ background: "#0A1628", borderLeft: `2px solid ${a}`, borderRadius: "0 8px 8px 0", padding: "10px 12px", marginTop: 8, fontSize: 13, color: ob.body, lineHeight: 1.6 }}>
                {plan.goalAdjustment < 0
                  ? `Your body burns ~${plan.tdee?.toLocaleString()} cal/day. We've reduced that by ${Math.abs(plan.goalAdjustment)} for steady fat loss.`
                  : plan.goalAdjustment > 0
                  ? `Your body burns ~${plan.tdee?.toLocaleString()} cal/day. We've added ${plan.goalAdjustment} to fuel muscle growth.`
                  : `Your maintenance is ~${plan.tdee?.toLocaleString()} cal/day — we're keeping you right there.`}
              </div>
            )}
          </div>

          {/* ── Start Day 1 CTA — slides in last with glow ── */}
          <div style={{ opacity: revealStep >= 5 ? 1 : 0, transform: revealStep >= 5 ? "translateY(0)" : "translateY(10px)", transition: "opacity .5s ease, transform .5s ease", marginTop: "auto" }}>
            <button
              onClick={() => navigate("plan")}
              style={{ ...s.tealBtn(false), padding: "13px 10px", fontSize: 14, fontWeight: 700, borderRadius: 14, boxShadow: `0 0 28px rgba(0,212,177,0.4)`, letterSpacing: "0.2px" }}
            >
              Start Day 1 →
            </button>

          </div>

        </div>}
      </div>
      <div style={{ textAlign: "center", fontSize: 9, color: "#333", letterSpacing: "0.5px", padding: "4px 0 6px", flexShrink: 0 }}>POWERED BY MORPHIQ</div>
    </div>
  );
}


export { OnboardingScreen };
