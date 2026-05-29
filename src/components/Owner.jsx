import { useState, useEffect, useRef } from "react";
import { useApp } from "../utils/context";
import { theme } from "../utils/theme";
import { Layout, Pill } from "./Shared";
import sb from "../utils/supabase";


// ─── GYM OWNER DASHBOARD ──────────────────────────────────────────────────────

// Derive display properties from a raw profile + stats
function buildMemberRow(profile, sessions, lastDate, weightDelta) {
  const initials = (profile.name || "?").split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  const avatarColors = ["#003D35/#00D4B1","#2D1A00/#F59E0B","#1A1040/#A78BFA","#1F1010/#F87171","#0A1628/#60A5FA"];
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
    statusColor = "#00D4B1";
  } else if (sessions >= 5) {
    status = `${sessions} sessions · on track`;
    statusColor = "#6B7A8D";
  } else {
    status = `${sessions} sessions · needs nudge`;
    statusColor = "#F59E0B";
  }

  const delta = weightDelta !== undefined
    ? (parseFloat(weightDelta) > 0 ? `+${weightDelta}lb` : `${weightDelta}lb`)
    : "—";
  const deltaColor = weightDelta !== undefined
    ? (parseFloat(weightDelta) < 0 ? "#00D4B1" : "#F87171")
    : "#6B7A8D";

  return { id: profile.id, name: profile.name || "Member", initials, bg, color, sessions: sessions || 0, status, statusColor, delta, deltaColor, atRisk: daysSince === null || daysSince > 7 };
}

// Shared hook — loads all owner data once, shared between Overview + Members tabs
function useOwnerData() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const profiles = await sb.getGymMembers("demo-gym");
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
  }, []);

  return { members, loading };
}

function OwnerStatCard({ value, label, sub, color }) {
  return (
    <div style={{ background: "#1A2332", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || "#E8EDF2" }}>{value}</div>
      <div style={{ fontSize: 11, color: "#6B7A8D", marginTop: 2 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: "#00D4B1", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function OwnerSpinner() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "32px 0" }}>
      <div style={{ width: 28, height: 28, border: "3px solid #1A2332", borderTopColor: "#00D4B1", borderRadius: "50%", animation: "spin .9s linear infinite" }} />
      <div style={{ fontSize: 12, color: "#6B7A8D" }}>Loading member data…</div>
    </div>
  );
}

function OwnerOverviewTab() {
  const { members, loading } = useOwnerData();

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
        <OwnerStatCard value={`${activePct}%`} label="Active this month" color="#00D4B1" />
        <OwnerStatCard value={totalSessions.toLocaleString()} label="Sessions this month" color="#F59E0B" />
        <OwnerStatCard value={avgLoss ? `${avgLoss}lb` : "—"} label="Avg weight change" color="#818cf8" />
      </div>

      <div style={{ fontSize: 11, color: "#6B7A8D", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>Activity breakdown</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {[
          [`${activePct}%`, "Active members", "#00D4B1"],
          [`${members.filter(m => m.sessions >= 8).length}`, "On track", "#F59E0B"],
          [`${atRisk.length}`, "At risk", "#F87171"],
        ].map(([v, l, c]) => (
          <div key={l} style={{ flex: 1, background: "#1A2332", borderRadius: 12, padding: "10px 8px", textAlign: "center" }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: c }}>{v}</div>
            <div style={{ fontSize: 10, color: "#6B7A8D", marginTop: 3, lineHeight: 1.3 }}>{l}</div>
          </div>
        ))}
      </div>

      {atRisk.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: "#6B7A8D", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>Needs attention</div>
          {atRisk.slice(0, 3).map(m => (
            <div key={m.id} style={{ background: "#1F1010", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 12, padding: "12px 14px", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#1F1010", border: "1px solid #F87171", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#F87171", fontWeight: 600, flexShrink: 0 }}>{m.initials}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#E8EDF2" }}>{m.name}</div>
                  <div style={{ fontSize: 11, color: "#F87171" }}>{m.status}</div>
                </div>
                <Pill variant="red">At risk</Pill>
              </div>
            </div>
          ))}
        </>
      )}

      {total === 0 && (
        <div style={{ background: "#1A2332", borderRadius: 12, padding: "20px 16px", textAlign: "center" }}>
          <div style={{ fontSize: 13, color: "#6B7A8D", lineHeight: 1.6 }}>No members yet. Share your gym's sign-up link to get started.</div>
        </div>
      )}
    </div>
  );
}

function OwnerMembersTab() {
  const { members, loading } = useOwnerData();
  const [composeTo, setComposeTo] = useState(null);
  const [msgText, setMsgText] = useState("");
  const [sent, setSent] = useState(false);

  function sendMsg() { setSent(true); setTimeout(() => { setSent(false); setComposeTo(null); setMsgText(""); }, 1400); }

  if (loading) return <OwnerSpinner />;

  if (!members.length) {
    return (
      <div className="mq-fade" style={{ background: "#1A2332", borderRadius: 14, padding: "24px 16px", textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "#6B7A8D", lineHeight: 1.6 }}>No members have signed up yet.</div>
      </div>
    );
  }

  return (
    <div className="mq-fade">
      <div style={{ background: "#1A2332", borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
        {members.map((m, i) => (
          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: i < members.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: m.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: m.color, flexShrink: 0 }}>{m.initials}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#E8EDF2", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
              <div style={{ fontSize: 11, color: m.statusColor }}>{m.status}</div>
            </div>
            <div style={{ textAlign: "right", marginRight: 8, flexShrink: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: m.deltaColor }}>{m.delta}</div>
              <div style={{ fontSize: 10, color: "#6B7A8D" }}>weight</div>
            </div>
            <button onClick={() => { setComposeTo(m); setSent(false); setMsgText(""); }}
              style={{ width: 28, height: 28, borderRadius: 8, background: "#0D1623", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M1.5 6.5c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.4-.6 2.6-1.5 3.5L10.5 12H6.5c-2.76 0-5-2.24-5-5z" stroke="#00D4B1" strokeWidth="1" /></svg>
            </button>
          </div>
        ))}
      </div>

      {composeTo && (
        <div className="mq-fade" style={{ background: "#1A2332", borderRadius: 14, padding: "14px" }}>
          <div style={{ fontSize: 12, color: "#6B7A8D", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>Message</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, background: "#0D1623", borderRadius: 8, padding: "6px 10px", marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: "#6B7A8D" }}>To:</span>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: composeTo.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: composeTo.color, fontWeight: 600 }}>{composeTo.initials}</div>
            <span style={{ fontSize: 12, color: "#E8EDF2" }}>{composeTo.name}</span>
            <button onClick={() => setComposeTo(null)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#6B7A8D", cursor: "pointer", fontSize: 14 }}>×</button>
          </div>
          <textarea value={msgText} onChange={e => setMsgText(e.target.value)}
            placeholder={`Hey ${composeTo.name.split(" ")[0]} — we noticed you haven't logged in for a while. How's everything going? We're here if you need support 💪`}
            style={{ width: "100%", background: "#0D1623", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 12px", fontSize: 12, color: "#9BB3C8", outline: "none", fontFamily: "inherit", resize: "none", minHeight: 80, lineHeight: 1.5, marginBottom: 10 }} />
          <button onClick={sendMsg} style={{ width: "100%", background: sent ? "#003D35" : "#00D4B1", color: sent ? "#00D4B1" : "#003D35", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
            {sent ? "Sent ✓" : "Send message"}
          </button>
        </div>
      )}
    </div>
  );
}

function OwnerBrandingTab() {
  const { gymBranding, setGymBranding } = useApp();
  const [gymName, setGymName] = useState(gymBranding.name);
  const [brandColor, setBrandColor] = useState(gymBranding.accent);
  const [welcome, setWelcome] = useState(gymBranding.welcome || `Welcome to ${gymBranding.name}. Your personal AI trainer is ready. Let's get to work.`);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function save() {
    setSaving(true);
    setError(null);
    const ok = await sb.saveGymBranding("demo-gym", { name: gymName, accent: brandColor, welcome });
    setSaving(false);
    if (ok) {
      setGymBranding({ name: gymName, accent: brandColor, welcome, units: gymBranding.units });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      setError("Save failed — check your connection and try again.");
    }
  }

  return (
    <div className="mq-fade">
      <div style={{ background: "#1A2332", borderRadius: 14, padding: "14px", marginBottom: 16 }}>
        {/* Gym name */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#6B7A8D", marginBottom: 6 }}>Gym name</div>
          <input value={gymName} onChange={e => setGymName(e.target.value)}
            style={{ width: "100%", background: "#0D1623", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#E8EDF2", outline: "none", fontFamily: "inherit" }} />
        </div>
        {/* Brand color */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, color: "#6B7A8D", marginBottom: 6 }}>Brand color</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {["#00D4B1","#7C3AED","#EF4444","#F59E0B","#3B82F6"].map(c => (
              <button key={c} onClick={() => setBrandColor(c)} style={{ width: 28, height: 28, borderRadius: "50%", background: c, border: brandColor === c ? "3px solid #E8EDF2" : "2px solid transparent", cursor: "pointer", flexShrink: 0 }} />
            ))}
            <div style={{ fontSize: 12, color: "#9BB3C8", marginLeft: 4, fontFamily: "monospace" }}>{brandColor}</div>
          </div>
        </div>
        {/* Welcome message */}
        <div>
          <div style={{ fontSize: 11, color: "#6B7A8D", marginBottom: 6 }}>Welcome message</div>
          <textarea value={welcome} onChange={e => setWelcome(e.target.value)}
            style={{ width: "100%", background: "#0D1623", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#9BB3C8", outline: "none", fontFamily: "inherit", resize: "none", minHeight: 60, lineHeight: 1.5 }} />
        </div>
      </div>

      {/* Live preview */}
      <div style={{ fontSize: 11, color: "#6B7A8D", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>Live member preview</div>
      <div style={{ background: "#111827", borderRadius: 14, overflow: "hidden", marginBottom: 16, border: "1px solid #1E2D42" }}>
        <div style={{ background: "#111827", padding: "10px 14px", borderBottom: "1px solid #1E2D42", display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#003D35", border: `2px solid ${brandColor}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: brandColor }}>M</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#E8EDF2" }}>{gymName}</div>
            <div style={{ fontSize: 10, color: "#6B7A8D" }}>Powered by Morphiq</div>
          </div>
        </div>
        <div style={{ padding: "14px" }}>
          <div style={{ fontSize: 12, color: "#9BB3C8", marginBottom: 12, lineHeight: 1.5 }}>"{welcome}"</div>
          <div style={{ background: brandColor, borderRadius: 10, padding: "9px", fontSize: 12, fontWeight: 600, color: "#003D35", textAlign: "center" }}>Build my plan →</div>
        </div>
      </div>

      {error && <div style={{ fontSize: 12, color: "#F87171", marginBottom: 8, padding: "8px 12px", background: "#1F1010", borderRadius: 8 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={save} disabled={saving} style={{ flex: 2, background: saved ? "#003D35" : "#00D4B1", color: saved ? "#00D4B1" : "#003D35", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 600, cursor: saving ? "default" : "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}>
          {saving ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
        </button>
        <button onClick={() => { setGymName(gymBranding.name); setBrandColor(gymBranding.accent); setWelcome(gymBranding.welcome || ""); }} style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, padding: "10px", fontSize: 12, color: "#6B7A8D", cursor: "pointer", fontFamily: "inherit" }}>Reset</button>
      </div>
    </div>
  );
}

export default function GymOwnerDashboard() {
  const { navigate } = useApp();
  const [tab, setTab] = useState("overview");
  const tabs = [["overview","Overview"],["members","Members"],["branding","Branding"]];

  return (
    <div style={{ background: "#080E1A", borderRadius: 20, color: "#E8EDF2", fontFamily: "'DM Sans', system-ui, sans-serif", minHeight: "100dvh", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ background: "#0D1623", borderBottom: "1px solid #1E2D42", padding: "14px 16px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#E8EDF2" }}>Gym Dashboard</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#00D4B1" }} />
            <span style={{ fontSize: 11, color: "#6B7A8D" }}>Admin</span>
          </div>
        </div>
        {/* Tab bar */}
        <div style={{ display: "flex", gap: 0 }}>
          {tabs.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ flex: 1, padding: "8px 4px", background: "none", border: "none", borderBottom: `2px solid ${tab === id ? "#00D4B1" : "transparent"}`, fontSize: 12, fontWeight: tab === id ? 600 : 400, color: tab === id ? "#00D4B1" : "#6B7A8D", cursor: "pointer", fontFamily: "inherit", transition: "all .2s" }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: "16px 16px 0", overflowY: "auto" }}>
        {tab === "overview" && <OwnerOverviewTab />}
        {tab === "members"  && <OwnerMembersTab />}
        {tab === "branding" && <OwnerBrandingTab />}
      </div>

      {/* Footer back link */}
      <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={() => navigate("home")} style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 14px", fontSize: 12, color: "#6B7A8D", cursor: "pointer", fontFamily: "inherit" }}>← Member view</button>
        <div style={{ fontSize: 10, color: "#333", letterSpacing: ".5px" }}>POWERED BY MORPHIQ</div>
      </div>
    </div>
  );
}

