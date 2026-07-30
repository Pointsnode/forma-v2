import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasClearance } from "@/lib/clearance";

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

// Action-lane clearance gate (§G) for the direct-write server actions that don't pass
// through a box-gated DEFINER function (task/guest/ledger/facts/calendly/wedding/invite).
// STAFF-CONDITIONAL by design: it gates a workspace member who lacks the box, but a caller
// who is NOT a workspace member (a couple / day-of, who live in wedding_members) resolves
// no workspace and passes through untouched — their own lanes must never be box-gated.
// Returns "FS050" to refuse (maps to errors.clearance), or null to allow. The database is
// still the backstop for the DEFINER lanes; this closes the RLS-is-role-blind gap on the
// direct-write lanes without hiding-a-button masquerading as a permission.
export async function clearanceGate(supabase: SupabaseClient, key: string): Promise<"FS050" | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null; // unauthenticated is handled by the action's own auth guard
  const workspaceId = await currentWorkspace(supabase);
  if (!workspaceId) return null; // not a workspace member (couple/day-of) — not staff-gated
  const grants = await loadMyGrants(supabase, workspaceId);
  return hasClearance(grants, key) ? null : "FS050";
}
