import { useApp, theme, sb, SUPABASE_URL, SB_HEADERS, Icon } from "./shared.jsx";

// ─── Training style: "Coach me" vs "Log my own" (Session 53) ───────────────
// Lives in its own file (not shared.jsx) because shared.jsx is ~26 lines
// from the 3,800-line hard limit. Everything here is small and reused by
// Morphiq.jsx (profile loading + Settings), OnboardingScreen.jsx,
// LogWorkoutScreen.jsx and WhatsNew.jsx.
//
// Database (added Session 53, profiles table):
//   training_mode    text    'coach' | 'log'   (default 'coach' -- existing members unchanged)
//   nudges_enabled   boolean                   (default false)
//   routines         jsonb   [{ id, name, exercises: [name], lastDone }]  (default [])
//   last_seen_update text    id of the last "What's new" pop-up dismissed

// Saves any of the columns above in one PATCH. Same pattern as
// sb.saveExerciseUnits() in shared.jsx. Callers fire-and-forget it
// (.catch(() => {})) so a failed save never blocks or crashes the UI.
async function saveTrainingPrefs(supabaseUserId, patch) {
  try {
    if (!supabaseUserId) return false;
    const profileId = await sb.getProfileId(supabaseUserId);
    if (!profileId) return false;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${profileId}`, {
      method: "PATCH",
      headers: SB_HEADERS(),
      body: JSON.stringify(patch),
    });
    return res.ok;
  } catch { return false; }
}

// Maps a profiles row onto the app's user object fields. Spread into the
// user object wherever Morphiq.jsx builds it from a profile.
function profileTrainingFields(profile) {
  return {
    trainingMode: profile?.training_mode === "log" ? "log" : "coach",
    nudgesEnabled: !!profile?.nudges_enabled,
    routines: Array.isArray(profile?.routines) ? profile.routines : [],
    lastSeenUpdate: profile?.last_seen_update || null,
    createdAt: profile?.created_at || null,
  };
}

const isLogMode = (user) => user?.trainingMode === "log";

function ToggleSwitch({ on, onClick, label, accent }) {
  return (
    <button onClick={onClick} aria-label={label} aria-pressed={on}
      style={{ width: 52, height: 32, borderRadius: 16, border: "none", background: on ? accent : "#3A3D44", position: "relative", cursor: "pointer", flexShrink: 0, transition: "background .2s" }}>
      <span style={{ position: "absolute", top: 3, left: on ? 23 : 3, width: 26, height: 26, borderRadius: "50%", background: "#FFFFFF", boxShadow: "0 1px 3px rgba(0,0,0,0.4)", transition: "left .2s" }} />
    </button>
  );
}

// Settings section shown on the Profile screen. Switching modes is instant
// and only flips a setting -- no workout history, chart or PR is touched.
function TrainingStyleSection({ onShowWhatsNew }) {
  const { user, setUser, supabaseUser, gymBranding } = useApp();
  const a = gymBranding.accent;
  const logMode = isLogMode(user);

  function update(fields, dbPatch) {
    setUser(prev => ({ ...prev, ...fields }));
    saveTrainingPrefs(supabaseUser?.id, dbPatch).catch(() => {});
  }

  const segBtn = (active) => ({
    height: 44, borderRadius: 10, border: "none", background: active ? a : "transparent",
    color: active ? "#0B1E3D" : theme.textMuted, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
  });

  return (
    <>
      <div style={theme.sL}>Training</div>
      <div style={{ background: "#212429", borderRadius: 14, padding: "14px", marginBottom: 10 }}>
        <div style={{ fontSize: 15, fontWeight: 600, color: theme.text, marginBottom: 10 }}>Training style</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, background: "#171920", borderRadius: 12, padding: 4, marginBottom: 10 }}>
          <button onClick={() => logMode && update({ trainingMode: "coach" }, { training_mode: "coach" })} aria-pressed={!logMode} style={segBtn(!logMode)}>Coach me</button>
          <button onClick={() => !logMode && update({ trainingMode: "log" }, { training_mode: "log" })} aria-pressed={logMode} style={segBtn(logMode)}>Log my own</button>
        </div>
        <div style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.5 }}>
          {logMode
            ? "You run your own routine. We'll remember what you did last time and keep all your history."
            : "We'll build your workouts, suggest weights and reps, and bump the weight up when you're ready."}
        </div>
      </div>

      {logMode && (
        <div style={{ background: "#212429", borderRadius: 14, padding: "14px", marginBottom: 10, display: "flex", gap: 14, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: theme.text, marginBottom: 4 }}>Light nudges</div>
            <div style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.5 }}>Now and then, offer a suggested weight — like when you're coming back after a break. You can always ignore it.</div>
          </div>
          <ToggleSwitch on={!!user.nudgesEnabled} accent={a} label="Light nudges"
            onClick={() => update({ nudgesEnabled: !user.nudgesEnabled }, { nudges_enabled: !user.nudgesEnabled })} />
        </div>
      )}

      <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "2px 4px 12px" }}>
        <Icon name="check" size={14} color={theme.textMuted} style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ fontSize: 12, color: theme.textMuted, lineHeight: 1.5 }}>Switching styles never touches your history. Every workout and chart stays exactly where it is.</div>
      </div>

      {onShowWhatsNew && (
        <button onClick={onShowWhatsNew}
          style={{ width: "100%", background: "#212429", border: "none", borderRadius: 14, padding: "0 14px", height: 52, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", fontFamily: "inherit", marginBottom: 16 }}>
          <span style={{ fontSize: 15, color: theme.text, display: "flex", alignItems: "center", gap: 8 }}><Icon name="sparkle" size={15} color={a} />What's new</span>
          <Icon name="arrow-right" size={15} color={theme.textMuted} />
        </button>
      )}
    </>
  );
}

export { saveTrainingPrefs, profileTrainingFields, isLogMode, ToggleSwitch, TrainingStyleSection };
