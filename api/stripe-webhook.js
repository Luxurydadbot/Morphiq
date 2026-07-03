// api/stripe-webhook.js — keeps the gyms table in sync with Stripe billing events
//
// Stripe calls this URL automatically whenever something changes for a gym's
// subscription (trial ending, payment succeeding/failing, cancellation, etc).
// It never runs from a click in our own app — only Stripe's servers call it.
//
// Events handled:
//   checkout.session.completed   → first time a gym finishes checkout: save their
//                                   Stripe IDs onto the matching gym row
//   customer.subscription.created
//   customer.subscription.updated → mirrors Stripe's current status word onto the
//                                    gym row (trialing / active / past_due / canceled...)
//   customer.subscription.deleted → subscription fully canceled
//
// Requires two Vercel environment variables:
//   STRIPE_SECRET_KEY     (already set from the pricing setup session)
//   STRIPE_WEBHOOK_SECRET (new — generated when the webhook endpoint is created
//                           in the Stripe dashboard; still needs to be added)

import Stripe from "stripe";

// Tells Vercel not to auto-parse the request body. Stripe requires the exact
// raw, untouched bytes of the request to verify the signature — if the body
// were parsed to JSON first, the signature check would always fail.
export const config = {
  api: { bodyParser: false },
};

// Same Supabase project + public anon key the rest of the app already uses
// for reads/writes to the gyms table (see src/shared.jsx).
const SUPABASE_URL = "https://uvnyjegmhsztdednjclb.supabase.co";
const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2bnlqZWdtaHN6dGRlZG5qY2xiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg3MTgwMjcsImV4cCI6MjA5NDI5NDAyN30.-hMNwCO-GymvbiyAKer6Q5AjDbDZl6GhXmSTmr5bY04";

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Updates one gym row in Supabase. Fire-and-forget style, per project rules:
// a failed write is logged but never thrown, so it can never crash this
// endpoint or cause Stripe to see an error and start retrying.
async function updateGym(filterColumn, filterValue, patch) {
  if (!filterValue) return false;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/gyms?${filterColumn}=eq.${encodeURIComponent(filterValue)}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_ANON,
          Authorization: `Bearer ${SUPABASE_ANON}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(patch),
      }
    );
    if (!res.ok) {
      const errText = await res.text().catch(() => "no body");
      console.error("stripe-webhook: updateGym PATCH failed:", res.status, errText, filterColumn, filterValue);
    }
    return res.ok;
  } catch (e) {
    console.error("stripe-webhook: updateGym exception:", e);
    return false;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    console.error("stripe-webhook: missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET env var");
    return res.status(500).json({ error: "Server not configured" });
  }

  const stripe = new Stripe(secretKey);

  // Verify this request really came from Stripe (not someone guessing the URL).
  let event;
  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("stripe-webhook: signature verification failed:", err.message);
    return res.status(400).json({ error: "Invalid signature" });
  }

  // Process the event, but never let an internal problem become an error
  // response — we always want to tell Stripe "got it" so it doesn't retry
  // the same event repeatedly. Problems are logged instead.
  try {
    switch (event.type) {
      // Fired once when a gym owner finishes Stripe Checkout for the first time.
      // client_reference_id carries our own gym_id so we know which row to
      // update — GymSignupScreen.jsx must pass it when creating the Checkout
      // session (this is a separate, upcoming change).
      case "checkout.session.completed": {
        const session = event.data.object;
        const gymId = session.client_reference_id;
        if (!gymId) {
          console.error("stripe-webhook: checkout.session.completed had no client_reference_id");
          break;
        }
        await updateGym("gym_id", gymId, {
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
          subscription_status: "trialing",
          updated_at: new Date().toISOString(),
        });
        break;
      }

      // Fired whenever Stripe's view of the subscription changes — trial
      // ending, payment succeeding/failing, plan changing, etc. This is the
      // main "source of truth" event; we mirror Stripe's status word directly
      // rather than re-deciding it ourselves.
      case "customer.subscription.updated":
      case "customer.subscription.created": {
        const sub = event.data.object;
        await updateGym("stripe_customer_id", sub.customer, {
          stripe_subscription_id: sub.id,
          subscription_status: sub.status, // "trialing" | "active" | "past_due" | "canceled" | "unpaid" | ...
          trial_ends_at: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
          updated_at: new Date().toISOString(),
        });
        break;
      }

      // Fired when a subscription is fully canceled (not just a failed payment).
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await updateGym("stripe_customer_id", sub.customer, {
          subscription_status: "canceled",
          updated_at: new Date().toISOString(),
        });
        break;
      }

      default:
        // Any other event type is intentionally ignored — we only track
        // what the gym owner dashboard needs to show billing status.
        break;
    }
  } catch (err) {
    console.error("stripe-webhook: processing error:", err);
  }

  return res.status(200).json({ received: true });
}
