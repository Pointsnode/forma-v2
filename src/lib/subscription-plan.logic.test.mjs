import assert from "node:assert/strict";
import { planLines, planTotalCents, mapSubStatus, reconcileItems, additionalCount } from "./subscription-plan.mjs";

// The injected prices MUST be Gio's M15 numbers (lib/pricing.ts). Mirror them here and
// assert the model's total equals the seatBill formula — the DoD "identical to Team".
const PRICES = { priceAdmin: 79, priceAdditional: 49, priceConcierge: 15 };
const seatBillTotal = (accounts, concierge) => 79 + 49 * Math.max(0, accounts - 1) + 15 * concierge;

// planLines: admin always present; additional/concierge only when > 0.
{
  const solo = planLines(1, 0, PRICES);
  assert.equal(solo.length, 1, "a solo studio bills the admin line only");
  assert.equal(solo[0].amountCents, 7900);
  assert.equal(solo[0].quantity, 1);

  const full = planLines(4, 2, PRICES); // 1 admin + 3 additional + 2 concierge
  assert.equal(full.length, 3);
  assert.equal(additionalCount(4), 3);
  const byAmount = Object.fromEntries(full.map((l) => [l.amountCents, l.quantity]));
  assert.deepEqual(byAmount, { 7900: 1, 4900: 3, 1500: 2 });
}

// planTotalCents === seatBill(...).total * 100 across a grid — the price identity.
for (const accounts of [1, 2, 5, 12]) {
  for (const concierge of [0, 1, 3]) {
    assert.equal(
      planTotalCents(accounts, concierge, PRICES),
      seatBillTotal(accounts, concierge) * 100,
      `plan total must equal seatBill for accounts=${accounts} concierge=${concierge}`,
    );
  }
}

// mapSubStatus: pass-through for known, safe collapses for the rest.
assert.equal(mapSubStatus("active"), "active");
assert.equal(mapSubStatus("past_due"), "past_due");
assert.equal(mapSubStatus("trialing"), "trialing");
assert.equal(mapSubStatus("incomplete_expired"), "canceled");
assert.equal(mapSubStatus("unpaid"), "canceled");
assert.equal(mapSubStatus("something_new"), "incomplete");

// reconcileItems: grow into concierge, shrink out of additional, correct a quantity.
{
  // live sub: admin(1) + additional(2). Desired roster accounts=2 (additional 1) + concierge 1.
  const existing = [
    { id: "si_admin", unitAmount: 7900, quantity: 1 },
    { id: "si_add", unitAmount: 4900, quantity: 2 },
  ];
  const { setQty, add, remove } = reconcileItems(existing, 2, 1, PRICES);
  assert.deepEqual(setQty, [{ id: "si_add", quantity: 1 }], "additional corrected 2→1");
  assert.deepEqual(remove, [], "nothing removed");
  assert.deepEqual(add, [{ amountCents: 1500, quantity: 1, name: "Forma · Concierge seat" }], "concierge added");
}
{
  // live sub: admin + additional + concierge. Roster shrinks to solo (accounts 1, concierge 0).
  const existing = [
    { id: "si_admin", unitAmount: 7900, quantity: 1 },
    { id: "si_add", unitAmount: 4900, quantity: 3 },
    { id: "si_con", unitAmount: 1500, quantity: 2 },
  ];
  const { setQty, add, remove } = reconcileItems(existing, 1, 0, PRICES);
  assert.deepEqual(setQty, [], "admin unchanged");
  assert.deepEqual(add, [], "nothing added");
  assert.deepEqual(remove.sort(), ["si_add", "si_con"], "additional + concierge removed");
}

console.log("subscription-plan: lines + seatBill-identity + status map + reconcile ok");
