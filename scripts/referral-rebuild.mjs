#!/usr/bin/env node
// REF-1 referral rebuild — service-role, MANUAL, deterministic. For every PENDING referral,
// recount the referred workspace's paid, non-fully-refunded invoices from the mirror and
// (re)apply maturity + the $100 credit (idempotent on the ledger's unique key). MATURED and VOID
// referrals are frozen. Reuses the SAME pure engine (referral.mjs) as the webhook, so live
// accrual and a rebuild can never drift. No Stripe key needed — it reads the mirror only.
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/referral-rebuild.mjs
import { createClient } from "@supabase/supabase-js";
import { countMaturedInvoices, matureDecision, REFERRAL_INVOICES, REFERRAL_CREDIT_CENTS } from "../src/lib/referral.mjs";

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("referral-rebuild: set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}
const db = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const { data: referrals } = await db.from("referrals").select("referred_workspace_id, referrer_workspace_id, status").eq("status", "pending");
let updated = 0, matured = 0;
for (const r of referrals ?? []) {
  const { data: invoices } = await db.from("billing_invoices").select("stripe_invoice_id, amount_paid_cents").eq("workspace_id", r.referred_workspace_id);
  const invIds = (invoices ?? []).map((i) => i.stripe_invoice_id);
  const refunded = new Set();
  if (invIds.length) {
    const { data: pays } = await db.from("billing_payments").select("stripe_invoice_id, status").in("stripe_invoice_id", invIds);
    for (const p of pays ?? []) if (p.status === "refunded" && p.stripe_invoice_id) refunded.add(p.stripe_invoice_id);
  }
  const enriched = (invoices ?? []).map((iv) => ({ amount_paid_cents: iv.amount_paid_cents, fully_refunded: refunded.has(iv.stripe_invoice_id) }));
  const d = matureDecision({ status: r.status, count: countMaturedInvoices(enriched), threshold: REFERRAL_INVOICES });
  await db.from("referrals").update({ paid_invoice_count: d.count, ...(d.matured ? { status: "matured", matured_at: new Date().toISOString() } : {}) }).eq("referred_workspace_id", r.referred_workspace_id);
  updated++;
  if (d.matured) {
    await db.from("referral_credits").upsert(
      { workspace_id: r.referrer_workspace_id, kind: "credit", source_ref: r.referred_workspace_id, amount_cents: REFERRAL_CREDIT_CENTS, status: "accrued", memo: "referral matured" },
      { onConflict: "workspace_id,kind,source_ref", ignoreDuplicates: true },
    );
    matured++;
  }
}
console.log(`referral rebuild: ${updated} pending referrals recounted, ${matured} matured (deterministic; matured + void frozen).`);
