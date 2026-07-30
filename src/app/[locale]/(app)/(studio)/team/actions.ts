"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { currentWorkspace } from "@/lib/workspace";

// Every action re-resolves the workspace server-side (never trusts a client-sent id) and
// leans on the DEFINER functions for authority — the FS050 gate lives there (law 2), so a
// non-admin who forged a call still gets refused at the database. Results carry the raw
// SQLSTATE + message so the client maps FS050 → errors.clearance via formaErrorMessage.
export type TeamResult = { ok?: true; error?: string; message?: string; inviteId?: string };

async function ctx() {
  const supabase = await createClient();
  const workspaceId = await currentWorkspace(supabase);
  return { supabase, workspaceId };
}

export async function inviteMember(email: string, grants: string[], title: string): Promise<TeamResult> {
  const { supabase, workspaceId } = await ctx();
  if (!workspaceId) return { error: "generic" };
  const { data, error } = await supabase.rpc("create_workspace_invite", {
    p_workspace: workspaceId,
    p_email: email,
    p_grants: grants,
    p_title: title || null,
  });
  if (error) {
    console.error(`create_workspace_invite (${error.code}): ${error.message}`);
    return { error: error.code || "generic", message: error.message };
  }
  revalidatePath("/team");
  return { ok: true, inviteId: (data as string) ?? undefined };
}

export async function setClearances(userId: string, grants: string[], title: string): Promise<TeamResult> {
  const { supabase, workspaceId } = await ctx();
  if (!workspaceId) return { error: "generic" };
  const { error } = await supabase.rpc("set_member_clearances", {
    p_workspace: workspaceId,
    p_user: userId,
    p_grants: grants,
    p_title: title || null,
  });
  if (error) {
    console.error(`set_member_clearances (${error.code}): ${error.message}`);
    return { error: error.code || "generic", message: error.message };
  }
  revalidatePath("/team");
  return { ok: true };
}

export async function removeMember(userId: string): Promise<TeamResult> {
  const { supabase, workspaceId } = await ctx();
  if (!workspaceId) return { error: "generic" };
  const { error } = await supabase.rpc("remove_member", { p_workspace: workspaceId, p_user: userId });
  if (error) {
    console.error(`remove_member (${error.code}): ${error.message}`);
    return { error: error.code || "generic", message: error.message };
  }
  revalidatePath("/team");
  return { ok: true };
}

// Revoke a pending invite. workspace_invites RLS already restricts every verb to admins
// (has_clearance admin), so this direct delete is enforced at the row layer — no fn needed.
export async function revokeInvite(inviteId: string): Promise<TeamResult> {
  const { supabase, workspaceId } = await ctx();
  if (!workspaceId) return { error: "generic" };
  const { error } = await supabase.from("workspace_invites").delete().eq("id", inviteId).eq("workspace_id", workspaceId);
  if (error) {
    console.error(`revokeInvite (${error.code}): ${error.message}`);
    return { error: error.code || "generic", message: error.message };
  }
  revalidatePath("/team");
  return { ok: true };
}

export async function setConciergeCap(cap: number): Promise<TeamResult> {
  const { supabase, workspaceId } = await ctx();
  if (!workspaceId) return { error: "generic" };
  const { error } = await supabase.rpc("set_concierge_cap", { p_workspace: workspaceId, p_cap: Math.max(0, Math.floor(cap)) });
  if (error) {
    console.error(`set_concierge_cap (${error.code}): ${error.message}`);
    return { error: error.code || "generic", message: error.message };
  }
  revalidatePath("/team");
  return { ok: true };
}
