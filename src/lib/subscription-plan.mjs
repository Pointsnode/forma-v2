// Pure model for the studio subscription's Stripe line items (Part F). Prices are
// INJECTED (from lib/pricing.ts at the call site) so this module never hardcodes a
// figure and stays a pure, testable unit — the Stripe amount is always lib/pricing.ts.
//
// Three logical lines, identified downstream by their per-unit amount (the three
// amounts are distinct — 79/49/15 — so unit_amount is a stable key against the live
// subscription's items, no product expansion needed):
//   • admin base   — quantity 1 always
//   • additional   — quantity = accounts - 1  (only when > 0)
//   • concierge    — quantity = concierge seats (only when > 0)
// A line with quantity 0 is omitted (Stripe Checkout wants quantity >= 1); reconciliation
// ADDS it later if the roster grows into it, and REMOVES it if the roster shrinks out.

// additional accounts mirrors seatBill(): every account beyond the admin.
export function additionalCount(accounts) {
  return Math.max(0, accounts - 1);
}

// The desired line set for a roster, prices injected. Each line: {amountCents, quantity, name}.
export function planLines(accounts, conciergeSeats, prices) {
  const { priceAdmin, priceAdditional, priceConcierge } = prices;
  const lines = [{ amountCents: priceAdmin * 100, quantity: 1, name: "Forma — Admin account" }];
  const additional = additionalCount(accounts);
  if (additional > 0) lines.push({ amountCents: priceAdditional * 100, quantity: additional, name: "Forma — Additional account" });
  if (conciergeSeats > 0) lines.push({ amountCents: priceConcierge * 100, quantity: conciergeSeats, name: "Forma — Concierge seat" });
  return lines;
}

// The whole plan's monthly total in cents — must equal seatBill(...).total * 100.
export function planTotalCents(accounts, conciergeSeats, prices) {
  return planLines(accounts, conciergeSeats, prices).reduce((n, l) => n + l.amountCents * l.quantity, 0);
}

// Map a Stripe subscription status to our stored enum. Anything unrecognised collapses
// to 'incomplete' (a safe "not billing yet") rather than a value the CHECK would reject.
const STATUS = new Set(["active", "past_due", "canceled", "trialing", "incomplete", "none"]);
export function mapSubStatus(stripeStatus) {
  if (stripeStatus === "incomplete_expired" || stripeStatus === "unpaid") return "canceled";
  return STATUS.has(stripeStatus) ? stripeStatus : "incomplete";
}

// Diff the live subscription items against the desired roster → the update payload.
// existing: [{id, unitAmount, quantity}]. Returns {setQty:[{id,quantity}], add:[{amountCents,quantity,name}], remove:[id]}.
// Matching is by unit amount (distinct per line). Items whose amount isn't desired are
// removed (a line the roster shrank out of); desired amounts with no existing item are
// added (a line the roster grew into); matched items get their quantity corrected.
export function reconcileItems(existing, accounts, conciergeSeats, prices) {
  const desired = new Map(planLines(accounts, conciergeSeats, prices).map((l) => [l.amountCents, l]));
  const setQty = [];
  const remove = [];
  for (const item of existing) {
    const want = desired.get(item.unitAmount);
    if (!want) {
      remove.push(item.id);
      continue;
    }
    if (item.quantity !== want.quantity) setQty.push({ id: item.id, quantity: want.quantity });
    desired.delete(item.unitAmount);
  }
  const add = [...desired.values()].map((l) => ({ amountCents: l.amountCents, quantity: l.quantity, name: l.name }));
  return { setQty, add, remove };
}
