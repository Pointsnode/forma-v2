#!/usr/bin/env node
// ADM-1 Stripe backfill — idempotent, service-role, MANUAL. Pages the Stripe API and
// upserts the billing mirror, so history is complete when the webhook goes live mid-stream
// and so test-mode data can be wiped and re-pulled. Idempotent by construction: every
// mirror table keys on a Stripe id (upsert on the PK). Reuses the SAME pure mappers as the
// webhook, so the two can never drift. There is no CI backfill lane — run this by hand:
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... STRIPE_SECRET_KEY=... \
//     node scripts/stripe-backfill.mjs
import { createClient } from "@supabase/supabase-js";
import { invoiceToRow, secToIso, refundStatus } from "../src/lib/stripe-mirror.mjs";

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !STRIPE_SECRET_KEY) {
  console.error("backfill: set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY");
  process.exit(2);
}
const db = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const API = "https://api.stripe.com/v1";

async function stripe(path) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` } });
  if (!res.ok) throw new Error(`stripe ${res.status} ${path}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
async function* pages(path) {
  let after = null;
  for (;;) {
    const url = `${path}${path.includes("?") ? "&" : "?"}limit=100${after ? `&starting_after=${after}` : ""}`;
    const page = await stripe(url);
    for (const it of page.data) yield it;
    if (!page.has_more || !page.data.length) break;
    after = page.data[page.data.length - 1].id;
  }
}
async function wsFor(subscription, customer) {
  if (subscription) {
    const { data } = await db.from("workspace_subscriptions").select("workspace_id").eq("stripe_subscription_id", subscription).maybeSingle();
    if (data) return data.workspace_id;
  }
  if (customer) {
    const { data } = await db.from("workspace_subscriptions").select("workspace_id").eq("stripe_customer_id", customer).maybeSingle();
    if (data) return data.workspace_id ?? null;
  }
  return null;
}

let invoices = 0, payments = 0, refunds = 0;

for await (const inv of pages("/invoices")) {
  const ws = await wsFor(inv.subscription, inv.customer);
  await db.from("billing_invoices").upsert(invoiceToRow(inv, ws));
  invoices++;
  if (inv.status === "paid") {
    const chargeId = typeof inv.charge === "string" ? inv.charge : null;
    const paymentId = chargeId ?? (typeof inv.payment_intent === "string" ? inv.payment_intent : null);
    if (paymentId) {
      let fee = null, net = null;
      if (chargeId) {
        const c = await stripe(`/charges/${chargeId}?expand[]=balance_transaction`);
        const bt = c.balance_transaction;
        if (bt && typeof bt === "object") { fee = bt.fee ?? null; net = bt.net ?? null; }
      }
      await db.from("billing_payments").upsert({
        stripe_id: paymentId, stripe_invoice_id: inv.id, workspace_id: ws,
        amount_cents: inv.amount_paid ?? null, fee_cents: fee, net_cents: net,
        status: "succeeded", paid_at: secToIso(inv.status_transitions?.paid_at),
      });
      payments++;
    }
  }
}

for await (const charge of pages("/charges")) {
  if (!charge.refunds?.data?.length) continue;
  const paymentId = charge.id;
  const ws = await wsFor(null, charge.customer);
  for (const r of charge.refunds.data) {
    await db.from("billing_refunds").upsert({
      stripe_refund_id: r.id, payment_id: paymentId, workspace_id: ws,
      amount_cents: r.amount ?? null, reason: r.reason ?? null, refunded_at: secToIso(r.created),
    });
    refunds++;
  }
  if (charge.amount_refunded) {
    await db.from("billing_payments").update({ status: refundStatus(charge.amount_refunded, charge.amount) }).eq("stripe_id", paymentId);
  }
}

console.log(`backfill: ${invoices} invoices, ${payments} payments, ${refunds} refunds upserted (idempotent).`);
