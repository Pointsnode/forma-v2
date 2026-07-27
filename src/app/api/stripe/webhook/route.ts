import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyStripeSignature, isPaymentEvent } from "@/lib/stripe-verify.mjs";
import { sendBatch } from "@/lib/email/resend";
import { phase1InviteEmails } from "@/lib/email/contract-email";

// Stripe webhook — signature-verified, idempotent. On a settled planner fee it
// records the payment + flips the ledger line to paid (record_fee_payment, which
// runs the Phase-1 gate), then emails any invites the gate just created. The whole
// payment path is service-role: no user session exists for a webhook.
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
        const base = process.env.NEXT_PUBLIC_SITE_URL ?? req.nextUrl.origin;
        const emails = await phase1InviteEmails(admin, weddingId, base);
        if (emails.length) await sendBatch(emails);
      }
    }
  }

  return NextResponse.json({ received: true });
}
