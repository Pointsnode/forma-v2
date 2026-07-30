import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// The current workspace — ONE deterministic resolver (§I), replacing the 12 copy-
// pasted `workspace_members … limit(1)` lookups that were only safe while every user
// had exactly one workspace. Team invites end that. No stored-preference column exists
// yet, so: oldest membership, tie-broken by workspace id (stable across surfaces).
export async function currentWorkspace(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .order("created_at", { ascending: true })
    .order("workspace_id", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.workspace_id as string | undefined) ?? null;
}

// The signed-in caller's clearance grants for a workspace (role='owner' → admin, per
// §B). Used to gate what the studio UI offers; the functions enforce regardless.
export async function loadMyGrants(supabase: SupabaseClient, workspaceId: string): Promise<string[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("workspace_members")
    .select("role, grants")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!data) return [];
  if (data.role === "owner") return ["admin"];
  return (data.grants as string[] | null) ?? [];
}
