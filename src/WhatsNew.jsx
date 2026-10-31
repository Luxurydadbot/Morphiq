import { useState, useEffect } from "react";
import { useApp, theme, Icon } from "./shared.jsx";
import { saveTrainingPrefs } from "./TrainingStyle.jsx";

// ─── "What's new" pop-up (Session 53) ──────────────────────────────────────
// Shown ONCE per update per member, on the Home screen after login (never
// mid-workout), in the app's own style. Closes with the X or "Got it".
//
// HOW TO ANNOUNCE A NEW UPDATE: add a new entry to the TOP of APP_UPDATES
// with a new unique id and today's date. Keep it to 3 items max, one
// sentence each, and only for changes members would actually notice
// (behind-the-scenes fixes don't get an entry). Bryant approves the wording
// before it ships.
//
// Who sees it: members whose account was created BEFORE the update's date
// and who haven't dismissed this update yet (profiles.last_seen_update).
// Brand-new members skip it -- they have no "before" to compare against.
const APP_UPDATES = [
  {
    id: "2026-11-log-mode",
    date: "2026-10-31",
    label: "November 2026",
    items: [
      { icon: "clipboard", title: "Log your own workouts", text: "Have your own routine? Switch to “Log my own” in your profile and we'll just remember what you lifted last time." },
      { icon: "refresh", title: "Easier comebacks", text: "Been away a while? In log mode you'll see how long it's been since each exercise, so you can ease back in." },
      { icon: "trending-up", title: "A recap after every exercise", text: "Finish an exercise to see today vs. last time, set by set, plus a coaching tip." },
    ],
  },
];
const LATEST_UPDATE = APP_UPDATES[0];

function shouldShowWhatsNew(user) {
  if (!user || !LATEST_UPDATE) return false;
  if (user.lastSeenUpdate === LATEST_UPDATE.id) return false;
  // Only show when we KNOW the member predates the update. Members who just
  // signed up in this session have no createdAt yet -- they skip it.
  if (!user.createdAt) return false;
  return String(user.createdAt).slice(0, 10) < LATEST_UPDATE.date;
}

function WhatsNewPopup({ open, onClose, update = LATEST_UPDATE }) {
  const { gymBranding } = useApp();
  const a = gymBranding.accent;
  if (!open || !update) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="What's new"
      style={{ position: "fixed", inset: 0, background: "rgba(6,7,9,0.72)", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, zIndex: 40 }}>
      <div className="mq-fade" style={{ width: "100%", maxWidth: 400, background: "#1C1E23", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, padding: 20, boxShadow: "0 20px 50px rgba(0,0,0,0.5)", maxHeight: "90dvh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 2 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "1.2px", fontWeight: 600, color: a, textTransform: "uppercase", marginBottom: 4 }}>What's new</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: theme.text }}>A few updates for you</div>
          </div>
          <button onClick={onClose} aria-label="Close"
            style={{ width: 44, height: 44, margin: "-8px -8px 0 0", borderRadius: 10, background: "transparent", border: "none", color: theme.textMuted, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            <Icon name="x" size={20} />
          </button>
        </div>
        <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 18 }}>{update.label}</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 22 }}>
          {update.items.slice(0, 3).map(item => (
            <div key={item.title} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: "#172338", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: a }}>
                <Icon name={item.icon} size={18} />
              </div>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: theme.text, marginBottom: 2 }}>{item.title}</div>
                <div style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.45 }}>{item.text}</div>
              </div>
            </div>
          ))}
        </div>

        <button onClick={onClose}
          style={{ width: "100%", height: 50, borderRadius: 12, background: a, color: "#0B1E3D", border: "none", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>Got it</button>
        <div style={{ textAlign: "center", fontSize: 12, color: theme.textMuted, marginTop: 12 }}>You can see this again anytime in your profile.</div>
      </div>
    </div>
  );
}

// Drop-in for the Home screen: decides on its own whether to show, and
// remembers the dismissal on the member's account (fire-and-forget).
function WhatsNewAuto() {
  const { user, setUser, supabaseUser } = useApp();
  const [open, setOpen] = useState(() => shouldShowWhatsNew(user));
  useEffect(() => {
    if (shouldShowWhatsNew(user)) setOpen(true);
  }, [user?.createdAt, user?.lastSeenUpdate]);

  function close() {
    setOpen(false);
    setUser(prev => ({ ...prev, lastSeenUpdate: LATEST_UPDATE.id }));
    saveTrainingPrefs(supabaseUser?.id, { last_seen_update: LATEST_UPDATE.id }).catch(() => {});
  }
  return <WhatsNewPopup open={open} onClose={close} />;
}

export { APP_UPDATES, LATEST_UPDATE, shouldShowWhatsNew, WhatsNewPopup, WhatsNewAuto };
