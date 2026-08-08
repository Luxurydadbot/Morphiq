import { useState, useEffect, useRef } from "react";
import { useApp, sb, Pill, Spinner, MicIcon, VoiceBtn, Layout, NavIcon, Icon, PoweredByHypergentiq, GymLogo, SUPABASE_URL, SUPABASE_ANON, SB_HEADERS, SB_GET, theme } from "./shared.jsx";

function buildMemberRow(profile, sessions, lastDate, weightDelta) {
  const initials = (profile.name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const avatarColors = ["#0B1E3D/#4C8DFF","#16233D/#7C93B8","#0F2A3D/#5FA8E0","#152A4D/#2D5FA8","#0F1E38/#8BA9D4"];
  const [bg, color] = (avatarColors[initials.charCodeAt(0) % avatarColors.length]).split("/");

  const today = new Date();
  const daysSince = lastDate
    ? Math.floor((today - new Date(lastDate)) / 86400000)
    : null;

  let status, statusColor;
  if (daysSince === null || daysSince > 7) {
    status = daysSince !== null ? `No activity — ${daysSince} days` : "Never logged in";
    statusColor = "#F87171";
  } else if (sessions >= 10) {
    status = `${sessions} sessions · ahead of plan`;
    statusColor = "#4C8DFF";
  } else if (sessions >= 5) {
    status = `${sessions} sessions · on track`;
    statusColor = "#6E7480";
  } else {
    status = `${sessions} sessions · needs nudge`;
    statusColor = "#F59E0B";
  }

  const delta = weightDelta !== undefined
    ? (parseFloat(weightDelta) > 0 ? `+${weightDelta}lb` : `${weightDelta}lb`)
    : "—";
  const deltaColor = weightDelta !== undefined
    ? (parseFloat(weightDelta) < 0 ? "#4C8DFF" : "#F87171")
    : "#6E7480";

  return { id: profile.id, name: profile.name || "Member", initials, bg, color, sessions: sessions || 0, status, statusColor, delta, deltaColor, atRisk: daysSince === null || daysSince > 7, isActive: profile.is_active !== false };
}

// Shared hook — loads all owner data once, shared between Overview + Members tabs
function useOwnerData() {
  const { gymBranding } = useApp();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      // Use the real gym ID from context — set when owner signs in
      const gymId = gymBranding?.gymId || "demo-gym";
      const profiles = await sb.getGymMembers(gymId);
      if (cancelled || !profiles.length) { setLoading(false); return; }

      const profileIds = profiles.map(p => p.id);
      const [counts, lastDates, deltas] = await Promise.all([
        sb.getWorkoutCountsThisMonth(profileIds),
        sb.getLastWorkoutDates(profileIds),
        sb.getWeightDeltas(profileIds),
      ]);

      if (cancelled) return;
      const rows = profiles.map(p => buildMemberRow(p, counts[p.id] || 0, lastDates[p.id] || null, deltas[p.id]));
      setMembers(rows);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [gymBranding?.gymId]); // re-fetch if gym changes

  function updateLocalActive(id, isActive) {
    setMembers(prev => prev.map(m => (m.id === id ? { ...m, isActive } : m)));
  }

  return { members, loading, updateLocalActive };
}

function OwnerStatCard({ value, label, sub, color }) {
  return (
    <div style={{ background: "#212429", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || "#EDEEF0" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#6E7480", marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "#4C8DFF", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function OwnerSpinner() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "32px 0" }}>
      <Spinner />
      <div style={{ fontSize: 12, color: "#6E7480" }}>Loading member data…</div>
    </div>
  );
}

function OwnerOverviewTab() {
  const { members, loading } = useOwnerData();
  const { gymBranding } = useApp();
  const [nudgeSending, setNudgeSending] = useState(false);
  const [nudgeResult, setNudgeResult] = useState(null); // { sent, failed } or null

  async function sendNudge() {
    const atRiskIds = members.filter(m => m.atRisk).map(m => m.id);
    if (!atRiskIds.length) return;
    setNudgeSending(true);
    setNudgeResult(null);
    const gymId = gymBranding?.gymId || "demo-gym";
    const msg = "Hey — we noticed you haven't been active lately. Your plan is still here whenever you're ready. Even one session this week makes a difference 💪 We're cheering for you.";
    const result = await sb.broadcastMessage(gymId, atRiskIds, msg);
    setNudgeSending(false);
    setNudgeResult(result);
    setTimeout(() => setNudgeResult(null), 4000);
  }

  if (loading) return <OwnerSpinner />;

  const total = members.length;
  const activeCount = members.filter(m => m.sessions > 0).length;
  const activePct = total > 0 ? Math.round((activeCount / total) * 100) : 0;
  const totalSessions = members.reduce((s, m) => s + m.sessions, 0);
  const weightLosers = members.filter(m => m.delta !== "—" && parseFloat(m.delta) < 0);
  const avgLoss = weightLosers.length > 0
    ? (weightLosers.reduce((s, m) => s + parseFloat(m.delta), 0) / weightLosers.length).toFixed(1)
    : null;
  const atRisk = members.filter(m => m.atRisk);

  return (
    <div className="mq-fade">
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
        <OwnerStatCard value={total || "0"} label="Total members" />
        <OwnerStatCard value={`${activePct}%`} label="Active this month" color="#4C8DFF" />
        <OwnerStatCard value={totalSessions.toLocaleString()} label="Sessions this month" color="#7C93B8" />
        <OwnerStatCard value={avgLoss ? `${avgLoss}lb` : "—"} label="Avg weight change" color="#5FA8E0" />
      </div>

      <div style={{ fontSize: 11, color: "#6E7480", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>Activity breakdown</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {[
          [`${activePct}%`, "Active members", "#4C8DFF"],
          [`${members.filter(m => m.sessions >= 8).length}`, "On track", "#F59E0B"],
          [`${atRisk.length}`, "At risk", "#F87171"],
        ].map(([v, l, c]) => (
          <div key={l} style={{ flex: 1, background: "#212429", borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: c }}>{v}</div>
            <div style={{ fontSize: 10, color: "#6E7480", marginTop: 3, lineHeight: 1.3 }}>{l}</div>
          </div>
        ))}
      </div>

      {atRisk.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: "#6E7480", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>Needs attention</div>
          {atRisk.slice(0, 3).map(m => (
            <div key={m.id} style={{ background: "#1F1010", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#1F1010", border: "1px solid #F87171", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#F87171", fontWeight: 600, flexShrink: 0 }}>{m.initials}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#EDEEF0" }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: "#F87171" }}>{m.status}</div>
                </div>
                <Pill variant="red">At risk</Pill>
              </div>
            </div>
          ))}

          {/* Nudge button — sends a pre-written re-engagement message to all at-risk members only */}
          {nudgeResult ? (
            <div style={{ background: "#0A1628", border: "1px solid rgba(76,141,255,0.3)", borderRadius: 10, padding: "10px 14px", textAlign: "center", fontSize: 12, color: "#4C8DFF", marginTop: 4 }}>
              <Icon name="check" size={12} style={{ verticalAlign: "-1px", marginRight: 3 }} /> Nudge sent to {nudgeResult.sent} member{nudgeResult.sent !== 1 ? "s" : ""}
              {nudgeResult.failed > 0 && <span style={{ color: "#F87171", marginLeft: 6 }}>({nudgeResult.failed} failed)</span>}
            </div>
          ) : (
            <button
              onClick={sendNudge}
              disabled={nudgeSending}
              style={{ width: "100%", marginTop: 4, background: nudgeSending ? "#212429" : "transparent", border: "1px solid rgba(248,113,113,0.35)", borderRadius: 10, padding: "10px 14px", fontSize: 12, fontWeight: 600, color: nudgeSending ? "#6E7480" : "#F87171", cursor: nudgeSending ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
            >
              {nudgeSending ? "Sending nudges..." : <><Icon name="chat" size={12} /> Nudge {atRisk.length} at-risk member{atRisk.length !== 1 ? "s" : ""}</>}
            </button>
          )}
        </>
      )}

      {total === 0 && (
        <div style={{ background: "#212429", borderRadius: 12, padding: "20px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "#6E7480", lineHeight: 1.6 }}>No members yet. Share your gym's sign-up link to get started.</div>
        </div>
      )}
    </div>
  );
}

function OwnerMembersTab() {
  const { members, loading, updateLocalActive } = useOwnerData();
  const { gymBranding } = useApp();
  const activeMembers = members.filter(m => m.isActive !== false);
  const removedMembers = members.filter(m => m.isActive === false);
  const [busyMemberId, setBusyMemberId] = useState(null);
  const [showRemoved, setShowRemoved] = useState(false);

  async function handleRemoveMember(m) {
    if (!window.confirm(`Remove ${m.name} from this gym? They'll stop counting toward your active member total. You can restore them anytime.`)) return;
    setBusyMemberId(m.id);
    const ok = await sb.setMemberActive(m.id, false);
    setBusyMemberId(null);
    if (ok) updateLocalActive(m.id, false);
  }

  async function handleRestoreMember(m) {
    setBusyMemberId(m.id);
    const ok = await sb.setMemberActive(m.id, true);
    setBusyMemberId(null);
    if (ok) updateLocalActive(m.id, true);
  }

  // ── Individual message state ──────────────────────────────────────────────
  const [composeTo, setComposeTo] = useState(null);
  const [msgText, setMsgText] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState(null);

  // ── Broadcast message state ───────────────────────────────────────────────
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastText, setBroadcastText] = useState("");
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastResult, setBroadcastResult] = useState(null); // { sent, failed } after send

  async function sendMsg() {
    const text = msgText.trim() ||
      `Hey ${composeTo.name.split(" ")[0]} — we noticed you haven't logged in for a while. How's everything going? We're here if you need support 💪`;
    setSending(true);
    setSendError(null);
    const gymId = gymBranding?.gymId || "demo-gym";
    const ok = await sb.saveMessage(gymId, composeTo.id, text);
    setSending(false);
    if (ok) {
      setSent(true);
      setTimeout(() => { setSent(false); setComposeTo(null); setMsgText(""); }, 1400);
    } else {
      setSendError("Send failed — check your connection.");
    }
  }

  async function sendBroadcast() {
    const text = broadcastText.trim();
    if (!text || !activeMembers.length) return;
    setBroadcastSending(true);
    setBroadcastResult(null);
    const gymId = gymBranding?.gymId || "demo-gym";
    const profileIds = activeMembers.map(m => m.id);
    const result = await sb.broadcastMessage(gymId, profileIds, text);
    setBroadcastSending(false);
    setBroadcastResult(result);
    if (result.sent > 0) {
      setBroadcastText("");
      // Auto-collapse the panel after 3 seconds so the owner can see members again
      setTimeout(() => { setBroadcastOpen(false); setBroadcastResult(null); }, 3000);
    }
  }

  if (loading) return <OwnerSpinner />;

  if (!activeMembers.length) {
    return (
      <div className="mq-fade" style={{ background: "#212429", borderRadius: 14, padding: "24px 16px", textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "#6E7480", lineHeight: 1.6 }}>No members have signed up yet.</div>
      </div>
    );
  }

  return (
    <div className="mq-fade">

      {/* ── Broadcast panel ── */}
      <div style={{ marginBottom: 14 }}>
        <button
          onClick={() => { setBroadcastOpen(v => !v); setBroadcastResult(null); }}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: broadcastOpen ? "#1A2E2B" : "#212429", border: `1px solid ${broadcastOpen ? "rgba(76,141,255,0.35)" : "rgba(255,255,255,0.06)"}`, borderRadius: broadcastOpen ? "14px 14px 0 0" : 14, padding: "12px 14px", cursor: "pointer", fontFamily: "inherit", transition: "all .2s" }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(76,141,255,0.12)", border: "1px solid rgba(76,141,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", color: "#4C8DFF" }}><Icon name="megaphone" size={13} /></div>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#EDEEF0" }}>Message all members</div>
              <div style={{ fontSize: 11, color: "#6E7480", marginTop: 1 }}>{activeMembers.length} member{activeMembers.length !== 1 ? "s" : ""} will receive this</div>
            </div>
          </div>
          <div style={{ fontSize: 18, color: "#6E7480", transform: broadcastOpen ? "rotate(90deg)" : "none", transition: "transform .2s" }}>›</div>
        </button>

        {broadcastOpen && (
          <div className="mq-fade" style={{ background: "#1A2E2B", border: "1px solid rgba(76,141,255,0.35)", borderTop: "none", borderRadius: "0 0 14px 14px", padding: "14px" }}>
            {/* Recipient preview chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 12 }}>
              {members.slice(0, 8).map(m => (
                <div key={m.id} style={{ background: "#171920", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 20, padding: "3px 9px", fontSize: 10, color: "#9BA0AA", display: "flex", alignItems: "center", gap: 5 }}>
                  <div style={{ width: 14, height: 14, borderRadius: "50%", background: m.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, color: m.color, fontWeight: 700 }}>{m.initials}</div>
                  {m.name.split(" ")[0]}
                </div>
              ))}
              {activeMembers.length > 8 && (
                <div style={{ background: "#171920", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 20, padding: "3px 9px", fontSize: 10, color: "#6E7480" }}>+{activeMembers.length - 8} more</div>
              )}
            </div>

            <textarea
              value={broadcastText}
              onChange={e => setBroadcastText(e.target.value)}
              placeholder={`Hey everyone at ${gymBranding?.name || "the gym"} — just a quick update from your coach...`}
              style={{ width: "100%", background: "#171920", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 12px", fontSize: 12, color: "#9BA0AA", outline: "none", fontFamily: "inherit", resize: "none", minHeight: 88, lineHeight: 1.55, marginBottom: 10, boxSizing: "border-box" }}
            />

            {/* Character count */}
            <div style={{ fontSize: 10, color: broadcastText.length > 280 ? "#F87171" : "#6E7480", textAlign: "right", marginTop: -6, marginBottom: 10 }}>
              {broadcastText.length} / 280 characters
            </div>

            {broadcastResult && (
              <div style={{ background: broadcastResult.failed === 0 ? "#0B1E3D" : "#1F1010", border: `1px solid ${broadcastResult.failed === 0 ? "rgba(76,141,255,0.4)" : "rgba(248,113,113,0.3)"}`, borderRadius: 10, padding: "10px 12px", marginBottom: 10, fontSize: 12, color: broadcastResult.failed === 0 ? "#4C8DFF" : "#F87171" }}>
                {broadcastResult.failed === 0
                  ? <><Icon name="check" size={12} style={{ verticalAlign: "-1px", marginRight: 3 }} /> Sent to all {broadcastResult.sent} member{broadcastResult.sent !== 1 ? "s" : ""} — they'll see it next time they open the app.</>
                  : `Sent to ${broadcastResult.sent}, failed for ${broadcastResult.failed}. Check your connection and try again.`}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => { setBroadcastOpen(false); setBroadcastText(""); setBroadcastResult(null); }}
                style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px", fontSize: 12, color: "#6E7480", cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
              <button
                onClick={sendBroadcast}
                disabled={!broadcastText.trim() || broadcastSending || broadcastText.length > 280}
                style={{ flex: 2, background: broadcastResult?.sent > 0 ? "#0B1E3D" : "#4C8DFF", color: broadcastResult?.sent > 0 ? "#4C8DFF" : "#0B1E3D", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 600, cursor: (!broadcastText.trim() || broadcastSending) ? "default" : "pointer", fontFamily: "inherit", opacity: (!broadcastText.trim() || broadcastSending) ? 0.5 : 1, transition: "all .2s" }}
              >
                {broadcastSending ? "Sending..." : broadcastResult?.sent > 0 ? <>Sent <Icon name="check" size={12} style={{ verticalAlign: "-1px" }} /></> : `Send to all ${activeMembers.length} members`}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Member list ── */}
      <div style={{ background: "#212429", borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
        {activeMembers.map((m, i) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: i < activeMembers.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: m.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: m.color, flexShrink: 0 }}>{m.initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#EDEEF0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
              <div style={{ fontSize: 11, color: m.statusColor }}>{m.status}</div>
            </div>
            <div style={{ textAlign: "right", marginRight: 8, flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: m.deltaColor }}>{m.delta}</div>
              <div style={{ fontSize: 10, color: "#6E7480" }}>weight</div>
            </div>
            <button onClick={() => { setComposeTo(m); setSent(false); setMsgText(""); setBroadcastOpen(false); }}
              style={{ width: 28, height: 28, borderRadius: 8, background: "#171920", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 6.5c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.4-.6 2.6-1.5 3.5L10.5 12H6.5c-2.76 0-5-2.24-5-5z" stroke="#4C8DFF" strokeWidth="1" /></svg>
            </button>
            <button onClick={() => handleRemoveMember(m)} disabled={busyMemberId === m.id} title="Remove member"
              style={{ width: 28, height: 28, borderRadius: 8, background: "#171920", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, marginLeft: 6, opacity: busyMemberId === m.id ? 0.5 : 1 }}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2 2l9 9M11 2l-9 9" stroke="#F87171" strokeWidth="1.5" strokeLinecap="round" /></svg>
            </button>
          </div>
        ))}
      </div>

      {removedMembers.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <button onClick={() => setShowRemoved(v => !v)}
            style={{ background: "none", border: "none", color: "#6E7480", fontSize: 12, cursor: "pointer", padding: "4px 0", fontFamily: "inherit" }}>
            {showRemoved ? "Hide" : "Show"} removed members ({removedMembers.length})
          </button>
          {showRemoved && (
            <div style={{ background: "#212429", borderRadius: 14, overflow: "hidden", marginTop: 8, opacity: 0.6 }}>
              {removedMembers.map((m, i) => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: i < removedMembers.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: m.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: m.color, flexShrink: 0 }}>{m.initials}</div>
                  <div style={{ flex: 1, fontSize: 13, color: "#EDEEF0" }}>{m.name}</div>
                  <button onClick={() => handleRestoreMember(m)} disabled={busyMemberId === m.id}
                    style={{ fontSize: 11, fontWeight: 600, color: "#4C8DFF", background: "none", border: "1px solid #4C8DFF", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontFamily: "inherit", opacity: busyMemberId === m.id ? 0.5 : 1 }}>
                    {busyMemberId === m.id ? "..." : "Restore"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Individual compose panel ── */}
      {composeTo && (
        <div className="mq-fade" style={{ background: "#212429", borderRadius: 14, padding: "14px" }}>
          <div style={{ fontSize: 12, color: "#6E7480", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>Message</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#171920", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: "#6E7480" }}>To:</span>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: composeTo.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: composeTo.color, fontWeight: 600 }}>{composeTo.initials}</div>
            <span style={{ fontSize: 12, color: "#EDEEF0" }}>{composeTo.name}</span>
            <button onClick={() => setComposeTo(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#6E7480", cursor: "pointer", fontSize: 14 }}>×</button>
          </div>
          <textarea value={msgText} onChange={e => setMsgText(e.target.value)}
            placeholder={`Hey ${composeTo.name.split(" ")[0]} — we noticed you haven't logged in for a while. How's everything going? We're here if you need support 💪`}
            style={{ width: "100%", background: "#171920", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 12px", fontSize: 12, color: "#9BA0AA", outline: "none", fontFamily: "inherit", resize: "none", minHeight: 80, lineHeight: 1.5, marginBottom: 10 }} />
          {sendError && <div style={{ fontSize: 12, color: "#F87171", marginBottom: 8 }}>{sendError}</div>}
          <button onClick={sendMsg} disabled={sending} style={{ width: "100%", background: sent ? "#0B1E3D" : "#4C8DFF", color: sent ? "#4C8DFF" : "#0B1E3D", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 600, cursor: sending ? "default" : "pointer", fontFamily: "inherit", opacity: sending ? 0.7 : 1 }}>
            {sent ? <>Sent <Icon name="check" size={12} style={{ verticalAlign: "-1px" }} /></> : sending ? "Sending..." : "Send message"}
          </button>
        </div>
      )}
    </div>
  );
}

function OwnerBrandingTab() {
  const { gymBranding, setGymBranding } = useApp();
  const [gymName, setGymName] = useState(gymBranding.name);
  const [welcome, setWelcome] = useState(gymBranding.welcome || `Welcome to ${gymBranding.name}. Your personal AI trainer is ready. Let's get to work.`);
  // Gym-logo branding (this session): logoUrl mirrors gymName/welcome's own
  // pattern -- edited locally, only actually persisted to gyms.logo_url when
  // "Save changes" is pressed, via saveGymBranding()'s existing (until now
  // unused) optional `logo` param. The file itself uploads to Storage
  // immediately on selection (uploadGymLogo already handles overwrite-in-place
  // via upsert), but the DB row and app state don't change until Save.
  const [logoUrl, setLogoUrl] = useState(gymBranding.logo || null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoError, setLogoError] = useState(null);
  const fileInputRef = useRef(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Session 11: accent is fixed app-wide now, no longer a per-gym setting --
  // this used to be an editable "Brand color" swatch picker here, removed
  // since it would otherwise silently do nothing (misleading, not just
  // inert). Still passed through to saveGymBranding() below so the DB row
  // stays consistent, but it's a constant, not something read from state.
  const FIXED_ACCENT = "#4C8DFF";

  // Client-side validation before ever touching the network -- matches the
  // Storage bucket's own 2MB cap and image-mime-type restriction, but fails
  // fast with a plain-English message instead of waiting on a rejected upload.
  const ALLOWED_LOGO_TYPES = { "image/png": true, "image/jpeg": true, "image/webp": true, "image/svg+xml": true };
  const MAX_LOGO_BYTES = 2 * 1024 * 1024;

  async function handleLogoFile(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so re-selecting the same file still fires onChange
    if (!file) return;
    setLogoError(null);
    if (!ALLOWED_LOGO_TYPES[file.type]) {
      setLogoError("Please choose a PNG, JPG, WebP, or SVG image.");
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setLogoError("That image is too large — 2MB max.");
      return;
    }
    setLogoUploading(true);
    const gymId = gymBranding?.gymId || "demo-gym";
    const result = await sb.uploadGymLogo(gymId, file);
    setLogoUploading(false);
    if (result.ok) {
      setLogoUrl(result.url);
    } else {
      setLogoError(result.error || "Upload failed — check your connection and try again.");
    }
  }

  function removeLogo() {
    setLogoUrl(null);
    setLogoError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    // Use the real gym ID stored in context when the owner signed in
    const gymId = gymBranding?.gymId || "demo-gym";
    const ok = await sb.saveGymBranding(gymId, { name: gymName, accent: FIXED_ACCENT, welcome, logo: logoUrl });
    setSaving(false);
    if (ok) {
      setGymBranding({ name: gymName, accent: FIXED_ACCENT, welcome, units: gymBranding.units, gymId, logo: logoUrl });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      setError("Save failed — check your connection and try again.");
    }
  }

  return (
    <div className="mq-fade">
      <div style={{ background: "#212429", borderRadius: 14, padding: "14px", marginBottom: 16 }}>
        {/* Gym name */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#6E7480", marginBottom: 6 }}>Gym name</div>
          <input value={gymName} onChange={e => setGymName(e.target.value)}
            style={{ width: "100%", background: "#171920", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#EDEEF0", outline: "none", fontFamily: "inherit" }} />
        </div>
        {/* Welcome message */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#6E7480", marginBottom: 6 }}>Welcome message</div>
          <textarea value={welcome} onChange={e => setWelcome(e.target.value)}
            style={{ width: "100%", background: "#171920", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#9BA0AA", outline: "none", fontFamily: "inherit", resize: "none", minHeight: 60, lineHeight: 1.5 }} />
        </div>
        {/* Gym logo */}
        <div>
          <div style={{ fontSize: 11, color: "#6E7480", marginBottom: 6 }}>Gym logo</div>
          <div style={{ fontSize: 11, color: "#6E7480", marginBottom: 8, lineHeight: 1.5 }}>Shown on your members' loading screen. PNG, JPG, WebP, or SVG — 2MB max.</div>
          <div style={{ background: "#0F1013", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "16px", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 64, marginBottom: 8 }}>
            {logoUrl
              ? <GymLogo src={logoUrl} size={40} />
              : <span style={{ fontSize: 12, color: "#6E7480", textAlign: "center" }}>No logo — members will see your gym name instead</span>}
          </div>
          <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={handleLogoFile} style={{ display: "none" }} />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button onClick={() => fileInputRef.current?.click()} disabled={logoUploading}
              style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "7px 12px", fontSize: 12, color: "#EDEEF0", cursor: logoUploading ? "default" : "pointer", fontFamily: "inherit" }}>
              {logoUploading ? "Uploading…" : logoUrl ? "Change logo" : "Upload logo"}
            </button>
            {logoUrl && !logoUploading && (
              <button onClick={removeLogo} style={{ background: "transparent", border: "none", fontSize: 12, color: "#6E7480", cursor: "pointer", fontFamily: "inherit" }}>Remove</button>
            )}
          </div>
          {logoError && <div style={{ fontSize: 12, color: "#F87171", marginTop: 8 }}>{logoError}</div>}
        </div>
      </div>

      {/* Live preview */}
      <div style={{ fontSize: 11, color: "#6E7480", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>Live member preview</div>
      <div style={{ background: "#1B1D21", borderRadius: 14, overflow: "hidden", marginBottom: 16, border: "1px solid #2B2E34" }}>
        <div style={{ background: "#1B1D21", padding: "10px 14px", borderBottom: "1px solid #2B2E34", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#0B1E3D", border: `2px solid ${FIXED_ACCENT}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: FIXED_ACCENT }}>M</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#EDEEF0" }}>{gymName}</div>
            <div style={{ fontSize: 10, color: "#6E7480" }}><PoweredByHypergentiq /></div>
          </div>
        </div>
        <div style={{ padding: "14px" }}>
          <div style={{ fontSize: 12, color: "#9BA0AA", marginBottom: 12, lineHeight: 1.5 }}>"{welcome}"</div>
          <div style={{ background: FIXED_ACCENT, borderRadius: 10, padding: "9px", fontSize: 12, fontWeight: 600, color: "#0B1E3D", textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>Build my plan <Icon name="arrow-right" size={12} /></div>
        </div>
      </div>

      {/* Loading screen preview -- shows exactly what LoadingScreen in
          Morphiq.jsx will render: the uploaded logo + small Hypergentiq
          credit if one's set, or the plain gym name (never the Hypergentiq
          mark) if not. */}
      <div style={{ fontSize: 11, color: "#6E7480", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>Loading screen preview</div>
      <div style={{ background: "#000", borderRadius: 14, padding: "28px 14px", marginBottom: 16, border: "1px solid #2B2E34", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        {logoUrl ? (
          <>
            <GymLogo src={logoUrl} size={44} />
            <div style={{ fontSize: 10, color: "#3A3D44", marginTop: 10 }}><PoweredByHypergentiq /></div>
          </>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 500, letterSpacing: ".1em", color: FIXED_ACCENT, textTransform: "uppercase" }}>{gymName}</span>
        )}
      </div>

      {error && <div style={{ fontSize: 12, color: "#F87171", marginBottom: 8, padding: "8px 12px", background: "#1F1010", borderRadius: 8 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save} disabled={saving} style={{ flex: 2, background: saved ? "#0B1E3D" : "#4C8DFF", color: saved ? "#4C8DFF" : "#0B1E3D", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 600, cursor: saving ? "default" : "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>
          {saving ? "Saving…" : saved ? <>Saved <Icon name="check" size={12} style={{ verticalAlign: "-1px" }} /></> : "Save changes"}
        </button>
        <button onClick={() => { setGymName(gymBranding.name); setWelcome(gymBranding.welcome || ""); setLogoUrl(gymBranding.logo || null); setLogoError(null); }} style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px", fontSize: 12, color: "#6E7480", cursor: "pointer", fontFamily: "inherit" }}>Reset</button>
      </div>
    </div>
  );
}

function OwnerInviteTab() {
  const { gymBranding } = useApp();
  const gymId = gymBranding?.gymId || "demo-gym";
  const inviteUrl = `${window.location.origin}?gym=${gymId}`;
  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }).catch(() => {
      // Fallback for browsers without clipboard API
      const el = document.createElement("textarea");
      el.value = inviteUrl;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  return (
    <div className="mq-fade">
      <div style={{ background: "#212429", borderRadius: 14, padding: "16px 14px", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#EDEEF0", marginBottom: 6 }}>Member invite link</div>
        <div style={{ fontSize: 12, color: "#9BA0AA", lineHeight: 1.6, marginBottom: 14 }}>
          Share this link with new members. When they open it, they'll land directly on your branded gym sign-up — no searching for Hypergentiq separately.
        </div>
        <div style={{ background: "#171920", border: "1px solid #2B2E34", borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, fontSize: 11, color: "#9BA0AA", fontFamily: "monospace", wordBreak: "break-all", lineHeight: 1.5 }}>{inviteUrl}</div>
          <button onClick={copyLink} style={{ flexShrink: 0, background: copied ? "#0B1E3D" : "#4C8DFF", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: copied ? "#4C8DFF" : "#0B1E3D", cursor: "pointer", fontFamily: "inherit", transition: "all .2s" }}>
            {copied ? <>Copied <Icon name="check" size={12} style={{ verticalAlign: "-1px" }} /></> : "Copy"}
          </button>
        </div>
        <div style={{ fontSize: 10, color: "#6E7480", lineHeight: 1.6 }}>
          Members who sign up via this link are automatically assigned to your gym. Their plan will show your branding.
        </div>
      </div>

      <div style={{ background: "#212429", borderRadius: 14, padding: "14px", marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: "#6E7480", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>How it works</div>
        {[
          ["1", "Copy the link above and share it via text, email, or your gym's social media."],
          ["2", "Member opens the link → sees your gym name and branding on the sign-in screen."],
          ["3", "They sign up with their email → get a 6-digit code → complete the quiz."],
          ["4", "Their plan is built by Hypergentiq AI and appears in the Members tab of your dashboard."],
        ].map(([num, text]) => (
          <div key={num} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#0B1E3D", border: "1px solid rgba(76,141,255,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#4C8DFF", flexShrink: 0 }}>{num}</div>
            <div style={{ fontSize: 12, color: "#9BA0AA", lineHeight: 1.6 }}>{text}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#0F1922", border: "1px solid rgba(76,141,255,0.1)", borderRadius: 12, padding: "12px 14px" }}>
        <div style={{ fontSize: 11, color: "#4C8DFF", fontWeight: 600, marginBottom: 4 }}>Tip: QR code</div>
        <div style={{ fontSize: 11, color: "#6E7480", lineHeight: 1.6 }}>
          Go to qr-code-generator.com, paste your link, and print the QR code to display at your front desk or on your website.
        </div>
      </div>
    </div>
  );
}

function PricingScreen() {
  const { navigate } = useApp();
  const [leadPlan, setLeadPlan] = useState(null);   // which plan button was tapped
  const [leadEmail, setLeadEmail] = useState("");
  const [leadSent, setLeadSent] = useState(false);
  const [leadSaving, setLeadSaving] = useState(false);

  async function submitLead() {
    if (!leadEmail.includes("@") || !leadPlan) return;
    setLeadSaving(true);
    try {
      // Save to Supabase leads table (create table SQL: id uuid default gen_random_uuid(), email text, plan text, created_at timestamptz default now())
      await fetch(`${SUPABASE_URL}/rest/v1/leads`, {
        method: "POST",
        headers: { ...SB_HEADERS, "Prefer": "return=minimal" },
        body: JSON.stringify({ email: leadEmail, plan: leadPlan, created_at: new Date().toISOString() }),
      });
    } catch (_) {}  // fire-and-forget — never block the UI
    setLeadSent(true);
    setLeadSaving(false);
  }

  const plans = [
    {
      name: "Starter",
      price: "$99",
      perMember: "$2",
      color: "#4C8DFF",
      bg: "#0B1E3D",
      border: "rgba(76,141,255,0.3)",
      badge: null,
      features: [
        "Up to 100 active members",
        "AI workout plans",
        "AI meal plans",
        "Voice rep logging",
        "Member progress tracking",
        "Basic gym branding",
        "Email support",
      ],
    },
    {
      name: "Growth",
      price: "$199",
      perMember: "$1.75",
      color: "#7C93B8",
      bg: "#16233D",
      border: "rgba(124,147,184,0.4)",
      badge: "Most popular",
      features: [
        "Up to 500 active members",
        "Everything in Starter",
        "Broadcast messaging to all members",
        "Advanced analytics dashboard",
        "Custom welcome message",
        "Priority email support",
        "Weekly engagement report",
      ],
    },
    {
      name: "Scale",
      price: "$399",
      perMember: "$1.50",
      color: "#5FA8E0",
      bg: "#0F2A3D",
      border: "rgba(95,168,224,0.3)",
      badge: "Best value",
      features: [
        "Unlimited active members",
        "Everything in Growth",
        "Dedicated account manager",
        "Custom AI personality name",
        "White-label mobile app icon",
        "API access",
        "Phone & chat support",
      ],
    },
  ];

  return (
    <div style={{ background: "#121316", borderRadius: 20, color: "#EDEEF0", fontFamily: "'Inter', system-ui, sans-serif", minHeight: "100dvh", overflow: "hidden" }}>
      <div style={{ background: "#171920", borderBottom: "1px solid #2B2E34", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => navigate("owner")} style={{ background: "none", border: "none", color: "#6E7480", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}><Icon name="arrow-left" size={18} /></button>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#EDEEF0" }}>Pricing Plans</div>
      </div>

      <div style={{ padding: "16px 16px 80px", overflowY: "auto" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: "#9BA0AA", lineHeight: 1.6 }}>
            All plans include a <span style={{ color: "#4C8DFF", fontWeight: 600 }}>14-day free trial</span>. No credit card required to start.
          </div>
          <div style={{ fontSize: 11, color: "#6E7480", marginTop: 4 }}>
            Billing is monthly. "Active member" = logged at least one workout that month.
          </div>
        </div>

        {plans.map(plan => (
          <div key={plan.name} style={{ background: plan.bg, border: `1px solid ${plan.border}`, borderRadius: 16, padding: "16px 14px", marginBottom: 12, position: "relative" }}>
            {plan.badge && (
              <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: plan.color, color: "#0B1E3D", borderRadius: 20, padding: "2px 12px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>
                {plan.badge}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: plan.color }}>{plan.name}</div>
                <div style={{ fontSize: 11, color: "#9BA0AA", marginTop: 2 }}>Base monthly fee</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#EDEEF0", lineHeight: 1 }}>{plan.price}<span style={{ fontSize: 12, color: "#9BA0AA", fontWeight: 400 }}>/mo</span></div>
                <div style={{ fontSize: 11, color: plan.color, marginTop: 2 }}>+ {plan.perMember} per active member</div>
              </div>
            </div>
            <div style={{ borderTop: `1px solid rgba(255,255,255,0.06)`, paddingTop: 10 }}>
              {plan.features.map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                  <div style={{ width: 14, height: 14, borderRadius: "50%", background: plan.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#121316", flexShrink: 0 }}><Icon name="check" size={9} /></div>
                  <span style={{ fontSize: 12, color: theme.textMuted }}>{f}</span>
                </div>
              ))}
            </div>
            {leadPlan === plan.name && !leadSent ? (
              <div style={{ marginTop: 14 }}>
                <input
                  type="email"
                  value={leadEmail}
                  onChange={e => setLeadEmail(e.target.value)}
                  placeholder="Your email address"
                  style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: `1px solid ${plan.color}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "#EDEEF0", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => setLeadPlan(null)} style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "9px", fontSize: 12, color: "#9BA0AA", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                  <button onClick={submitLead} disabled={!leadEmail.includes("@") || leadSaving} style={{ flex: 2, background: plan.color, color: "#121316", border: "none", borderRadius: 10, padding: "9px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: leadSaving ? 0.6 : 1 }}>
                    {leadSaving ? "Saving..." : <>Start free trial <Icon name="arrow-right" size={12} /></>}
                  </button>
                </div>
              </div>
            ) : leadPlan === plan.name && leadSent ? (
              <div style={{ marginTop: 14, background: "rgba(0,0,0,0.3)", border: `1px solid ${plan.color}`, borderRadius: 10, padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: 14, color: plan.color, fontWeight: 700, marginBottom: 4 }}><Icon name="check" size={13} style={{ verticalAlign: "-2px", marginRight: 3 }} /> You're on the list!</div>
                <div style={{ fontSize: 11, color: "#9BA0AA" }}>We'll reach out to {leadEmail} within 24 hours to get you set up.</div>
              </div>
            ) : (
              <button onClick={() => { setLeadPlan(plan.name); setLeadEmail(""); setLeadSent(false); }} style={{ width: "100%", background: plan.color, color: "#121316", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginTop: 14 }}>
                Start {plan.name} trial <Icon name="arrow-right" size={13} style={{ verticalAlign: "-2px" }} />
              </button>
            )}
          </div>
        ))}

        <div style={{ background: "#212429", borderRadius: 14, padding: "14px", textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#EDEEF0", marginBottom: 6 }}>Need something custom?</div>
          <div style={{ fontSize: 12, color: "#9BA0AA", marginBottom: 10, lineHeight: 1.6 }}>
            Enterprise plans available for gym chains, franchises, and large studios. Let's talk.
          </div>
          <div style={{ fontSize: 12, color: "#4C8DFF" }}>hello@hypergentiq.com</div>
        </div>
      </div>

      <div style={{ textAlign: "center", fontSize: 10, color: "#333", letterSpacing: ".5px", padding: "8px 0 12px" }}><PoweredByHypergentiq caps /></div>
    </div>
  );
}


function OwnerUsageTab() {
  const { gymBranding } = useApp();
  const a = "#4C8DFF";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const month = new Date().toISOString().slice(0, 7);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `https://uvnyjegmhsztdednjclb.supabase.co/rest/v1/ai_usage?month=eq.${month}&order=created_at.desc&limit=200`,
          { headers: { "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2bnlqZWdtaHN6dGRlZG5qY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTgwMjcsImV4cCI6MjA5NDI5NDAyN30.-hMNwCO-GymvbiyAKer6Q5AjDbDZl6GhXmSTmr5bY04", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2bnlqZWdtaHN6dGRlZG5qY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTgwMjcsImV4cCI6MjA5NDI5NDAyN30.-hMNwCO-GymvbiyAKer6Q5AjDbDZl6GhXmSTmr5bY04" } }
        );
        const data = await res.json();
        if (Array.isArray(data)) setRows(data);
      } catch {}
      setLoading(false);
    }
    load();
  }, []);

  const totalCalls = rows.length;
  const totalTokens = rows.reduce((sum, r) => sum + (r.tokens_used || 0), 0);
  const estCost = ((totalTokens / 1000) * 0.003).toFixed(2);
  const chatCalls = rows.filter(r => r.feature === "chat").length;
  const mealCalls = rows.filter(r => r.feature === "meal_parse").length;

  const card = { background: "#212429", borderRadius: 12, padding: "12px 14px", marginBottom: 10 };
  const dim = { fontSize: 11, color: "#6E7480" };
  const big = { fontSize: 22, fontWeight: 700, color: a };

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#EDEEF0", marginBottom: 14 }}>AI Usage — {month}</div>
      {loading ? <div style={{ ...dim, textAlign: "center", padding: 20 }}>Loading...</div> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <div style={card}><div style={big}>{totalCalls}</div><div style={dim}>Total AI calls</div></div>
            <div style={{ ...card, background: "#0A1628", border: "1px solid rgba(76,141,255,0.2)" }}><div style={big}>${estCost}</div><div style={dim}>Est. cost this month</div></div>
            <div style={card}><div style={{ fontSize: 18, fontWeight: 700, color: "#7C93B8" }}>{totalTokens.toLocaleString()}</div><div style={dim}>Tokens used</div></div>
            <div style={card}><div style={{ fontSize: 18, fontWeight: 700, color: "#F59E0B" }}>{chatCalls}</div><div style={dim}>Chat messages</div></div>
          </div>
          <div style={card}>
            <div style={{ fontSize: 11, color: "#6E7480", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Usage by feature</div>
            {[["AI Chat", chatCalls, a], ["Meal parsing", mealCalls, "#F59E0B"], ["Plan generation", totalCalls - chatCalls - mealCalls, "#5FA8E0"]].map(([label, count, color]) => (
              <div key={label} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9BA0AA", marginBottom: 4 }}>
                  <span>{label}</span><span style={{ color }}>{count} calls</span>
                </div>
                <div style={{ height: 4, background: "#171920", borderRadius: 2 }}>
                  <div style={{ height: 4, borderRadius: 2, background: color, width: totalCalls ? `${Math.round((count/totalCalls)*100)}%` : "0%", transition: "width .5s" }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ ...card, background: "#171920" }}>
            <div style={{ fontSize: 11, color: "#6E7480", marginBottom: 4 }}>Member limit</div>
            <div style={{ fontSize: 13, color: "#EDEEF0" }}>50 AI chat messages per member per month</div>
            <div style={{ fontSize: 11, color: "#6E7480", marginTop: 4 }}>Resets on the 1st of each month</div>
          </div>
        </>
      )}
    </div>
  );
}

function GymOwnerDashboard() {
  const { navigate } = useApp();
  const [tab, setTab] = useState("overview");
  const tabs = [["overview","Overview"],["members","Members"],["invite","Invite"],["branding","Branding"],["usage","AI Usage"]];

  return (
    <div style={{ background: "#121316", borderRadius: 20, color: "#EDEEF0", fontFamily: "'Inter', system-ui, sans-serif", minHeight: "100dvh", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ background: "#171920", borderBottom: "1px solid #2B2E34", padding: "14px 16px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#EDEEF0" }}>Gym Dashboard</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4C8DFF" }} />
            <span style={{ fontSize: 11, color: "#6E7480" }}>Admin</span>
          </div>
        </div>
        {/* Tab bar */}
        <div style={{ display: "flex", gap: 0 }}>
          {tabs.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ flex: 1, padding: "8px 4px", background: "none", border: "none", borderBottom: `2px solid ${tab === id ? "#4C8DFF" : "transparent"}`, fontSize: 12, fontWeight: tab === id ? 600 : 400, color: tab === id ? "#4C8DFF" : "#6E7480", cursor: "pointer", fontFamily: "inherit", transition: "all .2s" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "16px 16px 0", overflowY: "auto" }}>
        {tab === "overview" && <OwnerOverviewTab />}
        {tab === "members"  && <OwnerMembersTab />}
        {tab === "invite"   && <OwnerInviteTab />}
        {tab === "branding" && <OwnerBrandingTab />}
        {tab === "usage"    && <OwnerUsageTab />}
      </div>

      {/* Footer back link */}
      <div style={{ padding: "14px 16px", display: "flex", justifyContent: "flex-end", alignItems: "center" }}>
        <button onClick={() => navigate("pricing")} style={{ background: "none", border: "1px solid rgba(76,141,255,0.3)", borderRadius: 8, padding: "6px 14px", fontSize: 12, color: "#4C8DFF", cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>Plans & pricing <Icon name="arrow-right" size={12} /></button>
      </div>
      <div style={{ textAlign: "center", fontSize: 10, color: "#333", letterSpacing: ".5px", padding: "0 0 12px" }}><PoweredByHypergentiq caps /></div>
    </div>
  );
}

function LoadingScreen() {
  const { gymBranding } = useApp();
  const a = gymBranding.accent;
  const ob = theme.ob;
  return (
    <div style={{ background: ob.bg, borderRadius: 20, minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, fontFamily: ob.font }}>
      <div style={{ width: 48, height: 48, borderRadius: "50%", background: ob.tealDk, border: `2px solid ${a}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: a }}>M</div>
      <Spinner size={36} color={a} trackColor={ob.card} />
      <div style={{ fontSize: 13, color: ob.body }}>Loading your account…</div>
      <div style={{ fontSize: 9, color: "#333", letterSpacing: ".5px", marginTop: 20 }}><PoweredByHypergentiq caps /></div>
    </div>
  );
}

export { GymOwnerDashboard, PricingScreen, OwnerUsageTab };
