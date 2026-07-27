"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureArtifactFiled } from "@/lib/contract-artifact";

export type SignResult = { ok?: boolean; error?: string; completed?: boolean; filed?: boolean };

// The signer surface is tokenized (no account) — thin passthroughs to the public
// invoker wrappers, which run the private DEFINER fns with the order/required/
// immutability gates. Errors map to human messages client-side.
export async function fillFields(token: string, values: Record<string, string>): Promise<SignResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("fill_contract_fields_as", { p_token: token, p_values: values });
  if (error) return { error: error.code || "generic" };
  return { ok: true };
}

export async function signContract(token: string, typedName: string): Promise<SignResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sign_contract_as", { p_token: token, p_typed_name: typedName });
  if (error) return { error: error.code || "generic" };
  const completed = (data as { completed?: boolean } | null)?.completed ?? false;
  // On completion the DB stamped artifact_path; file the frozen copy there so the
  // banner's "a copy has been filed" is TRUE only when it is. `filed` gates the
  // banner copy; a failed upload no longer claims success.
  let filed = false;
  if (completed) {
    try {
      const admin = createAdminClient();
      const { data: s } = await admin.from("contract_signers").select("contract_id").eq("token", token).maybeSingle();
      if (s?.contract_id) filed = await ensureArtifactFiled(admin, s.contract_id as string);
    } catch (e) {
      console.error("contract artifact filing failed", e);
    }
  }
  return { ok: true, completed, filed };
}

export async function declineContract(token: string, reason: string): Promise<SignResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_contract_as", { p_token: token, p_reason: reason });
  if (error) return { error: error.code || "generic" };
  return { ok: true };
}
