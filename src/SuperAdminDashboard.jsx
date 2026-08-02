import { useState, useEffect, useMemo } from "react";
import { useApp, sb, Spinner, MonthlyTrendLineChart } from "./shared.jsx";

// ── PRICING — must match api/create-checkout.js exactly ──────────────────
// If the real Stripe prices ever change, update both places at once.
const PLAN_PRICING = {
  starter: { label: "Starter", flat: 99, perMember: 2,    color: "#4C8DFF" },
  growth:  { label: "Growth",  flat: 199, perMember: 1.75, color: "#7C93B8" },
  scale:   { label: "Scale",   flat: 399, perMember: 1.5,  color: "#5FA8E0" },
};

function expectedRevenue(planTier, memberCount) {
  const plan = PLAN_PRICING[planTier];
  if (!plan) return 0;
  return plan.flat + plan.perMember * (memberCount || 0);
}

function StatusPill({ gym }) {
  if (gym.is_suspended) {
    return <span style={{ background: "#1F1010", color: "#F87171", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>Suspended</span>;
  }
  const status = gym.subscription_status || "trialing";
  const map = {
    active:   { bg: "#0A1A14", color: "#1D9E75", label: "Active" },
    trialing: { bg: "#0A1628", color: "#4C8DFF", label: "Trialing" },
    past_due: { bg: "#2D1A00", color: "#F59E0B", label: "Past due" },
    canceled: { bg: "#1F1010", color: "#F87171", label: "Canceled" },
  };
  const s = map[status] || map.trialing;
  return <span style={{ background: s.bg, color: s.color, borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600 }}>{s.label}</span>;
}

function GymCard({ gym, memberCount, activeCount, onToggleSuspend, onSaveNotes }) {
  const [notes, setNotes] = useState(gym.admin_notes || "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [confirmingLock, setConfirmingLock] = useState(false);
  const plan = PLAN_PRICING[gym.plan_tier] || { label: gym.plan_tier || "Unknown", color: "#6E7480" };
  const revenue = expectedRevenue(gym.plan_tier, memberCount);
  const joined = gym.created_at ? new Date(gym.created_at).toLocaleDateString() : "—";

  async function handleNotesBlur() {
    if (notes === (gym.admin_notes || "")) return;
    setSavingNotes(true);
    await onSaveNotes(gym.gym_id, notes);
    setSavingNotes(false);
  }

  return (
    <div style={{ background: "#212429", borderRadius: 14, padding: "14px 16px", marginBottom: 10, border: gym.is_suspended ? "1px solid rgba(248,113,113,0.3)" : "1px solid transparent" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#EDEEF0" }}>{gym.name || gym.gym_id}</div>
          <div style={{ fontSize: 11, color: "#6E7480", marginTop: 2 }}>{gym.gym_id} · {gym.owner_email}</div>
        </div>
        <StatusPill gym={gym} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 12 }}>
        <div style={{ background: "#171920", borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ fontSize: 10, color: "#6E7480" }}>Plan</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: plan.color }}>{plan.label}</div>
        </div>
        <div style={{ background: "#171920", borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ fontSize: 10, color: "#6E7480" }}>Members</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#EDEEF0" }}>{memberCount}</div>
        </div>
        <div style={{ background: "#0A1628", border: "1px solid rgba(76,141,255,0.15)", borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ fontSize: 10, color: "#6E7480" }}>Active members</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#4C8DFF" }}>{activeCount?.active30 || 0}</div>
        </div>
        <div style={{ background: "#0A1628", borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ fontSize: 10, color: "#6E7480" }}>Expected/mo</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#4C8DFF" }}>${revenue.toFixed(2)}</div>
        </div>
        <div style={{ background: "#171920", borderRadius: 8, padding: "8px 10px" }}>
          <div style={{ fontSize: 10, color: "#6E7480" }}>Joined</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#EDEEF0" }}>{joined}</div>
        </div>
      </div>

      <textarea
        value={notes}
        onChange={e => setNotes(e.target.value)}
        onBlur={handleNotesBlur}
        placeholder="Private notes about this gym (only you see this)..."
        style={{ width: "100%", minHeight: 44, background: "#171920", border: "1px solid #2B2E34", borderRadius: 8, padding: "8px 10px", fontSize: 12, color: "#9BA0AA", fontFamily: "inherit", resize: "vertical", marginBottom: 10 }}
      />
      {savingNotes && <div style={{ fontSize: 10, color: "#6E7480", marginTop: -6, marginBottom: 8 }}>Saving note…</div>}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        {confirmingLock ? (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 11, color: "#9BA0AA" }}>
              {gym.is_suspended ? "Unlock this gym?" : "Lock this gym out immediately?"}
            </span>
            <button onClick={() => { onToggleSuspend(gym.gym_id, !gym.is_suspended); setConfirmingLock(false); }}
              style={{ background: gym.is_suspended ? "#4C8DFF" : "#F87171", color: "#171920", border: "none", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
              Yes, {gym.is_suspended ? "unlock" : "lock"}
            </button>
            <button onClick={() => setConfirmingLock(false)}
              style={{ background: "none", border: "1px solid #2B2E34", borderRadius: 8, padding: "6px 12px", fontSize: 11, color: "#6E7480", cursor: "pointer", fontFamily: "inherit" }}>
              Cancel
            </button>
          </div>
        ) : (
          <button onClick={() => setConfirmingLock(true)}
            style={{ background: "none", border: `1px solid ${gym.is_suspended ? "rgba(76,141,255,0.3)" : "rgba(248,113,113,0.3)"}`, borderRadius: 8, padding: "6px 14px", fontSize: 11, fontWeight: 600, color: gym.is_suspended ? "#4C8DFF" : "#F87171", cursor: "pointer", fontFamily: "inherit" }}>
            {gym.is_suspended ? "Unlock gym" : "Lock gym"}
          </button>
        )}
      </div>
    </div>
  );
}

function SuperAdminDashboard() {
  const { signOut } = useApp();
  const [gyms, setGyms] = useState([]);
  const [memberCounts, setMemberCounts] = useState({});
  const [activeCounts, setActiveCounts] = useState({});
  const [monthlyActive, setMonthlyActive] = useState([]);
  const [monthlyTotal, setMonthlyTotal] = useState([]);
  const [activity, setActivity] = useState({ active7: 0, active30: 0 });
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState("revenue");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError(false);
      const [gymRows, counts, activitySummary, activeByGym, monthly, monthlyTotalMembers, recentMembers] = await Promise.all([
        sb.getAllGyms(),
        sb.getMemberCountsByGym(),
        sb.getPlatformActivitySummary(),
        sb.getActiveMemberCountsByGym(),
        sb.getMonthlyActiveMembers(),
        sb.getMonthlyTotalMembers(),
        sb.getRecentMembers(),
      ]);
      if (cancelled) return;
      setGyms(gymRows);
      setMemberCounts(counts);
      setActivity(activitySummary);
      setActiveCounts(activeByGym);
      setMonthlyActive(monthly);
      setMonthlyTotal(monthlyTotalMembers);
      setMembers(recentMembers);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  async function handleToggleSuspend(gymId, suspended) {
    // Optimistic update so the switch feels instant — reverted if the save fails.
    setGyms(prev => prev.map(g => g.gym_id === gymId ? { ...g, is_suspended: suspended } : g));
    const ok = await sb.setGymSuspended(gymId, suspended);
    if (!ok) {
      setGyms(prev => prev.map(g => g.gym_id === gymId ? { ...g, is_suspended: !suspended } : g));
      alert("Couldn't save that change — the is_suspended column may not exist on the gyms table yet.");
    }
  }

  async function handleSaveNotes(gymId, notes) {
    setGyms(prev => prev.map(g => g.gym_id === gymId ? { ...g, admin_notes: notes } : g));
    await sb.saveGymNotes(gymId, notes);
  }

  const filtered = useMemo(() => {
    let list = gyms.slice();
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(g => (g.name || "").toLowerCase().includes(q) || (g.gym_id || "").toLowerCase().includes(q));
    }
    if (statusFilter !== "all") {
      if (statusFilter === "suspended") list = list.filter(g => g.is_suspended);
      else list = list.filter(g => !g.is_suspended && (g.subscription_status || "trialing") === statusFilter);
    }
    list.sort((a, b) => {
      if (sortBy === "revenue") return expectedRevenue(b.plan_tier, memberCounts[b.gym_id]) - expectedRevenue(a.plan_tier, memberCounts[a.gym_id]);
      if (sortBy === "status") return (a.subscription_status || "").localeCompare(b.subscription_status || "");
      if (sortBy === "date") return new Date(b.created_at || 0) - new Date(a.created_at || 0);
      return 0;
    });
    return list;
  }, [gyms, memberCounts, search, statusFilter, sortBy]);

  const totalRevenue = gyms.reduce((sum, g) => sum + expectedRevenue(g.plan_tier, memberCounts[g.gym_id]), 0);
  const activeGymCount = gyms.filter(g => !g.is_suspended).length;
  const suspendedCount = gyms.filter(g => g.is_suspended).length;
  const totalMembers = Object.values(memberCounts).reduce((sum, c) => sum + c, 0);

  const selectStyle = { background: "#212429", border: "1px solid #2B2E34", borderRadius: 8, padding: "7px 10px", fontSize: 12, color: "#EDEEF0", fontFamily: "inherit" };

  return (
    <div style={{ background: "#121316", borderRadius: 20, color: "#EDEEF0", fontFamily: "'Inter', system-ui, sans-serif", minHeight: "100dvh", padding: "16px 16px 40px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Platform Admin</div>
          <div style={{ fontSize: 11, color: "#6E7480" }}>Every gym on Hypergentiq, in one place</div>
        </div>
        <button onClick={signOut} style={{ background: "none", border: "1px solid #2B2E34", borderRadius: 8, padding: "6px 12px", fontSize: 11, color: "#6E7480", cursor: "pointer", fontFamily: "inherit" }}>
          Log out
        </button>
      </div>

      {loading ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "48px 0" }}>
          <Spinner />
          <div style={{ fontSize: 12, color: "#6E7480" }}>Loading gyms…</div>
        </div>
      ) : (
        <>
          {/* Top summary row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, margin: "18px 0" }}>
            <div style={{ background: "#0A1628", border: "1px solid rgba(76,141,255,0.2)", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#4C8DFF" }}>${totalRevenue.toFixed(2)}</div>
              <div style={{ fontSize: 11, color: "#6E7480", marginTop: 2 }}>Expected monthly revenue</div>
            </div>
            <div style={{ background: "#212429", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{gyms.length}</div>
              <div style={{ fontSize: 11, color: "#6E7480", marginTop: 2 }}>Total gyms</div>
            </div>
            <div style={{ background: "#212429", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#7C93B8" }}>{activeGymCount}</div>
              <div style={{ fontSize: 11, color: "#6E7480", marginTop: 2 }}>Not locked</div>
            </div>
            <div style={{ background: "#212429", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#F87171" }}>{suspendedCount}</div>
              <div style={{ fontSize: 11, color: "#6E7480", marginTop: 2 }}>Locked out</div>
            </div>
          </div>

          {/* Membership growth vs. engagement — last 12 calendar months, platform-wide */}
          <div style={{ background: "#212429", borderRadius: 12, padding: "14px 16px", marginBottom: 20 }}>
            <div style={{ fontSize: 11, color: "#6E7480", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10 }}>
              Membership growth — last 12 months
            </div>
            <MonthlyTrendLineChart series={[
              { label: "Total members", color: "#7C93B8", data: monthlyTotal },
              { label: "Active members", color: "#4C8DFF", data: monthlyActive },
            ]} />
          </div>

          {/* Platform-wide usage — how many people, and how many are still coming back */}
          <div style={{ fontSize: 11, color: "#6E7480", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>Platform usage</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
            <div style={{ background: "#212429", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{totalMembers}</div>
              <div style={{ fontSize: 11, color: "#6E7480", marginTop: 2 }}>Total members, all gyms</div>
            </div>
            <div style={{ background: "#0A1628", border: "1px solid rgba(76,141,255,0.2)", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#4C8DFF" }}>{activity.active7}</div>
              <div style={{ fontSize: 11, color: "#6E7480", marginTop: 2 }}>Logged a workout, last 7 days</div>
            </div>
            <div style={{ background: "#212429", borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#7C93B8" }}>{activity.active30}</div>
              <div style={{ fontSize: 11, color: "#6E7480", marginTop: 2 }}>Logged a workout, last 30 days</div>
            </div>
          </div>

          {/* Recent signups — every member across every gym, newest first, so
              you can verify test members actually signed up and see who's
              come back this week. Counts a logged workout in the last 7
              days as "active" — meal-only usage isn't reflected here yet. */}
          <div style={{ fontSize: 11, color: "#6E7480", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 8 }}>Recent signups</div>
          <div style={{ background: "#212429", borderRadius: 12, marginBottom: 20, maxHeight: 340, overflowY: "auto" }}>
            {members.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px 0", color: "#6E7480", fontSize: 13 }}>No members yet.</div>
            ) : (
              members.map(m => (
                <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", borderBottom: "1px solid #171920" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#EDEEF0" }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: "#6E7480", marginTop: 2 }}>{m.gymName} · joined {m.joined ? new Date(m.joined).toLocaleDateString() : "—"}</div>
                  </div>
                  <span style={{
                    background: m.activeThisWeek ? "#0A1628" : "#212429",
                    color: m.activeThisWeek ? "#4C8DFF" : "#6E7480",
                    border: m.activeThisWeek ? "1px solid rgba(76,141,255,0.2)" : "1px solid #2B2E34",
                    borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 600,
                  }}>
                    {m.activeThisWeek ? "Logged a workout this week" : "No workout this week"}
                  </span>
                </div>
              ))
            )}
          </div>

          {/* Search / filter / sort controls */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by gym name or ID..."
              style={{ ...selectStyle, flex: 1, minWidth: 180 }}
            />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={selectStyle}>
              <option value="all">All statuses</option>
              <option value="trialing">Trialing</option>
              <option value="active">Active</option>
              <option value="past_due">Past due</option>
              <option value="canceled">Canceled</option>
              <option value="suspended">Suspended</option>
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={selectStyle}>
              <option value="revenue">Sort: Revenue</option>
              <option value="status">Sort: Status</option>
              <option value="date">Sort: Join date</option>
            </select>
          </div>

          {/* Gym list */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#6E7480", fontSize: 13 }}>
              {gyms.length === 0 ? "No gyms found yet." : "No gyms match your search/filter."}
            </div>
          ) : (
            filtered.map(gym => (
              <GymCard
                key={gym.gym_id}
                gym={gym}
                memberCount={memberCounts[gym.gym_id] || 0}
                activeCount={activeCounts[gym.gym_id]}
                onToggleSuspend={handleToggleSuspend}
                onSaveNotes={handleSaveNotes}
              />
            ))
          )}
        </>
      )}

      <div style={{ textAlign: "center", fontSize: 10, color: "#333", letterSpacing: ".5px", paddingTop: 20 }}>POWERED BY HYPERGENTIQ</div>
    </div>
  );
}

export { SuperAdminDashboard };
