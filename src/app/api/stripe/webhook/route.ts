import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { APP_URL } from "@/lib/env";
import { verifyStripeSignature, isPaymentEvent } from "@/lib/stripe-verify.mjs";
import { mapSubStatus } from "@/lib/subscription-plan.mjs";
import { reconcileSubscription } from "@/lib/stripe";
import { seatBill } from "@/lib/pricing";
import { sendBatch } from "@/lib/email/resend";
import { phase1InviteEmails } from "@/lib/email/contract-email";

// Unix seconds → ISO, or null. Stripe periods arrive as integer seconds.
function iso(sec: unknown): string | null {
  return typeof sec === "number" && sec > 0 ? new Date(sec * 1000).toISOString() : null;
}

// The live roster for a workspace (service-role, RLS bypassed). Concierge seat = the
// admin box (owner role) OR an explicit concierge grant — the same rule Team/Usage use.
async function workspaceSeats(admin: SupabaseClient, ws: string): Promise<{ accounts: number; conciergeSeats: number }> {
  const { data } = await admin.from("workspace_members").select("role, grants").eq("workspace_id", ws);
  const rows = (data ?? []) as { role: string; grants: string[] | null }[];
  const conciergeSeats = rows.filter((m) => m.role === "owner" || (m.grants ?? []).includes("admin") || (m.grants ?? []).includes("concierge")).length;
  return { accounts: rows.length, conciergeSeats };
}

// Resolve the workspace behind an invoice via its subscription id (the stored row).
async function workspaceForSubscription(admin: SupabaseClient, subscriptionId: string | null): Promise<string | null> {
  if (!subscriptionId) return null;
  const { data } = await admin.from("workspace_subscriptions").select("workspace_id").eq("stripe_subscription_id", subscriptionId).maybeSingle();
  return (data?.workspace_id as string | null) ?? null;
}

// Stripe webhook — signature-verified, idempotent. Two lanes, both service-role (no user
// session exists for a webhook): (1) a settled planner fee records the payment + flips
// the ledger line (record_fee_payment) then emails Phase-1 invites; (2) the studio's own
// Forma subscription (Part F) — customer.subscription.* mirrors status/period into
// workspace_subscriptions, invoice.upcoming reconciles item quantities to the live roster
// (period-boundary, no mid-cycle proration), invoice.paid snapshots the billed seats.
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const raw = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!secret || !verifyStripeSignature(raw, sig, secret)) {
    return NextResponse.json({ error: "bad signature" }, { status: 400 });
  }

  let event: { id: string; type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  const admin = createAdminClient();
  // Idempotency: first write wins. A PK conflict (23505) means already handled.
  const { error: dupeErr } = await admin.from("stripe_events").insert({ id: event.id, type: event.type });
  if (dupeErr?.code === "23505") return NextResponse.json({ received: true, duplicate: true });

  if (isPaymentEvent(event.type)) {
    const obj = event.data.object as {
      metadata?: { ledger_line_id?: string; wedding_id?: string };
      client_reference_id?: string; payment_intent?: string; id?: string;
      amount_total?: number; amount?: number;
    };
    const lineId = obj.metadata?.ledger_line_id ?? obj.client_reference_id ?? null;
    const intent = obj.payment_intent ?? obj.id ?? event.id;
    const amount = (obj.amount_total ?? obj.amount ?? 0) / 100;
    if (lineId) {
      // record_fee_payment is itself idempotent (upsert on intent, status<>'paid' guard)
      await admin.rpc("record_fee_payment", { p_line: lineId, p_intent: String(intent), p_status: "succeeded", p_amount: amount });
      const weddingId = obj.metadata?.wedding_id;
      if (weddingId) {
        // The join link is a couple-portal app route — build it from APP_URL (the app
        // origin), never SITE_URL (marketing, which flips to forma.events at cutover)
        // or the webhook's request host (whatever Stripe happened to call).
        const emails = await phase1InviteEmails(admin, weddingId, APP_URL);
        if (emails.length) await sendBatch(emails);
      }
    }
  } else if (event.type.startsWith("customer.subscription.")) {
    // Mirror the subscription's status + period into workspace_subscriptions. workspace_id
    // rides on the subscription metadata we set at Start; fall back to the stored row by
    // subscription id. Best-effort: a failure here shouldn't storm retries — the next
    // subscription event re-mirrors the same fields (upsert).
    try {
      const sub = event.data.object as { id?: string; customer?: string; status?: string; current_period_end?: number; metadata?: { workspace_id?: string } };
      const ws = sub.metadata?.workspace_id ?? (await workspaceForSubscription(admin, sub.id ?? null));
      if (ws) {
        const status = event.type === "customer.subscription.deleted" ? "canceled" : mapSubStatus(sub.status);
        await admin.from("workspace_subscriptions").upsert({
          workspace_id: ws,
          stripe_customer_id: sub.customer ?? null,
          stripe_subscription_id: sub.id ?? null,
          status,
          current_period_end: iso(sub.current_period_end),
          updated_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.error("subscription mirror failed:", (e as Error).message);
    }
  } else if (event.type === "invoice.upcoming") {
    // Period-boundary reconciliation: set item quantities to the live roster so the
    // RENEWAL bills accurately. No Stripe write ever happens in the Team seat path.
    try {
      const inv = event.data.object as { subscription?: string };
      const ws = await workspaceForSubscription(admin, inv.subscription ?? null);
      if (ws && inv.subscription) {
        const { accounts, conciergeSeats } = await workspaceSeats(admin, ws);
        await reconcileSubscription(inv.subscription, accounts, conciergeSeats);
      }
    } catch (e) {
      console.error("invoice.upcoming reconcile failed:", (e as Error).message);
    }
  } else if (event.type === "invoice.paid") {
    // The renewal was billed — snapshot the seats it was billed for + confirm active.
    try {
      const inv = event.data.object as { subscription?: string; period_end?: number; lines?: { data?: { period?: { end?: number } }[] } };
      const ws = await workspaceForSubscription(admin, inv.subscription ?? null);
      if (ws) {
        const { accounts, conciergeSeats } = await workspaceSeats(admin, ws);
        const periodEnd = inv.lines?.data?.[0]?.period?.end ?? inv.period_end;
        await admin.from("workspace_subscriptions").update({
          seats_snapshot: seatBill(accounts, conciergeSeats),
          status: "active",
          current_period_end: iso(periodEnd),
          updated_at: new Date().toISOString(),
        }).eq("workspace_id", ws);
      }
    } catch (e) {
      console.error("invoice.paid snapshot failed:", (e as Error).message);
    }
  }

  return NextResponse.json({ received: true });
}
