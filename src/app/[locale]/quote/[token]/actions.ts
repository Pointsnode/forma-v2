"use server";

import { createClient } from "@/lib/supabase/server";

export type AcceptResult = { ok?: boolean; error?: "expired" | "closed" | "invalid" | "generic" };

// The public accept. Calls the anon DEFINER quote_accept; maps its human errcodes to a calm
// line. No auth — the token is the credential (the rsvp_submit pattern).
export async function acceptQuote(token: string, name: string): Promise<AcceptResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("quote_accept", { token, p_name: name });
  if (!error) return { ok: true };
  const code = (error as { code?: string }).code;
  if (code === "FM011") return { error: "expired" };
  if (code === "FM013" || code === "FM010") return { error: "invalid" };
  console.error(`acceptQuote (${code}): ${error.message}`);
  return { error: "generic" };
}
