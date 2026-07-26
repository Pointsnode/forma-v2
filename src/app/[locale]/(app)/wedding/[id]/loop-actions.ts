"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type LoopResult = { ok?: boolean; error?: string };

// The wedding floor + couple lens live under /[locale]/wedding/[id]; revalidating
// that segment as a LAYOUT refreshes proposals, threads, court and the hero in
// place, both locales (the pattern covers /es).
function refresh() {
  revalidatePath("/[locale]/wedding/[id]", "layout");
}

export async function createProposal(
  weddingId: string,
  input: { title: string; note?: string; estimate?: string; eventRef?: string; send?: boolean },
): Promise<LoopResult> {
  const title = input.title?.trim();
  if (!title) return { error: "invalid" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "generic" };
  const estimate = input.estimate ? Number(input.estimate.replace(/[^0-9.]/g, "")) : null;
  const { data: row, error } = await supabase
    .from("proposals")
    .insert({
      wedding_id: weddingId,
      title,
      note: input.note?.trim() || null,
      estimate_amount: estimate && estimate > 0 ? estimate : null,
      event_ref: input.eventRef || null,
      created_by: user.id,
    })
    .select("id")
    .single();
  if (error || !row) {
    console.error(`createProposal failed (${error?.code}): ${error?.message}`);
    return { error: "generic" };
  }
  if (input.send) {
    const { error: se } = await supabase.rpc("send_proposal", { p: row.id });
    if (se) {
      console.error(`send after create failed (${se.code}): ${se.message}`);
      return { error: "generic" };
    }
  }
  refresh();
  return { ok: true };
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<LoopResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) {
    console.error(`${fn} failed (${error.code}): ${error.message}`);
    return { error: error.code || "generic" };
  }
  refresh();
  return { ok: true };
}

export async function sendProposal(_weddingId: string, proposalId: string) {
  return rpc("send_proposal", { p: proposalId });
}
export async function withdrawProposal(_weddingId: string, proposalId: string) {
  return rpc("withdraw_proposal", { p: proposalId });
}
export async function markSeen(_weddingId: string, proposalId: string) {
  return rpc("mark_proposal_seen", { p: proposalId });
}
export async function postMessage(_weddingId: string, proposalId: string, body: string) {
  return rpc("post_proposal_message", { p: proposalId, body });
}
export async function respondProposal(
  _weddingId: string,
  proposalId: string,
  action: "approve" | "request_change" | "decline",
  message: string | null,
) {
  return rpc("respond_to_proposal", { p: proposalId, action, message });
}

export async function createInvite(
  weddingId: string,
  role: "partner" | "family" | "day_of",
): Promise<LoopResult & { token?: string; expires?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "generic" };
  const { data, error } = await supabase
    .from("wedding_invites")
    .insert({ wedding_id: weddingId, role, created_by: user.id })
    .select("token, expires_at")
    .single();
  if (error || !data) {
    console.error(`createInvite failed (${error?.code}): ${error?.message}`);
    return { error: "generic" };
  }
  refresh();
  return { ok: true, token: (data.token as string).trim(), expires: data.expires_at as string };
}

export async function revokeInvite(_weddingId: string, inviteId: string): Promise<LoopResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("wedding_invites").delete().eq("id", inviteId);
  if (error) {
    console.error(`revokeInvite failed (${error.code}): ${error.message}`);
    return { error: "generic" };
  }
  refresh();
  return { ok: true };
}

export async function acceptInvite(token: string): Promise<{ ok?: boolean; weddingId?: string; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_wedding_invite", { p_token: token });
  if (error) {
    const code = error.code;
    if (code === "FV224") return { error: "used" };
    if (code === "FV225") return { error: "expired" };
    if (code === "FV223") return { error: "invalid" };
    console.error(`acceptInvite failed (${code}): ${error.message}`);
    return { error: "generic" };
  }
  return { ok: true, weddingId: data as string };
}
