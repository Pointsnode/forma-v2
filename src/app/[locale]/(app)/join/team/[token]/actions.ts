"use server";

import { createClient } from "@/lib/supabase/server";

export type AcceptResult = { ok?: true; workspaceId?: string; error?: string; message?: string };

// Accept a team invite as the signed-in invitee. accept_workspace_invite enforces the
// email match, expiry, and single-use rules (and is idempotent for a re-accept), so this
// just surfaces the SQLSTATE for the card to map. No revalidate — the client navigates.
export async function acceptTeamInvite(token: string): Promise<AcceptResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_workspace_invite", { p_token: token });
  if (error) {
    console.error(`accept_workspace_invite (${error.code}): ${error.message}`);
    return { error: error.code || "generic", message: error.message };
  }
  return { ok: true, workspaceId: (data as string) ?? undefined };
}
