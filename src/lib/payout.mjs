// Pure payout math — shared by the record flow's live total, the statement, and the tests.
// The payout total is exactly the sum of its entries' signed amount_cents (a statement's
// total always equals its item sums, by construction).
export function payoutTotalCents(entries) {
  return (entries ?? []).reduce((s, e) => s + (Number(e.amount_cents) || 0), 0);
}
