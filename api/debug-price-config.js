// api/debug-price-config.js — TEMPORARY, READ-ONLY diagnostic.
//
// Purpose: check exactly how the 3 existing usage-based Stripe prices are
// configured (specifically: are they backed by a Billing Meter, which
// Stripe now requires for all metered usage since legacy usage records
// were retired). Does not change anything in Stripe or the database.
//
// Visit directly in a browser:
//   https://morphiq-nine.vercel.app/api/debug-price-config
//
// Safe to delete once Stage 2 is sorted out — this file is not part of the
// permanent app, just a one-time inspection tool.

import Stripe from "stripe";

const USAGE_PRICE_IDS = {
  starter: "price_1ToZ2yR8eoLB9l0RbOlxgrCO",
  growth: "price_1TpAwJR8eoLB9l0ROMup1AqC",
  scale: "price_1TpB5sR8eoLB9l0RdHMfNMnx",
};

export default async function handler(req, res) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: "Server not configured — STRIPE_SECRET_KEY is missing in Vercel." });
  }

  try {
    const stripe = new Stripe(secretKey);
    const results = {};
    for (const [tier, priceId] of Object.entries(USAGE_PRICE_IDS)) {
      const price = await stripe.prices.retrieve(priceId);
      results[tier] = {
        price_id: price.id,
        usage_type: price.recurring?.usage_type || null,
        meter: price.recurring?.meter || null,
        billing_scheme: price.billing_scheme,
      };
    }
    return res.status(200).json({ note: "Read-only inspection. Nothing changed.", prices: results });
  } catch (err) {
    console.error("debug-price-config error:", err);
    return res.status(500).json({ error: "Something went wrong: " + err.message });
  }
}
