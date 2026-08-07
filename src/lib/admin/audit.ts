import "server-only";
import { createClient } from "@/lib/supabase/server";

export type AuditRow = { id: string; actor_id: string | null; action: string; entity: string; entity_id: string | null; before: unknown; after: unknown; created_at: string };

export async function loadAudit(filters: { entity?: string; actor?: string } = {}): Promise<AuditRow[]> {
  const supabase = await createClient();
  let q = supabase.from("admin_audit_log").select("id, actor_id, action, entity, entity_id, before, after, created_at").order("created_at", { ascending: false }).limit(500);
  if (filters.entity) q = q.eq("entity", filters.entity);
  if (filters.actor) q = q.eq("actor_id", filters.actor);
  const { data } = await q;
  return (data ?? []) as AuditRow[];
}

// auth.users is not RLS-readable — the actor→email map comes from the admin-gated DEFINER.
export async function loadActorEmails(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return {};
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_actor_emails", { p_ids: unique });
  return (data && typeof data === "object" ? data : {}) as Record<string, string>;
}
