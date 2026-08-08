import assert from "node:assert/strict";
import { computeReport, periodBounds, inRange } from "./report.mjs";

// A rich fixture spanning every kind, with period-boundary edges.
const data = {
  payments: [
    { amount_cents: 7900, fee_cents: 259, status: "succeeded", paid_at: "2026-08-15T12:00:00Z" }, // in
    { amount_cents: 5000, fee_cents: 175, status: "succeeded", paid_at: "2026-08-31T23:59:00Z" }, // month-end 23:59 → IN
    { amount_cents: 3000, fee_cents: 100, status: "succeeded", paid_at: "2026-09-01T00:00:00Z" }, // next-month 00:00 → OUT
    { amount_cents: 1000, fee_cents: 50, status: "failed", paid_at: "2026-08-10T00:00:00Z" },     // failed → OUT
  ],
  refunds: [
    { amount_cents: 500, refunded_at: "2026-08-20T00:00:00Z" }, // in
    { amount_cents: 800, refunded_at: "2026-09-02T00:00:00Z" }, // cross-month → OUT
  ],
  commissions: [
    { partner_id: "P1", amount_cents: 2370, status: "accrued", created_at: "2026-08-15T12:00:00Z" }, // in
    { partner_id: "P1", amount_cents: 1000, status: "paid", created_at: "2026-08-16T00:00:00Z" },     // paid still counts as accrued-ever
    { partner_id: "P1", amount_cents: 500, status: "void", created_at: "2026-08-17T00:00:00Z" },      // void → OUT
    { partner_id: "P1", amount_cents: 900, status: "accrued", created_at: "2026-07-31T23:59:00Z" },   // prior month → OUT
  ],
  payouts: [
    { partner_id: "P1", total_cents: 3370, paid_on: "2026-08-01" }, // in month + year
    { partner_id: "P2", total_cents: 1200, paid_on: "2026-08-25" }, // in month + year
    { partner_id: "P1", total_cents: 500, paid_on: "2026-12-01" },  // out of month, IN year
  ],
  expenses: [
    { category: "infrastructure", amount_cents: 2000, voided: false, paid_on: "2026-08-05" }, // in
    { category: "tooling", amount_cents: 1500, voided: false, paid_on: "2026-08-06" },        // in
    { category: "infrastructure", amount_cents: 999, voided: true, paid_on: "2026-08-07" },   // voided → OUT of sums
    { category: "services", amount_cents: 700, voided: false, paid_on: "2026-09-03" },        // next month → OUT
  ],
};

const b = periodBounds("month", "2026-08");
assert.equal(b.startIso, "2026-08-01T00:00:00.000Z");
assert.equal(b.endIso, "2026-09-01T00:00:00.000Z");
const r = computeReport(b, data);

// Every figure re-derived INDEPENDENTLY from the fixture (cent-exact).
assert.equal(r.gross, 7900 + 5000, "gross = the two in-period succeeded payments");          // 12900
assert.equal(r.fees, 259 + 175, "fees = their fees");                                          // 434
assert.equal(r.refunds, 500, "refunds = only the in-period refund (cross-month excluded)");    // 500
assert.equal(r.netRevenue, 12900 - 500 - 434);                                                 // 11966
assert.equal(r.commissionsAccrued, 2370 + 1000, "accrued+paid count; void + prior-month excluded"); // 3370
assert.equal(r.payoutsRecorded, 3370 + 1200, "payouts recorded this month (Dec excluded)");    // 4570
assert.deepEqual(r.expensesByCategory, { infrastructure: 2000, tooling: 1500 }, "voided + next-month excluded");
assert.equal(r.expensesTotal, 3500);
assert.equal(r.net, 11966 - 3370 - 3500, "net = netRevenue - commissions - expenses");         // 5096
assert.deepEqual(r.perPartnerAnnual, { P1: 3370 + 500, P2: 1200 }, "per-partner payouts across the YEAR");

// Boundary primitives.
assert.equal(inRange("2026-08-31T23:59:00Z", b.startIso, b.endIso), true);
assert.equal(inRange("2026-09-01T00:00:00Z", b.startIso, b.endIso), false);

// Quarter + year bounds.
const q = periodBounds("quarter", "2026-Q3");
assert.equal(q.startIso, "2026-07-01T00:00:00.000Z");
assert.equal(q.endIso, "2026-10-01T00:00:00.000Z");
const y = periodBounds("year", "2026");
assert.equal(y.startIso, "2026-01-01T00:00:00.000Z");
assert.equal(y.endIso, "2027-01-01T00:00:00.000Z");

// Empty data → all zeros, never fakes.
const z = computeReport(b, {});
assert.equal(z.gross, 0);
assert.equal(z.net, 0);
assert.deepEqual(z.expensesByCategory, {});
assert.deepEqual(z.perPartnerAnnual, {});

console.log("report: computed figures re-derived cent-exact + boundary edges ok");
