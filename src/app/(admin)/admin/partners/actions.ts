"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { adminGate } from "@/lib/admin/guard";
import { createClient } from "@/lib/supabase/server";

export type ActionResult = { ok?: boolean; error?: string };

// Owner-only (partners are read-only). The DEFINER re-checks owner + audit-logs; this is the
// first, cheap gate. The RPC runs as the signed-in owner through the invoker wrapper.
async function requireOwner(): Promise<boolean> {
  const gate = await adminGate();
  return gate.state === "ok" && gate.role === "owner";
}

const partnerSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  display_name: z.string().trim().min(1).max(120),
  type: z.enum(["founding", "referral", "reseller"]),
  rate_bps: z.coerce.number().int().min(0).max(10000),
  activation_fee_cents: z.coerce.number().int().min(0),
  active: z.coerce.boolean(),
});

export async function upsertPartner(raw: z.input<typeof partnerSchema>): Promise<ActionResult> {
  if (!(await requireOwner())) return { error: "forbidden" };
  const p = partnerSchema.safeParse(raw);
  if (!p.success) return { error: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_upsert_partner", {
    p_id: p.data.id ?? null, p_display_name: p.data.display_name, p_type: p.data.type,
    p_rate_bps: p.data.rate_bps, p_activation_fee_cents: p.data.activation_fee_cents, p_active: p.data.active,
  });
  if (error) return { error: error.code || "generic" };
  revalidatePath("/admin/partners");
  return { ok: true };
}

const attrSchema = z.object({
  workspace_id: z.string().uuid(),
  partner_id: z.string().uuid().nullable(),
  source: z.enum(["manual", "link", "house"]),
  first_contact_at: z.string().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export async function setAttribution(raw: z.input<typeof attrSchema>): Promise<ActionResult> {
  if (!(await requireOwner())) return { error: "forbidden" };
  const a = attrSchema.safeParse(raw);
  if (!a.success) return { error: "invalid" };
  // House ⇔ null partner (the DB check enforces it too; fail early with a clear message).
  if ((a.data.source === "house") !== (a.data.partner_id === null)) return { error: "house_mismatch" };
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_attribution", {
    p_workspace: a.data.workspace_id, p_partner: a.data.partner_id, p_source: a.data.source,
    p_first_contact: a.data.first_contact_at || null, p_notes: a.data.notes || null,
  });
  if (error) return { error: error.code || "generic" };
  revalidatePath("/admin/partners");
  return { ok: true };
}
