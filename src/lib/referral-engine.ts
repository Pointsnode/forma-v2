import type { SupabaseClient } from "@supabase/supabase-js";
import { countMaturedInvoices, matureDecision } from "@/lib/referral.mjs";
import { REFERRAL_INVOICES, REFERRAL_CREDIT_CENTS } from "@/lib/referral";

// Impure referral maturity — called from the webhook mirror lane on invoice.paid for a referred
// workspace, after the billing_invoices/payments upserts. Best-effort, service-role admin client.
// Recounts the referred workspace's PAID, non-fully-refunded invoices from the mirror; at >= 3
// (pending) it matures and mints the referrer's $100 credit, idempotent on the ledger's unique key.
export async function matureReferralForPayment(admin: SupabaseClient, referredWs: string | null): Promise<void> {
  if (!referredWs) return;
  const { data: ref } = await admin.from("referrals").select("referrer_workspace_id, status, paid_invoice_count").eq("referred_workspace_id", referredWs).maybeSingle();
  if (!ref || ref.status !== "pending") return; // none, or frozen (matured/void)

  const { data: invoices } = await admin.from("billing_invoices").select("stripe_invoice_id, amount_paid_cents").eq("workspace_id", referredWs);
  const invIds = (invoices ?? []).map((i) => (i as { stripe_invoice_id: string }).stripe_invoice_id);
  const refunded = new Set<string>();
  if (invIds.length) {
    const { data: pays } = await admin.from("billing_payments").select("stripe_invoice_id, status").in("stripe_invoice_id", invIds);
    for (const p of (pays ?? []) as { stripe_invoice_id: string | null; status: string | null }[]) {
      if (p.status === "refunded" && p.stripe_invoice_id) refunded.add(p.stripe_invoice_id);
    }
  }
  const enriched = (invoices ?? []).map((iv) => {
    const x = iv as { stripe_invoice_id: string; amount_paid_cents: number | null };
    return { amount_paid_cents: x.amount_paid_cents, fully_refunded: refunded.has(x.stripe_invoice_id) };
  });
  const decision = matureDecision({ status: ref.status as string, count: countMaturedInvoices(enriched), threshold: REFERRAL_INVOICES });

  await admin.from("referrals").update({
    paid_invoice_count: decision.count,
    ...(decision.matured ? { status: "matured", matured_at: new Date().toISOString() } : {}),
  }).eq("referred_workspace_id", referredWs);

  if (decision.matured) {
    await admin.from("referral_credits").upsert(
      { workspace_id: ref.referrer_workspace_id, kind: "credit", source_ref: referredWs, amount_cents: REFERRAL_CREDIT_CENTS, status: "accrued", memo: "referral matured" },
      { onConflict: "workspace_id,kind,source_ref", ignoreDuplicates: true },
    );
  }
}
