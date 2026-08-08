"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { adminGate } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";
import { applyBillCredit } from "@/lib/referral-credit";

export type ActionResult = { ok?: boolean; error?: string };
async function requireOwner(): Promise<boolean> {
  const g = await adminGate();
  return g.state === "ok" && g.role === "owner";
}

// Settle a requested redemption. For BILL, push the Stripe customer-balance credit first (service-
// role lib) and store its id as the reference; for CASH, the owner supplies the bank reference.
// The DEFINER re-checks owner, the open status, and the cash backstop, then records + audits.
export async function settleRedemption(id: string, reference?: string): Promise<ActionResult> {
  if (!(await requireOwner())) return { error: "forbidden" };
  if (!z.string().uuid().safeParse(id).success) return { error: "invalid" };
  const supabase = await createClient();
  const { data: red } = await supabase.from("referral_redemptions").select("workspace_id, kind, amount_cents, status").eq("id", id).maybeSingle();
  if (!red) return { error: "not_found" };
  if (red.status !== "requested") return { error: "not_open" };

  let ref = (reference ?? "").trim();
  if (red.kind === "bill") {
    const creditId = await applyBillCredit(red.workspace_id as string, Math.abs(Number(red.amount_cents) || 0));
    if (!creditId) return { error: "no_customer" }; // no Stripe customer / unconfigured → can't bill-settle
    ref = creditId;
  } else if (!ref) {
    return { error: "reference_required" }; // cash needs a bank reference
  }

  const { error } = await supabase.rpc("admin_settle_redemption", { p_id: id, p_reference: ref });
  if (error) return { error: error.code || "generic" };
  revalidatePath("/admin/referrals");
  return { ok: true };
}

export async function rejectRedemption(id: string, memo: string): Promise<ActionResult> {
  if (!(await requireOwner())) return { error: "forbidden" };
  if (!z.string().uuid().safeParse(id).success) return { error: "invalid" };
  if (!memo?.trim()) return { error: "memo_required" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_reject_redemption", { p_id: id, p_memo: memo });
  if (error) return { error: error.code || "generic" };
  revalidatePath("/admin/referrals");
  return { ok: true };
}
