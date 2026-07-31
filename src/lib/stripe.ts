import "server-only";
import { seatBill, PRICE_ADMIN, PRICE_ADDITIONAL, PRICE_CONCIERGE } from "@/lib/pricing";
import { planLines, planTotalCents, reconcileItems } from "@/lib/subscription-plan.mjs";

// Stripe hosted Checkout via the REST API (no SDK). Test mode until cutover.
// Planner_fee one-off lines (Decision 3) AND the studio's own Forma subscription
// (Part F) both live here. If STRIPE_SECRET_KEY is unset (dev / preview before Gio
// wires it), callers see null and render a "payments not configured" state rather
// than crashing — the Resend pattern.
const API = "https://api.stripe.com/v1";

const PRICES = { priceAdmin: PRICE_ADMIN, priceAdditional: PRICE_ADDITIONAL, priceConcierge: PRICE_CONCIERGE };

export function stripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY;
}

// Thin REST helper — same header/error shape as createCheckoutSession below.
async function stripe(path: string, method: "GET" | "POST", form?: URLSearchParams): Promise<Record<string, unknown> | null> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: form ? form.toString() : undefined,
  });
  if (!res.ok) {
    console.error(`stripe ${method} ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    throw new Error(`stripe ${res.status}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

// Write one recurring price_data line's form fields (shared by Checkout line_items and
// subscription-item adds). `p` is the field prefix, e.g. "line_items[0]" or "items[2]".
function writeRecurringLine(form: URLSearchParams, p: string, amountCents: number, quantity: number, name: string) {
  form.set(`${p}[price_data][currency]`, "usd");
  form.set(`${p}[price_data][unit_amount]`, String(amountCents));
  form.set(`${p}[price_data][recurring][interval]`, "month");
  form.set(`${p}[price_data][product_data][name]`, name);
  form.set(`${p}[quantity]`, String(quantity));
}

// ── Part F: the studio's own Forma subscription ──────────────────────────────────
// Start a subscription in Checkout (subscription mode). Line items are the seatBill
// breakdown as recurring price_data — the price is lib/pricing.ts, never a stored Stripe
// Price. A guard proves the Stripe total equals seatBill(...).total before we ever send
// it, so the two can't drift. workspace_id rides on the subscription's metadata so the
// webhook can resolve the row. A stored stripe_customer_id is reused; otherwise Checkout
// creates the customer (the webhook persists it).
export async function createSubscriptionCheckout(opts: {
  workspaceId: string;
  accounts: number;
  conciergeSeats: number;
  customerId?: string | null;
  customerEmail?: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string } | null> {
  if (!stripeConfigured()) return null;
  const lines = planLines(opts.accounts, opts.conciergeSeats, PRICES) as { amountCents: number; quantity: number; name: string }[];
  // Proof the Stripe amount is identical to Team's seatBill — refuse to charge otherwise.
  const bill = seatBill(opts.accounts, opts.conciergeSeats);
  if (planTotalCents(opts.accounts, opts.conciergeSeats, PRICES) !== bill.total * 100) {
    throw new Error("subscription total diverged from seatBill");
  }
  const form = new URLSearchParams();
  form.set("mode", "subscription");
  form.set("success_url", opts.successUrl);
  form.set("cancel_url", opts.cancelUrl);
  form.set("client_reference_id", opts.workspaceId);
  form.set("metadata[workspace_id]", opts.workspaceId);
  form.set("subscription_data[metadata][workspace_id]", opts.workspaceId);
  if (opts.customerId) form.set("customer", opts.customerId);
  else if (opts.customerEmail) form.set("customer_email", opts.customerEmail);
  lines.forEach((l, i) => writeRecurringLine(form, `line_items[${i}]`, l.amountCents, l.quantity, l.name));
  const data = await stripe("/checkout/sessions", "POST", form);
  return data ? { url: data.url as string } : null;
}

// Customer Portal session — manage payment method / cancel.
export async function createPortalSession(opts: { customerId: string; returnUrl: string }): Promise<{ url: string } | null> {
  if (!stripeConfigured()) return null;
  const form = new URLSearchParams();
  form.set("customer", opts.customerId);
  form.set("return_url", opts.returnUrl);
  const data = await stripe("/billing_portal/sessions", "POST", form);
  return data ? { url: data.url as string } : null;
}

type SubItem = { id: string; unitAmount: number; quantity: number };

// The live subscription's items, distilled to {id, unitAmount, quantity} for reconcile.
export async function fetchSubscriptionItems(subscriptionId: string): Promise<SubItem[] | null> {
  const data = await stripe(`/subscriptions/${subscriptionId}`, "GET");
  if (!data) return null;
  const items = ((data.items as { data?: Record<string, unknown>[] })?.data ?? []) as Record<string, unknown>[];
  return items.map((it) => ({
    id: it.id as string,
    unitAmount: Number((it.price as { unit_amount?: number })?.unit_amount ?? 0),
    quantity: Number(it.quantity ?? 0),
  }));
}

// Period-boundary reconciliation (invoice.upcoming): set the subscription's item
// quantities to the live roster so the RENEWAL bills accurately — no mid-cycle proration
// (proration_behavior=none). Adds a line the roster grew into, removes one it shrank out
// of, corrects quantities on the rest. No-op when nothing changed.
export async function reconcileSubscription(subscriptionId: string, accounts: number, conciergeSeats: number): Promise<boolean> {
  const existing = await fetchSubscriptionItems(subscriptionId);
  if (!existing) return false;
  const { setQty, add, remove } = reconcileItems(existing, accounts, conciergeSeats, PRICES) as {
    setQty: { id: string; quantity: number }[];
    add: { amountCents: number; quantity: number; name: string }[];
    remove: string[];
  };
  if (!setQty.length && !add.length && !remove.length) return true;
  const form = new URLSearchParams();
  form.set("proration_behavior", "none");
  let i = 0;
  for (const s of setQty) { form.set(`items[${i}][id]`, s.id); form.set(`items[${i}][quantity]`, String(s.quantity)); i++; }
  for (const id of remove) { form.set(`items[${i}][id]`, id); form.set(`items[${i}][deleted]`, "true"); i++; }
  for (const a of add) { writeRecurringLine(form, `items[${i}]`, a.amountCents, a.quantity, a.name); i++; }
  await stripe(`/subscriptions/${subscriptionId}`, "POST", form);
  return true;
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
