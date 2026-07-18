import { useState, useEffect } from "react";
import {
  useApp, theme, sb,
  Layout, Spinner,
  WeightChart, StreakCalendar,
  PERSONAL_BESTS, WEIGHT_DATA_MOCK, Icon,
} from "./shared.jsx";

function ProgressScreen() {
  const { gymBranding, supabaseUser, user, plan, historicalData, loadHistoricalData } = useApp();
  const a = gymBranding.accent;
  const [tab, setTab] = useState("body");
  const sL = { ...theme.sL, fontSize: 10, letterSpacing: "1.2px", marginBottom: 10, fontWeight: 500 };

  // Fetch fresh workout + weight data every time Progress screen opens.
  // Track loading so we show "..." instead of "—" while waiting.
  const [logsLoading, setLogsLoading] = useState(!historicalData);
  const [selectedExercise, setSelectedExercise] = useState(null); // exercise name tapped for strength chart
  const [exerciseHistory, setExerciseHistory] = useState([]);     // chart data for selected exercise
  const [exerciseHistoryLoading, setExerciseHistoryLoading] = useState(false);
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
            { val: (() => { var ws = historicalData?.weekStreak ?? 0; return ws > 0 ? <><Icon name="flame" size={14} style={{verticalAlign:"-2px", marginRight:2}} />{ws}</> : "—"; })(), lbl:"Week streak", color:"#F59E0B" },
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
                    {lost >= 0 ? <><Icon name="arrow-down" size={12} style={{verticalAlign:"-1px", marginRight:2}} />{lost} lbs since day 1</> : <><Icon name="arrow-up" size={12} style={{verticalAlign:"-1px", marginRight:2}} />{Math.abs(lost)} lbs since day 1</>}
                  </div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
                  <div style={{ background: weightError ? "#1F1010" : "#003D35", borderRadius:8, padding:"4px 10px", fontSize:11, color: weightError ? "#F87171" : a, fontWeight:500 }}>
                    {weightError ? "Save failed — try again" : weightSaved ? <><Icon name="check" size={12} style={{verticalAlign:"-1px", marginRight:2}} />Saved</> : <><Icon name="check" size={12} style={{verticalAlign:"-1px", marginRight:2}} />On track</>}
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
                        <Icon name="flame" size={11} style={{verticalAlign:"-1px", marginRight:2}} />{w.pbs} PB{w.pbs > 1 ? "s" : ""}
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
                    {realPBs.map((pb, i) => {
                      const isOpen = selectedExercise === pb.exercise;
                      return (
                        <div key={pb.exercise}>
                          {/* Tappable row — tap to expand/collapse strength chart */}
                          <div
                            onClick={() => {
                              if (isOpen) { setSelectedExercise(null); return; }
                              setSelectedExercise(pb.exercise);
                              setExerciseHistory([]);
                              setExerciseHistoryLoading(true);
                              sb.getExerciseHistory(supabaseUser.id, pb.exercise)
                                .then(data => { setExerciseHistory(data); setExerciseHistoryLoading(false); })
                                .catch(() => setExerciseHistoryLoading(false));
                            }}
                            style={{ padding:"11px 14px", borderBottom: (!isOpen && i < realPBs.length-1) ? "1px solid rgba(255,255,255,0.04)" : "none", cursor:"pointer", display:"flex", justifyContent:"space-between", alignItems:"center" }}
                          >
                            <div>
                              <div style={{ fontSize:13, fontWeight:600, color:theme.text }}>{pb.exercise}</div>
                              <div style={{ fontSize:11, color:"#6B7A8D", marginTop:2 }}>
                                {pb.date ? new Date(pb.date + "T12:00:00").toLocaleDateString("en-US", { month:"short", day:"numeric" }) : "—"}
                              </div>
                            </div>
                            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                              <div style={{ textAlign:"right" }}>
                                <div style={{ fontSize:15, fontWeight:700, color:a }}>{pb.weight}</div>
                                <div style={{ fontSize:11, color:"#6B7A8D" }}>{pb.reps} reps</div>
                              </div>
                              <div style={{ fontSize:14, color:"#6B7A8D", transition:"transform .2s", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▾</div>
                            </div>
                          </div>
                          {/* Inline strength chart — shown when this exercise is selected */}
                          {isOpen && (
                            <div className="mq-fade" style={{ background:"#0A1628", borderTop:"1px solid rgba(255,255,255,0.04)", padding:"12px 14px 14px", borderBottom: i < realPBs.length-1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                              <div style={{ fontSize:10, color:a, textTransform:"uppercase", letterSpacing:"1px", marginBottom:8 }}>Strength over time</div>
                              {exerciseHistoryLoading ? (
                                <div style={{ display:"flex", justifyContent:"center", padding:"12px 0" }}><Spinner size={20} color={a} /></div>
                              ) : exerciseHistory.length < 2 ? (
                                <div style={{ fontSize:12, color:"#6B7A8D", textAlign:"center", padding:"10px 0" }}>
                                  {exerciseHistory.length === 1 ? "Log one more session to see your trend" : "No history found for this exercise"}
                                </div>
                              ) : (
                                <WeightChart data={exerciseHistory} accent={a} />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
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


export { ProgressScreen };
