import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchChargeFee } from "@/lib/stripe";
import { billingMirrorOps, invoiceToRow, secToIso, refundStatus } from "@/lib/stripe-mirror.mjs";
import { accrueCommissionsForPayment, clawbackForRefund } from "@/lib/commission";
import { matureReferralForPayment } from "@/lib/referral-engine";

// The impure billing mirror — best-effort, admin-owned tables, service-role (the caller's
// admin client). Classification + row mapping live in stripe-mirror.mjs (pure, tested);
// this file resolves the workspace, fetches the Stripe fee, and upserts. It NEVER touches
// workspace_subscriptions or the planner-fee path — those are the existing lanes.
type Ev = { id: string; type: string; data: { object: Record<string, unknown> } };

async function wsForSubscription(admin: SupabaseClient, subId: unknown): Promise<string | null> {
  if (typeof subId !== "string" || !subId) return null;
  const { data } = await admin.from("workspace_subscriptions").select("workspace_id").eq("stripe_subscription_id", subId).maybeSingle();
  return (data?.workspace_id as string | null) ?? null;
}
async function wsForCustomer(admin: SupabaseClient, custId: unknown): Promise<string | null> {
  if (typeof custId !== "string" || !custId) return null;
  const { data } = await admin.from("workspace_subscriptions").select("workspace_id").eq("stripe_customer_id", custId).maybeSingle();
  return (data?.workspace_id as string | null) ?? null;
}

export async function mirrorBillingEvent(admin: SupabaseClient, event: Ev): Promise<void> {
  const ops = billingMirrorOps(event.type);
  if (!ops.length) return;
  const obj = event.data.object;

  if (ops.includes("invoice")) {
    const inv = obj as {
      id?: string; subscription?: string; customer?: string; charge?: string; payment_intent?: string;
      amount_paid?: number; status_transitions?: { paid_at?: number };
    };
    const ws = (await wsForSubscription(admin, inv.subscription)) ?? (await wsForCustomer(admin, inv.customer));
    await admin.from("billing_invoices").upsert(invoiceToRow(inv, ws));

    if (ops.includes("payment")) {
      const chargeId = typeof inv.charge === "string" ? inv.charge : null;
      const paymentId = chargeId ?? (typeof inv.payment_intent === "string" ? inv.payment_intent : null);
      if (paymentId) {
        let fee: number | null = null;
        let net: number | null = null;
        if (chargeId) {
          const f = await fetchChargeFee(chargeId);
          fee = f?.fee_cents ?? null;
          net = f?.net_cents ?? null;
        }
        const paidAt = secToIso(inv.status_transitions?.paid_at);
        await admin.from("billing_payments").upsert({
          stripe_id: paymentId,
          stripe_invoice_id: inv.id ?? null,
          workspace_id: ws,
          amount_cents: inv.amount_paid ?? null,
          fee_cents: fee,
          net_cents: net,
          status: "succeeded",
          paid_at: paidAt,
        });
        // ADM-2 commission engine (best-effort; never disturbs the mirror above).
        try {
          await accrueCommissionsForPayment(admin, ws, { stripe_id: paymentId, amount_cents: inv.amount_paid ?? null, paid_at: paidAt });
        } catch (e) {
          console.error("commission accrual failed:", (e as Error).message);
        }
        // REF-1 referral maturity (best-effort; the referred workspace's paid invoices).
        try {
          await matureReferralForPayment(admin, ws);
        } catch (e) {
          console.error("referral maturity failed:", (e as Error).message);
        }
      }
    }
    return;
  }

  if (ops.includes("refund")) {
    const charge = obj as {
      id?: string; payment_intent?: string; customer?: string; amount?: number; amount_refunded?: number;
      refunds?: { data?: { id?: string; amount?: number; reason?: string; created?: number }[] };
    };
    const ids = [charge.id, charge.payment_intent].filter((x): x is string => typeof x === "string" && !!x);
    const { data: pay } = ids.length
      ? await admin.from("billing_payments").select("stripe_id, workspace_id").in("stripe_id", ids).maybeSingle()
      : { data: null };
    const paymentId = (pay?.stripe_id as string | null) ?? charge.id ?? null;
    const ws = (pay?.workspace_id as string | null) ?? (await wsForCustomer(admin, charge.customer));
    for (const r of charge.refunds?.data ?? []) {
      if (!r.id) continue;
      const refundedAt = secToIso(r.created);
      await admin.from("billing_refunds").upsert({
        stripe_refund_id: r.id,
        payment_id: paymentId,
        workspace_id: ws,
        amount_cents: r.amount ?? null,
        reason: r.reason ?? null,
        refunded_at: refundedAt,
      });
      // ADM-2 clawback (best-effort; <=90 days, at the original stored rate).
      try {
        await clawbackForRefund(admin, ws, { stripe_refund_id: r.id, amount_cents: r.amount ?? null, refunded_at: refundedAt, payment_id: paymentId });
      } catch (e) {
        console.error("commission clawback failed:", (e as Error).message);
      }
    }
    if (paymentId) {
      await admin.from("billing_payments").update({ status: refundStatus(charge.amount_refunded, charge.amount) }).eq("stripe_id", paymentId);
    }
    return;
  }

  if (ops.includes("dispute")) {
    const dispute = obj as { charge?: string; payment_intent?: string };
    const ids = [dispute.charge, dispute.payment_intent].filter((x): x is string => typeof x === "string" && !!x);
    if (ids.length) await admin.from("billing_payments").update({ disputed: true }).in("stripe_id", ids);
    return;
  }
}
