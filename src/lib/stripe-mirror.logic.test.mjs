import assert from "node:assert/strict";
import { billingMirrorOps, invoiceToRow, refundStatus, secToIso } from "./stripe-mirror.mjs";
import { dedupeEvent } from "./stripe-verify.mjs";

// Classification — the planner fee AND every subscription event touch NO billing table.
for (const t of [
  "checkout.session.completed", "payment_intent.succeeded",
  "customer.subscription.created", "customer.subscription.updated", "customer.subscription.deleted",
  "invoice.upcoming",
]) {
  assert.deepEqual(billingMirrorOps(t), [], `${t} must not touch billing tables`);
}
assert.deepEqual(billingMirrorOps("invoice.finalized"), ["invoice"]);
assert.deepEqual(billingMirrorOps("invoice.payment_failed"), ["invoice"]);
assert.deepEqual(billingMirrorOps("invoice.voided"), ["invoice"]);
assert.deepEqual(billingMirrorOps("invoice.paid"), ["invoice", "payment"]);
assert.deepEqual(billingMirrorOps("charge.refunded"), ["refund"]);
assert.deepEqual(billingMirrorOps("charge.dispute.created"), ["dispute"]);

// Replay — a repeated event id is a no-op (the webhook's PK-conflict guard, pure model).
let seen = new Set();
const first = dedupeEvent(seen, "evt_1");
assert.equal(first.process, true, "first sight processes");
const replay = dedupeEvent(first.seen, "evt_1");
assert.equal(replay.process, false, "replayed event id is a no-op");

// invoiceToRow — cents preserved, discount is Stripe's summed figure, seconds → ISO.
const row = invoiceToRow({
  id: "in_1", subscription: "sub_1", status: "paid", currency: "usd",
  subtotal: 7900, tax: 0, total: 7100, amount_paid: 7100,
  total_discount_amounts: [{ amount: 500 }, { amount: 300 }],
  period_start: 1700000000, period_end: 1702592000,
  status_transitions: { paid_at: 1700000500 },
  hosted_invoice_url: "https://pay.stripe.com/x",
}, "ws-1");
assert.equal(row.stripe_invoice_id, "in_1");
assert.equal(row.workspace_id, "ws-1");
assert.equal(row.subtotal_cents, 7900);
assert.equal(row.discount_cents, 800); // 500 + 300, summed
assert.equal(row.total_cents, 7100);
assert.equal(row.amount_paid_cents, 7100);
assert.equal(row.paid_at, new Date(1700000500 * 1000).toISOString());
assert.equal(row.hosted_invoice_url, "https://pay.stripe.com/x");

// Bare invoice → null workspace, zero discount, null paid_at.
const bare = invoiceToRow({ id: "in_2" }, null);
assert.equal(bare.workspace_id, null);
assert.equal(bare.discount_cents, 0);
assert.equal(bare.paid_at, null);

// refundStatus — full vs partial.
assert.equal(refundStatus(7100, 7100), "refunded");
assert.equal(refundStatus(7200, 7100), "refunded");
assert.equal(refundStatus(500, 7100), "partially_refunded");

// secToIso — guards zero/null, converts seconds.
assert.equal(secToIso(0), null);
assert.equal(secToIso(null), null);
assert.equal(secToIso(1700000000), new Date(1700000000 * 1000).toISOString());

console.log("stripe-mirror: classification + row mapping + replay ok");
