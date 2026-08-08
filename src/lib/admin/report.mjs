// Pure accountant report — every figure derives from the raw mirror/ledger/expense rows for
// the period, so a test can re-derive each one independently. Zeros, never fakes. Money in cents.
// net = net revenue (gross - refunds - fees) - commissions accrued - expenses; payouts recorded is
// a cash-movement line (the commissions were counted when they accrued, not when paid).
const sum = (arr, k) => (arr ?? []).reduce((s, x) => s + (Number(x[k]) || 0), 0);

// [start, end): a month-end 23:59 payment is IN; a next-month-00:00 payment is OUT.
export function inRange(iso, startIso, endIso) {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= new Date(startIso).getTime() && t < new Date(endIso).getTime();
}

export function computeReport({ startIso, endIso, yearStartIso, yearEndIso }, data) {
  const paidInPeriod = (data.payments ?? []).filter((p) => p.status === "succeeded" && inRange(p.paid_at, startIso, endIso));
  const gross = sum(paidInPeriod, "amount_cents");
  const fees = sum(paidInPeriod, "fee_cents");
  const refunds = sum((data.refunds ?? []).filter((r) => inRange(r.refunded_at, startIso, endIso)), "amount_cents");
  const netRevenue = gross - refunds - fees;

  const commissionsAccrued = sum((data.commissions ?? []).filter((c) => c.status !== "void" && inRange(c.created_at, startIso, endIso)), "amount_cents");
  const payoutsRecorded = sum((data.payouts ?? []).filter((po) => inRange(po.paid_on, startIso, endIso)), "total_cents");

  const activeExpenses = (data.expenses ?? []).filter((e) => !e.voided && inRange(e.paid_on, startIso, endIso));
  const expensesByCategory = {};
  for (const e of activeExpenses) expensesByCategory[e.category] = (expensesByCategory[e.category] ?? 0) + (Number(e.amount_cents) || 0);
  const expensesTotal = sum(activeExpenses, "amount_cents");

  const net = netRevenue - commissionsAccrued - expensesTotal;

  // The contractor-payments record: per-partner payouts recorded across the YEAR of the period.
  const perPartnerAnnual = {};
  const ys = yearStartIso ?? startIso;
  const ye = yearEndIso ?? endIso;
  for (const po of (data.payouts ?? []).filter((p) => inRange(p.paid_on, ys, ye))) {
    perPartnerAnnual[po.partner_id] = (perPartnerAnnual[po.partner_id] ?? 0) + (Number(po.total_cents) || 0);
  }

  return { gross, refunds, fees, netRevenue, commissionsAccrued, payoutsRecorded, expensesByCategory, expensesTotal, net, perPartnerAnnual };
}

// Period bounds for the picker. month = "YYYY-MM", quarter = "YYYY-Qn", year = "YYYY".
export function periodBounds(kind, value) {
  if (kind === "year") {
    const y = Number(value);
    return { startIso: iso(y, 0), endIso: iso(y + 1, 0), yearStartIso: iso(y, 0), yearEndIso: iso(y + 1, 0) };
  }
  if (kind === "quarter") {
    const [ys, q] = value.split("-Q");
    const y = Number(ys);
    const m0 = (Number(q) - 1) * 3;
    return { startIso: iso(y, m0), endIso: iso(y, m0 + 3), yearStartIso: iso(y, 0), yearEndIso: iso(y + 1, 0) };
  }
  const [ys, ms] = value.split("-");
  const y = Number(ys);
  const m = Number(ms) - 1;
  return { startIso: iso(y, m), endIso: iso(y, m + 1), yearStartIso: iso(y, 0), yearEndIso: iso(y + 1, 0) };
}
function iso(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex, 1)).toISOString();
}
