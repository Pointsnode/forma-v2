// Pure core of the ADM-1 billing mirror — shared by the impure webhook lane and the logic
// tests. No IO. Money stays in cents; units are preserved from Stripe verbatim.

// Which admin-owned billing tables an event implies writing to. Planner-fee events
// (checkout.session.completed / payment_intent.succeeded) and every subscription.* event
// map to NOTHING — they never touch billing_*. This is the classifier both sides share.
export function billingMirrorOps(type) {
  if (type === "invoice.finalized" || type === "invoice.payment_failed" || type === "invoice.voided" || type === "invoice.paid") {
    return type === "invoice.paid" ? ["invoice", "payment"] : ["invoice"];
  }
  if (type === "charge.refunded") return ["refund"];
  if (type === "charge.dispute.created") return ["dispute"];
  return [];
}

// Unix seconds → ISO, or null (Stripe timestamps are integer seconds).
export function secToIso(sec) {
  return typeof sec === "number" && sec > 0 ? new Date(sec * 1000).toISOString() : null;
}

// Stripe invoice object → billing_invoices row. discount is the summed line discounts
// (Stripe's own figure), never derived from subtotal/total arithmetic.
export function invoiceToRow(inv, workspaceId) {
  const discount = Array.isArray(inv.total_discount_amounts)
    ? inv.total_discount_amounts.reduce((s, d) => s + (Number(d.amount) || 0), 0)
    : 0;
  return {
    stripe_invoice_id: inv.id,
    workspace_id: workspaceId ?? null,
    status: inv.status ?? null,
    currency: inv.currency ?? null,
    subtotal_cents: inv.subtotal ?? null,
    discount_cents: discount,
    tax_cents: inv.tax ?? null,
    total_cents: inv.total ?? null,
    amount_paid_cents: inv.amount_paid ?? null,
    paid_at: secToIso(inv.status_transitions?.paid_at),
    period_start: secToIso(inv.period_start),
    period_end: secToIso(inv.period_end),
    hosted_invoice_url: inv.hosted_invoice_url ?? null,
  };
}

// A refund is total when the charge's refunded amount reaches its amount.
export function refundStatus(amountRefunded, amount) {
  return (Number(amountRefunded) || 0) >= (Number(amount) || 0) ? "refunded" : "partially_refunded";
}
