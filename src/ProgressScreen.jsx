import { useState, useEffect, useRef } from "react";
import {
  useApp, theme, sb, localDateStr,
  Layout, Spinner, CardioQuickLog,
  WeightChart, CardioWeeklyChart, NutritionTrendChart,
  PERSONAL_BESTS, WEIGHT_DATA_MOCK, Icon,
} from "./shared.jsx";

function ProgressScreen() {
  const { navigate, gymBranding, supabaseUser, user, plan, historicalData, loadHistoricalData } = useApp();
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
  // Strength-only view of the same logs, for anywhere that groups by exercise
  // name or sums weight x reps -- cardio rows (tagged is_cardio) carry neither,
  // so they'd otherwise show up as a bogus "0 lbs" exercise/personal best.
  const strengthLogs = realLogs ? realLogs.filter(r => !r.is_cardio) : null;
  const cardioLogs = historicalData?.cardioLogs ?? [];
  const mealLogs = historicalData?.mealLogs ?? [];

  const realSessions = useRealWorkoutData ? (() => {
    const byDate = {};
    strengthLogs.forEach(row => {
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

  // Count ALL unique workout dates (strength OR cardio), not just the 5 shown in the recent list
  const totalWorkouts = useRealWorkoutData ? new Set(realLogs.map(r => r.workout_date)).size : 0;

  const realPBs = useRealWorkoutData ? (() => {
    const best = {};
    strengthLogs.forEach(row => {
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
        <div style={{ display:"flex", background:"#212429", borderRadius:10, padding:3, marginBottom:16, marginTop:6 }}>
          {[["body","Body"],["workouts","Workouts"],["cardio","Cardio"],["nutrition","Nutrition"]].map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex:1, padding:"7px 6px", background:tab===t ? a : "transparent", border:"none", borderRadius:8, fontSize:12, fontWeight:500, color:tab===t ? "#0B1E3D" : theme.textDim, cursor:"pointer", fontFamily:"inherit", transition:"all .2s" }}>
              {label}
            </button>
          ))}
        </div>

        {tab === "body" && (
          <div className="mq-fade">
            {/* Weight chart card */}
            <div style={{ background:"#212429", borderRadius:14, padding:"14px 14px 10px", marginBottom:12 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                <div>
                  <div style={sL}>
                    Weight trend
                    {!useRealWeightData && <span style={{ color: theme.textFaint, marginLeft:6, fontStyle:"italic" }}>(sample)</span>}
                  </div>
                  <div style={{ fontSize:26, fontWeight:700, color:theme.text, lineHeight:1 }}>
                    {curr} <span style={{ fontSize:13, color:"#6E7480", fontWeight:400 }}>lbs</span>
                  </div>
                  <div style={{ fontSize:12, color: lost >= 0 ? a : "#F87171", marginTop:2 }}>
                    {lost >= 0 ? <><Icon name="arrow-down" size={12} style={{verticalAlign:"-1px", marginRight:2}} />{lost} lbs since day 1</> : <><Icon name="arrow-up" size={12} style={{verticalAlign:"-1px", marginRight:2}} />{Math.abs(lost)} lbs since day 1</>}
                  </div>
                </div>
                <div style={{ display:"flex", flexDirection:"column", alignItems:"flex-end", gap:6 }}>
                  <div style={{ background: weightError ? "#1F1010" : "#0B1E3D", borderRadius:8, padding:"4px 10px", fontSize:11, color: weightError ? "#F87171" : a, fontWeight:500 }}>
                    {weightError ? "Save failed — try again" : weightSaved ? <><Icon name="check" size={12} style={{verticalAlign:"-1px", marginRight:2}} />Saved</> : <><Icon name="check" size={12} style={{verticalAlign:"-1px", marginRight:2}} />On track</>}
                  </div>
                </div>
              </div>

              {/* Log weight button — large and prominent */}
              <button onClick={() => setShowLogWeight(!showLogWeight)}
                style={{ width:"100%", background: showLogWeight ? "transparent" : a, border: showLogWeight ? "1px solid rgba(255,255,255,0.12)" : "none", borderRadius:12, padding:"13px", fontSize:15, fontWeight:600, color: showLogWeight ? "#6E7480" : "#0B1E3D", cursor:"pointer", fontFamily:"inherit", marginBottom:10 }}>
                {showLogWeight ? "Cancel" : "＋ Log today's weight"}
              </button>

              {/* Log weight inline form */}
              {showLogWeight && (
                <div className="mq-fade" style={{ background:"#0A1628", borderRadius:12, padding:"14px", marginBottom:10 }}>
                  <div style={{ fontSize:13, color:"#9BA0AA", marginBottom:10, fontWeight:500 }}>What's your weight today?</div>
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <input
                      type="number"
                      value={newWeightInput}
                      onChange={e => setNewWeightInput(e.target.value)}
                      onKeyDown={e => e.key === "Enter" && saveWeight()}
                      placeholder="e.g. 182.5"
                      autoFocus
                      style={{ flex:1, background:"#1B1D21", border:"1px solid rgba(255,255,255,0.12)", borderRadius:10, padding:"12px 14px", fontSize:16, color:"#EDEEF0", outline:"none", fontFamily:"inherit" }}
                    />
                    <div style={{ fontSize:13, color:"#6E7480", flexShrink:0 }}>lbs</div>
                    <button onClick={saveWeight} disabled={savingWeight || !newWeightInput}
                      style={{ background: newWeightInput ? a : "#212429", border:"none", borderRadius:10, padding:"12px 18px", fontSize:14, color: newWeightInput ? "#0B1E3D" : "#6E7480", fontWeight:600, cursor: newWeightInput ? "pointer" : "default", fontFamily:"inherit", flexShrink:0 }}>
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
                <div style={{ fontSize:10, color: theme.textFaint, textAlign:"center", marginTop:4 }}>
                  Log your weight to replace this sample chart with your real data
                </div>
              )}
            </div>

            {/* Measurements */}
            <div style={sL}>Measurements</div>
            <div style={{ background:"#212429", borderRadius:14, overflow:"hidden", marginBottom:12 }}>
              {[
                { label:"Starting weight", start:"", current:`${startWeight} lbs`, delta:"", dColor:a },
                { label:"Current weight",  start:"", current:`${curr} lbs`,        delta: lost >= 0 ? `−${lost} lbs` : `+${Math.abs(lost)} lbs`, dColor: lost >= 0 ? a : "#F87171" },
                // Was hardcoded to a fake "21%" / "−3%" regardless of the real
                // member -- there's no body-fat input or tracking anywhere in
                // the app to back that number up (no onboarding field, no log,
                // no column). Rather than invent a formula the app has no real
                // data to feed, this now honestly shows "not tracked yet",
                // matching how the weight chart above handles missing real
                // data instead of quietly faking a number.
                { label:"Body fat est.",   start:"", current:"Not tracked yet",    delta:"", dColor:a, muted:true },
              ].map((row, i, arr) => (
                <div key={row.label} style={{ display:"flex", alignItems:"center", padding:"10px 14px", borderBottom: i < arr.length-1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <div style={{ flex:1, fontSize:13, color:theme.textMuted }}>{row.label}</div>
                  <div style={{ fontSize:13, fontWeight: row.muted ? 400 : 600, color: row.muted ? theme.textFaint : theme.text, marginRight:8, fontStyle: row.muted ? "italic" : "normal" }}>{row.current}</div>
                  {row.delta && <div style={{ fontSize:11, color:row.dColor, fontWeight:600, minWidth:52, textAlign:"right" }}>{row.delta}</div>}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "workouts" && (
          <div className="mq-fade">
            {(() => {
              // Total volume = sum of weight × reps across all working sets (exclude warm-ups: set_number > 0)
              const totalVol = useRealWorkoutData
                ? strengthLogs.filter(r => r.set_number > 0).reduce((acc, r) => acc + (r.weight || 0) * (r.reps || 0), 0)
                : null;
              const volDisplay = logsLoading ? "..." : totalVol !== null ? totalVol.toLocaleString() + " lbs" : "—";
              const workoutsDisplay = logsLoading ? "..." : totalWorkouts > 0 ? String(totalWorkouts) : "0";
              return (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
                  <div style={{ background:"#212429", borderRadius:12, padding:"10px 12px" }}>
                    <div style={{ fontSize:20, fontWeight:700, color:a }}>{workoutsDisplay}</div>
                    <div style={{ fontSize:10, color:"#6E7480", marginTop:2 }}>Sessions logged</div>
                  </div>
                  <div style={{ background:"#212429", borderRadius:12, padding:"10px 12px" }}>
                    <div style={{ fontSize:20, fontWeight:700, color:"#F59E0B" }}>{volDisplay}</div>
                    <div style={{ fontSize:10, color:"#6E7480", marginTop:2 }}>Total volume lifted</div>
                  </div>
                </div>
              );
            })()}
            <div style={sL}>Recent sessions</div>
            <div style={{ background:"#212429", borderRadius:14, overflow:"hidden" }}>
              {realSessions.length === 0 ? (
                <div style={{ padding:"18px 14px", textAlign:"center" }}>
                  <div style={{ fontSize:13, fontWeight:600, color:theme.text }}>{logsLoading ? "Loading..." : "No sessions yet"}</div>
                  <div style={{ fontSize:11, color:"#6E7480", marginTop:4 }}>{logsLoading ? "Fetching your workout history." : "Log a set in the workout screen and it'll appear here."}</div>
                </div>
              ) : realSessions.map((w, i) => (
                <div key={w.date} style={{ padding:"10px 14px", borderBottom: i < realSessions.length-1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600, color:theme.text }}>{w.name}</div>
                      <div style={{ fontSize:11, color:"#6E7480", marginTop:2 }}>{w.date} · {w.sets} sets · {w.vol}</div>
                    </div>
                    {w.pbs > 0 && (
                      <span style={{ background:"#0A1A14", color:theme.success, borderRadius:20, padding:"2px 8px", fontSize:10, fontWeight:500, flexShrink:0 }}>
                        <Icon name="flame" size={11} style={{verticalAlign:"-1px", marginRight:2}} />{w.pbs} PB{w.pbs > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ ...sL, marginTop: 18 }}>Personal bests</div>

            {(() => {
              // Build real volume-per-exercise from workout logs for the current month
              const thisMonth = new Date().toISOString().slice(0, 7); // "YYYY-MM"
              const volColors = [a, "#7C93B8", "#5FA8E0", "#2D5FA8"];
              const realVolBars = useRealWorkoutData ? (() => {
                const vol = {};
                strengthLogs.forEach(row => {
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
                  <div style={{ background:"#0A1628", borderLeft:"2px solid #4C8DFF", borderRadius:"0 10px 10px 0", padding:"8px 12px", marginBottom:14 }}>
                    <div style={{ fontSize:12, color:"#9BA0AA", lineHeight:1.5 }}>{pbMsg}</div>
                  </div>
                  {realPBs.length > 0 && (
                    <>
                      <div style={sL}>Current bests</div>
                      <div style={{ background:"#212429", borderRadius:14, overflow:"hidden", marginBottom:14 }}>
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
                                  <div style={{ fontSize:11, color:"#6E7480", marginTop:2 }}>
                                    {pb.date ? new Date(pb.date + "T12:00:00").toLocaleDateString("en-US", { month:"short", day:"numeric" }) : "—"}
                                  </div>
                                </div>
                                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                                  <div style={{ textAlign:"right" }}>
                                    <div style={{ fontSize:15, fontWeight:700, color:a }}>{pb.weight}</div>
                                    <div style={{ fontSize:11, color:"#6E7480" }}>{pb.reps} reps</div>
                                  </div>
                                  <div style={{ fontSize:14, color:"#6E7480", transition:"transform .2s", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}>▾</div>
                                </div>
                              </div>
                              {/* Inline strength chart — shown when this exercise is selected */}
                              {isOpen && (
                                <div className="mq-fade" style={{ background:"#0A1628", borderTop:"1px solid rgba(255,255,255,0.04)", padding:"12px 14px 14px", borderBottom: i < realPBs.length-1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                                  <div style={{ fontSize:10, color:a, textTransform:"uppercase", letterSpacing:"1px", marginBottom:8 }}>Strength over time</div>
                                  {exerciseHistoryLoading ? (
                                    <div style={{ display:"flex", justifyContent:"center", padding:"12px 0" }}><Spinner size={20} color={a} /></div>
                                  ) : exerciseHistory.length < 2 ? (
                                    <div style={{ fontSize:12, color:"#6E7480", textAlign:"center", padding:"10px 0" }}>
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
                    <div style={{ background:"#212429", borderRadius:14, padding:"12px 14px" }}>
                      <div style={{ fontSize:11, color:"#6E7480", textTransform:"uppercase", letterSpacing:"1px", marginBottom:10 }}>Volume this month</div>
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
        )}

        {tab === "cardio" && (
          <div className="mq-fade">
            {/* Weekly/monthly cardio totals -- simple sum over cardioLogs
                (bounded to the 60 most recent sessions historicalData
                already fetches, same window every other Progress stat uses;
                60 cardio sessions inside one month would be 2+/day, well
                past what this needs to cover in practice). Answers "am I
                doing enough cardio" directly, requested alongside the
                cardio-day redesign -- see DECISIONS.md session 32. */}
            {(() => {
              const now = new Date();
              const dow = now.getDay();
              const mondayDiff = now.getDate() - dow + (dow === 0 ? -6 : 1);
              const mondayStr = localDateStr(new Date(now.getFullYear(), now.getMonth(), mondayDiff));
              const monthStr = localDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
              const weekLogs = cardioLogs.filter(c => c.logged_date >= mondayStr);
              const monthLogs = cardioLogs.filter(c => c.logged_date >= monthStr);
              const sumMin = rows => rows.reduce((sum, c) => sum + (c.duration_minutes || 0), 0);
              return (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                  {[["This week", weekLogs], ["This month", monthLogs]].map(([label, rows]) => (
                    <div key={label} style={{ background: theme.surface, border: `0.5px solid ${theme.borderSubtle}`, borderRadius: 12, padding: ".85rem .75rem" }}>
                      <div style={{ fontSize: 18, fontWeight: 500, color: theme.text }}>{sumMin(rows)} min</div>
                      <div style={{ fontSize: 12, color: theme.textDim, marginTop: 4 }}>{label} · {rows.length} session{rows.length === 1 ? "" : "s"}</div>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* 6-week cardio trend -- lets a member see "how much cardio have I
                actually been doing" at a glance instead of just this-week/this-
                month numbers. Bucketed here (Monday-start weeks, same convention
                as the totals cards above); CardioWeeklyChart (shared.jsx) just
                draws whatever it's handed. Requested alongside the cardio
                confirmation-detail change, same session. */}
            {cardioLogs.length > 0 && (() => {
              const weeks = [];
              for (let i = 5; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i * 7);
                const dow = d.getDay();
                const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow + (dow === 0 ? -6 : 1));
                const mondayStr = localDateStr(monday);
                const sunday = new Date(monday);
                sunday.setDate(sunday.getDate() + 6);
                const sundayStr = localDateStr(sunday);
                const minutes = cardioLogs
                  .filter(c => c.logged_date >= mondayStr && c.logged_date <= sundayStr)
                  .reduce((sum, c) => sum + (c.duration_minutes || 0), 0);
                weeks.push({ label: i === 0 ? "This wk" : monday.toLocaleDateString("en-US", { month: "short", day: "numeric" }), minutes });
              }
              return (
                <div style={{ background: theme.surface, border: `0.5px solid ${theme.borderSubtle}`, borderRadius: 12, padding: "12px 10px", marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: theme.textDim, textTransform: "uppercase", letterSpacing: "1px", marginBottom: 6, paddingLeft: 4 }}>Cardio minutes, last 6 weeks</div>
                  <CardioWeeklyChart data={weeks} accent={a} />
                </div>
              );
            })()}

            <button onClick={() => navigate("cardio")} style={{ width: "100%", background: a, color: "#0B1E3D", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", marginBottom: 10 }}>
              Start a cardio session
            </button>

            <CardioQuickLog accent={a} supabaseUserId={supabaseUser?.id} onLogged={() => loadHistoricalData(supabaseUser.id)} />

            {cardioLogs.length > 0 && (
              <>
                <div style={sL}>Recent cardio</div>
                <div style={{ background:"#212429", borderRadius:14, overflow:"hidden" }}>
                  {cardioLogs.slice(0, 12).map((c, i, arr) => (
                    <div key={c.id} style={{ padding:"10px 14px", borderBottom: i < arr.length-1 ? "1px solid rgba(255,255,255,0.04)" : "none", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600, color:theme.text }}>{c.activity_type}</div>
                        <div style={{ fontSize:11, color:"#6E7480", marginTop:2 }}>{new Date(c.logged_date + "T12:00:00").toLocaleDateString("en-US", { month:"short", day:"numeric" })}</div>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <div style={{ fontSize:13, color:a, fontWeight:600 }}>{c.duration_minutes} min</div>
                        {c.calories ? <div style={{ fontSize:11, color:"#6E7480" }}>~{c.calories} cal</div> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

          </div>
        )}

        {/* Nutrition tab -- same shape as Cardio: stat cards, a trend chart,
            a recent-days list. Scoped from research (MacroFactor's App Store
            rating sits around 4.8/19,500 ratings, and its screen combines
            trend charts + adherence percentages together, not one or the
            other) rather than a bare adherence-only view. Bucketed here by
            calendar date from mealLogs (raw per-entry rows -- a member can
            log several foods a day, see getMealLogs() in shared.jsx);
            NutritionTrendChart just draws whatever it's handed, same
            division of responsibility as CardioWeeklyChart. */}
        {tab === "nutrition" && (() => {
          const calGoal = plan?.calories || 1800;
          const proteinGoal = plan?.protein || 140;

          // Bucket every logged entry into a per-day total.
          const byDate = {};
          mealLogs.forEach(m => {
            if (!byDate[m.date]) byDate[m.date] = { cal: 0, protein: 0 };
            byDate[m.date].cal += m.logged_cal || 0;
            byDate[m.date].protein += m.logged_protein || 0;
          });
          const loggedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

          const now = new Date();
          const dow = now.getDay();
          const mondayStr = localDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow + (dow === 0 ? -6 : 1)));
          const weekDates = loggedDates.filter(d => d >= mondayStr);
          const avgCalThisWeek = weekDates.length > 0 ? Math.round(weekDates.reduce((s, d) => s + byDate[d].cal, 0) / weekDates.length) : null;
          const proteinHitDays = weekDates.filter(d => byDate[d].protein >= proteinGoal).length;

          // 14-day trend, oldest first -- zero-filled for days with no log
          // so gaps are visible instead of silently skipped. Two parallel
          // trends (calories + protein) built the same way, off the same
          // byDate buckets, so the two cards below always agree with each
          // other and with "Recent days".
          const trend = [];
          const proteinTrend = [];
          for (let i = 13; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dStr = localDateStr(d);
            const label = d.toLocaleDateString("en-US", { day: "numeric" });
            trend.push({ label, calories: byDate[dStr]?.cal || 0 });
            proteinTrend.push({ label, protein: byDate[dStr]?.protein || 0 });
          }

          return (
            <div className="mq-fade">
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 14 }}>
                <div style={{ background: theme.surface, border: `0.5px solid ${theme.borderSubtle}`, borderRadius: 12, padding: ".85rem .75rem" }}>
                  <div style={{ fontSize: 18, fontWeight: 500, color: theme.text }}>{avgCalThisWeek ?? "—"}{avgCalThisWeek ? <span style={{ fontSize: 12, color: theme.textDim }}> cal</span> : ""}</div>
                  <div style={{ fontSize: 12, color: theme.textDim, marginTop: 4 }}>Avg calories this week</div>
                </div>
                <div style={{ background: theme.surface, border: `0.5px solid ${theme.borderSubtle}`, borderRadius: 12, padding: ".85rem .75rem" }}>
                  <div style={{ fontSize: 18, fontWeight: 500, color: theme.text }}>{proteinHitDays} of {weekDates.length || 7}</div>
                  <div style={{ fontSize: 12, color: theme.textDim, marginTop: 4 }}>Days hit protein target</div>
                </div>
              </div>

              {loggedDates.length > 0 ? (
                <>
                  <div style={{ background: theme.surface, border: `0.5px solid ${theme.borderSubtle}`, borderRadius: 12, padding: "14px 12px 12px", marginBottom: 10 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: theme.text, marginBottom: 2 }}>Calories</div>
                    <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 10 }}>Last 14 days</div>
                    <NutritionTrendChart data={trend} target={calGoal} accent={a} valueKey="calories" />
                  </div>
                  <div style={{ background: theme.surface, border: `0.5px solid ${theme.borderSubtle}`, borderRadius: 12, padding: "14px 12px 12px", marginBottom: 14 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: theme.text, marginBottom: 2 }}>Protein</div>
                    <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 10 }}>Last 14 days</div>
                    <NutritionTrendChart data={proteinTrend} target={proteinGoal} accent={a} valueKey="protein" />
                  </div>
                </>
              ) : (
                <div style={{ background: theme.surface, border: `0.5px solid ${theme.borderSubtle}`, borderRadius: 12, padding: "18px 14px", textAlign: "center", marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>No meals logged yet</div>
                  <div style={{ fontSize: 11, color: "#6E7480", marginTop: 4 }}>Log food on the Meals tab and your trend will show up here.</div>
                </div>
              )}

              {loggedDates.length > 0 && (
                <>
                  <div style={sL}>Recent days</div>
                  <div style={{ background: "#212429", borderRadius: 14, overflow: "hidden" }}>
                    {loggedDates.slice(0, 12).map((d, i, arr) => (
                      <div key={d} style={{ padding: "10px 14px", borderBottom: i < arr.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>{new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 13, color: byDate[d].cal > calGoal * 1.1 ? "#F59E0B" : a, fontWeight: 600 }}>{Math.round(byDate[d].cal)} cal</div>
                          <div style={{ fontSize: 11, color: "#6E7480" }}>{Math.round(byDate[d].protein)}g protein</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })()}

      </div>
    </Layout>
  );
}


export { ProgressScreen };
