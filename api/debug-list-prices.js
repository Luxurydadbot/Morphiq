// api/debug-list-prices.js — TEMPORARY, for troubleshooting only.
// Lists all prices actually present in the Stripe account so we can compare
// against the IDs hardcoded in create-checkout.js. Safe to delete once the
// mismatch is found and fixed — reads only, no secret key exposed to browser.

import Stripe from "stripe";

export default async function handler(req, res) {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });

  const stripe = new Stripe(secretKey);
  try {
    const prices = await stripe.prices.list({ limit: 30, expand: ["data.product"] });
    const simplified = prices.data.map(p => ({
      id: p.id,
      nickname: p.nickname,
      product_name: p.product?.name,
      unit_amount: p.unit_amount,
      recurring: p.recurring,
      active: p.active,
    }));
    return res.status(200).json(simplified);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
