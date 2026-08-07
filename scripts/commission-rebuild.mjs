#!/usr/bin/env node
// ADM-2 commission rebuild — service-role, MANUAL, deterministic. Regenerates every
// non-adjustment, non-paid commission entry from the mirror (in paid_at order). PAID rows and
// ADJUSTMENT rows are FROZEN — never deleted, never overwritten. Reuses the SAME pure engine
// (commission.mjs) as the webhook, so live accrual and a rebuild can never drift. Running it
// twice yields an identical ledger. No Stripe key needed — it reads the mirror only.
//   NEXT_PUBLIC_SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/commission-rebuild.mjs
import { createClient } from "@supabase/supabase-js";
import { rebuildCommissions } from "../src/lib/commission.mjs";

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("commission-rebuild: set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY");
  process.exit(2);
}
const db = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const [{ data: payments }, { data: refunds }, { data: attributions }, { data: partners }, { data: invoices }] = await Promise.all([
  db.from("billing_payments").select("stripe_id, workspace_id, amount_cents, paid_at, status"),
  db.from("billing_refunds").select("stripe_refund_id, payment_id, workspace_id, amount_cents, refunded_at"),
  db.from("partner_attributions").select("workspace_id, partner_id"),
  db.from("partners").select("id, commission_rate_bps, activation_fee_cents"),
  db.from("billing_invoices").select("workspace_id, paid_at"),
]);

const attributionByWs = new Map((attributions ?? []).map((a) => [a.workspace_id, a]));
const partnerById = new Map((partners ?? []).map((p) => [p.id, p]));
const firstPaidByWs = new Map();
for (const iv of invoices ?? []) {
  if (!iv.paid_at) continue;
  const cur = firstPaidByWs.get(iv.workspace_id);
  if (!cur || iv.paid_at < cur) firstPaidByWs.set(iv.workspace_id, iv.paid_at);
}

const desired = rebuildCommissions({
  payments: (payments ?? []).filter((p) => p.status === "succeeded" && p.paid_at),
  refunds: refunds ?? [],
  attributionByWs, partnerById, firstPaidByWs,
});

// Delete the regenerable set (non-adjustment AND non-paid), then upsert the desired entries.
// ignoreDuplicates protects any surviving PAID row (its key is unchanged), so paid stays paid.
const { error: delErr } = await db.from("commission_entries").delete().neq("kind", "adjustment").neq("status", "paid");
if (delErr) { console.error("commission-rebuild: delete failed:", delErr.message); process.exit(2); }
for (const e of desired) {
  await db.from("commission_entries").upsert({ ...e, created_by: null }, { onConflict: "partner_id,kind,source_ref", ignoreDuplicates: true });
}

console.log(`commission rebuild: ${desired.length} entries regenerated (paid + adjustment frozen, deterministic).`);
