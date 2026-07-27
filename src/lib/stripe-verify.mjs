import { createHmac, timingSafeEqual } from "node:crypto";

// Verify a Stripe webhook signature (the `t=...,v1=...` scheme) without the SDK.
// Returns false on a missing/malformed header, an expired timestamp, or a mismatch.
export function verifyStripeSignature(payload, sigHeader, secret, opts = {}) {
  if (!sigHeader || !secret || typeof payload !== "string") return false;
  const toleranceSec = opts.toleranceSec ?? 300;
  const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const parts = {};
  for (const kv of sigHeader.split(",")) {
    const i = kv.indexOf("=");
    if (i > 0) parts[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1 || !/^\d+$/.test(t)) return false;
  if (Math.abs(nowSec - Number(t)) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Idempotency reducer: an event id is processed only the first time it is seen.
// (The webhook backs this with the stripe_events table; this is the pure model.)
export function dedupeEvent(seen, eventId) {
  if (seen.has(eventId)) return { process: false, seen };
  const next = new Set(seen);
  next.add(eventId);
  return { process: true, seen: next };
}

// The subset of Stripe event types that settle a planner fee.
export function isPaymentEvent(type) {
  return type === "checkout.session.completed" || type === "payment_intent.succeeded";
}
