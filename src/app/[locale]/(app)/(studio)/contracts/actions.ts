"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { templateDeletable } from "@/lib/studio-contracts-classify.mjs";

export type TemplateResult = { ok?: boolean; error?: string; id?: string };

const KINDS = new Set(["full", "partial", "day_of", "rider"]);

async function firstWorkspace(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | null> {
  const { data } = await supabase.from("workspace_members").select("workspace_id").order("created_at", { ascending: true }).limit(1).maybeSingle();
  return data?.workspace_id ?? null;
}

// Templates are workspace-scoped and staff-CRUD under the existing
// contract_templates RLS (is_workspace_member) — direct-table writes, no RPC.
export async function createTemplate(formData: FormData): Promise<TemplateResult> {
  const supabase = await createClient();
  const ws = await firstWorkspace(supabase);
  if (!ws) return { error: "generic" };
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "");
  if (!name || !KINDS.has(kind)) return { error: "invalid" };
  const { data, error } = await supabase.from("contract_templates").insert({
    workspace_id: ws, name, kind, body: String(formData.get("body") ?? ""),
  }).select("id").single();
  if (error || !data) { console.error(`createTemplate (${error?.code}): ${error?.message}`); return { error: "generic" }; }
  revalidatePath("/[locale]/contracts", "layout");
  return { ok: true, id: data.id };
}

export async function updateTemplate(id: string, formData: FormData): Promise<TemplateResult> {
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const kind = String(formData.get("kind") ?? "");
  if (!name || !KINDS.has(kind)) return { error: "invalid" };
  const { error } = await supabase.from("contract_templates")
    .update({ name, kind, body: String(formData.get("body") ?? "") }).eq("id", id);
  if (error) { console.error(`updateTemplate (${error.code}): ${error.message}`); return { error: "generic" }; }
  revalidatePath("/[locale]/contracts", "layout");
  return { ok: true };
}

// Delete only when unused — a template a contract was created from is refused
// with a human message (the round-trip law's "used templates refuse").
export async function deleteTemplate(id: string): Promise<TemplateResult> {
  const supabase = await createClient();
  const { count } = await supabase.from("contracts").select("id", { count: "exact", head: true }).eq("template_id", id);
  if (!templateDeletable(count ?? 0)) return { error: "inUse" };
  const { error } = await supabase.from("contract_templates").delete().eq("id", id);
  if (error) { console.error(`deleteTemplate (${error.code}): ${error.message}`); return { error: "generic" }; }
  revalidatePath("/[locale]/contracts", "layout");
  return { ok: true };
}
