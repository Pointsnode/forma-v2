import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { initials } from "@/lib/wedding";

export type FeedItem = { id: string; verb: string; summary: string; actorName: string | null; tag: string; actorKind: "user" | "concierge" };
export type ChaseItem = { id: string; title: string; weddingId: string; tag: string; ageDays: number; href: string; kind: "proposal" | "task" };

// The two cockpit cards, scoped by RLS to the viewer's weddings. `weddings` is the
// already-loaded studio list (id → couple_display) used only for the wedding tag.
export async function loadCockpit(
  supabase: SupabaseClient,
  userId: string,
  weddings: { id: string; couple_display: string }[],
): Promise<{ feed: FeedItem[]; chase: ChaseItem[] }> {
  const name = new Map(weddings.map((w) => [w.id, w.couple_display]));
  const tag = (weddingId: string) => initials(name.get(weddingId) ?? "");

  const { data: prof } = await supabase.from("profiles").select("last_seen_at").eq("id", userId).maybeSingle();
  const since = (prof?.last_seen_at as string | null) ?? new Date(Date.now() - 14 * 86_400_000).toISOString();

  // Since you were away — activity since last visit, others' actions only.
  const { data: acts } = await supabase
    .from("activity")
    .select("id, wedding_id, actor_id, verb, summary, created_at, actor_kind")
    .gt("created_at", since)
    .order("created_at", { ascending: false })
    .limit(24);
  const feedRaw = ((acts ?? []) as { id: string; wedding_id: string; actor_id: string | null; verb: string; summary: string; actor_kind: "user" | "concierge" }[])
    .filter((a) => a.actor_id !== userId || a.actor_kind === "concierge");
  const actorIds = [...new Set(feedRaw.map((a) => a.actor_id).filter((x): x is string => !!x))];
  const actorNames = new Map<string, string | null>();
  if (actorIds.length) {
    const { data: p } = await supabase.from("profiles").select("id, display_name").in("id", actorIds);
    for (const x of (p ?? []) as { id: string; display_name: string | null }[]) actorNames.set(x.id, x.display_name);
  }
  const feed: FeedItem[] = feedRaw.slice(0, 8).map((a) => ({
    id: a.id,
    verb: a.verb,
    summary: a.summary,
    actorName: a.actor_id ? actorNames.get(a.actor_id) ?? "—" : null,
    tag: tag(a.wedding_id),
    actorKind: a.actor_kind,
  }));

  // The chase list — someone else's court: proposals with the couple, PLUS waiting
  // tasks assigned to the couple or a vendor (§3 — same age-badge anatomy). Oldest first.
  const chase: ChaseItem[] = [];
  const { data: court } = await supabase
    .from("proposal_court")
    .select("proposal_id, wedding_id, court, age_days")
    .eq("court", "couple");
  const courtRows = (court ?? []) as { proposal_id: string; wedding_id: string; age_days: number }[];
  if (courtRows.length) {
    const { data: props } = await supabase.from("proposals").select("id, title").in("id", courtRows.map((c) => c.proposal_id));
    const titles = new Map((props ?? []).map((p: { id: string; title: string }) => [p.id, p.title]));
    for (const c of courtRows) chase.push({ id: c.proposal_id, title: titles.get(c.proposal_id) ?? "—", weddingId: c.wedding_id, tag: tag(c.wedding_id), ageDays: c.age_days, href: `/wedding/${c.wedding_id}/proposals`, kind: "proposal" });
  }

  const { data: waitingTasks } = await supabase
    .from("tasks")
    .select("id, title, wedding_id, updated_at, assignee_kind")
    .eq("status", "waiting")
    .in("assignee_kind", ["couple", "vendor"])
    .not("wedding_id", "is", null);
  const now = Date.now();
  for (const w of (waitingTasks ?? []) as { id: string; title: string; wedding_id: string; updated_at: string; assignee_kind: string }[]) {
    const ageDays = Math.max(0, Math.floor((now - new Date(w.updated_at).getTime()) / 86_400_000));
    chase.push({ id: w.id, title: w.title, weddingId: w.wedding_id, tag: tag(w.wedding_id), ageDays, href: `/wedding/${w.wedding_id}/tasks`, kind: "task" });
  }

  chase.sort((a, b) => b.ageDays - a.ageDays);
  return { feed, chase: chase.slice(0, 8) };
}
