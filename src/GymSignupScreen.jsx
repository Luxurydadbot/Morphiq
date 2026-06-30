import { useState } from "react";
import { sb, theme, useApp } from "./shared.jsx";

const PLANS = [
  { id: "starter", name: "Starter", price: "$99/mo + $2 per active member" },
  { id: "growth",  name: "Growth",  price: "$199/mo + $1.75 per active member" },
  { id: "scale",   name: "Scale",   price: "$399/mo + $1.50 per active member" },
];

// Turns a gym name into a URL-safe id, e.g. "Iron House Fitness!" -> "iron-house-fitness"
function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "gym";
}

function GymSignupScreen() {
  const { navigate } = useApp();
  const ob = theme.ob;

  const [step, setStep] = useState(1); // 1 = details, 2 = submitting/done
  const [gymName, setGymName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [planTier, setPlanTier] = useState("starter");
  const [status, setStatus] = useState("idle"); // idle | checking | error | success
  const [errorMsg, setErrorMsg] = useState("");

  const inp = {
    width: "100%", background: ob.card, border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 10, padding: "11px 12px", fontSize: 13, color: ob.white,
    outline: "none", fontFamily: ob.font, boxSizing: "border-box",
  };
  const label = { fontSize: 11, color: ob.body, display: "block", marginBottom: 5 };

  const canSubmit = gymName.trim().length > 1 && ownerName.trim().length > 1 && email.includes("@");

  async function handleSubmit() {
    if (!canSubmit) {
      setErrorMsg("Fill in your gym name, your name, and a valid email first.");
      return;
    }
    setStatus("checking");
    setErrorMsg("");

    // 1. Make sure this email isn't already a gym owner
    const existingGym = await sb.getGymByOwnerEmail(email);
    if (existingGym) {
      setStatus("error");
      setErrorMsg("An account with that email already exists. Try signing in instead.");
      return;
    }

    // 2. Find an available gym_id, trying a few suffixes if the base name is taken
    const base = slugify(gymName);
    let candidateId = base;
    let found = await sb.isGymIdAvailable(candidateId);
    let attempt = 2;
    while (!found && attempt <= 6) {
      candidateId = `${base}-${attempt}`;
      found = await sb.isGymIdAvailable(candidateId);
      attempt++;
    }
    if (!found) {
      setStatus("error");
      setErrorMsg("Couldn't generate a unique gym ID — try a slightly different gym name.");
      return;
    }

    // 3. Create the gym row
    const result = await sb.createGym({
      gymId: candidateId,
      name: gymName.trim(),
      ownerEmail: email,
      planTier,
    });

    if (result.ok) {
      setStatus("success");
      setStep(2);
    } else {
      setStatus("error");
      setErrorMsg(result.error || "Something went wrong creating your gym. Please try again.");
    }
  }

  return (
    <div style={{ background: ob.bg, borderRadius: 20, minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: ob.font, color: ob.white, padding: "24px 16px" }}>
      <div style={{ width: "100%", maxWidth: 420, background: "#0D1623", border: "1px solid #1E2D42", borderRadius: 16, padding: "32px 28px" }}>

        {step === 1 && (
          <>
            <div style={{ textAlign: "center", marginBottom: 24 }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#003D35", border: "2px solid #00D4B1", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 10px" }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: "#00D4B1" }}>M</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: ob.white }}>Bring Morphiq to your gym</div>
              <div style={{ fontSize: 12, color: ob.body, marginTop: 4 }}>Set up your branded AI coaching app in under 5 minutes</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={label}>Gym name</label>
                <input style={inp} type="text" placeholder="Iron House Fitness" value={gymName} onChange={e => setGymName(e.target.value)} />
              </div>
              <div>
                <label style={label}>Your name</label>
                <input style={inp} type="text" placeholder="Alex Rivera" value={ownerName} onChange={e => setOwnerName(e.target.value)} />
              </div>
              <div>
                <label style={label}>Work email</label>
                <input style={inp} type="email" placeholder="alex@ironhousefitness.com" value={email} onChange={e => setEmail(e.target.value)} />
                <div style={{ fontSize: 10, color: ob.muted, marginTop: 4 }}>You'll use this to log in — no password needed.</div>
              </div>
              <div>
                <label style={label}>Choose a plan</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {PLANS.map(p => (
                    <div
                      key={p.id}
                      onClick={() => setPlanTier(p.id)}
                      style={{
                        background: ob.card,
                        border: planTier === p.id ? "1.5px solid #00D4B1" : "1px solid #1E2D42",
                        borderRadius: 10, padding: "10px 12px", display: "flex",
                        justifyContent: "space-between", alignItems: "center", cursor: "pointer",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: ob.white }}>{p.name}</div>
                        <div style={{ fontSize: 10, color: ob.muted }}>{p.price}</div>
                      </div>
                      {planTier === p.id && (
                        <div style={{ background: "#003D35", color: "#00D4B1", fontSize: 9, padding: "3px 8px", borderRadius: 12 }}>14-day free trial</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {errorMsg ? (
              <div style={{ fontSize: 11, color: "#F87171", marginTop: 14, lineHeight: 1.5 }}>{errorMsg}</div>
            ) : null}

            <button
              onClick={handleSubmit}
              disabled={status === "checking"}
              style={{
                width: "100%", background: status === "checking" ? "#1A2332" : "#00D4B1",
                color: status === "checking" ? ob.muted : "#003D35", border: "none",
                borderRadius: 10, padding: 13, fontSize: 13, fontWeight: 600,
                marginTop: 22, cursor: status === "checking" ? "default" : "pointer",
                fontFamily: ob.font,
              }}
            >
              {status === "checking" ? "Setting up your gym..." : "Create my gym →"}
            </button>

            <div style={{ textAlign: "center", fontSize: 10, color: ob.muted, marginTop: 14 }}>
              Already have an account?{" "}
              <span style={{ color: "#00D4B1", cursor: "pointer" }} onClick={() => navigate("auth")}>Sign in</span>
            </div>
          </>
        )}

        {step === 2 && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "#003D35", border: "2px solid #00D4B1", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 22, color: "#00D4B1" }}>✓</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: ob.white, marginBottom: 8 }}>{gymName} is ready</div>
            <div style={{ fontSize: 12, color: ob.body, lineHeight: 1.6, marginBottom: 22 }}>
              Your 14-day free trial has started. Sign in below with <span style={{ color: ob.white }}>{email}</span> — we'll email you a one-time code, no password needed.
            </div>
            <button
              onClick={() => navigate("auth")}
              style={{ width: "100%", background: "#00D4B1", color: "#003D35", border: "none", borderRadius: 10, padding: 13, fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: ob.font }}
            >
              Go to sign in →
            </button>
          </div>
        )}

      </div>
    </div>
  );
}

export { GymSignupScreen };
