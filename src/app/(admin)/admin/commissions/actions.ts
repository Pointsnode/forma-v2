"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { adminGate } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok?: boolean; error?: string };

async function requireOwner(): Promise<boolean> {
  const gate = await adminGate();
  return gate.state === "ok" && gate.role === "owner";
}

const voidSchema = z.object({ id: z.string().uuid(), memo: z.string().trim().min(1).max(2000) });

export async function voidCommission(raw: z.input<typeof voidSchema>): Promise<ActionResult> {
  if (!(await requireOwner())) return { error: "forbidden" };
  const v = voidSchema.safeParse(raw);
  if (!v.success) return { error: "memo_required" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_void_commission", { p_entry: v.data.id, p_memo: v.data.memo });
  if (error) return { error: error.code || "generic" };
  revalidatePath("/admin/commissions");
  return { ok: true };
}

const adjSchema = z.object({
  partner_id: z.string().uuid(),
  workspace_id: z.string().uuid().nullable().optional(),
  amount_cents: z.coerce.number().int(),
  memo: z.string().trim().min(1).max(2000),
});

export async function addAdjustment(raw: z.input<typeof adjSchema>): Promise<ActionResult> {
  if (!(await requireOwner())) return { error: "forbidden" };
  const a = adjSchema.safeParse(raw);
  if (!a.success) return { error: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_add_adjustment", {
    p_partner: a.data.partner_id, p_workspace: a.data.workspace_id ?? null, p_amount_cents: a.data.amount_cents, p_memo: a.data.memo,
  });
  if (error) return { error: error.code || "generic" };
  revalidatePath("/admin/commissions");
  return { ok: true };
}
