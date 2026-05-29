import { useState, useRef } from "react";
import { useApp } from "../utils/context";
import { theme } from "../utils/theme";
import sb from "../utils/supabase";

export default function AuthScreen() {
  const { signIn, gymBranding } = useApp();
  const a  = gymBranding.accent;
  const ob = theme.ob;

  const [mode, setMode]     = useState("member");
  const [email, setEmail]   = useState("");
  const [step, setStep]     = useState("idle");
  const [code, setCode]     = useState(["","","","","",""]);
  const [errorMsg, setError] = useState("");
  const refs = [useRef(),useRef(),useRef(),useRef(),useRef(),useRef()];

  const isLocal = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  const inp = { width:"100%", background:ob.card, border:"1px solid rgba(255,255,255,0.08)", borderRadius:10, padding:"10px 12px", fontSize:13, color:ob.white, outline:"none", fontFamily:ob.font, marginBottom:10 };
  const btn = (dis) => ({ width:"100%", background:dis?"#1A2332":a, color:dis?ob.muted:ob.tealDk, border:"none", borderRadius:10, padding:"11px", fontSize:13, fontWeight:600, cursor:dis?"default":"pointer", fontFamily:ob.font, marginTop:4 });

  async function handleSend() {
    if (!email.includes("@")) { setError("Please enter a valid email."); return; }
    setStep("sending"); setError("");
    const result = await sb.sendOTP(email);
    if (result?.ok) { setStep("code"); setTimeout(() => refs[0]?.current?.focus(), 100); }
    else { setStep("idle"); setError(result?.error ? `Error: ${result.error}` : "Couldn't send the code. Try again."); }
  }

  function handleDigit(i, val) {
    if (val.length === 6 && /^\d{6}$/.test(val)) {
      const digits = val.split(""); setCode(digits); refs[5]?.current?.focus();
      setTimeout(() => verifyCode(digits.join("")), 100); return;
    }
    const digit = val.replace(/\D/g,"").slice(-1);
    const next = [...code]; next[i] = digit; setCode(next);
    if (digit && i < 5) refs[i+1]?.current?.focus();
    if (next.every(d => d !== "")) setTimeout(() => verifyCode(next.join("")), 80);
  }

  function handleKey(i, e) { if (e.key === "Backspace" && !code[i] && i > 0) refs[i-1]?.current?.focus(); }

  async function verifyCode(token) {
    setStep("verifying"); setError("");
    const result = await sb.verifyOTP(email, token);
    if (result?.uid) {
      const gymRow = await sb.getGymByOwnerEmail(email);
      signIn(result.email, gymRow ? "owner" : "member", null, result.uid);
    } else {
      setStep("code"); setCode(["","","","","",""]); setError("Incorrect code — try again.");
      setTimeout(() => refs[0]?.current?.focus(), 100);
    }
  }

  function reset() { setStep("idle"); setCode(["","","","","",""]); setError(""); }

  return (
    <div style={{ background:ob.bg, borderRadius:20, minHeight:"100dvh", display:"flex", flexDirection:"column", fontFamily:ob.font, color:ob.white, overflow:"hidden" }}>

      {/* Logo */}
      <div style={{ padding:"20px 20px 16px", textAlign:"center" }}>
        <div style={{ width:56, height:56, borderRadius:"50%", background:ob.tealDk, border:`2px solid ${a}`, display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 12px", fontSize:24, fontWeight:700, color:a }}>M</div>
        <div style={{ fontSize:20, fontWeight:700, color:ob.white }}>{gymBranding.name}</div>
        <div style={{ fontSize:11, color:ob.muted, marginTop:3 }}>Powered by Morphiq</div>
      </div>

      {/* Member / Owner toggle */}
      {step === "idle" && (
        <div style={{ display:"flex", margin:"0 20px 20px", background:ob.card, borderRadius:10, padding:3 }}>
          {[["member","I'm a Member"],["owner","Gym Owner"]].map(([id, label]) => (
            <button key={id} onClick={() => { setMode(id); setError(""); }}
              style={{ flex:1, padding:"8px", background:mode===id?a:"transparent", color:mode===id?ob.tealDk:ob.muted, border:"none", borderRadius:8, fontSize:12, fontWeight:600, cursor:"pointer", fontFamily:ob.font }}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div style={{ flex:1, padding:"0 20px 20px" }}>

        {/* Email entry */}
        {(step === "idle" || step === "sending") && (
          <div className="mq-fade">
            <div style={{ fontSize:13, color:ob.body, marginBottom:16, lineHeight:1.6 }}>
              {mode === "member" ? "Enter your email and we'll send you a 6-digit code to sign in instantly." : "Enter your gym owner email to receive a sign-in code."}
            </div>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={e => e.key==="Enter" && handleSend()} placeholder="your@email.com" style={inp} autoCapitalize="none" autoCorrect="off" />
            {errorMsg && <div style={{ fontSize:11, color:theme.red, marginBottom:8 }}>{errorMsg}</div>}
            <button onClick={handleSend} style={btn(!email.includes("@") || step==="sending")}>{step==="sending" ? "Sending code…" : "Send code →"}</button>
          </div>
        )}

        {/* Code entry */}
        {(step === "code" || step === "verifying") && (
          <div className="mq-fade">
            <div style={{ textAlign:"center", marginBottom:20 }}>
              <div style={{ fontSize:32, marginBottom:10 }}>📱</div>
              <div style={{ fontSize:15, fontWeight:600, color:ob.white, marginBottom:6 }}>Enter your code</div>
              <div style={{ fontSize:12, color:ob.body, lineHeight:1.6 }}>We sent a 6-digit code to<br /><span style={{ color:a, fontWeight:500 }}>{email}</span></div>
            </div>
            <div style={{ display:"flex", gap:8, justifyContent:"center", marginBottom:16 }}>
              {code.map((digit, i) => (
                <input key={i} ref={refs[i]} type="tel" inputMode="numeric" maxLength={6} value={digit}
                  onChange={e => handleDigit(i, e.target.value)} onKeyDown={e => handleKey(i, e)}
                  style={{ width:42, height:52, textAlign:"center", fontSize:22, fontWeight:700, background:digit?ob.tealDk:ob.card, border:`1.5px solid ${digit?a:"rgba(255,255,255,0.12)"}`, borderRadius:10, color:digit?a:ob.muted, outline:"none", fontFamily:ob.font }} />
              ))}
            </div>
            {errorMsg && <div style={{ fontSize:12, color:theme.red, textAlign:"center", marginBottom:12, background:"#1F1010", borderRadius:8, padding:"8px 12px" }}>{errorMsg}</div>}
            {step === "verifying"
              ? <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:10, padding:"8px 0" }}><div style={{ width:28, height:28, border:`3px solid ${ob.card}`, borderTopColor:a, borderRadius:"50%", animation:"spin .9s linear infinite" }} /><div style={{ fontSize:12, color:ob.body }}>Verifying…</div></div>
              : <button onClick={() => verifyCode(code.join(""))} style={btn(code.some(d => !d))}>Verify code →</button>
            }
            <div style={{ textAlign:"center", marginTop:16, display:"flex", flexDirection:"column", gap:8 }}>
              <button onClick={handleSend} style={{ fontSize:11, color:ob.muted, background:"none", border:"none", cursor:"pointer", fontFamily:ob.font }}>Resend code</button>
              <button onClick={reset} style={{ fontSize:11, color:ob.muted, background:"none", border:"none", cursor:"pointer", fontFamily:ob.font }}>Use a different email</button>
            </div>
          </div>
        )}
      </div>

      {/* DEV BYPASS — always visible for testing */}
      <div style={{ margin:"0 20px 16px", padding:"12px", background:"#1A0A00", border:"1px dashed #F59E0B", borderRadius:12 }}>
        <div style={{ fontSize:9, color:"#F59E0B", textTransform:"uppercase", letterSpacing:"1px", marginBottom:8, textAlign:"center" }}>⚡ Dev Bypass</div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={() => signIn("dev@test.local","member",false)} style={{ flex:1, background:"#2D1A00", border:"1px solid #F59E0B", borderRadius:8, padding:"8px 4px", fontSize:11, fontWeight:600, color:"#F59E0B", cursor:"pointer", fontFamily:ob.font }}>🆕 New</button>
          <button onClick={() => signIn("dev@test.local","member",true)}  style={{ flex:1, background:"#2D1A00", border:"1px solid #F59E0B", borderRadius:8, padding:"8px 4px", fontSize:11, fontWeight:600, color:"#F59E0B", cursor:"pointer", fontFamily:ob.font }}>🏠 Returning</button>
          <button onClick={() => signIn("bcarbonell@sbcglobal.net","owner")} style={{ flex:1, background:"#2D1A00", border:"1px solid #F59E0B", borderRadius:8, padding:"8px 4px", fontSize:11, fontWeight:600, color:"#F59E0B", cursor:"pointer", fontFamily:ob.font }}>🏋️ Owner</button>
        </div>
      </div>

      <div style={{ textAlign:"center", fontSize:9, color:"#333", letterSpacing:".5px", padding:"4px 0 10px" }}>POWERED BY MORPHIQ</div>
    </div>
  );
}
