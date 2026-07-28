"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createCheckoutSession, stripeConfigured } from "@/lib/stripe";

export type MoneyResult = { ok?: boolean; error?: string; url?: string };

async function baseUrl(): Promise<string> {
  // APP_URL first: Stripe returns must land back on the app origin (cookies are
  // host-scoped) — it must not follow SITE_URL to the marketing domain at cutover.
  const app = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (app) return app;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}

// Couple pays a due planner_fee line → Stripe hosted Checkout. Only planner_fee
// lines ever reach Stripe (Decision 3).
export async function payPlannerFee(lineId: string): Promise<MoneyResult> {
  const supabase = await createClient();
  const { data: line } = await supabase.from("ledger_lines").select("id, wedding_id, title, amount, kind, status").eq("id", lineId).maybeSingle();
  if (!line) return { error: "generic" };
  if (line.kind !== "planner_fee") return { error: "notFee" };
  if (!stripeConfigured()) return { error: "notConfigured" };
  const base = await baseUrl();
  try {
    const session = await createCheckoutSession({
      lineId: line.id, weddingId: line.wedding_id, amountCents: Math.round(Number(line.amount) * 100),
      title: line.title, successUrl: `${base}/wedding/${line.wedding_id}?paid=1`, cancelUrl: `${base}/wedding/${line.wedding_id}`,
    });
    if (!session) return { error: "notConfigured" };
    return { ok: true, url: session.url };
  } catch {
    return { error: "generic" };
  }
}

// Staff adds a manual ledger line.
export async function addLedgerLine(weddingId: string, form: FormData): Promise<MoneyResult> {
  const supabase = await createClient();
  const title = String(form.get("title") ?? "").trim();
  const amount = Number(String(form.get("amount") ?? "").replace(/[^0-9.]/g, ""));
  if (!title || !amount) return { error: "invalid" };
  const due = String(form.get("due_date") ?? "").trim() || null;
  const { error } = await supabase.from("ledger_lines").insert({ wedding_id: weddingId, title, amount, kind: "manual", status: "expected", due_date: due });
  if (error) { console.error(`addLedgerLine (${error.code}): ${error.message}`); return { error: "generic" }; }
  revalidatePath("/[locale]/wedding/[id]", "layout");
  return { ok: true };
}

// Staff moves a tracked line along (expected→scheduled→due→paid). planner_fee is
// paid only through Stripe — never marked by hand here.
export async function setLineStatus(lineId: string, status: string): Promise<MoneyResult> {
  const supabase = await createClient();
  const { data: line } = await supabase.from("ledger_lines").select("kind").eq("id", lineId).maybeSingle();
  if (!line) return { error: "generic" };
  if (line.kind === "planner_fee" && status === "paid") return { error: "feeStripeOnly" };
  const patch: Record<string, unknown> = { status };
  if (status === "paid") patch.paid_at = new Date().toISOString();
  const { error } = await supabase.from("ledger_lines").update(patch).eq("id", lineId);
  if (error) { console.error(`setLineStatus (${error.code}): ${error.message}`); return { error: "generic" }; }
  revalidatePath("/[locale]/wedding/[id]", "layout");
  return { ok: true };
}
