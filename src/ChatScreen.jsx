import { useState, useEffect, useRef } from "react";
import {
  useApp, theme, sb,
  MicIcon, Spinner,
  CHAT_SUGGESTIONS,
  getFallbackReply, fetchAIReply,
} from "./shared.js";

function ChatScreen({ fromScreen = "home" }) {
  const { navigate, user, plan, gymBranding, workoutContext, supabaseUser, setPendingAISwap } = useApp();
  const [msgUsage, setMsgUsage] = useState(null);
  const a = gymBranding.accent;
  const [messages, setMessages] = useState([
    { id: 1, role: "ai", text: `Hey ${user.name || "there"}! I can see your full plan and history. What's up?` },
  ]);
  const [input, setInput] = useState("");
  const [voicePhase, setVoicePhase] = useState("idle"); // idle | listening | heard
  const [voiceText, setVoiceText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [dynamicChips, setDynamicChips] = useState(null); // chips returned by Claude
  const [apiError, setApiError] = useState(false);
  const [apiErrorMsg, setApiErrorMsg] = useState("");
  const scrollRef = useRef(null);
  const timerRef = useRef(null);

  // Load usage count on mount so counter is visible before first message
  useEffect(() => {
    async function loadUsage() {
      try {
        const profileId = await sb.getProfileId(supabaseUser?.id).catch(() => null);
        if (!profileId) return;
        const month = new Date().toISOString().slice(0, 7);
        const url = `https://uvnyjegmhsztdednjclb.supabase.co/rest/v1/ai_usage?user_id=eq.${profileId}&month=eq.${month}&feature=eq.chat&select=id`;
        const res = await fetch(url, { headers: { apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2bnlqZWdtaHN6dGRlZG5qY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTgwMjcsImV4cCI6MjA5NDI5NDAyN30.-hMNwCO-GymvbiyAKer6Q5AjDbDZl6GhXmSTmr5bY04", Authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2bnlqZWdtaHN6dGRlZG5qY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTgwMjcsImV4cCI6MjA5NDI5NDAyN30.-hMNwCO-GymvbiyAKer6Q5AjDbDZl6GhXmSTmr5bY04" } });
        const rows = await res.json();
        const count = Array.isArray(rows) ? rows.length : 0;
        setMsgUsage({ count, limit: 50 });
      } catch { /* non-blocking */ }
    }
    loadUsage();
  }, [supabaseUser]);

  // Default suggestion chips per context — shown before first exchange
  const defaultChips = CHAT_SUGGESTIONS[fromScreen] || CHAT_SUGGESTIONS.idle;
  // After first exchange: show Claude's chips if available, else nothing
  const visibleChips = messages.length <= 2 ? defaultChips : (dynamicChips || []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, thinking]);

  async function sendMessage(text) {
    if (!text.trim()) return;
    const userMsg = { id: Date.now(), role: "user", text: text.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setVoicePhase("idle");
    setVoiceText("");
    setThinking(true);
    setDynamicChips(null);
    setApiError(false);

    try {
      // Send full conversation history so Claude has context
      const userMessages = newMessages.filter(m => m.role === "user" || m.role === "ai");
      const profileId = await sb.getProfileId(supabaseUser?.id).catch(() => null);
      const { text: reply, action, chips, usageCount, usageLimit } = await fetchAIReply(
        userMessages,
        { ...user, plan, gymName: gymBranding.name, profileId, gymId: gymBranding.gymId || "unknown" },
        fromScreen,
        workoutContext   // null when not in workout, object when mid-workout
      );
      if (usageCount !== undefined) setMsgUsage({ count: usageCount, limit: usageLimit });
      setThinking(false);
      setMessages(prev => [...prev, { id: Date.now() + 1, role: "ai", text: reply }]);
      if (chips?.length) setDynamicChips(chips);
      // Action handling — wire AI decisions to live workout screen
      if (action?.type === "swap_exercise") {
        // Single exercise swap — WorkoutScreen watches pendingAISwap and
        // calls doSwap() automatically, then clears it.
        setPendingAISwap({
          name: action.to,
          muscle: action.muscle || "",
          sets: workoutContext?.totalSets || 3,
          targetReps: workoutContext?.targetReps || 10,
          weight: workoutContext?.weight ? Math.round(workoutContext.weight * 0.85) : 20,
          rpe: 7,
          alternative: null,
        });
      } else if (action?.type === "swap_remaining") {
        // Injury affecting multiple exercises — swap all remaining exercises
        // that load the injured area. Store as special pendingAISwap with
        // type so WorkoutScreen knows to apply it across multiple exercises.
        setPendingAISwap({
          _bulk: true,
          _type: "injury",
          area: action.area, // "back" | "knee" | "shoulder" | "wrist"
        });
      } else if (action?.type === "bodyweight_mode") {
        // "I'm at home today" — swap all remaining exercises to bodyweight
        setPendingAISwap({
          _bulk: true,
          _type: "bodyweight",
        });
      } else if (action?.type === "trim_workout") {
        // "Only have 15 minutes" — trim remaining sets
        setPendingAISwap({
          _bulk: true,
          _type: "trim",
          minutes: action.minutes,
        });
      }
    } catch (err) {
      console.warn("[Morphiq] API unavailable, using fallback:", err.message);
      setApiError(true);
      setApiErrorMsg(err.message || "unknown error");
      setThinking(false);
      setMessages(prev => [...prev, { id: Date.now() + 1, role: "ai", text: getFallbackReply(text) }]);
    }
  }

  function startVoice() {
    setVoicePhase("listening");
    timerRef.current = setTimeout(() => {
      setVoiceText(defaultChips[Math.floor(Math.random() * defaultChips.length)]);
      setVoicePhase("heard");
    }, 2000);
  }
  function cancelVoice() {
    clearTimeout(timerRef.current);
    setVoicePhase("idle");
    setVoiceText("");
  }
  function confirmVoice() { sendMessage(voiceText); }
  useEffect(() => () => clearTimeout(timerRef.current), []);

  // Build a detailed context string — if we have live workout context, use it
  const ctxBase = { home: "Dashboard", workout: "Mid-workout", meals: "Meal plan", chat: "Dashboard" }[fromScreen] || "Dashboard";
  const ctx = (fromScreen === "workout" && workoutContext)
    ? `${workoutContext.exercise} · Set ${workoutContext.setNumber} of ${workoutContext.totalSets}`
    : ctxBase;

  return (
    <div style={{ background: theme.bg, borderRadius: 20, color: theme.text, minHeight: "100dvh", fontFamily: "system-ui,sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ background: "#0D1117", borderBottom: `1px solid ${theme.borderSubtle}`, padding: "14px 16px 12px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => navigate(fromScreen === "chat" ? "home" : fromScreen)} style={{ background: "none", border: "none", color: theme.textDim, cursor: "pointer", fontSize: 20, padding: 0, lineHeight: 1, marginRight: 2 }}>←</button>
          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#003D35", border: `1.5px solid ${a}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, color: a, flexShrink: 0 }}>AI</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>Hypergentiq Trainer</div>
            <div style={{ fontSize: 11, color: a }}>Knows your full plan</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <div style={{ width: 7, height: 7, borderRadius: "50%", background: a }} />
              <span style={{ fontSize: 11, color: theme.textDim }}>Online</span>
            </div>
            {msgUsage && (
              <div style={{ background: msgUsage.count >= 45 ? "#1F1010" : "#0D1623", border: "1px solid " + (msgUsage.count >= 45 ? "rgba(248,113,113,0.3)" : "rgba(255,255,255,0.08)"), borderRadius: 10, padding: "2px 7px" }}>
                <span style={{ fontSize: 10, color: msgUsage.count >= msgUsage.limit ? "#F87171" : msgUsage.count >= 45 ? "#F59E0B" : "#6B7A8D", fontWeight: 500 }}>
                  {msgUsage.count >= msgUsage.limit ? "Limit reached" : (msgUsage.limit - msgUsage.count) + " left this month"}
                </span>
              </div>
            )}
          </div>
        </div>
        {/* Context chip */}
        <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 5, background: "#0A1628", border: `1px solid rgba(0,212,177,0.15)`, borderRadius: 20, padding: "4px 10px" }}>
          <span style={{ fontSize: 10, color: a }}>⏱</span>
          <span style={{ fontSize: 10, color: "#9BB3C8" }}>{ctx} · {gymBranding.name}</span>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "14px 14px 0", display: "flex", flexDirection: "column", gap: 4 }}>
        {messages.map(msg => (
          <div key={msg.id} className="mq-fade" style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start", marginBottom: 6 }}>
            {msg.role === "ai" && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: 7, maxWidth: "90%" }}>
                <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#003D35", border: `1px solid ${a}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 600, color: a, flexShrink: 0, marginTop: 2 }}>AI</div>
                <div style={{ background: "#1A2332", borderRadius: "12px 12px 12px 4px", padding: "9px 12px", fontSize: 13, lineHeight: 1.55, color: "#9BB3C8" }}>{msg.text}</div>
              </div>
            )}
            {msg.role === "user" && (
              <div style={{ background: a, borderRadius: "12px 12px 4px 12px", padding: "9px 12px", fontSize: 13, color: "#003D35", fontWeight: 500, maxWidth: "82%" }}>{msg.text}</div>
            )}
          </div>
        ))}
        {thinking && (
          <div className="mq-fade" style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 6 }}>
            <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#003D35", border: `1px solid ${a}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: a, flexShrink: 0 }}>AI</div>
            <div style={{ background: "#1A2332", borderRadius: "12px 12px 12px 4px", padding: "9px 14px" }}>
              <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                {[0, 0.2, 0.4].map(d => <div key={d} style={{ width: 6, height: 6, borderRadius: "50%", background: a, animation: "mqPulse 1.2s infinite", animationDelay: `${d}s`, opacity: 0.7 }} />)}
              </div>
            </div>
          </div>
        )}
        <div style={{ height: 8 }} />
      </div>

      {/* API error banner — shown when proxy is unreachable */}
      {apiError && (
        <div style={{ margin: "6px 14px 0", background: "#1A1010", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 10, padding: "7px 12px", fontSize: 11, color: "#F87171", flexShrink: 0 }}>
          ⚠ API error: {apiErrorMsg || "check console for details"}
        </div>
      )}

      {/* Suggestion chips — default before first exchange, Claude's chips after */}
      {visibleChips.length > 0 && !thinking && (
        <div style={{ padding: "8px 14px 0", display: "flex", flexWrap: "wrap", gap: 6, flexShrink: 0 }}>
          {visibleChips.map(s => (
            <button key={s} onClick={() => sendMessage(s)}
              style={{ background: "#1A2332", border: `1px solid rgba(0,212,177,0.2)`, borderRadius: 20, padding: "5px 10px", fontSize: 11, color: a, cursor: "pointer", fontFamily: "inherit" }}>
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Voice overlay */}
      {voicePhase !== "idle" && (
        <div className="mq-fade" style={{ margin: "8px 14px 0", background: "#0A1628", border: `1px solid rgba(0,212,177,0.2)`, borderRadius: 14, padding: "12px", textAlign: "center", flexShrink: 0 }}>
          {voicePhase === "listening" && <>
            <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 6 }}>Listening...</div>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 3, height: 28, marginBottom: 6 }} className="mq-wave">
              {[1,2,3,4,5,6].map(i => <span key={i} />)}
            </div>
            <div style={{ fontSize: 10, color: a, marginBottom: 8 }}>Speak your question</div>
            <button onClick={cancelVoice} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8, padding: "5px 16px", fontSize: 10, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
          </>}
          {voicePhase === "heard" && <>
            <div style={{ fontSize: 11, color: theme.textDim, marginBottom: 7 }}>Heard you — does this look right?</div>
            <div style={{ background: "#111827", borderRadius: 8, padding: "7px 12px", fontSize: 12, color: "#9BB3C8", fontStyle: "italic", marginBottom: 10 }}>"{voiceText}"</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={cancelVoice} style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 9, padding: "7px", fontSize: 11, color: theme.textDim, cursor: "pointer", fontFamily: "inherit" }}>Redo</button>
              <button onClick={confirmVoice} style={{ flex: 2, background: a, border: "none", borderRadius: 9, padding: "7px", fontSize: 11, color: "#003D35", fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Send ✓</button>
            </div>
          </>}
        </div>
      )}

      {/* Usage counter moved to header */}

      {/* Input bar */}
      <div style={{ padding: "10px 14px 14px", background: "#0D1117", borderTop: `1px solid ${theme.borderSubtle}`, display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
        <button onClick={startVoice} disabled={voicePhase !== "idle"}
          style={{ width: 36, height: 36, borderRadius: "50%", background: voicePhase !== "idle" ? a : "#1A2332", border: `1px solid ${voicePhase !== "idle" ? a : "rgba(255,255,255,0.1)"}`, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0 }}>
          <MicIcon size={14} color={voicePhase !== "idle" ? "#003D35" : "#6B7A8D"} />
        </button>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && sendMessage(input)}
          placeholder="Ask anything..."
          style={{ flex: 1, background: "#1A2332", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: "8px 12px", fontSize: 13, color: theme.text, outline: "none", fontFamily: "inherit" }}
        />
        <button onClick={() => sendMessage(input)} disabled={!input.trim()}
          style={{ width: 36, height: 36, borderRadius: "50%", background: input.trim() ? a : "#1A2332", border: "none", display: "flex", alignItems: "center", justifyContent: "center", cursor: input.trim() ? "pointer" : "default", flexShrink: 0, fontSize: 15, color: input.trim() ? "#003D35" : theme.textFaint, fontWeight: 700 }}>→</button>
      </div>

      {/* Bottom text */}
      <div style={{ textAlign: "center", fontSize: 10, color: theme.textFaint, paddingBottom: 10, background: "#0D1117", flexShrink: 0 }}>Powered by Hypergentiq</div>
    </div>
  );
}


export { ChatScreen };
