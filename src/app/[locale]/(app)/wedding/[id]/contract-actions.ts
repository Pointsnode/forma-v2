"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { resolveMergeFields } from "@/lib/contracts";
import { signerEmail } from "@/lib/email/contract-email";
import { sendBatch } from "@/lib/email/resend";

export type ContractActionResult = { ok?: boolean; error?: string };

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
