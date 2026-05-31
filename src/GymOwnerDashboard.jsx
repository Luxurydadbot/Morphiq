import { useState, useEffect, useRef } from "react";
import { useApp, sb, Pill, Spinner, MicIcon, VoiceBtn, Layout, NavIcon,
         SUPABASE_URL, SUPABASE_ANON, SB_HEADERS, SB_GET } from "./Morphiq.jsx";

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
      <Spinner />
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

function OwnerInviteTab() {
  const gymId = "demo-gym";
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
      <div style={{ background: "#1A2332", borderRadius: 14, padding: "16px 14px", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#E8EDF2", marginBottom: 6 }}>Member invite link</div>
        <div style={{ fontSize: 12, color: "#9BB3C8", lineHeight: 1.6, marginBottom: 14 }}>
          Share this link with new members. When they open it, they'll land directly on your branded gym sign-up — no searching for Morphiq separately.
        </div>
        <div style={{ background: "#0D1623", border: "1px solid #1E2D42", borderRadius: 10, padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, fontSize: 11, color: "#9BB3C8", fontFamily: "monospace", wordBreak: "break-all", lineHeight: 1.5 }}>{inviteUrl}</div>
          <button onClick={copyLink} style={{ flexShrink: 0, background: copied ? "#003D35" : "#00D4B1", border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: copied ? "#00D4B1" : "#003D35", cursor: "pointer", fontFamily: "inherit", transition: "all .2s" }}>
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
        <div style={{ fontSize: 10, color: "#6B7A8D", lineHeight: 1.6 }}>
          Members who sign up via this link are automatically assigned to your gym. Their plan will show your branding.
        </div>
      </div>

      <div style={{ background: "#1A2332", borderRadius: 14, padding: "14px", marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: "#6B7A8D", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>How it works</div>
        {[
          ["1", "Copy the link above and share it via text, email, or your gym's social media."],
          ["2", "Member opens the link → sees your gym name and branding on the sign-in screen."],
          ["3", "They sign up with their email → get a 6-digit code → complete the quiz."],
          ["4", "Their plan is built by Morphiq AI and appears in the Members tab of your dashboard."],
        ].map(([num, text]) => (
          <div key={num} style={{ display: "flex", gap: 10, marginBottom: 10, alignItems: "flex-start" }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#003D35", border: "1px solid rgba(0,212,177,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#00D4B1", flexShrink: 0 }}>{num}</div>
            <div style={{ fontSize: 12, color: "#9BB3C8", lineHeight: 1.6 }}>{text}</div>
          </div>
        ))}
      </div>

      <div style={{ background: "#0F1922", border: "1px solid rgba(0,212,177,0.1)", borderRadius: 12, padding: "12px 14px" }}>
        <div style={{ fontSize: 11, color: "#00D4B1", fontWeight: 600, marginBottom: 4 }}>Tip: QR code</div>
        <div style={{ fontSize: 11, color: "#6B7A8D", lineHeight: 1.6 }}>
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
      color: "#00D4B1",
      bg: "#003D35",
      border: "rgba(0,212,177,0.3)",
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
      color: "#A78BFA",
      bg: "#1E1040",
      border: "rgba(167,139,250,0.4)",
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
      color: "#F59E0B",
      bg: "#2D1A00",
      border: "rgba(245,158,11,0.3)",
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
    <div style={{ background: "#080E1A", borderRadius: 20, color: "#E8EDF2", fontFamily: "'DM Sans', system-ui, sans-serif", minHeight: "100dvh", overflow: "hidden" }}>
      <div style={{ background: "#0D1623", borderBottom: "1px solid #1E2D42", padding: "14px 16px", display: "flex", alignItems: "center", gap: 10 }}>
        <button onClick={() => navigate("owner")} style={{ background: "none", border: "none", color: "#6B7A8D", cursor: "pointer", fontSize: 18, padding: 0 }}>←</button>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#E8EDF2" }}>Pricing Plans</div>
      </div>

      <div style={{ padding: "16px 16px 80px", overflowY: "auto" }}>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: "#9BB3C8", lineHeight: 1.6 }}>
            All plans include a <span style={{ color: "#00D4B1", fontWeight: 600 }}>14-day free trial</span>. No credit card required to start.
          </div>
          <div style={{ fontSize: 11, color: "#6B7A8D", marginTop: 4 }}>
            Billing is monthly. "Active member" = logged at least one workout that month.
          </div>
        </div>

        {plans.map(plan => (
          <div key={plan.name} style={{ background: plan.bg, border: `1px solid ${plan.border}`, borderRadius: 16, padding: "16px 14px", marginBottom: 12, position: "relative" }}>
            {plan.badge && (
              <div style={{ position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: plan.color, color: plan.name === "Growth" ? "#1E1040" : "#2D1A00", borderRadius: 20, padding: "2px 12px", fontSize: 10, fontWeight: 700, whiteSpace: "nowrap" }}>
                {plan.badge}
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: plan.color }}>{plan.name}</div>
                <div style={{ fontSize: 11, color: "#9BB3C8", marginTop: 2 }}>Base monthly fee</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: "#E8EDF2", lineHeight: 1 }}>{plan.price}<span style={{ fontSize: 12, color: "#9BB3C8", fontWeight: 400 }}>/mo</span></div>
                <div style={{ fontSize: 11, color: plan.color, marginTop: 2 }}>+ {plan.perMember} per active member</div>
              </div>
            </div>
            <div style={{ borderTop: `1px solid rgba(255,255,255,0.06)`, paddingTop: 10 }}>
              {plan.features.map(f => (
                <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 0" }}>
                  <div style={{ width: 14, height: 14, borderRadius: "50%", background: plan.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#080E1A", fontWeight: 700, flexShrink: 0 }}>✓</div>
                  <span style={{ fontSize: 12, color: "#C0C0C0" }}>{f}</span>
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
                  style={{ width: "100%", background: "rgba(0,0,0,0.3)", border: `1px solid ${plan.color}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "#E8EDF2", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                />
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button onClick={() => setLeadPlan(null)} style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, padding: "9px", fontSize: 12, color: "#9BB3C8", cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
                  <button onClick={submitLead} disabled={!leadEmail.includes("@") || leadSaving} style={{ flex: 2, background: plan.color, color: "#080E1A", border: "none", borderRadius: 10, padding: "9px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: leadSaving ? 0.6 : 1 }}>
                    {leadSaving ? "Saving..." : "Start free trial →"}
                  </button>
                </div>
              </div>
            ) : leadPlan === plan.name && leadSent ? (
              <div style={{ marginTop: 14, background: "rgba(0,0,0,0.3)", border: `1px solid ${plan.color}`, borderRadius: 10, padding: "12px", textAlign: "center" }}>
                <div style={{ fontSize: 14, color: plan.color, fontWeight: 700, marginBottom: 4 }}>✓ You're on the list!</div>
                <div style={{ fontSize: 11, color: "#9BB3C8" }}>We'll reach out to {leadEmail} within 24 hours to get you set up.</div>
              </div>
            ) : (
              <button onClick={() => { setLeadPlan(plan.name); setLeadEmail(""); setLeadSent(false); }} style={{ width: "100%", background: plan.color, color: "#080E1A", border: "none", borderRadius: 10, padding: "10px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginTop: 14 }}>
                Start {plan.name} trial →
              </button>
            )}
          </div>
        ))}

        <div style={{ background: "#1A2332", borderRadius: 14, padding: "14px", textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#E8EDF2", marginBottom: 6 }}>Need something custom?</div>
          <div style={{ fontSize: 12, color: "#9BB3C8", marginBottom: 10, lineHeight: 1.6 }}>
            Enterprise plans available for gym chains, franchises, and large studios. Let's talk.
          </div>
          <div style={{ fontSize: 12, color: "#00D4B1" }}>hello@morphiq.app</div>
        </div>
      </div>

      <div style={{ textAlign: "center", fontSize: 10, color: "#333", letterSpacing: ".5px", padding: "8px 0 12px" }}>POWERED BY MORPHIQ</div>
    </div>
  );
}


function OwnerUsageTab() {
  const { gymBranding } = useApp();
  const a = "#00D4B1";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const month = new Date().toISOString().slice(0, 7);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(
          `https://uvnyjegmhsztdednjclb.supabase.co/rest/v1/ai_usage?month=eq.${month}&order=created_at.desc&limit=200`,
          { headers: { "apikey": "sb_publishable_uMj3nFhXSfk4s9Upa4mkuw_nwFvBCll", "Authorization": "Bearer sb_publishable_uMj3nFhXSfk4s9Upa4mkuw_nwFvBCll" } }
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

  const card = { background: "#1A2332", borderRadius: 12, padding: "12px 14px", marginBottom: 10 };
  const dim = { fontSize: 11, color: "#6B7A8D" };
  const big = { fontSize: 22, fontWeight: 700, color: a };

  return (
    <div style={{ paddingBottom: 80 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#E8EDF2", marginBottom: 14 }}>AI Usage — {month}</div>
      {loading ? <div style={{ ...dim, textAlign: "center", padding: 20 }}>Loading...</div> : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <div style={card}><div style={big}>{totalCalls}</div><div style={dim}>Total AI calls</div></div>
            <div style={{ ...card, background: "#0A1A14", border: "1px solid rgba(0,212,177,0.2)" }}><div style={big}>${estCost}</div><div style={dim}>Est. cost this month</div></div>
            <div style={card}><div style={{ fontSize: 18, fontWeight: 700, color: "#A78BFA" }}>{totalTokens.toLocaleString()}</div><div style={dim}>Tokens used</div></div>
            <div style={card}><div style={{ fontSize: 18, fontWeight: 700, color: "#F59E0B" }}>{chatCalls}</div><div style={dim}>Chat messages</div></div>
          </div>
          <div style={card}>
            <div style={{ fontSize: 11, color: "#6B7A8D", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Usage by feature</div>
            {[["AI Chat", chatCalls, a], ["Meal parsing", mealCalls, "#F59E0B"], ["Plan generation", totalCalls - chatCalls - mealCalls, "#A78BFA"]].map(([label, count, color]) => (
              <div key={label} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#9BB3C8", marginBottom: 4 }}>
                  <span>{label}</span><span style={{ color }}>{count} calls</span>
                </div>
                <div style={{ height: 4, background: "#0D1623", borderRadius: 2 }}>
                  <div style={{ height: 4, borderRadius: 2, background: color, width: totalCalls ? `${Math.round((count/totalCalls)*100)}%` : "0%", transition: "width .5s" }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ ...card, background: "#0D1623" }}>
            <div style={{ fontSize: 11, color: "#6B7A8D", marginBottom: 4 }}>Member limit</div>
            <div style={{ fontSize: 13, color: "#E8EDF2" }}>50 AI chat messages per member per month</div>
            <div style={{ fontSize: 11, color: "#6B7A8D", marginTop: 4 }}>Resets on the 1st of each month</div>
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
        {tab === "invite"   && <OwnerInviteTab />}
        {tab === "branding" && <OwnerBrandingTab />}
        {tab === "usage"    && <OwnerUsageTab />}
      </div>

      {/* Footer back link */}
      <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button onClick={() => navigate("home")} style={{ background: "none", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, padding: "6px 14px", fontSize: 12, color: "#6B7A8D", cursor: "pointer", fontFamily: "inherit" }}>← Member view</button>
        <button onClick={() => navigate("pricing")} style={{ background: "none", border: "1px solid rgba(167,139,250,0.3)", borderRadius: 8, padding: "6px 14px", fontSize: 12, color: "#A78BFA", cursor: "pointer", fontFamily: "inherit" }}>Plans & pricing →</button>
      </div>
      <div style={{ textAlign: "center", fontSize: 10, color: "#333", letterSpacing: ".5px", padding: "0 0 12px" }}>POWERED BY MORPHIQ</div>
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
      <div style={{ fontSize: 9, color: "#333", letterSpacing: ".5px", marginTop: 20 }}>POWERED BY MORPHIQ</div>
    </div>
  );
}

export { GymOwnerDashboard, PricingScreen, OwnerUsageTab };
