import assert from "node:assert/strict";
import {
  commissionAmount, withinWindow, within90Days,
  commissionEntriesForPayment, clawbackEntry, rebuildCommissions,
} from "./commission.mjs";

// ── Primitives.
assert.equal(commissionAmount(7900, 3000), 2370); // 30%
assert.equal(commissionAmount(7900, 2000), 1580); // 20%
assert.equal(commissionAmount(0, 3000), 0);

// 12-month window from the workspace's first paid invoice: [start, start+12mo).
assert.equal(withinWindow("2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"), true);
assert.equal(withinWindow("2026-12-31T00:00:00Z", "2026-01-01T00:00:00Z"), true);
assert.equal(withinWindow("2027-01-01T00:00:00Z", "2026-01-01T00:00:00Z"), false); // exactly 12mo → out
assert.equal(withinWindow("2025-12-31T00:00:00Z", "2026-01-01T00:00:00Z"), false); // before start
assert.equal(withinWindow("2026-06-01T00:00:00Z", null), false);

// 90-day clawback window.
assert.equal(within90Days("2026-01-01T00:00:00Z", "2026-02-01T00:00:00Z"), true);  // 31 days
assert.equal(within90Days("2026-01-01T00:00:00Z", "2026-06-01T00:00:00Z"), false); // ~151 days
assert.equal(within90Days("2026-02-01T00:00:00Z", "2026-01-01T00:00:00Z"), false); // negative

const partner = { id: "p1", commission_rate_bps: 3000, activation_fee_cents: 7500 };

// A payment in-window → commission + activation (first time only).
const first = commissionEntriesForPayment({ payment: { stripe_id: "pay1", workspace_id: "ws1", amount_cents: 7900, paid_at: "2026-01-01T00:00:00Z" }, partner, windowStartIso: "2026-01-01T00:00:00Z", hasActivation: false });
assert.equal(first.length, 2);
assert.equal(first.find((e) => e.kind === "commission").amount_cents, 2370);
assert.equal(first.find((e) => e.kind === "activation_fee").amount_cents, 7500);
assert.equal(first.find((e) => e.kind === "activation_fee").source_ref, "ws1"); // once per workspace

// Same workspace, activation already recorded → commission only.
const second = commissionEntriesForPayment({ payment: { stripe_id: "pay2", workspace_id: "ws1", amount_cents: 7900, paid_at: "2026-06-01T00:00:00Z" }, partner, windowStartIso: "2026-01-01T00:00:00Z", hasActivation: true });
assert.equal(second.length, 1);
assert.equal(second[0].kind, "commission");

// Out of window → nothing. No partner (house/unattributed) → nothing.
assert.equal(commissionEntriesForPayment({ payment: { stripe_id: "pay3", workspace_id: "ws1", amount_cents: 7900, paid_at: "2027-02-01T00:00:00Z" }, partner, windowStartIso: "2026-01-01T00:00:00Z", hasActivation: true }).length, 0);
assert.equal(commissionEntriesForPayment({ payment: { stripe_id: "payX", workspace_id: "ws1", amount_cents: 7900, paid_at: "2026-06-01T00:00:00Z" }, partner: null, windowStartIso: "2026-01-01T00:00:00Z", hasActivation: true }).length, 0);

// Clawback uses the ORIGINAL stored rate (3000), not any later partner rate; negative.
const cb = clawbackEntry({ refund: { stripe_refund_id: "re1", amount_cents: 7900, refunded_at: "2026-02-01T00:00:00Z", payment_paid_at: "2026-01-01T00:00:00Z", workspace_id: "ws1" }, originalCommission: { partner_id: "p1", rate_bps: 3000 } });
assert.equal(cb.amount_cents, -2370);
assert.equal(cb.base_amount_cents, -7900);
assert.equal(cb.kind, "clawback");
// Outside 90 days → no clawback.
assert.equal(clawbackEntry({ refund: { stripe_refund_id: "re2", amount_cents: 7900, refunded_at: "2026-06-01T00:00:00Z", payment_paid_at: "2026-01-01T00:00:00Z", workspace_id: "ws1" }, originalCommission: { partner_id: "p1", rate_bps: 3000 } }), null);

// ── Full rebuild — deterministic (run twice → identical), activation once, clawback at old rate.
const mirror = {
  payments: [
    { stripe_id: "pay1", workspace_id: "ws1", amount_cents: 7900, paid_at: "2026-01-01T00:00:00Z" },
    { stripe_id: "pay2", workspace_id: "ws1", amount_cents: 7900, paid_at: "2026-06-01T00:00:00Z" },
    { stripe_id: "pay3", workspace_id: "ws1", amount_cents: 7900, paid_at: "2027-02-01T00:00:00Z" }, // out of window
    { stripe_id: "payH", workspace_id: "wsHouse", amount_cents: 5000, paid_at: "2026-03-01T00:00:00Z" }, // house → nothing
  ],
  refunds: [
    { stripe_refund_id: "re1", payment_id: "pay1", amount_cents: 7900, refunded_at: "2026-02-01T00:00:00Z" }, // in 90d
    { stripe_refund_id: "re2", payment_id: "pay2", amount_cents: 7900, refunded_at: "2026-12-01T00:00:00Z" }, // out of 90d
  ],
  attributionByWs: new Map([
    ["ws1", { workspace_id: "ws1", partner_id: "p1" }],
    ["wsHouse", { workspace_id: "wsHouse", partner_id: null }], // house
  ]),
  partnerById: new Map([["p1", partner]]),
  firstPaidByWs: new Map([["ws1", "2026-01-01T00:00:00Z"], ["wsHouse", "2026-03-01T00:00:00Z"]]),
};
const run1 = rebuildCommissions(mirror);
const run2 = rebuildCommissions(mirror);
assert.deepEqual(run1, run2, "rebuild is deterministic across runs");
// commission(pay1) + activation(ws1) + commission(pay2) + clawback(re1) = 4; pay3/house/re2 excluded.
assert.equal(run1.length, 4);
assert.equal(run1.filter((e) => e.kind === "activation_fee").length, 1, "activation once");
assert.equal(run1.filter((e) => e.kind === "clawback").length, 1);
assert.equal(run1.find((e) => e.kind === "clawback").amount_cents, -2370, "clawback at the original 3000 rate");
assert.equal(run1.filter((e) => e.workspace_id === "wsHouse").length, 0, "house accrues nothing");

console.log("commission: window + activation-once + clawback-old-rate + rebuild-determinism ok");
