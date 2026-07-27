"use server";

import { createClient } from "@/lib/supabase/server";

export type SignResult = { ok?: boolean; error?: string; completed?: boolean };

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
  return { ok: true, completed: (data as { completed?: boolean } | null)?.completed ?? false };
}

export async function declineContract(token: string, reason: string): Promise<SignResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_contract_as", { p_token: token, p_reason: reason });
  if (error) return { error: error.code || "generic" };
  return { ok: true };
}
