import { useState, useEffect } from "react";
import { useApp, sb, Spinner, Layout, theme, GOAL_OPTIONS, buildPlan } from "./Morphiq.jsx";

const PERSONAL_BESTS = [{exercise:"Goblet Squat",weight:"35 lbs",reps:13,date:"May 14"},{exercise:"Dumbbell Bench Press",weight:"35 lbs",reps:11,date:"May 12"},{exercise:"Seated Cable Row",weight:"95 lbs",reps:12,date:"May 14"},{exercise:"Romanian Deadlift",weight:"75 lbs",reps:10,date:"May 9"}];

function WeightChart({ data, accent }) {
  const W = 260, H = 84, PAD = 10;
  if (!data || data.length === 0) return null;
  // Need at least 2 points for a line; duplicate single point so chart renders
  const chartData = data.length === 1 ? [data[0], data[0]] : data;
  const vals = chartData.map(d => d.weight);
  const minV = Math.min(...vals) - 1;
  const maxV = Math.max(...vals) + 1;
  const xStep = (W - PAD * 2) / Math.max(chartData.length - 1, 1);
  const toY = v => PAD + ((maxV - v) / (maxV - minV)) * (H - PAD * 2 - 12);
  const points = chartData.map((d, i) => [PAD + i * xStep, toY(d.weight)]);
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const areaPath = linePath + ` L${points[points.length-1][0].toFixed(1)},${H-12} L${PAD},${H-12} Z`;
  const last = points[points.length - 1];
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      <defs>
        <linearGradient id="wg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={accent} stopOpacity="0.2" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#wg)" />
      <path d={linePath} fill="none" stroke={accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="3.5"
          fill={i === points.length - 1 ? accent : "#1A2332"} stroke={accent} strokeWidth="1.5" />
      ))}
      {chartData.map((d, i) => (
        <text key={i} x={points[i][0]} y={H} textAnchor="middle" fontSize="8" fill="#6B7A8D">{d.week}</text>
      ))}
      <text x={last[0] + 6} y={last[1] - 4} fontSize="9" fill={accent} fontWeight="600">{chartData[chartData.length-1].weight}</text>
    </svg>
  );
}

function StreakCalendar({ accent, workoutDates }) {
  const days = ["M","T","W","T","F","S","S"];
  // Build a 4-week grid ending today
  const today = new Date();
  // Find the most recent Monday
  const dow = today.getDay(); // 0=Sun
  const mondayOffset = dow === 0 ? 6 : dow - 1;
  const monday = new Date(today);
  monday.setDate(today.getDate() - mondayOffset - 21); // go back 3 more weeks
  const dateSet = new Set(workoutDates || []);
  const grid = [];
  for (let week = 0; week < 4; week++) {
    const row = [];
    for (let d = 0; d < 7; d++) {
      const cell = new Date(monday);
      cell.setDate(monday.getDate() + week * 7 + d);
      if (cell > today) { row.push(null); }
      else {
        const iso = cell.toISOString().slice(0,10);
        row.push(dateSet.has(iso) ? 1 : 0);
      }
    }
    grid.push(row);
  }
  return (
    <div>
      <div style={{ display:"flex", gap:4, marginBottom:5 }}>
        {days.map((d,i) => <div key={i} style={{ flex:1, textAlign:"center", fontSize:9, color:"#6B7A8D" }}>{d}</div>)}
      </div>
      {grid.map((row, ri) => (
        <div key={ri} style={{ display:"flex", gap:4, marginBottom:4 }}>
          {row.map((v, ci) => (
            <div key={ci} style={{
              flex:1, height:20, borderRadius:4,
              background: v === 1 ? accent : v === 0 ? "#1A2332" : "transparent",
              border: v === 0 ? "1px solid #1E2D42" : "none",
            }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// Returns the number of consecutive completed weeks (week streak).
// A week is "complete" when the morphiq_week_YYYY-MM-DD key in localStorage
// holds a value >= daysPerWeek. We look back up to 52 weeks.
function getWeekStreak(daysPerWeek) {
  daysPerWeek = daysPerWeek || 3;
  try {
    var streak = 0;
    for (var w = 0; w < 52; w++) {
      var d = new Date();
      var day = d.getDay();
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1) - w * 7);
      var key = "morphiq_week_" + d.toISOString().slice(0, 10);
      var done = parseInt(localStorage.getItem(key) || "0", 10);
      if (done >= daysPerWeek) {
        streak++;
      } else {
        break;
      }
    }
    return streak;
  } catch(e) { return 0; }
}

export function ProgressScreen() {
  const { gymBranding, supabaseUser, user, plan, historicalData, loadHistoricalData } = useApp();
  const a = gymBranding.accent;
  const [tab, setTab] = useState("body");
  const sL = { ...theme.sL, fontSize: 10, letterSpacing: "1.2px", marginBottom: 10, fontWeight: 500 };

  // Fetch fresh workout + weight data every time Progress screen opens.
  // Track loading so we show "..." instead of "—" while waiting.
  const [logsLoading, setLogsLoading] = useState(!historicalData);
  useEffect(() => {
    if (!supabaseUser?.id) return;
    setLogsLoading(true);
    loadHistoricalData(supabaseUser.id).finally(() => setLogsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // realLogs: use whatever historicalData has — even an empty array means "loaded, just no data yet"
  const realLogs = historicalData?.workoutLogs ?? null;
  // hasData = logs loaded AND at least one row exists
  const useRealWorkoutData = Array.isArray(realLogs) && realLogs.length > 0;

  const realSessions = useRealWorkoutData ? (() => {
    const byDate = {};
    realLogs.forEach(row => {
      if (!byDate[row.workout_date]) byDate[row.workout_date] = { date: row.workout_date, sets: 0, exercises: new Set(), totalVol: 0 };
      byDate[row.workout_date].sets++;
      byDate[row.workout_date].exercises.add(row.exercise_name);
      byDate[row.workout_date].totalVol += (row.weight || 0) * (row.reps || 0);
    });
    return Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5).map(s => ({
      date: new Date(s.date + "T12:00:00").toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" }),
      name: "Full body", sets: s.sets,
      vol: s.totalVol > 0 ? s.totalVol.toLocaleString() + " lbs" : "—", pbs: 0,
    }));
  })() : [];

  // Count ALL unique workout dates, not just the 5 shown in the recent list
  const totalWorkouts = useRealWorkoutData ? new Set(realLogs.map(r => r.workout_date)).size : 0;

  const realPBs = useRealWorkoutData ? (() => {
    const best = {};
    realLogs.forEach(row => {
      const key = row.exercise_name;
      if (!best[key] || row.weight > best[key].weight) {
        best[key] = { exercise: key, weight: `${row.weight} lbs`, reps: row.reps, date: row.workout_date };
      }
    });
    return Object.values(best).slice(0, 6);
  })() : PERSONAL_BESTS;

  // ── Weight logs from historicalData ──────────────────────────────────────
  const [weightLoading] = useState(false);
  const [weightLogs, setWeightLogs] = useState(null);
  const [showLogWeight, setShowLogWeight] = useState(false);
  const [newWeightInput, setNewWeightInput] = useState("");
  const [savingWeight, setSavingWeight] = useState(false);
  const [weightSaved, setWeightSaved] = useState(false);
  const [weightError, setWeightError] = useState(false);

  const isRealUser = supabaseUser?.id && !supabaseUser.id.startsWith("sim-") && supabaseUser.id !== "dev-001";

  // Sync weightLogs from historicalData whenever it updates
  useEffect(() => {
    if (historicalData?.weightLogs) setWeightLogs(historicalData.weightLogs);
  }, [historicalData?.weightLogs]);

  // Build chart data: real entries or mock fallback
  const useRealWeightData = weightLogs !== null && weightLogs.length >= 1;
  const weightChartData = useRealWeightData
    ? weightLogs.map((r) => ({
        // Fix (June 2026): labels were W1/W2/W3 by entry order, not real dates.
        // Now shows the actual date (e.g. "Jun 3") so two weigh-ins on the same
        // day get the same label, and the chart reflects real time spacing.
        week: new Date(r.logged_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        weight: parseFloat(r.weight_lbs),
        date: r.logged_date,
      }))
    : WEIGHT_DATA_MOCK;

  const lost = (weightChartData[0].weight - weightChartData[weightChartData.length - 1].weight).toFixed(1);
  const curr = weightChartData[weightChartData.length - 1].weight;
  const startWeight = weightChartData[0].weight;

  async function saveWeight() {
    const val = parseFloat(newWeightInput);
    if (!val || val < 50 || val > 600) return;
    setSavingWeight(true);
    setWeightError(false);
    // Always update local state immediately so chart refreshes without waiting
    const newEntry = { weight_lbs: val, logged_date: new Date().toISOString().slice(0, 10) };
    setWeightLogs(prev => [...(prev || []), newEntry]);
    // Persist to Supabase if real user — check result so we can surface failures
    if (isRealUser) {
      const ok = await sb.insertWeightLog(supabaseUser.id, val);
      if (!ok) {
        // Save failed — remove the optimistic entry and show error
        setWeightLogs(prev => (prev || []).filter(r => r.logged_date !== newEntry.logged_date || r.weight_lbs !== val));
        setSavingWeight(false);
        setWeightError(true);
        setTimeout(() => setWeightError(false), 4000);
        return;
      }
      // Refresh historicalData so weight chart and home screen update
      await loadHistoricalData(supabaseUser.id);
    }
    setSavingWeight(false);
    setWeightSaved(true);
    setNewWeightInput("");
    setShowLogWeight(false);
    setTimeout(() => setWeightSaved(false), 3000);
  }

  return (
    <Layout activeNav="progress">
      <div style={{ padding:"1.25rem 1.25rem 0" }}>
        <div style={{ marginBottom:16 }}>
          <div style={{ fontSize:20, fontWeight:600, color:theme.text }}>Your Progress</div>
          <div style={{ fontSize:12, color:theme.textDim, marginTop:2 }}>
            {useRealWeightData ? `${weightLogs.length} weigh-ins logged` : "Week 6 · Fat loss plan"}
          </div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:8, marginBottom:16 }}>
          {[
            { val: lost > 0 ? `−${lost} lbs` : `+${Math.abs(lost)} lbs`, lbl:"Weight change", color: lost >= 0 ? a : "#F87171" },
            { val: (() => { var ws = getWeekStreak(plan ? plan.daysPerWeek : 3); return ws > 0 ? "🔥 " + ws : "—"; })(), lbl:"Week streak", color:"#F59E0B" },
            { val: String(realPBs.length || 0), lbl:"PBs logged", color:"#A78BFA" },
          ].map(({ val, lbl, color }) => (
            <div key={lbl} style={{ background:"#1A2332", borderRadius:12, padding:"10px 8px", textAlign:"center" }}>
              <div style={{ fontSize:18, fontWeight:700, color }}>{val}</div>
              <div style={{ fontSize:10, color:"#6B7A8D", marginTop:3, lineHeight:1.3 }}>{lbl}</div>
            </div>
          ))}
        </div>

        <div style={{ display:"flex", background:"#1A2332", borderRadius:10, padding:3, marginBottom:16 }}>
          {[["body","Body"],["workouts","Workouts"],["bests","Bests"]].map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex:1, padding:"7px 6px", background:tab===t ? a : "transparent", border:"none", borderRadius:8, fontSize:12, fontWeight:500, color:tab===t ? "#003D35" : theme.textDim, cursor:"pointer", fontFamily:"inherit", transition:"all .2s" }}>
              {label}
            </button>
          ))}
        </div>

        {tab === "body" && (
          <div className="mq-fade">
            {/* Weight chart card */}
            <div style={{ background:"#1A2332", borderRadius:14, padding:"14px 14px 10px", marginBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                <div>
                  <div style={sL}>
                    Weight trend
                    {!useRealWeightData && <span style={{ color:"#2D3A4A", marginLeft:6, fontStyle:"italic" }}>(sample)</span>}
                  </div>
                  <div style={{ fontSize:26, fontWeight:700, color:theme.text, lineHeight:1 }}>
                    {curr} <span style={{ fontSize:13, color:"#6B7A8D", fontWeight:400 }}>lbs</span>
                  </div>
                  <div style={{ fontSize:12, color: lost >= 0 ? a : "#F87171", marginTop:2 }}>
                    {lost >= 0 ? `↓ ${lost} lbs since day 1` : `↑ ${Math.abs(lost)} lbs since day 1`}
                  </div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
                  <div style={{ background: weightError ? "#1F1010" : "#003D35", borderRadius:8, padding:"4px 10px", fontSize:11, color: weightError ? "#F87171" : a, fontWeight:500 }}>
                    {weightError ? "Save failed — try again" : weightSaved ? "Saved ✓" : "On track ✓"}
                  </div>
                </div>
              </div>

              {/* Log weight button — large and prominent */}
              <button onClick={() => setShowLogWeight(!showLogWeight)}
                style={{ width:"100%", background: showLogWeight ? "transparent" : a, border: showLogWeight ? "1px solid rgba(255,255,255,0.12)" : "none", borderRadius:12, padding:"13px", fontSize:15, fontWeight:600, color: showLogWeight ? "#6B7A8D" : "#003D35", cursor:"pointer", fontFamily:"inherit", marginBottom:10 }}>
                {showLogWeight ? "Cancel" : "＋ Log today's weight"}
              </button>

              {/* Log weight inline form */}
              {showLogWeight && (
                <div className="mq-fade" style={{ background:"#0A1628", borderRadius:12, padding:"14px", marginBottom:10 }}>
                  <div style={{ fontSize:13, color:"#9BB3C8", marginBottom:10, fontWeight:500 }}>What's your weight today?</div>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <input
                      type="number"
                      value={newWeightInput}
                      onChange={e => setNewWeightInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && saveWeight()}
                      placeholder="e.g. 182.5"
                      autoFocus
                      style={{ flex:1, background:"#111827", border:"1px solid rgba(255,255,255,0.12)", borderRadius:10, padding:"12px 14px", fontSize:16, color:"#E8EDF2", outline:"none", fontFamily:"inherit" }}
                    />
                    <div style={{ fontSize:13, color:"#6B7A8D", flexShrink:0 }}>lbs</div>
                    <button onClick={saveWeight} disabled={savingWeight || !newWeightInput}
                      style={{ background: newWeightInput ? a : "#1A2332", border:"none", borderRadius:10, padding:"12px 18px", fontSize:14, color: newWeightInput ? "#003D35" : "#6B7A8D", fontWeight:600, cursor: newWeightInput ? "pointer" : "default", fontFamily:"inherit", flexShrink:0 }}>
                      {savingWeight ? "..." : "Save"}
                    </button>
                  </div>
                </div>
              )}

              {weightLoading ? (
                <div style={{ display:"flex", justifyContent:"center", padding:"20px 0" }}>
                  <Spinner size={24} color={a} />
                </div>
              ) : (
                <WeightChart data={weightChartData} accent={a} />
              )}

              {!useRealWeightData && !weightLoading && (
                <div style={{ fontSize:10, color:"#2D3A4A", textAlign:"center", marginTop:4 }}>
                  Log your weight to replace this sample chart with your real data
                </div>
              )}
            </div>

            {/* Measurements */}
            <div style={sL}>Measurements</div>
            <div style={{ background:"#1A2332", borderRadius:14, overflow:"hidden", marginBottom:12 }}>
              {[
                { label:"Starting weight", start:"", current:`${startWeight} lbs`, delta:"", dColor:a },
                { label:"Current weight",  start:"", current:`${curr} lbs`,        delta: lost >= 0 ? `−${lost} lbs` : `+${Math.abs(lost)} lbs`, dColor: lost >= 0 ? a : "#F87171" },
                { label:"Body fat est.",   start:"", current:"21%",                delta:"−3%",                                                    dColor:a },
              ].map((row, i, arr) => (
                <div key={row.label} style={{ display:"flex", alignItems:"center", padding:"10px 14px", borderBottom: i < arr.length-1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <div style={{ flex:1, fontSize:13, color:theme.textMuted }}>{row.label}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:theme.text, marginRight:8 }}>{row.current}</div>
                  {row.delta && <div style={{ fontSize:11, color:row.dColor, fontWeight:600, minWidth:52, textAlign:"right" }}>{row.delta}</div>}
                </div>
              ))}
            </div>

            <div style={sL}>Workout streak</div>
            <div style={{ background:"#1A2332", borderRadius:14, padding:"14px" }}>
              <StreakCalendar accent={a} workoutDates={
                useRealWorkoutData
                  ? [...new Set(realLogs.map(r => r.workout_date))]
                  : []
              } />
              <div style={{ display:"flex", gap:14, marginTop:10 }}>
                <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <div style={{ width:10, height:10, borderRadius:3, background:a }} />
                  <span style={{ fontSize:10, color:"#6B7A8D" }}>Workout done</span>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                  <div style={{ width:10, height:10, borderRadius:3, background:"#1A2332", border:"1px solid #1E2D42" }} />
                  <span style={{ fontSize:10, color:"#6B7A8D" }}>Rest day</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === "workouts" && (
          <div className="mq-fade">
            {(() => {
              // Total volume = sum of weight × reps across all working sets (exclude warm-ups: set_number > 0)
              const totalVol = useRealWorkoutData
                ? realLogs.filter(r => r.set_number > 0).reduce((acc, r) => acc + (r.weight || 0) * (r.reps || 0), 0)
                : null;
              const volDisplay = logsLoading ? "..." : totalVol !== null ? totalVol.toLocaleString() + " lbs" : "—";
              const workoutsDisplay = logsLoading ? "..." : totalWorkouts > 0 ? String(totalWorkouts) : "0";
              return (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
                  <div style={{ background:"#1A2332", borderRadius:12, padding:"10px 12px" }}>
                    <div style={{ fontSize:20, fontWeight:700, color:a }}>{workoutsDisplay}</div>
                    <div style={{ fontSize:10, color:"#6B7A8D", marginTop:2 }}>Sessions logged</div>
                  </div>
                  <div style={{ background:"#1A2332", borderRadius:12, padding:"10px 12px" }}>
                    <div style={{ fontSize:20, fontWeight:700, color:"#F59E0B" }}>{volDisplay}</div>
                    <div style={{ fontSize:10, color:"#6B7A8D", marginTop:2 }}>Total volume lifted</div>
                  </div>
                </div>
              );
            })()}
            <div style={sL}>Recent sessions</div>
            <div style={{ background:"#1A2332", borderRadius:14, overflow:"hidden" }}>
              {realSessions.length === 0 ? (
                <div style={{ padding:"18px 14px", textAlign:"center" }}>
                  <div style={{ fontSize:13, fontWeight:600, color:theme.text }}>{logsLoading ? "Loading..." : "No sessions yet"}</div>
                  <div style={{ fontSize:11, color:"#6B7A8D", marginTop:4 }}>{logsLoading ? "Fetching your workout history." : "Log a set in the workout screen and it'll appear here."}</div>
                </div>
              ) : realSessions.map((w, i) => (
                <div key={w.date} style={{ padding:"10px 14px", borderBottom: i < realSessions.length-1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:theme.text }}>{w.name}</div>
                      <div style={{ fontSize:11, color:"#6B7A8D", marginTop:2 }}>{w.date} · {w.sets} sets · {w.vol}</div>
                    </div>
                    {w.pbs > 0 && (
                      <span style={{ background:"#2D1A00", color:"#F59E0B", borderRadius:20, padding:"2px 8px", fontSize:10, fontWeight:500, flexShrink:0 }}>
                        🔥 {w.pbs} PB{w.pbs > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "bests" && (() => {
          // Build real volume-per-exercise from workout logs for the current month
          const thisMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
          const volColors = [a, "#818cf8", "#F59E0B", "#f472b6", "#60A5FA", "#34D399"];
          const realVolBars = useRealWorkoutData ? (() => {
            const vol = {};
            realLogs.forEach(row => {
              if (!row.workout_date?.startsWith(thisMonth)) return;
              const k = row.exercise_name;
              if (!vol[k]) vol[k] = 0;
              vol[k] += (row.weight || 0) * (row.reps || 0);
            });
            const entries = Object.entries(vol).sort((a, b) => b[1] - a[1]).slice(0, 4);
            if (!entries.length) return null;
            const maxVol = entries[0][1];
            return entries.map(([label, v], i) => ({
              label, pct: Math.round((v / maxVol) * 100), color: volColors[i % volColors.length],
              total: v.toLocaleString() + " lbs",
            }));
          })() : null;

          const pbCount = useRealWorkoutData ? realPBs.length : 0;
          const pbMsg = useRealWorkoutData
            ? (realPBs.length > 0
                ? `You have ${pbCount} exercise best${pbCount !== 1 ? "s" : ""} on record. Keep adding weight to keep growing.`
                : "No workouts logged yet. Complete your first session to start tracking personal bests.")
            : "You've set 8 personal bests this month. Progressive overload is working.";

          return (
            <div className="mq-fade">
              <div style={{ background:"#0A1628", borderLeft:"2px solid #00D4B1", borderRadius:"0 10px 10px 0", padding:"8px 12px", marginBottom:14 }}>
                <div style={{ fontSize:12, color:"#9BB3C8", lineHeight:1.5 }}>{pbMsg}</div>
              </div>
              {realPBs.length > 0 && (
                <>
                  <div style={sL}>Current bests</div>
                  <div style={{ background:"#1A2332", borderRadius:14, overflow:"hidden", marginBottom:14 }}>
                    {realPBs.map((pb, i) => (
                      <div key={pb.exercise} style={{ padding:"11px 14px", borderBottom: i < realPBs.length-1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                          <div>
                            <div style={{ fontSize:13, fontWeight:600, color:theme.text }}>{pb.exercise}</div>
                            <div style={{ fontSize:11, color:"#6B7A8D", marginTop:2 }}>
                              {pb.date ? new Date(pb.date + "T12:00:00").toLocaleDateString("en-US", { month:"short", day:"numeric" }) : "—"}
                            </div>
                          </div>
                          <div style={{ textAlign:"right" }}>
                            <div style={{ fontSize:15, fontWeight:700, color:a }}>{pb.weight}</div>
                            <div style={{ fontSize:11, color:"#6B7A8D" }}>{pb.reps} reps</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {realVolBars && (
                <div style={{ background:"#1A2332", borderRadius:14, padding:"12px 14px" }}>
                  <div style={{ fontSize:11, color:"#6B7A8D", textTransform:"uppercase", letterSpacing:"1px", marginBottom:10 }}>Volume this month</div>
                  {realVolBars.map(bar => (
                    <div key={bar.label} style={{ marginBottom:8 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                        <span style={{ fontSize:11, color:theme.textMuted }}>{bar.label}</span>
                        <span style={{ fontSize:11, color:bar.color, fontWeight:600 }}>{bar.total}</span>
                      </div>
                      <div style={{ height:4, background:"#0F1922", borderRadius:2 }}>
                        <div style={{ height:4, borderRadius:2, background:bar.color, width:`${bar.pct}%`, transition:"width .8s ease" }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

      </div>
    </Layout>
  );
}

const EQUIPMENT_OPTIONS = [
  { id: "dumbbell",    label: "Dumbbells",         sub: "Home or gym — most common" },
  { id: "barbell",     label: "Barbell & rack",     sub: "Full gym with squat rack" },
  { id: "machine",     label: "Machines only",      sub: "Commercial gym machines" },
  { id: "kettlebell",  label: "Kettlebells",         sub: "Home gym or functional fitness" },
];

export function ProfileScreen() {
  const { navigate, user, setUser, plan, setPlan, gymBranding, signOut, supabaseUser } = useApp();
  const a = gymBranding.accent;
  const sL = theme.sL;

  // Edit state for each editable field
  const [editGoal, setEditGoal]         = useState(false);
  const [editDays, setEditDays]         = useState(false);
  const [editEquip, setEditEquip]       = useState(false);
  const [saving, setSaving]             = useState(false);
  const [savedMsg, setSavedMsg]         = useState("");

  // Local selections — initialised from live data
  const [selectedGoal,  setSelectedGoal]  = useState(user.goal || "lose_fat");
  const [selectedDays,  setSelectedDays]  = useState(user.daysPerWeek || plan?.daysPerWeek || 3);
  const [selectedEquip, setSelectedEquip] = useState(user.equipment || "dumbbell");

  const goalLabel  = GOAL_OPTIONS.find(g => g.id === selectedGoal)?.label  || "Lose fat";
  const equipLabel = EQUIPMENT_OPTIONS.find(e => e.id === selectedEquip)?.label || "Dumbbells";

  // Shared save function — rebuilds plan from scratch, keeps all history/streaks untouched
  async function saveChanges(newGoal, newDays, newEquip) {
    setSaving(true);
    const updatedUser = { ...user, goal: newGoal, daysPerWeek: newDays, equipment: newEquip };
    const newPlan = buildPlan(updatedUser);
    // Preserve week tracking so streak isn't lost
    newPlan.weekNumber    = plan?.weekNumber    || 1;
    newPlan.weekStartDate = plan?.weekStartDate || new Date().toISOString().split("T")[0];
    setUser(updatedUser);
    setPlan(newPlan);
    // Fire-and-forget save to Supabase — never blocks the UI
    if (supabaseUser?.id) {
      sb.upsertProfile(supabaseUser.id, updatedUser, newPlan).catch(() => {});
    }
    setSaving(false);
    setSavedMsg("Plan updated ✓");
    setTimeout(() => setSavedMsg(""), 3000);
  }

  const StatRow = ({ label, value, sub }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
      <div>
        <div style={{ fontSize: 13, color: theme.text }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: theme.textDim, marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: a }}>{value}</div>
    </div>
  );

  const EditBtn = ({ onClick }) => (
    <button onClick={onClick} style={{ background: "#003D35", border: `1px solid rgba(0,212,177,0.3)`, borderRadius: 8, padding: "5px 12px", fontSize: 11, color: a, cursor: "pointer", fontFamily: "inherit" }}>Change</button>
  );

  const SaveCancelRow = ({ onSave, onCancel }) => (
    <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
      <button onClick={onCancel} style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "8px", fontSize: 12, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
      <button onClick={onSave} disabled={saving} style={{ flex: 2, background: a, border: "none", borderRadius: 10, padding: "8px", fontSize: 12, fontWeight: 600, color: "#003D35", cursor: "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>
        {saving ? "Saving…" : "Save & rebuild plan"}
      </button>
    </div>
  );

  return (
    <Layout activeNav="progress">
      <div style={{ padding: "1.25rem 1.25rem 0" }}>
        {/* Avatar + Name */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#003D35", border: `2px solid ${a}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: a, flexShrink: 0 }}>
            {(user.name || "?")[0].toUpperCase()}
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: theme.text }}>{user.name || "Member"}</div>
            <div style={{ fontSize: 12, color: theme.textDim, marginTop: 2 }}>{gymBranding.name} · Member</div>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 5, background: "#003D35", border: `1px solid rgba(0,212,177,0.25)`, borderRadius: 20, padding: "2px 8px", marginTop: 4 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: a }} />
              <span style={{ fontSize: 10, color: a }}>Active plan · {goalLabel}</span>
            </div>
          </div>
        </div>

        {/* Saved confirmation banner */}
        {savedMsg && (
          <div style={{ background: "#003D35", border: `1px solid rgba(0,212,177,0.4)`, borderRadius: 10, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: a, textAlign: "center" }}>
            {savedMsg}
          </div>
        )}

        {/* ── Goal ── */}
        <div style={sL}>Your Goal</div>
        <div style={{ background: "#1A2332", borderRadius: 14, padding: "12px 14px", marginBottom: 16 }}>
          {!editGoal ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: theme.text }}>{goalLabel}</div>
                <div style={{ fontSize: 12, color: theme.textDim, marginTop: 2 }}>{selectedDays} workouts/week</div>
              </div>
              <EditBtn onClick={() => setEditGoal(true)} />
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 10 }}>Choose new goal:</div>
              {GOAL_OPTIONS.map(g => (
                <button key={g.id} onClick={() => setSelectedGoal(g.id)}
                  style={{ width: "100%", background: selectedGoal === g.id ? "#003D35" : "transparent", border: `1px solid ${selectedGoal === g.id ? a : "rgba(255,255,255,0.08)"}`, borderRadius: 10, padding: "9px 10px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", marginBottom: 6, fontFamily: "inherit", textAlign: "left" }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: selectedGoal === g.id ? a : theme.text }}>{g.label}</span>
                  {g.sub && <span style={{ fontSize: 11, color: theme.textDim, marginLeft: "auto" }}>{g.sub}</span>}
                </button>
              ))}
              <SaveCancelRow
                onCancel={() => { setEditGoal(false); setSelectedGoal(user.goal || "lose_fat"); }}
                onSave={() => { setEditGoal(false); saveChanges(selectedGoal, selectedDays, selectedEquip); }}
              />
            </div>
          )}
        </div>

        {/* ── Days per week ── */}
        <div style={sL}>Workouts per Week</div>
        <div style={{ background: "#1A2332", borderRadius: 14, padding: "12px 14px", marginBottom: 16 }}>
          {!editDays ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: theme.text }}>{selectedDays} days/week</div>
                <div style={{ fontSize: 12, color: theme.textDim, marginTop: 2 }}>~{Math.round((plan?.exercises?.length || 5) * 8)} min per session</div>
              </div>
              <EditBtn onClick={() => setEditDays(true)} />
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 10 }}>How many days per week?</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 4 }}>
                {[2, 3, 4, 5].map(d => (
                  <button key={d} onClick={() => setSelectedDays(d)}
                    style={{ flex: 1, background: selectedDays === d ? "#003D35" : "transparent", border: `1px solid ${selectedDays === d ? a : "rgba(255,255,255,0.1)"}`, borderRadius: 10, padding: "10px 4px", fontSize: 16, fontWeight: 700, color: selectedDays === d ? a : theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>
                    {d}
                  </button>
                ))}
              </div>
              <div style={{ fontSize: 11, color: theme.textDim, textAlign: "center", marginBottom: 4 }}>days per week</div>
              <SaveCancelRow
                onCancel={() => { setEditDays(false); setSelectedDays(user.daysPerWeek || 3); }}
                onSave={() => { setEditDays(false); saveChanges(selectedGoal, selectedDays, selectedEquip); }}
              />
            </div>
          )}
        </div>

        {/* ── Equipment ── */}
        <div style={sL}>Equipment</div>
        <div style={{ background: "#1A2332", borderRadius: 14, padding: "12px 14px", marginBottom: 16 }}>
          {!editEquip ? (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: theme.text }}>{equipLabel}</div>
                <div style={{ fontSize: 12, color: theme.textDim, marginTop: 2 }}>{EQUIPMENT_OPTIONS.find(e => e.id === selectedEquip)?.sub || ""}</div>
              </div>
              <EditBtn onClick={() => setEditEquip(true)} />
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 10 }}>What equipment do you have?</div>
              {EQUIPMENT_OPTIONS.map(e => (
                <button key={e.id} onClick={() => setSelectedEquip(e.id)}
                  style={{ width: "100%", background: selectedEquip === e.id ? "#003D35" : "transparent", border: `1px solid ${selectedEquip === e.id ? a : "rgba(255,255,255,0.08)"}`, borderRadius: 10, padding: "9px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", marginBottom: 6, fontFamily: "inherit" }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: selectedEquip === e.id ? a : theme.text }}>{e.label}</span>
                  <span style={{ fontSize: 11, color: theme.textDim }}>{e.sub}</span>
                </button>
              ))}
              <SaveCancelRow
                onCancel={() => { setEditEquip(false); setSelectedEquip(user.equipment || "dumbbell"); }}
                onSave={() => { setEditEquip(false); saveChanges(selectedGoal, selectedDays, selectedEquip); }}
              />
            </div>
          )}
        </div>

        {/* Body stats — read-only */}
        <div style={sL}>Body Stats</div>
        <div style={{ background: "#1A2332", borderRadius: 14, padding: "0 14px", marginBottom: 16 }}>
          <StatRow label="Height" value={user.height || "5′ 10″"} />
          <StatRow label="Weight" value={user.weight || "185 lbs"} sub="Starting weight" />
          <StatRow label="Age" value={user.age ? `${user.age} yrs` : "28 yrs"} />
          <div style={{ padding: "10px 0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, color: theme.text }}>Sex</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: a }}>{user.sex || "Male"}</div>
            </div>
          </div>
        </div>

        {/* Daily targets */}
        <div style={sL}>Daily Targets</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[[(plan?.calories?.toLocaleString() || "1,800"), "Calories", a], [(plan?.protein ? plan.protein + "g" : "140g"), "Protein", "#F59E0B"], [(plan?.carbs ? plan.carbs + "g" : "160g"), "Carbs", "#818cf8"], [(plan?.fat ? plan.fat + "g" : "55g"), "Fat", "#f472b6"]].map(([v, l, c]) => (
            <div key={l} style={{ background: "#1A2332", borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: c }}>{v}</div>
              <div style={{ fontSize: 11, color: theme.textDim, marginTop: 2 }}>{l}</div>
            </div>
          ))}
        </div>

        {/* Injuries */}
        <div style={sL}>Injuries / Notes</div>
        <div style={{ background: "#1A2332", borderRadius: 14, padding: "12px 14px", marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: user.injuries ? theme.text : theme.textDim }}>{user.injuries || "None noted"}</div>
          <div style={{ fontSize: 11, color: theme.textDim, marginTop: 4 }}>Tell the AI trainer in chat to update these</div>
        </div>

        {/* Danger zone */}
        <button onClick={() => navigate("onboarding")} style={{ width: "100%", background: "transparent", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 12, padding: "10px", fontSize: 13, color: "#F87171", cursor: "pointer", fontFamily: "inherit", marginBottom: 8 }}>
          Restart onboarding quiz
        </button>
        <button onClick={signOut} style={{ width: "100%", background: "transparent", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: "10px", fontSize: 13, color: theme.textDim, cursor: "pointer", fontFamily: "inherit", marginBottom: 8 }}>
          Sign out
        </button>
      </div>
    </Layout>
  );
}

// Derive display properties from a raw profile + stats
export function LoadingScreen() {
  return (
    <Layout>
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
        <Spinner />
        <div style={{ fontSize: 13, color: theme.textDim }}>Loading...</div>
      </div>
    </Layout>
  );
}

export function NetworkErrorScreen() {
  const { navigate } = useApp();
  return (
    <Layout>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flex: 1, gap: 16, padding: "0 32px", textAlign: "center" }}>
        <div style={{ fontSize: 40 }}>📶</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: theme.text }}>Connection issue</div>
        <div style={{ fontSize: 14, color: theme.textMuted, lineHeight: 1.6 }}>
          We couldn't confirm your data saved — could be a connection issue or a brief server hiccup. You're still logged in — just tap retry.
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{ background: theme.accent, color: "#003D35", border: "none", borderRadius: 12, padding: "14px 32px", fontSize: 15, fontWeight: 700, cursor: "pointer", marginTop: 8 }}
        >
          Retry
        </button>
        <button
          onClick={() => navigate("auth")}
          style={{ background: "transparent", color: theme.textDim, border: "none", fontSize: 13, cursor: "pointer" }}
        >
          Use a different account
        </button>
      </div>
    </Layout>
  );
}
