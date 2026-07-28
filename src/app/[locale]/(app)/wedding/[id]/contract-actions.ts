"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveMergeFields } from "@/lib/contracts";
import { signerEmail } from "@/lib/email/contract-email";
import { sendBatch } from "@/lib/email/resend";
import { CONTRACT_KINDS, MERGE_SOURCES, SIGNER_ROLES } from "@/lib/contract-enums";

export type ContractActionResult = { ok?: boolean; error?: string; id?: string };

// Edits (body/fields/signers) are permitted on DRAFTS only — everything freezes
// at send. Returns the wedding_id (for revalidation) or null when the contract
// isn't an editable draft. Direct-table writes run under the staff RLS.
async function assertDraft(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contractId: string,
): Promise<string | null> {
  const { data } = await supabase.from("contracts").select("wedding_id, status").eq("id", contractId).maybeSingle();
  return data && data.status === "draft" ? (data.wedding_id as string) : null;
}
async function contractIdOf(supabase: Awaited<ReturnType<typeof createClient>>, table: string, rowId: string): Promise<string | null> {
  const { data } = await supabase.from(table).select("contract_id").eq("id", rowId).maybeSingle();
  return (data?.contract_id as string) ?? null;
}

async function baseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  return host ? `${(h.get("x-forwarded-proto") ?? "https")}://${host}` : "http://localhost:3000";
}

// Staff sends a contract: resolve the merge snapshot from the mesh, flip it out of
// draft (send_contract enforces the draft-hold + signer gates), then email each
// signer their tokenized /sign link. The draft-hold refusal (FM022) surfaces as a
// message; approving the blocking proposal auto-sends via the trigger.
export async function sendContractAction(contractId: string): Promise<ContractActionResult> {
  const supabase = await createClient();
  const locale = await getLocale();
  const { data: c } = await supabase.from("contracts").select("id, wedding_id, title, engagement_id").eq("id", contractId).maybeSingle();
  if (!c) return { error: "generic" };
  const { data: fieldRows } = await supabase.from("contract_fields").select("field_key, merge_source").eq("contract_id", contractId);
  const resolved = await resolveMergeFields(supabase, c, (fieldRows ?? []) as { field_key: string; merge_source: string }[], locale);

  const { error } = await supabase.rpc("send_contract", { p_contract: contractId, p_resolved: resolved });
  if (error) { console.error(`send_contract (${error.code}): ${error.message}`); return { error: error.code === "FM022" ? "draftHold" : "generic" }; }

  const { data: signers } = await supabase.from("contract_signers").select("name, email, token, sign_order").eq("contract_id", contractId).order("sign_order");
  const base = await baseUrl();
  const emails = ((signers ?? []) as { name: string; email: string | null; token: string; sign_order: number }[])
    .filter((s) => s.email)
    .map((s) => signerEmail({ to: s.email!, signerName: s.name, title: c.title, signUrl: `${base}/sign/${s.token.trim()}`, locale }));
  if (emails.length) { try { await sendBatch(emails); } catch (e) { console.error("signer email send failed", e); } }

  revalidatePath("/[locale]/wedding/[id]", "layout");
  return { ok: true };
}

export async function voidContractAction(contractId: string): Promise<ContractActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_contract", { p_contract: contractId });
  if (error) { console.error(`void_contract (${error.code}): ${error.message}`); return { error: "generic" }; }
  revalidatePath("/[locale]/wedding/[id]", "layout");
  return { ok: true };
}

// ── The create leg (the round-trip's missing opening move) ───────────────────
// Staff creates a draft from a studio template (body copied into
// contract_draft_content) or blank, then lands in the editable room. Status stays
// 'draft' — never written directly here; send/void go through the RPC layer.
export async function createContract(
  weddingId: string,
  input: { templateId?: string | null; title: string; kind: string },
): Promise<ContractActionResult> {
  const supabase = await createClient();
  const title = input.title.trim();
  const kind = (CONTRACT_KINDS as readonly string[]).includes(input.kind) ? input.kind : "vendor";
  if (!title) return { error: "invalid" };

  let body = "";
  let templateId: string | null = null;
  if (input.templateId) {
    const { data: tpl } = await supabase.from("contract_templates").select("id, body").eq("id", input.templateId).maybeSingle();
    if (tpl) { templateId = tpl.id; body = tpl.body ?? ""; }
  }
  const { data: userRes } = await supabase.auth.getUser();
  const { data: contract, error } = await supabase.from("contracts").insert({
    wedding_id: weddingId, template_id: templateId, kind, title, created_by: userRes.user?.id ?? null,
  }).select("id").single();
  if (error || !contract) { console.error(`createContract (${error?.code}): ${error?.message}`); return { error: "generic" }; }

  const { error: bodyErr } = await supabase.from("contract_draft_content").insert({ contract_id: contract.id, body });
  if (bodyErr) console.error(`createContract body (${bodyErr.code}): ${bodyErr.message}`);

  revalidatePath("/[locale]/wedding/[id]", "layout");
  redirect({ href: `/wedding/${weddingId}/contracts/${contract.id}`, locale: await getLocale() });
  return { ok: true, id: contract.id };
}

export async function saveDraftBody(contractId: string, body: string): Promise<ContractActionResult> {
  const supabase = await createClient();
  if (!(await assertDraft(supabase, contractId))) return { error: "notDraft" };
  const { error } = await supabase.from("contract_draft_content").upsert({ contract_id: contractId, body }, { onConflict: "contract_id" });
  if (error) { console.error(`saveDraftBody (${error.code}): ${error.message}`); return { error: "generic" }; }
  revalidatePath("/[locale]/wedding/[id]", "layout");
  return { ok: true };
}

export async function addField(
  contractId: string,
  f: { label: string; field_key: string; merge_source: string; signer_order: number | null; required: boolean },
): Promise<ContractActionResult> {
  const supabase = await createClient();
  if (!(await assertDraft(supabase, contractId))) return { error: "notDraft" };
  const label = f.label.trim();
  const field_key = f.field_key.trim().replace(/[^a-zA-Z0-9_]/g, "");
  const merge_source = (MERGE_SOURCES as readonly string[]).includes(f.merge_source) ? f.merge_source : "manual";
  if (!label || !field_key) return { error: "invalid" };
  const { data: last } = await supabase.from("contract_fields").select("sort").eq("contract_id", contractId).order("sort", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("contract_fields").insert({
    contract_id: contractId, label, field_key, merge_source,
    signer_order: merge_source === "manual" ? f.signer_order : null, required: f.required,
    sort: (last?.sort ?? -1) + 1,
  });
  if (error) { console.error(`addField (${error.code}): ${error.message}`); return { error: "generic" }; }
  revalidatePath("/[locale]/wedding/[id]", "layout");
  return { ok: true };
}

export async function removeField(fieldId: string): Promise<ContractActionResult> {
  const supabase = await createClient();
  const cid = await contractIdOf(supabase, "contract_fields", fieldId);
  if (!cid || !(await assertDraft(supabase, cid))) return { error: "notDraft" };
  const { error } = await supabase.from("contract_fields").delete().eq("id", fieldId);
  if (error) { console.error(`removeField (${error.code}): ${error.message}`); return { error: "generic" }; }
  revalidatePath("/[locale]/wedding/[id]", "layout");
  return { ok: true };
}

export async function addSigner(
  contractId: string,
  s: { name: string; role: string; email: string | null },
): Promise<ContractActionResult> {
  const supabase = await createClient();
  if (!(await assertDraft(supabase, contractId))) return { error: "notDraft" };
  const name = s.name.trim();
  const role = (SIGNER_ROLES as readonly string[]).includes(s.role) ? s.role : "vendor";
  if (!name) return { error: "invalid" };
  const { data: last } = await supabase.from("contract_signers").select("sign_order").eq("contract_id", contractId).order("sign_order", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("contract_signers").insert({
    contract_id: contractId, name, role, email: s.email?.trim() || null, sign_order: (last?.sign_order ?? 0) + 1,
  });
  if (error) { console.error(`addSigner (${error.code}): ${error.message}`); return { error: "generic" }; }
  revalidatePath("/[locale]/wedding/[id]", "layout");
  return { ok: true };
}

export async function removeSigner(signerId: string): Promise<ContractActionResult> {
  const supabase = await createClient();
  const cid = await contractIdOf(supabase, "contract_signers", signerId);
  if (!cid || !(await assertDraft(supabase, cid))) return { error: "notDraft" };
  const { error } = await supabase.from("contract_signers").delete().eq("id", signerId);
  if (error) { console.error(`removeSigner (${error.code}): ${error.message}`); return { error: "generic" }; }
  revalidatePath("/[locale]/wedding/[id]", "layout");
  return { ok: true };
}

// Reorder a signer by swapping sign_order with its neighbour. unique(contract_id,
// sign_order) forbids a direct swap, so we park one row at a sentinel order first.
export async function reorderSigner(signerId: string, dir: "up" | "down"): Promise<ContractActionResult> {
  const supabase = await createClient();
  const cid = await contractIdOf(supabase, "contract_signers", signerId);
  if (!cid || !(await assertDraft(supabase, cid))) return { error: "notDraft" };
  const { data: rows } = await supabase.from("contract_signers").select("id, sign_order").eq("contract_id", cid).order("sign_order");
  const list = (rows ?? []) as { id: string; sign_order: number }[];
  const i = list.findIndex((r) => r.id === signerId);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= list.length) return { ok: true };
  const a = list[i], b = list[j];
  await supabase.from("contract_signers").update({ sign_order: 100000 }).eq("id", a.id);
  await supabase.from("contract_signers").update({ sign_order: a.sign_order }).eq("id", b.id);
  await supabase.from("contract_signers").update({ sign_order: b.sign_order }).eq("id", a.id);
  revalidatePath("/[locale]/wedding/[id]", "layout");
  return { ok: true };
}
