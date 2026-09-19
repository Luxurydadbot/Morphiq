import { useState, useEffect, useRef } from "react";
import {
  useApp, theme, sb, localDateStr,
  Layout, Spinner, CardioQuickLog,
  WeightChart, CardioWeeklyChart, NutritionTrendChart,
  PERSONAL_BESTS, WEIGHT_DATA_MOCK, Icon,
} from "./shared.jsx";

// ═══════════════════════════════════════════════════════════════════
// Workouts-tab trend charts (Session 50 design, approved via a Claude
// Design mockup — see HANDOFF.md). Kept local to this file rather than
// added to shared.jsx, which has almost no headroom left under the
// 3,800-line hard limit.
// ═══════════════════════════════════════════════════════════════════

// One entry per exercise per calendar day: that day's heaviest working set
// (highest weight; ties broken by higher reps) supplies BOTH the Weight
// point and the Reps point for the day, so the two stacked charts always
// describe one real set rather than mixing numbers from different sets on
// the same day. Confirmed with Bryant before building (HANDOFF.md Session
// 50). Same "working set only" convention as the totalVol calc elsewhere
// on this screen: set_number > 0 excludes warm-ups.
function buildExerciseDailyHistory(strengthLogs) {
  const byExercise = {};
  (strengthLogs || []).forEach(row => {
    if (!row.exercise_name || !(row.set_number > 0)) return;
    if (typeof row.weight !== "number" || typeof row.reps !== "number") return;
    const exMap = byExercise[row.exercise_name] || (byExercise[row.exercise_name] = {});
    const existing = exMap[row.workout_date];
    if (!existing || row.weight > existing.weight || (row.weight === existing.weight && row.reps > existing.reps)) {
      exMap[row.workout_date] = { date: row.workout_date, weight: row.weight, reps: row.reps };
    }
  });
  const result = {};
  Object.keys(byExercise).forEach(name => {
    result[name] = Object.values(byExercise[name]).sort((a, b) => a.date.localeCompare(b.date));
  });
  return result;
}

// Reps-star target: the plan's CURRENT repMax for this exercise (the same
// number progressPlan()'s 2-for-2 rule compares against, shared.jsx) --
// workout_logs doesn't store a per-set rep target historically, so this
// applies today's plan target across the exercise's whole history. A
// reasonable simplification: repMax for a given exercise rarely changes
// except at a plan rotation.
function getRepMaxLookup(plan) {
  const map = {};
  (plan?.exercises || []).forEach(e => {
    if (e?.name && map[e.name] === undefined) map[e.name] = e.repMax ?? ((e.reps || 0) + 2);
  });
  (plan?.customDays || []).forEach(day => {
    (day?.exercises || []).forEach(e => {
      if (e?.name && map[e.name] === undefined) map[e.name] = e.repMax ?? ((e.reps || 0) + 2);
    });
  });
  return map;
}

// Weight star = a genuine all-time PR on this lift (heaviest ever), not
// every minor uptick. Reps star = the first session hitting the top of the
// rep range at that same weight -- the same moment the app's own
// progression rule would bump next week's weight (see getRepMaxLookup).
function computeTrendStars(history, repMax) {
  const weightStars = new Set();
  const repsStars = new Set();
  let maxWeightSoFar = -Infinity;
  const firstHitAtWeight = new Set();
  history.forEach(pt => {
    if (pt.weight > maxWeightSoFar) {
      weightStars.add(pt.date);
      maxWeightSoFar = pt.weight;
    }
    if (typeof repMax === "number" && pt.reps >= repMax && !firstHitAtWeight.has(pt.weight)) {
      firstHitAtWeight.add(pt.weight);
      repsStars.add(pt.date);
    }
  });
  return { weightStars, repsStars };
}

// TrendLine -- one scrollable line chart (weight OR reps). Same real-scroll/
// no-visible-scrollbar behavior and the same right-edge label-clipping fixes
// as WeightChart (shared.jsx) so it behaves identically to the app's
// existing chart -- see WeightChart's own comments for why each fix exists.
// Touch-and-hold a dot to see its exact date + value in a small bubble
// (requested by Bryant, Session 50 follow-up) -- most dots have no visible
// date label (see showLabel/LABEL_MIN_GAP below), so this is the only way to
// read an unlabeled point's real value. Bubble follows the finger while
// pressed and disappears on release; doesn't block the existing horizontal
// swipe-to-scroll gesture since it never calls preventDefault.
function TrendLine({ entries, valueKey, color, starDates, unit }) {
  const H = 84, PAD = 10;
  const POINT_SPACING = 34;
  const LABEL_MIN_GAP = 26;
  const FALLBACK_W = 260;
  const containerRef = useRef(null);
  const scrollRef = useRef(null);
  const svgRef = useRef(null);
  const pressedRef = useRef(false);
  const [containerWidth, setContainerWidth] = useState(null);
  const [activeIdx, setActiveIdx] = useState(null);
  const hasData = entries && entries.length > 0;
  const chartData = hasData ? (entries.length === 1 ? [entries[0], entries[0]] : entries) : [];
  const neededW = hasData ? PAD * 2 + (chartData.length - 1) * POINT_SPACING : 0;
  const availableW = containerWidth || FALLBACK_W;
  const scrollable = hasData && neededW > availableW;
  const W = scrollable ? neededW : availableW;

  useEffect(() => {
    function measure() { if (containerRef.current) setContainerWidth(containerRef.current.clientWidth); }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    if (scrollable && scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [scrollable, chartData.length]);

  if (!hasData) {
    return <div ref={containerRef} style={{ fontSize: 11, color: "#6E7480", textAlign: "center", padding: "16px 0" }}>Not enough history yet</div>;
  }

  const vals = chartData.map(d => d[valueKey]);
  const minV = Math.min(...vals) - 1;
  const maxV = Math.max(...vals) + 1;
  const xStep = (W - PAD * 2) / Math.max(chartData.length - 1, 1);
  const toY = v => PAD + ((maxV - v) / (maxV - minV)) * (H - PAD * 2 - 12);
  const points = chartData.map((d, i) => [PAD + i * xStep, toY(d[valueKey])]);
  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const areaPath = linePath + ` L${points[points.length-1][0].toFixed(1)},${H-12} L${PAD},${H-12} Z`;
  const last = points[points.length - 1];

  let lastLabelX = -Infinity;
  const showLabel = chartData.map((d, i) => {
    const isEdge = i === 0 || i === chartData.length - 1;
    const x = points[i][0];
    if (isEdge || x - lastLabelX >= LABEL_MIN_GAP) { lastLabelX = x; return true; }
    return false;
  });

  const valueLabelX = Math.min(last[0] + 6, W - PAD);
  const valueLabelAnchor = last[0] + 6 > W - PAD - 20 ? "end" : "start";
  const gradId = "tl-" + valueKey;

  // Maps a touch/mouse position to the nearest data point. The svg's
  // rendered box is always the same size as the viewBox (W x H) whether it's
  // pinned to a fixed scrollable width or stretched to fill the container --
  // see the width={scrollable ? W : "100%"} line below -- so this scale
  // factor is 1 in both cases, but computed rather than assumed in case a
  // future change ever makes that untrue.
  function nearestPointIndex(clientX) {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    if (!rect.width) return null;
    const scale = W / rect.width;
    const localX = (clientX - rect.left) * scale;
    let nearest = 0, nearestDist = Infinity;
    points.forEach((p, i) => {
      const d = Math.abs(p[0] - localX);
      if (d < nearestDist) { nearestDist = d; nearest = i; }
    });
    return nearest;
  }
  function handlePointerDown(e) {
    pressedRef.current = true;
    const idx = nearestPointIndex(e.clientX);
    if (idx !== null) setActiveIdx(idx);
  }
  function handlePointerMove(e) {
    if (!pressedRef.current) return;
    const idx = nearestPointIndex(e.clientX);
    if (idx !== null) setActiveIdx(idx);
  }
  function clearActive() {
    pressedRef.current = false;
    setActiveIdx(null);
  }

  return (
    <div ref={containerRef}>
      <style>{`.mq-trendline-scroll::-webkit-scrollbar { display: none; }`}</style>
      <div
        ref={scrollRef}
        className="mq-trendline-scroll"
        // touchAction:"pan-x" tells the browser this element only ever pans
        // horizontally -- the standard fix for a horizontally-scrollable
        // element sitting inside a vertically-scrolling page sometimes not
        // getting a clean horizontal swipe on mobile (gesture disambiguation
        // otherwise defaults toward the page's own vertical scroll).
        style={scrollable ? { overflowX: "auto", WebkitOverflowScrolling: "touch", scrollbarWidth: "none", msOverflowStyle: "none", touchAction: "pan-x" } : { touchAction: "pan-x" }}
      >
        <svg
          ref={svgRef}
          width={scrollable ? W : "100%"}
          viewBox={`0 0 ${W} ${H}`}
          style={{ display: "block", overflow: "visible", touchAction: "pan-x" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={clearActive}
          onPointerCancel={clearActive}
          onPointerLeave={clearActive}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill={`url(#${gradId})`} />
          <path d={linePath} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          {points.map((p, i) => (
            <circle key={i} cx={p[0]} cy={p[1]} r="3.5"
              fill={i === points.length - 1 ? color : "#212429"} stroke={color} strokeWidth="1.5" />
          ))}
          {chartData.map((d, i) => (
            starDates.has(d.date) ? (
              <path key={"star" + i}
                d="M0,-3.5 L1.03,-1.08 L3.5,-1.08 L1.44,0.38 L2.16,2.83 L0,1.33 L-2.16,2.83 L-1.44,0.38 L-3.5,-1.08 L-1.03,-1.08 Z"
                fill="#F59E0B" transform={`translate(${points[i][0]},${points[i][1] - 9})`} />
            ) : null
          ))}
          {chartData.map((d, i) => {
            if (!showLabel[i]) return null;
            const x = points[i][0];
            const nearRight = x > W - PAD - 16;
            const nearLeft = x < PAD + 16;
            const anchor = nearRight ? "end" : nearLeft ? "start" : "middle";
            const labelX = nearRight ? Math.min(x + 8, W - PAD) : nearLeft ? Math.max(x - 8, PAD) : x;
            const label = new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
            return <text key={i} x={labelX} y={H - 3} textAnchor={anchor} fontSize="8" fontFamily="'Inter', system-ui, sans-serif" fill="#6E7480">{label}</text>;
          })}
          <text x={valueLabelX} y={last[1] - 4} textAnchor={valueLabelAnchor} fontSize="9" fontFamily="'Inter', system-ui, sans-serif" fill={color} fontWeight="600">{chartData[chartData.length - 1][valueKey]}</text>

          {/* Touch-and-hold value bubble -- see handlePointerDown/Move above.
              Drawn last so it sits on top of every line/star/label.
              Fix (live-tested by Bryant): the first version sat only 12 units
              from the touched point, which on a real phone is well inside a
              thumb's own contact area -- the finger was covering the very
              text it revealed. The svg's viewBox width is always set equal
              to its own rendered pixel width (see width={scrollable ? W :
              "100%"} above, where W is either that fixed pixel value or the
              measured container width) -- so 1 viewBox unit is ~1 real
              device pixel here, meaning GAP below is directly readable as
              "how many real pixels of clearance." GAP=44 plus the taller
              bubble puts the readable text roughly 70-80px from the touch
              point, clear of a normal fingertip. Bigger bubble/text too, per
              Bryant's "blow it up" ask.
              Fix #2 (live-tested by Bryant): this used to flip to BELOW the
              point whenever there wasn't room above, which felt
              inconsistent -- sometimes above, sometimes below. Always draws
              above now. The svg has overflow:"visible" set (see the <svg>
              tag above) specifically so this is safe even for a point near
              the very top of the chart -- the bubble is free to extend past
              the chart's own small box without being clipped; it's a
              momentary overlay, not part of the chart's permanent layout. */}
          {activeIdx !== null && chartData[activeIdx] && (() => {
            const p = points[activeIdx];
            const d = chartData[activeIdx];
            const dateLabel = new Date(d.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
            const text = `${dateLabel} · ${d[valueKey]} ${unit || ""}`.trim();
            const GAP = 44;      // clearance between the touched point and the near edge of the bubble
            const DOT_GAP = 10;  // small gap between the dot's own circle and the connector line
            const bubbleW = Math.max(84, text.length * 7.6 + 26);
            const bubbleH = 30;
            let bx = p[0] - bubbleW / 2;
            bx = Math.max(2, Math.min(bx, W - 2 - bubbleW));
            const by = p[1] - GAP - bubbleH; // always above the point now
            const lineY1 = by + bubbleH;
            const lineY2 = p[1] - DOT_GAP;
            return (
              <g pointerEvents="none">
                <line x1={p[0]} y1={lineY1} x2={p[0]} y2={lineY2} stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" strokeDasharray="2,3" />
                <circle cx={p[0]} cy={p[1]} r="7" fill={color} stroke="#121316" strokeWidth="2.5" />
                <rect x={bx} y={by} width={bubbleW} height={bubbleH} rx="8" fill="#0B0D11" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
                <text x={bx + bubbleW / 2} y={by + bubbleH / 2 + 4.5} textAnchor="middle" fontSize="13" fontFamily="'Inter', system-ui, sans-serif" fill="#EDEEF0" fontWeight="700">{text}</text>
              </g>
            );
          })()}
        </svg>
      </div>
    </div>
  );
}

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
  const [chartExercise, setChartExercise] = useState(null); // exercise picked in the Workouts-tab hero chart (Session 50)
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
  const waterLogs = historicalData?.waterLogs ?? [];

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
  // Fix (Aug 2026): weighing in more than once a day used to add a separate
  // point + date label for every single entry, so a day with several
  // weigh-ins (e.g. 4 on the same day) crammed that many overlapping labels
  // into the same spot and made them unreadable. Collapse to one point per
  // calendar day -- the day's last reading -- before charting. Every
  // individual weigh-in is still saved in Supabase; this only changes what
  // the trend line plots. A Map keyed by date naturally keeps dates in
  // ascending order while letting a later same-day entry overwrite the
  // earlier one, so no separate sort is needed.
  const weightByDay = useRealWeightData
    ? Array.from(
        weightLogs.reduce((map, r) => {
          map.set(r.logged_date, r);
          return map;
        }, new Map())
        .values()
      )
    : [];
  const weightChartData = useRealWeightData
    ? weightByDay.map((r) => ({
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
              // Session 50 redesign: the Workouts tab opens directly on a
              // chart instead of a flat log -- two stacked, real-scroll
              // charts (Weight, Reps) for one exercise at a time, picked via
              // the pills below. See HANDOFF.md Session 50 for the full
              // approved design and buildExerciseDailyHistory/
              // computeTrendStars above for how the numbers and stars are
              // derived from the same workout_logs rows the rest of this
              // screen already uses.
              if (!useRealWorkoutData) return null; // no history yet -- the "No sessions yet" empty state below covers this
              const exerciseHistoryMap = buildExerciseDailyHistory(strengthLogs);
              const exerciseNames = Object.keys(exerciseHistoryMap).sort((x, y) => {
                const lastX = exerciseHistoryMap[x][exerciseHistoryMap[x].length - 1]?.date || "";
                const lastY = exerciseHistoryMap[y][exerciseHistoryMap[y].length - 1]?.date || "";
                return lastY.localeCompare(lastX); // most-recently-logged exercise first
              });
              if (exerciseNames.length === 0) return null;
              const activeExercise = (chartExercise && exerciseHistoryMap[chartExercise]) ? chartExercise : exerciseNames[0];
              const history = exerciseHistoryMap[activeExercise];
              const repMaxLookup = getRepMaxLookup(plan);
              const { weightStars, repsStars } = computeTrendStars(history, repMaxLookup[activeExercise]);
              const lastPt = history[history.length - 1];
              return (
                <>
                  <div style={{ background:"#212429", borderRadius:14, padding:"16px 16px 8px", marginBottom:14 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:theme.text, marginBottom:2 }}>{activeExercise} — progress over time</div>
                    <div style={{ fontSize:11, color:"#6E7480", marginBottom:14 }}>Same dates, two plain numbers. A small star marks a real personal best — heaviest weight yet, or the first time you hit your target reps at that weight.</div>

                    <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:4 }}>
                      <div style={{ fontSize:10, letterSpacing:"1.2px", fontWeight:600, color:a, textTransform:"uppercase" }}>Weight</div>
                      <div style={{ fontSize:13, fontWeight:700, color:a }}>{lastPt.weight} lbs</div>
                    </div>
                    <div style={{ marginBottom:14 }}>
                      <TrendLine entries={history} valueKey="weight" color={a} starDates={weightStars} unit="lbs" />
                    </div>

                    <div style={{ display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:4 }}>
                      <div style={{ fontSize:10, letterSpacing:"1.2px", fontWeight:600, color:"#D7DAE0", textTransform:"uppercase" }}>Reps</div>
                      <div style={{ fontSize:13, fontWeight:700, color:"#D7DAE0" }}>{lastPt.reps} reps</div>
                    </div>
                    <TrendLine entries={history} valueKey="reps" color="#D7DAE0" starDates={repsStars} unit="reps" />

                    <div style={{ fontSize:10, color:"#3A3D44", textAlign:"center", padding:"10px 0 10px", fontStyle:"italic" }}>Scroll either chart with your finger to see older sessions</div>
                  </div>

                  <div style={{ display:"flex", gap:8, overflowX:"auto", paddingBottom:4, marginBottom:14 }}>
                    {exerciseNames.map(name => (
                      <button key={name} onClick={() => setChartExercise(name)}
                        style={{
                          flexShrink:0, padding:"8px 16px", borderRadius:20, fontSize:12,
                          fontWeight: name === activeExercise ? 700 : 500,
                          color: name === activeExercise ? "#0B1E3D" : "#9BA0AA",
                          background: name === activeExercise ? a : "transparent",
                          border: name === activeExercise ? "none" : "1px solid rgba(255,255,255,0.10)",
                          whiteSpace:"nowrap", cursor:"pointer", fontFamily:"inherit",
                        }}>
                        {name}
                      </button>
                    ))}
                  </div>
                </>
              );
            })()}
            {(() => {
              const workoutsDisplay = logsLoading ? "..." : totalWorkouts > 0 ? String(totalWorkouts) : "0";
              // "Total volume lifted" tile swapped for a week-streak tile (Session
              // 50) -- Bryant's call: volume answers "how much weight did I move,"
              // not "am I getting stronger," which is what he actually cares about.
              // historicalData.weekStreak is already computed elsewhere (Morphiq.jsx,
              // getWeekStreakFromDates() in shared.jsx) from real Supabase workout
              // dates going back up to a year -- reused as-is here, not new logic.
              const streakDisplay = logsLoading ? "..." : (historicalData?.weekStreak ?? 0);
              return (
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
                  <div style={{ background:"#212429", borderRadius:12, padding:"10px 12px" }}>
                    <div style={{ fontSize:20, fontWeight:700, color:a }}>{workoutsDisplay}</div>
                    <div style={{ fontSize:10, color:"#6E7480", marginTop:2 }}>Sessions logged</div>
                  </div>
                  <div style={{ background:"#212429", borderRadius:12, padding:"10px 12px" }}>
                    <div style={{ fontSize:20, fontWeight:700, color:"#F59E0B" }}>{streakDisplay} <span style={{ fontSize:12 }}>week streak</span></div>
                    <div style={{ fontSize:10, color:"#6E7480", marginTop:2 }}>Hit your target days in a row</div>
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
          const carbsGoal = plan?.carbs || 160;
          const fatGoal = plan?.fat || 55;
          const waterGoalOz = 64; // 8 glasses -- same goal WaterTracker (MealScreen.jsx) uses

          // Bucket every logged entry into a per-day total.
          const byDate = {};
          mealLogs.forEach(m => {
            if (!byDate[m.date]) byDate[m.date] = { cal: 0, protein: 0, carbs: 0, fat: 0 };
            byDate[m.date].cal += m.logged_cal || 0;
            byDate[m.date].protein += m.logged_protein || 0;
            byDate[m.date].carbs += m.logged_carbs || 0;
            byDate[m.date].fat += m.logged_fat || 0;
          });
          const loggedDates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));

          // Water lives in its own table (water_logs -- event-log style, one
          // row per add/remove tap, amount_oz negative for a removal) rather
          // than meal_logs, so it gets its own byDate bucket keyed off
          // logged_date instead of piggybacking on the meal one -- a member
          // can log water on a day they never logged a meal.
          const waterByDate = {};
          waterLogs.forEach(w => {
            if (!waterByDate[w.logged_date]) waterByDate[w.logged_date] = 0;
            waterByDate[w.logged_date] += w.amount_oz || 0;
          });
          const loggedWaterDates = Object.keys(waterByDate).filter(d => waterByDate[d] > 0);

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
          const carbsTrend = [];
          const fatTrend = [];
          const waterTrend = [];
          for (let i = 13; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dStr = localDateStr(d);
            const label = d.toLocaleDateString("en-US", { day: "numeric" });
            trend.push({ label, calories: byDate[dStr]?.cal || 0 });
            proteinTrend.push({ label, protein: byDate[dStr]?.protein || 0 });
            carbsTrend.push({ label, carbs: byDate[dStr]?.carbs || 0 });
            fatTrend.push({ label, fat: byDate[dStr]?.fat || 0 });
            waterTrend.push({ label, waterOz: Math.max(0, waterByDate[dStr] || 0) });
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
                  <div style={{ background: theme.surface, border: `0.5px solid ${theme.borderSubtle}`, borderRadius: 12, padding: "14px 12px 12px", marginBottom: 10 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: theme.text, marginBottom: 2 }}>Protein</div>
                    <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 10 }}>Last 14 days</div>
                    <NutritionTrendChart data={proteinTrend} target={proteinGoal} accent={a} valueKey="protein" />
                  </div>
                  <div style={{ background: theme.surface, border: `0.5px solid ${theme.borderSubtle}`, borderRadius: 12, padding: "14px 12px 12px", marginBottom: 10 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: theme.text, marginBottom: 2 }}>Carbs</div>
                    <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 10 }}>Last 14 days</div>
                    <NutritionTrendChart data={carbsTrend} target={carbsGoal} accent={a} valueKey="carbs" />
                  </div>
                  <div style={{ background: theme.surface, border: `0.5px solid ${theme.borderSubtle}`, borderRadius: 12, padding: "14px 12px 12px", marginBottom: 10 }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: theme.text, marginBottom: 2 }}>Fat</div>
                    <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 10 }}>Last 14 days</div>
                    <NutritionTrendChart data={fatTrend} target={fatGoal} accent={a} valueKey="fat" />
                  </div>
                </>
              ) : (
                <div style={{ background: theme.surface, border: `0.5px solid ${theme.borderSubtle}`, borderRadius: 12, padding: "18px 14px", textAlign: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>No meals logged yet</div>
                  <div style={{ fontSize: 11, color: "#6E7480", marginTop: 4 }}>Log food on the Meals tab and your trend will show up here.</div>
                </div>
              )}

              {/* Water -- own table (water_logs), own card, same treatment as
                  Calories/Protein above but gated on its own data rather than
                  loggedDates, since a member can log water without logging a
                  meal that day. */}
              {loggedWaterDates.length > 0 ? (
                <div style={{ background: theme.surface, border: `0.5px solid ${theme.borderSubtle}`, borderRadius: 12, padding: "14px 12px 12px", marginBottom: 14 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: theme.text, marginBottom: 2 }}>Water</div>
                  <div style={{ fontSize: 12, color: theme.textDim, marginBottom: 10 }}>Last 14 days</div>
                  <NutritionTrendChart data={waterTrend} target={waterGoalOz} accent={a} valueKey="waterOz" />
                </div>
              ) : (
                <div style={{ background: theme.surface, border: `0.5px solid ${theme.borderSubtle}`, borderRadius: 12, padding: "18px 14px", textAlign: "center", marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>No water logged yet</div>
                  <div style={{ fontSize: 11, color: "#6E7480", marginTop: 4 }}>Log water on the Meals tab and your trend will show up here.</div>
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
