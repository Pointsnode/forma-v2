// Pure commission engine — shared by the impure webhook wrapper and the rebuild script, and
// fully tested. No IO. Deterministic: the same mirror + attribution always yields the same
// entries. Money in cents; amount_cents is signed (clawbacks negative). The papered rules:
//   window  = 12 months from the workspace's FIRST paid invoice (min paid_at), computed
//   base    = the payment's amount_cents (post-discount cash collected)
//   rate    = the partner's stored commission_rate_bps
//   activation = one activation_fee entry per workspace, with the FIRST commissioned payment
//   clawback = a refund <= 90 days after its payment, negative, at the ORIGINAL stored rate

export function commissionAmount(baseCents, rateBps) {
  return Math.round((Number(baseCents) || 0) * (Number(rateBps) || 0) / 10000);
}

// Within 12 months of windowStart: [start, start + 12 months).
export function withinWindow(paidAtIso, windowStartIso) {
  if (!paidAtIso || !windowStartIso) return false;
  const start = new Date(windowStartIso);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 12);
  const at = new Date(paidAtIso);
  return at >= start && at < end;
}

export function within90Days(fromIso, toIso) {
  if (!fromIso || !toIso) return false;
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return ms >= 0 && ms <= 90 * 24 * 3600 * 1000;
}

// The entries a single paid payment implies (commission, and activation once). Empty when there
// is no partner (house / unattributed) or the payment is outside the window.
export function commissionEntriesForPayment({ payment, partner, windowStartIso, hasActivation }) {
  const out = [];
  if (!partner || !partner.id) return out;
  if (!withinWindow(payment.paid_at, windowStartIso)) return out;
  const rate = partner.commission_rate_bps;
  out.push({
    partner_id: partner.id, workspace_id: payment.workspace_id, kind: "commission",
    source_ref: payment.stripe_id, base_amount_cents: payment.amount_cents ?? 0,
    rate_bps: rate, amount_cents: commissionAmount(payment.amount_cents, rate), status: "accrued",
  });
  if (!hasActivation && (partner.activation_fee_cents ?? 0) > 0) {
    out.push({
      partner_id: partner.id, workspace_id: payment.workspace_id, kind: "activation_fee",
      source_ref: payment.workspace_id, base_amount_cents: 0,
      rate_bps: 0, amount_cents: partner.activation_fee_cents, status: "accrued",
    });
  }
  return out;
}

// A clawback for a refund, at the ORIGINAL commission's stored rate. Null if no original
// commission or the refund is outside the 90-day window.
export function clawbackEntry({ refund, originalCommission }) {
  if (!originalCommission || !originalCommission.partner_id) return null;
  if (!within90Days(refund.payment_paid_at, refund.refunded_at)) return null;
  const rate = originalCommission.rate_bps;
  const abs = Math.abs(Number(refund.amount_cents) || 0);
  return {
    partner_id: originalCommission.partner_id, workspace_id: refund.workspace_id, kind: "clawback",
    source_ref: refund.stripe_refund_id, base_amount_cents: -abs,
    rate_bps: rate, amount_cents: -commissionAmount(abs, rate), status: "accrued",
  };
}

// Deterministic full rebuild from the mirror. payments/refunds are the succeeded mirror rows;
// lookups are plain Maps. Payments are processed in paid_at order so activation lands on the
// first, and clawbacks reference the commission generated here (old rate). Pure → the rebuild
// script and the determinism test share it verbatim.
export function rebuildCommissions({ payments, refunds, attributionByWs, partnerById, firstPaidByWs }) {
  const entries = [];
  const activated = new Set();
  const commissionByPayment = new Map();
  const ordered = [...payments].sort((a, b) => String(a.paid_at || "").localeCompare(String(b.paid_at || "")) || String(a.stripe_id).localeCompare(String(b.stripe_id)));
  for (const p of ordered) {
    const attr = attributionByWs.get(p.workspace_id);
    if (!attr || !attr.partner_id) continue;
    const partner = partnerById.get(attr.partner_id);
    const list = commissionEntriesForPayment({ payment: p, partner, windowStartIso: firstPaidByWs.get(p.workspace_id), hasActivation: activated.has(p.workspace_id) });
    for (const e of list) {
      entries.push(e);
      if (e.kind === "commission") commissionByPayment.set(p.stripe_id, { partner_id: e.partner_id, rate_bps: e.rate_bps, paid_at: p.paid_at, workspace_id: p.workspace_id });
      if (e.kind === "activation_fee") activated.add(p.workspace_id);
    }
  }
  const orderedRefunds = [...refunds].sort((a, b) => String(a.refunded_at || "").localeCompare(String(b.refunded_at || "")) || String(a.stripe_refund_id).localeCompare(String(b.stripe_refund_id)));
  for (const r of orderedRefunds) {
    const oc = commissionByPayment.get(r.payment_id);
    const e = clawbackEntry({ refund: { ...r, payment_paid_at: oc?.paid_at, workspace_id: oc?.workspace_id }, originalCommission: oc });
    if (e) entries.push(e);
  }
  return entries;
}
