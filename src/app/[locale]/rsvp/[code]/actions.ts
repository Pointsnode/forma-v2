"use server";

import { createClient } from "@/lib/supabase/server";

export type RsvpResult = { ok?: boolean; error?: string };

export async function submitRsvp(code: string, payload: Record<string, unknown>): Promise<RsvpResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("rsvp_submit", { code, payload });
  if (error) {
    const c = error.code;
    if (c === "FM011") return { error: "closed" };
    if (c === "FM012") return { error: "expired" };
    if (c === "FM010" || c === "FM013" || c === "FM014") return { error: "invalid" };
    console.error(`submitRsvp failed (${c}): ${error.message}`);
    return { error: "generic" };
  }
  return { ok: true };
}

export async function markOpened(token: string): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("touchpoint_open", { token });
}
