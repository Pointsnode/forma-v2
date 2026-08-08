"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { adminGate } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok?: boolean; error?: string };
async function requireOwner(): Promise<boolean> {
  const g = await adminGate();
  return g.state === "ok" && g.role === "owner";
}

const expSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  paid_on: z.string().min(1),
  vendor: z.string().trim().max(120).optional().nullable(),
  category: z.enum(["infrastructure", "tooling", "services", "fees", "other"]),
  amount_cents: z.coerce.number().int().positive(),
  currency: z.string().trim().max(8).optional().nullable(),
  memo: z.string().trim().max(2000).optional().nullable(),
});

export async function upsertExpense(raw: z.input<typeof expSchema>): Promise<ActionResult> {
  if (!(await requireOwner())) return { error: "forbidden" };
  const e = expSchema.safeParse(raw);
  if (!e.success) return { error: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_upsert_expense", {
    p_id: e.data.id ?? null, p_paid_on: e.data.paid_on, p_vendor: e.data.vendor || null, p_category: e.data.category,
    p_amount_cents: e.data.amount_cents, p_currency: e.data.currency || "USD", p_memo: e.data.memo || null, p_receipt_url: null,
  });
  if (error) return { error: error.code || "generic" };
  revalidatePath("/admin/reports");
  return { ok: true };
}

export async function voidExpense(raw: { id: string; memo: string }): Promise<ActionResult> {
  if (!(await requireOwner())) return { error: "forbidden" };
  if (!raw.memo?.trim()) return { error: "memo_required" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_void_expense", { p_id: raw.id, p_memo: raw.memo });
  if (error) return { error: error.code || "generic" };
  revalidatePath("/admin/reports");
  return { ok: true };
}
