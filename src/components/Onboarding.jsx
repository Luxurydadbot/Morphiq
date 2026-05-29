import { useState, useEffect, useRef } from "react";
import { useApp } from "../utils/context";
import { theme, GOAL_OPTIONS } from "../utils/theme";
import { Pill } from "./Shared";
import sb from "../utils/supabase";



export default function OnboardingScreen() {
  const { navigate, setUser, setPlan, plan, gymBranding, supabaseUser } = useApp();
  const ob = theme.ob;
  const a = gymBranding.accent || ob.teal;
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState(null);
  const [sex, setSex] = useState(null);
  const [unit] = useState("imperial");
  const [heightFt, setHeightFt] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [weight, setWeight] = useState("");
  const [age, setAge] = useState("");
  const [daysPerWeek, setDaysPerWeek] = useState(null);
  const [medicalClear, setMedicalClear] = useState(null); // true = cleared, false = consult doctor
  const [restTimerSecs, setRestTimerSecs] = useState(60); // 60, 120, or 180
  const [injuries, setInjuries] = useState("");
  const [checklist, setChecklist] = useState([false, false, false, false]);

  useEffect(() => {
    if (step !== 9) return;
    let cancelled = false;
    [0,1,2,3].forEach(i => setTimeout(() => { if(!cancelled) setChecklist(c => c.map((v,idx) => idx<=i ? true : v)); }, i*550+300));

    async function generatePlan() {
      const prompt = `You are a certified personal trainer. Return ONLY valid JSON (no markdown, no preamble) for this member: name=${name}, goal=${goal}, sex=${sex}, height=${heightFt}ft${heightIn||0}in, weight=${weight}lbs, age=${age}, daysPerWeek=${daysPerWeek}, injuries=${injuries||"none"}.\nJSON shape exactly: {"calories":<number>,"protein":<number>,"carbs":<number>,"fat":<number>,"workoutDays":[<${daysPerWeek} day names>],"workoutType":"<string>","workoutDuration":<minutes>,"weeklyFocus":"<1 sentence>","exercises":[{"name":"<string>","sets":<n>,"reps":<n>,"weight":<starting lbs>,"muscle":"<string>"}],"tip":"<1 sentence>"}\nInclude 5-6 exercises. All numeric fields must be plain numbers.`;
      try {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, messages: [{ role: "user", content: prompt }] }),
        });
        const data = await res.json();
        const raw = (data.content || []).map(b => b.text || "").join("").replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(raw);
        if (!cancelled) {
          const userData = { name, goal, sex, height: `${heightFt}′ ${heightIn || "0"}″`, weight: `${weight} lbs`, age, daysPerWeek, injuries, unit, restTimerSecs };
          setUser(userData);
          setPlan(parsed);
          if (supabaseUser?.id) {
            sb.upsertProfile(supabaseUser.id, userData, parsed).catch(() => {});
          }
          setTimeout(() => { if (!cancelled) setStep(10); }, 400);
        }
      } catch (_) {
        if (!cancelled) {
          const userData = { name, goal, sex, height: `${heightFt}′ ${heightIn || "0"}″`, weight: `${weight} lbs`, age, daysPerWeek, injuries, unit, restTimerSecs };
          const fallbackPlan = { calories: goal === "lose_fat" ? 1800 : goal === "build_muscle" ? 2800 : 2200, protein: 140, carbs: 160, fat: 55, workoutDays: ["Monday","Wednesday","Friday","Saturday","Tuesday","Thursday"].slice(0, daysPerWeek || 3), workoutType: "Full Body", workoutDuration: 40, weeklyFocus: "Build your movement foundation with compound lifts.", exercises: [{ name: "Goblet Squat", sets: 3, reps: 12, weight: 25, muscle: "Quads / Glutes" }, { name: "Dumbbell Row", sets: 3, reps: 10, weight: 30, muscle: "Back / Biceps" }, { name: "Incline Press", sets: 3, reps: 10, weight: 35, muscle: "Chest / Shoulders" }, { name: "Romanian Deadlift", sets: 3, reps: 10, weight: 65, muscle: "Hamstrings" }, { name: "Shoulder Press", sets: 3, reps: 10, weight: 25, muscle: "Shoulders" }], tip: "Consistency over perfection — show up, even on hard days." };
          setUser(userData);
          setPlan(fallbackPlan);
          if (supabaseUser?.id) {
            sb.upsertProfile(supabaseUser.id, userData, fallbackPlan).catch(() => {});
          }
          setTimeout(() => { if (!cancelled) setStep(10); }, 400);
        }
      }
    }

    Promise.all([generatePlan(), new Promise(r => setTimeout(r, 2600))]);
    return () => { cancelled = true; };
  }, [step]);


  const bodyValid = heightFt && parseInt(heightFt) > 0 && parseInt(heightFt) < 9 && weight && parseFloat(weight) > 0;
  const ageValid = age && parseInt(age) >= 13 && parseInt(age) <= 100;
  const progressPct = [10, 20, 30, 42, 54, 64, 74, 83, 91, 100, 100][step] || 10;
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

  const restLabel = restTimerSecs === 60 ? "1 min" : restTimerSecs === 120 ? "2 min" : "3 min";
  const confirmRows = [
    ["Name", name], ["Goal", goalLabel], ["Sex", sex || "—"],
    ["Height", `${heightFt}′ ${heightIn || "0"}″`], ["Weight", `${weight} lbs`],
    ["Age", age ? `${age} yrs` : "—"], ["Days/week", daysPerWeek ? `${daysPerWeek}×` : "—"],
    ["Rest timer", restLabel], ["Medical", medicalClear ? "Cleared ✓" : "Consult recommended"],
  ];

  return (
    <div style={s.root}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 20, height: 20, borderRadius: "50%", background: ob.tealDk, border: `2px solid ${a}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: a }}>M</div>
          <span style={{ fontSize: 13, fontWeight: 600, color: a }}>{gymBranding.name}</span>
        </div>
        <span style={{ fontSize: 9, color: ob.muted }}>Powered by Morphiq</span>
      </div>
      {step < 9 && (
        <div style={{ padding: "8px 14px 0", flexShrink: 0 }}>
          <div style={{ height: 3, background: ob.card, borderRadius: 2 }}>
            <div style={{ height: 3, background: a, borderRadius: 2, width: `${progressPct}%`, transition: "width .5s ease" }} />
          </div>
        </div>
      )}
      <div style={s.inner}>
        {step === 0 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", gap: 7, marginBottom: 8 }}><AiAvatar /><div style={s.aiBubble}>Hey! I'm your Morphiq trainer. I'll build a plan completely personal to you — takes about 2 minutes. Ready?</div></div>
          <div style={{ display: "flex", gap: 7, marginBottom: 8 }}><AiAvatar /><div style={s.aiBubble}>First — what's your name?</div></div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: "auto" }}>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === "Enter" && name.trim().length >= 2 && setStep(1)} placeholder="Type your name..." style={{ flex: 1, background: ob.card, border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 16, padding: "8px 10px", fontSize: 12, color: ob.white, outline: "none", fontFamily: ob.font }} maxLength={30} />
            <button onClick={() => name.trim().length >= 2 && setStep(1)} style={{ width: 30, height: 30, borderRadius: "50%", background: a, border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", fontSize: 13, color: ob.tealDk, fontWeight: 700, opacity: name.trim().length < 2 ? 0.4 : 1 }}>→</button>
          </div>
        </div>}

        {step === 1 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", gap: 7, marginBottom: 10 }}><AiAvatar /><div style={s.aiBubble}>Nice to meet you, <span style={{ color: a, fontWeight: 600 }}>{name}</span>! No judgment — what's the main thing you want to achieve?</div></div>
          <div style={{ flex: 1 }}>
            {GOAL_OPTIONS.map(g => (
              <button key={g.id} onClick={() => setGoal(g.id)} style={s.goalCard(goal === g.id)}>
                <span style={{ fontSize: 16 }}>{g.icon}</span>
                <div><div style={{ fontSize: 12, fontWeight: 600, color: goal === g.id ? a : ob.white }}>{g.label}</div><div style={{ fontSize: 9, color: ob.muted }}>{g.sub}</div></div>
              </button>
            ))}
          </div>
          <button onClick={() => setStep(2)} disabled={!goal} style={s.tealBtn(!goal)}>Continue →</button>
        </div>}

        {step === 2 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", gap: 7, marginBottom: 10 }}><AiAvatar /><div style={s.aiBubble}>Got it! Are you male or female? (helps me calculate your calorie targets accurately)</div></div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            {[["Male", "♂"], ["Female", "♀"]].map(([label, icon]) => (
              <button key={label} onClick={() => setSex(label)} style={{ flex: 1, background: sex === label ? ob.tealDk : ob.card, border: `1.5px solid ${sex === label ? a : "rgba(255,255,255,0.08)"}`, borderRadius: 10, padding: "12px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 5, cursor: "pointer" }}>
                <span style={{ fontSize: 20 }}>{icon}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: sex === label ? a : ob.white }}>{label}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setStep(3)} disabled={!sex} style={s.tealBtn(!sex)}>Continue →</button>
        </div>}

        {step === 3 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", gap: 7, marginBottom: 10 }}><AiAvatar /><div style={s.aiBubble}>Quick stats — I use these to set the right calorie and weight targets for you.</div></div>
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
          <button onClick={() => setStep(4)} disabled={!bodyValid || !ageValid} style={{ ...s.tealBtn(!bodyValid || !ageValid), marginTop: "auto" }}>Continue →</button>
        </div>}

        {step === 4 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", gap: 7, marginBottom: 10 }}><AiAvatar /><div style={s.aiBubble}>How many days per week can you commit to working out?</div></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
            {[2, 3, 4, 5, 6, 7].map(d => (
              <button key={d} onClick={() => setDaysPerWeek(d)} style={{ background: daysPerWeek === d ? ob.tealDk : ob.card, border: `1.5px solid ${daysPerWeek === d ? a : "rgba(255,255,255,0.08)"}`, borderRadius: 10, padding: "10px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 3, cursor: "pointer" }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: daysPerWeek === d ? a : ob.white }}>{d}</span>
                <span style={{ fontSize: 9, color: ob.muted }}>days</span>
              </button>
            ))}
          </div>
          <button onClick={() => setStep(5)} disabled={!daysPerWeek} style={{ ...s.tealBtn(!daysPerWeek), marginTop: "auto" }}>Continue →</button>
        </div>}

        {step === 5 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", gap: 7, marginBottom: 8 }}><AiAvatar /><div style={s.aiBubble}>Before we begin — have you gotten medical clearance to start a new exercise program, or is this something you're comfortable starting on your own?</div></div>
          <div style={{ background: "#0A1628", borderLeft: `2px solid ${a}`, borderRadius: "0 8px 8px 0", padding: "8px 10px", marginBottom: 14, fontSize: 11, color: ob.body, lineHeight: 1.5 }}>
            If you have a medical condition, recent injury, or haven't exercised in a long time, we recommend consulting a doctor before starting. This program is not a substitute for medical advice.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 10 }}>
            <button onClick={() => { setMedicalClear(true); setStep(6); }}
              style={{ background: medicalClear === true ? ob.tealDk : ob.card, border: `1.5px solid ${medicalClear === true ? a : "rgba(255,255,255,0.08)"}`, borderRadius: 10, padding: "11px 12px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: medicalClear === true ? a : ob.white }}>Yes, I'm good to go</div>
                <div style={{ fontSize: 10, color: ob.muted }}>I'm healthy and ready to start exercising</div>
              </div>
            </button>
            <button onClick={() => { setMedicalClear(false); setStep(6); }}
              style={{ background: medicalClear === false ? "#1A0A0A" : ob.card, border: `1.5px solid ${medicalClear === false ? "#F87171" : "rgba(255,255,255,0.08)"}`, borderRadius: 10, padding: "11px 12px", display: "flex", alignItems: "center", gap: 10, cursor: "pointer", textAlign: "left" }}>
              <span style={{ fontSize: 18 }}>🩺</span>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: medicalClear === false ? "#F87171" : ob.white }}>I should check with my doctor first</div>
                <div style={{ fontSize: 10, color: ob.muted }}>I'll get cleared before starting intense workouts</div>
              </div>
            </button>
          </div>
          {medicalClear === false && (
            <div className="mq-fade" style={{ background: "#1A0A0A", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10, padding: "9px 11px", fontSize: 11, color: "#F87171", lineHeight: 1.5, marginBottom: 8 }}>
              No problem — we'll start you with light workouts and you can always update this later. Your safety comes first.
            </div>
          )}
        </div>}

        {step === 6 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", gap: 7, marginBottom: 10 }}><AiAvatar /><div style={s.aiBubble}>How long do you want to rest between sets? You can always change this later in your profile.</div></div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            {[["1 min", 60, "Faster pace, more cardio benefit"], ["2 min", 120, "Balanced — recommended for most"], ["3 min", 180, "More recovery, better for strength"]].map(([label, secs, sub]) => (
              <button key={secs} onClick={() => setRestTimerSecs(secs)}
                style={{ flex: 1, background: restTimerSecs === secs ? ob.tealDk : ob.card, border: `1.5px solid ${restTimerSecs === secs ? a : "rgba(255,255,255,0.08)"}`, borderRadius: 10, padding: "10px 6px", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: restTimerSecs === secs ? a : ob.white }}>{label}</span>
                <span style={{ fontSize: 8, color: ob.muted, textAlign: "center", lineHeight: 1.3 }}>{sub}</span>
              </button>
            ))}
          </div>
          <div style={{ background: ob.card, borderRadius: 10, padding: "8px 12px", marginBottom: 10, fontSize: 11, color: ob.body, lineHeight: 1.5 }}>
            <span style={{ color: a, fontWeight: 600 }}>Currently set: {restTimerSecs === 60 ? "1 min" : restTimerSecs === 120 ? "2 min" : "3 min"}</span> — timer auto-starts after each set. You can skip it anytime.
          </div>
          <button onClick={() => setStep(7)} style={{ ...s.tealBtn(false), marginTop: "auto" }}>Continue →</button>
        </div>}

        {step === 7 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", gap: 7, marginBottom: 10 }}><AiAvatar /><div style={s.aiBubble}>Almost there. Where do you usually work out?</div></div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
            {[["🏋️", "Gym", "Full equipment available"], ["🏠", "Home", "Dumbbells or bodyweight"], ["🌳", "Both", "Flexible setup"]].map(([icon, label, sub]) => (
              <button key={label} style={{ background: ob.card, border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 10, padding: "9px 10px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => setStep(8)}>
                <span style={{ fontSize: 16 }}>{icon}</span>
                <div><div style={{ fontSize: 12, fontWeight: 600, color: ob.white }}>{label}</div><div style={{ fontSize: 9, color: ob.muted }}>{sub}</div></div>
              </button>
            ))}
          </div>
        </div>}

        {step === 8 && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", gap: 7, marginBottom: 8 }}><AiAvatar /><div style={s.aiBubble}>Perfect. {goalLabel}, {daysPerWeek} days a week{injuries.trim() ? `, noting: ${injuries.trim()}` : ""}. I have everything I need.</div></div>
          <div style={{ background: ob.card, borderRadius: 10, padding: "6px 10px", marginBottom: 8 }}>
            {confirmRows.map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "4px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span style={{ color: ob.muted }}>{k}</span>
                <span style={{ color: ob.white, fontWeight: 500 }}>{v}</span>
              </div>
            ))}
          </div>
          <button onClick={() => { setChecklist([false, false, false, false]); setStep(9); }} style={{ ...s.tealBtn(false), marginTop: "auto" }}>Build my plan ✦</button>
          <button onClick={() => setStep(0)} style={{ ...s.outlineBtn, width: "100%", marginTop: 6 }}>Start over</button>
        </div>}

        {step === 9 && <div className="mq-fade" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
          <div style={{ width: 40, height: 40, border: `3px solid ${ob.card}`, borderTopColor: a, borderRadius: "50%", animation: "spin 0.9s linear infinite" }} />
          <div style={{ fontSize: 12, fontWeight: 600, color: ob.white }}>Building your plan</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, width: "100%", marginTop: 4 }}>
            {["Analyzing your goal", "Selecting best exercises", "Building your meal guide", "Personalizing week one..."].map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: checklist[i] ? a : ob.muted, padding: "3px 0" }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: checklist[i] ? a : ob.card, flexShrink: 0, transition: "background .3s" }} />{item}
              </div>
            ))}
          </div>
        </div>}

        {step === 10 && plan && <div className="mq-fade" style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ textAlign: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 9, color: a, textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Your plan is ready</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: ob.white }}>{name}&apos;s {goalLabel} Plan</div>
            <div style={{ fontSize: 9, color: ob.muted }}>Built by Morphiq AI · Week 1</div>
          </div>
          <div style={{ background: ob.card, borderRadius: 12, padding: "8px 12px", marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: ob.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Workouts — {plan.workoutType}</div>
            {(plan.workoutDays || []).map((day, i, arr) => (
              <div key={day} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                <span style={{ fontSize: 11, color: ob.white }}>{day}</span>
                <Pill>{plan.workoutType} · {plan.workoutDuration} min</Pill>
              </div>
            ))}
          </div>
          <div style={{ background: ob.card, borderRadius: 12, padding: "8px 12px", marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: ob.muted, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Daily targets</div>
            {[["Calories", `${plan.calories?.toLocaleString()}/day`], ["Protein", `${plan.protein}g/day`], ["Carbs", `${plan.carbs}g/day`], ["Fat", `${plan.fat}g/day`]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0" }}>
                <span style={{ fontSize: 11, color: ob.white }}>{k}</span>
                <span style={{ fontSize: 11, color: a, fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
          {plan.tip && <div style={{ background: "#0A1628", borderLeft: `2px solid ${a}`, borderRadius: "0 8px 8px 0", padding: "7px 10px", marginBottom: 8, fontSize: 11, color: ob.body, lineHeight: 1.5 }}>{plan.tip}</div>}
          <button onClick={() => navigate("plan")} style={{ ...s.tealBtn(false), marginTop: "auto", padding: 10, fontSize: 12 }}>Start Day 1 →</button>
        </div>}
      </div>
      <div style={{ textAlign: "center", fontSize: 9, color: "#333", letterSpacing: "0.5px", padding: "4px 0 6px", flexShrink: 0 }}>POWERED BY MORPHIQ</div>
    </div>
  );
}


// Export
