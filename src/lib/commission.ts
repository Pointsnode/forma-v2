import type { SupabaseClient } from "@supabase/supabase-js";
import { commissionEntriesForPayment, clawbackEntry } from "@/lib/commission.mjs";

// Impure commission engine — called from the webhook mirror lane AFTER the billing_payments /
// billing_refunds upserts, on the service-role admin client. Best-effort; the pure core
// (commission.mjs) decides the entries, this resolves attribution/partner/window and upserts
// idempotently (unique partner_id,kind,source_ref). Writes are engine-owned: created_by null.

type Payment = { stripe_id: string; amount_cents: number | null; paid_at: string | null };
type Refund = { stripe_refund_id: string; amount_cents: number | null; refunded_at: string | null; payment_id: string | null };

export async function accrueCommissionsForPayment(admin: SupabaseClient, workspaceId: string | null, payment: Payment): Promise<void> {
  if (!workspaceId) return;
  const { data: attr } = await admin.from("partner_attributions").select("partner_id").eq("workspace_id", workspaceId).maybeSingle();
  const partnerId = attr?.partner_id as string | null | undefined;
  if (!partnerId) return; // unattributed or house → no entry
  const { data: partner } = await admin.from("partners").select("id, commission_rate_bps, activation_fee_cents").eq("id", partnerId).maybeSingle();
  if (!partner) return;
  const { data: firstInv } = await admin.from("billing_invoices").select("paid_at").eq("workspace_id", workspaceId).not("paid_at", "is", null).order("paid_at", { ascending: true }).limit(1).maybeSingle();
  const windowStartIso = (firstInv?.paid_at as string | null) ?? payment.paid_at;
  const { count } = await admin.from("commission_entries").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).eq("kind", "activation_fee");
  const entries = commissionEntriesForPayment({ payment: { ...payment, workspace_id: workspaceId }, partner, windowStartIso, hasActivation: (count ?? 0) > 0 });
  for (const e of entries) await admin.from("commission_entries").upsert(e, { onConflict: "partner_id,kind,source_ref", ignoreDuplicates: true });
}

export async function clawbackForRefund(admin: SupabaseClient, workspaceId: string | null, refund: Refund): Promise<void> {
  if (!refund.payment_id) return;
  const { data: oc } = await admin.from("commission_entries").select("partner_id, rate_bps").eq("kind", "commission").eq("source_ref", refund.payment_id).maybeSingle();
  if (!oc?.partner_id) return;
  const { data: pay } = await admin.from("billing_payments").select("paid_at").eq("stripe_id", refund.payment_id).maybeSingle();
  const entry = clawbackEntry({ refund: { ...refund, payment_paid_at: (pay?.paid_at as string | null) ?? null, workspace_id: workspaceId }, originalCommission: oc });
  if (entry) await admin.from("commission_entries").upsert(entry, { onConflict: "partner_id,kind,source_ref", ignoreDuplicates: true });
}
