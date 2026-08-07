// Cents-accurate money, formatted once for the admin. Stripe stores minor units, so the
// admin never rounds to whole dollars (unlike the planner-facing formatMoney). Pure.
export function formatCents(cents, currency = "USD", locale = "en") {
  const n = (Number(cents) || 0) / 100;
  return new Intl.NumberFormat(locale, { style: "currency", currency: (currency || "USD").toUpperCase() }).format(n);
}
