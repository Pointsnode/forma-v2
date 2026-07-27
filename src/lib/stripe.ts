import "server-only";

// Stripe hosted Checkout via the REST API (no SDK). Test mode until cutover.
// Only planner_fee lines ever reach here (Decision 3). If STRIPE_SECRET_KEY is
// unset (dev / preview before Gio wires it), callers see null and render a
// "payments not configured" state rather than crashing — the Resend pattern.
const API = "https://api.stripe.com/v1";

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

export async function createCheckoutSession(opts: {
  lineId: string;
  weddingId: string;
  amountCents: number;
  title: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
}): Promise<{ url: string } | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const form = new URLSearchParams();
  form.set("mode", "payment");
  form.set("success_url", opts.successUrl);
  form.set("cancel_url", opts.cancelUrl);
  form.set("client_reference_id", opts.lineId);
  form.set("metadata[ledger_line_id]", opts.lineId);
  form.set("metadata[wedding_id]", opts.weddingId);
  form.set("payment_intent_data[metadata][ledger_line_id]", opts.lineId);
  form.set("payment_intent_data[metadata][wedding_id]", opts.weddingId);
  if (opts.customerEmail) form.set("customer_email", opts.customerEmail);
  form.set("line_items[0][quantity]", "1");
  form.set("line_items[0][price_data][currency]", "usd");
  form.set("line_items[0][price_data][unit_amount]", String(opts.amountCents));
  form.set("line_items[0][price_data][product_data][name]", opts.title);

  const res = await fetch(`${API}/checkout/sessions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  if (!res.ok) {
    console.error(`stripe checkout ${res.status}: ${(await res.text()).slice(0, 300)}`);
    throw new Error(`stripe ${res.status}`);
  }
  const data = (await res.json()) as { url: string };
  return { url: data.url };
}
