import assert from "node:assert/strict";
import { payoutTotalCents } from "./payout.mjs";

// The total is the signed sum of the selected entries — a statement total equals its item sums.
assert.equal(payoutTotalCents([{ amount_cents: 2370 }, { amount_cents: 1000 }]), 3370);
assert.equal(payoutTotalCents([{ amount_cents: 2370 }, { amount_cents: -1000 }]), 1370); // a clawback nets down
assert.equal(payoutTotalCents([]), 0);
assert.equal(payoutTotalCents(null), 0);
assert.equal(payoutTotalCents([{ amount_cents: 5000 }, { amount_cents: -5000 }]), 0); // nets to zero → the DEFINER would refuse

console.log("payout: totals = item sums ok");
