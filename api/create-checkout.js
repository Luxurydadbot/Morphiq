// api/create-checkout.js — creates a Stripe Checkout Session so a new gym
// owner can enter payment details and start their 14-day free trial.
//
// Called once, right after GymSignupScreen.jsx creates the gym's row in
// Supabase. Sends the browser to Stripe's own payment page. Stripe redirects
// back to our app when the owner finishes (or cancels).
//
// The actual "save Stripe's customer/subscription IDs onto the gym row" step
// happens separately and automatically, in api/stripe-webhook.js, once
// Stripe confirms the payment went through.

import Stripe from "stripe";

// Each plan bills two Stripe prices together on one subscription: a flat
// monthly fee, and a per-active-member usage fee. IDs are unchanged from the
// pricing setup session.
const PLAN_PRICES = {
  starter: {
    flat: "price_1ToYs1R8eoLB9l0R3p43EFLm",
    usage: "price_1ToZ2yR8eoLB9l0RbOlxgrCOG",
  },
  growth: {
    flat: "price_1TpAtHR8eoLB9l0RoNZ3tnIE",
    usage: "price_1TpAwJR8eoLB9l0ROMup1AqCS",
  },
  scale: {
    flat: "price_1TpB4zR8eoLB9l0RbNRvmWdH",
    usage: "price_1TpB5sR8eoLB9l0RdHMfNMnx",
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    console.error("create-checkout: missing STRIPE_SECRET_KEY env var");
    return res.status(500).json({ error: "Server not configured" });
  }

  const { gymId, gymName, planTier, email } = req.body || {};
  if (!gymId || !planTier || !email) {
    return res.status(400).json({ error: "Missing gymId, planTier, or email" });
  }

  const prices = PLAN_PRICES[planTier];
  if (!prices) {
    return res.status(400).json({ error: `Unknown plan tier: ${planTier}` });
  }

  const stripe = new Stripe(secretKey);

  // Where Stripe sends the browser back to afterward. Gym details are passed
  // along in the URL so the signup screen can show the right thing without
  // needing to re-fetch anything.
  const origin = req.headers.origin || "https://morphiq-nine.vercel.app";
  const successUrl =
    `${origin}/?join=gym&checkout=success&gym=${encodeURIComponent(gymId)}` +
    `&name=${encodeURIComponent(gymName || "")}&email=${encodeURIComponent(email)}`;
  const cancelUrl =
    `${origin}/?join=gym&checkout=canceled&gym=${encodeURIComponent(gymId)}` +
    `&name=${encodeURIComponent(gymName || "")}&email=${encodeURIComponent(email)}&plan=${encodeURIComponent(planTier)}`;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      // Lets stripe-webhook.js know which gym row to update once payment succeeds.
      client_reference_id: gymId,
      customer_email: email,
      line_items: [
        { price: prices.flat, quantity: 1 },
        { price: prices.usage }, // usage-based price — Stripe doesn't allow a quantity here
      ],
      subscription_data: {
        trial_period_days: 14,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("create-checkout: Stripe error:", err.message);
    // TEMPORARY DEBUG: exposing err.message directly in the response so we can
    // see the real reason in the browser during testing. Must be reverted to
    // the generic message before real gym owners use this — a raw Stripe
    // error is not something an end user should see.
    return res.status(500).json({ error: "Could not start checkout. Please try again.", debug: err.message });
  }
}
