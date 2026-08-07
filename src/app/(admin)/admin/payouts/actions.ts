"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { adminGate } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";

export type RecordResult = { ok?: boolean; id?: string; error?: string };

const schema = z.object({
  partner_id: z.string().uuid(),
  entry_ids: z.array(z.string().uuid()).min(1),
  method: z.string().trim().max(120).optional().nullable(),
  reference: z.string().trim().max(200).optional().nullable(),
  paid_on: z.string().optional().nullable(),
  period_label: z.string().trim().max(120).optional().nullable(),
});

// Owner-only. The DEFINER re-checks owner, validates every entry atomically, and audit-logs.
export async function recordPayout(raw: z.input<typeof schema>): Promise<RecordResult> {
  const gate = await adminGate();
  if (gate.state !== "ok" || gate.role !== "owner") return { error: "forbidden" };
  const p = schema.safeParse(raw);
  if (!p.success) return { error: "invalid" };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_record_payout", {
    p_partner: p.data.partner_id, p_entry_ids: p.data.entry_ids, p_method: p.data.method || null,
    p_reference: p.data.reference || null, p_paid_on: p.data.paid_on || null, p_period_label: p.data.period_label || null,
  });
  if (error) return { error: error.code || "generic" };
  revalidatePath("/admin/payouts");
  revalidatePath("/admin/commissions");
  return { ok: true, id: data as string };
}
