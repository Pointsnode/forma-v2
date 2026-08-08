import assert from "node:assert/strict";
import { countMaturedInvoices, matureDecision } from "./referral.mjs";

const THRESHOLD = 3;

// The free first month ($0) never counts; a fully-refunded invoice drops out.
const invoices = [
  { amount_paid_cents: 0, fully_refunded: false },    // free month → not counted
  { amount_paid_cents: 8900, fully_refunded: false },  // paid
  { amount_paid_cents: 8900, fully_refunded: false },  // paid
  { amount_paid_cents: 8900, fully_refunded: true },   // paid then fully refunded → out
];
assert.equal(countMaturedInvoices(invoices), 2, "free + fully-refunded excluded");

// Maturity at EXACTLY three paid invoices, not before.
assert.equal(matureDecision({ status: "pending", count: 2, threshold: THRESHOLD }).matured, false);
assert.equal(matureDecision({ status: "pending", count: 3, threshold: THRESHOLD }).matured, true, "matures at exactly 3");
assert.equal(matureDecision({ status: "pending", count: 4, threshold: THRESHOLD }).matured, true);

// A refund knocking a paid invoice out drops the count back below threshold before maturity.
const threePaidOneRefunded = [
  { amount_paid_cents: 8900, fully_refunded: false },
  { amount_paid_cents: 8900, fully_refunded: false },
  { amount_paid_cents: 8900, fully_refunded: true }, // refunded → only 2 count
];
assert.equal(countMaturedInvoices(threePaidOneRefunded), 2);
assert.equal(matureDecision({ status: "pending", count: countMaturedInvoices(threePaidOneRefunded), threshold: THRESHOLD }).matured, false, "a pre-maturity refund keeps it pending");

// Idempotent / frozen: once matured, a re-run does NOT re-mature (no second credit), and later
// cancellations change nothing. Same for void.
const maturedAgain = matureDecision({ status: "matured", count: 5, threshold: THRESHOLD });
assert.equal(maturedAgain.matured, false, "already matured → no re-mature");
assert.equal(maturedAgain.freeze, true);
const voided = matureDecision({ status: "void", count: 9, threshold: THRESHOLD });
assert.equal(voided.matured, false, "void → frozen, never matures");
assert.equal(voided.freeze, true);

// Empty / null guards.
assert.equal(countMaturedInvoices([]), 0);
assert.equal(countMaturedInvoices(null), 0);

console.log("referral: maturity at 3, refund knocks out, idempotent freeze, void ok");
