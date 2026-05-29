import { useApp } from "../utils/context";
import { theme } from "../utils/theme";

// ─── MIC ICON ─────────────────────────────────────────────────────────────────
export function MicIcon({ size = 22, color = "#003D35" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="8" y="2" width="8" height="12" rx="4" fill={color} />
      <path d="M5 12c0 3.866 3.134 7 7 7s7-3.134 7-7" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="19" x2="12" y2="22" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <line x1="9" y1="22" x2="15" y2="22" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ─── VOICE BUTTON ─────────────────────────────────────────────────────────────
export function VoiceBtn({ listening = false, onPress, size = 56 }) {
  const { gymBranding } = useApp();
  const a = gymBranding.accent;
  return (
    <button onClick={onPress} className={listening ? "mq-mic-pulse" : ""}
      style={{ width:size, height:size, borderRadius:"50%", background:a, border:"none", display:"flex", alignItems:"center", justifyContent:"center", cursor:"pointer", flexShrink:0 }}>
      <MicIcon size={Math.round(size * 0.4)} color="#003D35" />
    </button>
  );
}

// ─── PILL BADGE ───────────────────────────────────────────────────────────────
export function Pill({ children, variant = "teal" }) {
  const colors = {
    teal:  { bg: "#003D35", color: "#00D4B1" },
    amber: { bg: "#2D1A00", color: "#F59E0B" },
    gray:  { bg: "#1A2332", color: "#6B7A8D" },
    red:   { bg: "#1F1010", color: "#F87171" },
  };
  const c = colors[variant] || colors.teal;
  return (
    <span style={{ background:c.bg, color:c.color, borderRadius:20, padding:"2px 8px", fontSize:10, fontWeight:500 }}>
      {children}
    </span>
  );
}

// ─── NAV ICONS ────────────────────────────────────────────────────────────────
export function NavIcon({ id }) {
  if (id === "home")    return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M2 9L9 2l7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><path d="M4 7v8h4v-4h2v4h4V7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  if (id === "workout") return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="3" y="3" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" /><rect x="10" y="3" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" /><rect x="3" y="10" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" /><rect x="10" y="10" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.4" /></svg>;
  if (id === "meals")   return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2v4M9 12v4M2 9h4M12 9h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><circle cx="9" cy="9" r="3" stroke="currentColor" strokeWidth="1.4" /></svg>;
  return <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><path d="M9 2a5 5 0 100 10A5 5 0 009 2zM3.5 15.5c0-2 2.5-3.5 5.5-3.5s5.5 1.5 5.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>;
}

// ─── LAYOUT SHELL ─────────────────────────────────────────────────────────────
export function Layout({ children, activeNav = "home", chatTarget = "chat" }) {
  const { navigate, gymBranding, user } = useApp();
  const a = gymBranding.accent;
  return (
    <div style={{ background:theme.bg, borderRadius:20, color:theme.text, paddingBottom:"5.5rem", position:"relative", minHeight:"100dvh", fontFamily:"system-ui,sans-serif", overflow:"hidden" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"1.25rem 1.25rem 0" }}>
        <span style={{ fontSize:13, fontWeight:500, letterSpacing:".1em", color:a, textTransform:"uppercase" }}>{gymBranding.name}</span>
        <button onClick={() => navigate("profile")} style={{ width:34, height:34, borderRadius:"50%", background:theme.accentDim, border:`1.5px solid ${a}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:500, color:a, cursor:"pointer" }}>
          {user.name ? user.name[0].toUpperCase() : "?"}
        </button>
      </div>
      {children}
      <div style={{ textAlign:"center", fontSize:11, color:theme.textFaint, padding:".6rem", marginBottom:"3.5rem" }}>Powered by Morphiq</div>
      <div className="mq-pulse-ring" style={{ position:"absolute", bottom:"4.8rem", right:"1.25rem", width:52, height:52, borderRadius:"50%", background:"rgba(0,212,177,0.18)" }} />
      <button onClick={() => navigate(chatTarget)} style={{ position:"absolute", bottom:"4.8rem", right:"1.25rem", width:52, height:52, borderRadius:"50%", background:a, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none"><path d="M11 2C6.03 2 2 5.8 2 10.5c0 1.8.55 3.5 1.5 4.9L2 20l4.8-1.4A9.2 9.2 0 0011 19c4.97 0 9-3.8 9-8.5S15.97 2 11 2z" fill="#0A1F1D" /><circle cx="7.5" cy="10.5" r="1.2" fill={a} /><circle cx="11" cy="10.5" r="1.2" fill={a} /><circle cx="14.5" cy="10.5" r="1.2" fill={a} /></svg>
      </button>
      <div style={{ position:"absolute", bottom:0, left:0, right:0, background:"#111", borderTop:`0.5px solid ${theme.borderSubtle}`, borderRadius:"0 0 20px 20px", display:"flex" }}>
        {[["home","Home"],["workout","Workout"],["meals","Meals"],["progress","Progress"]].map(([id, label]) => (
          <button key={id} onClick={() => navigate(id)} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4, padding:".75rem .5rem", background:"none", border:"none", cursor:"pointer", color:activeNav===id?a:theme.textFaint, fontFamily:"inherit" }}>
            <NavIcon id={id} /><span style={{ fontSize:10, letterSpacing:".04em" }}>{label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
