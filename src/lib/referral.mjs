// Pure referral maturity engine + the program's numbers, in ONE place (§4). This is .mjs so both
// the TS app (via referral.ts re-export) and the plain-node rebuild script import the same values.
export const REFERRAL_CREDIT_CENTS = 10000; // $100 earned when a referral matures
export const REFERRAL_INVOICES = 3; // paid (non-fully-refunded) invoices to mature
export const REFERRAL_CASH_THRESHOLD_CENTS = 50000; // $500 balance to cash out
export const REFERRAL_COOKIE = "forma_ref";
export const REFERRAL_COOKIE_DAYS = 30;

// The count that matures a referral: PAID, non-fully-refunded invoices. The free first month is
// a $0 invoice (amount_paid_cents = 0) and never counts; a fully-refunded invoice drops out.
export function countMaturedInvoices(invoices) {
  return (invoices ?? []).filter((iv) => (Number(iv.amount_paid_cents) || 0) > 0 && !iv.fully_refunded).length;
}

// Given the current referral status + a fresh count, decide the transition. A void or already-
// matured referral is FROZEN (later cancellations change nothing — the payments happened). Only
// the pending → matured crossing at >= threshold mints the credit.
export function matureDecision({ status, count, threshold }) {
  if (status === "void" || status === "matured") return { count, matured: false, freeze: true };
  return { count, matured: count >= threshold, freeze: false };
}
