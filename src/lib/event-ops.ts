import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScheduleItemVM, MenuVM } from "@/components/wedding/event-ops";
import { runOfShowRank } from "@/lib/wedding";

// M14 §I: the seating half of the ops load (plan/tables/seats → SeatingVM) fed the removed
// pre-canvas SeatingCard and was never read by the live event page. The canvas stack loads its
// own data via loadFloorPlan; loadEventOps now returns only the schedule + menus it's used for.
export async function loadEventOps(supabase: SupabaseClient, weddingId: string, eventId: string): Promise<{ schedule: ScheduleItemVM[]; menus: MenuVM[] }> {
  const [{ data: sched }, { data: menuRows }, { data: choices }] = await Promise.all([
    supabase.from("schedule_items").select("id, time, title, detail, done_at").eq("event_id", eventId).order("time", { ascending: true, nullsFirst: false }).order("sort"),
    supabase.from("menus").select("id, title, locked_at, menu_options(id, label, diet_tags, sort)").eq("event_id", eventId),
    supabase.from("event_guests").select("menu_choice_id").eq("event_id", eventId).not("menu_choice_id", "is", null),
  ]);

  const schedule: ScheduleItemVM[] = (sched ?? []).map((s: { id: string; time: string | null; title: string; detail: string | null; done_at: string | null }) => ({ id: s.id, time: s.time, title: s.title, detail: s.detail, done: !!s.done_at }));
  // Late-night semantics via runOfShowRank: a 00:30 send-off sorts AFTER the
  // 22:00 reception, untimed items sink to the bottom. Stable sort keeps the DB
  // `sort` tiebreak for items sharing a minute (or all untimed).
  schedule.sort((a, b) => runOfShowRank(a.time) - runOfShowRank(b.time));

  const choiceCount = new Map<string, number>();
  for (const c of (choices ?? []) as { menu_choice_id: string }[]) choiceCount.set(c.menu_choice_id, (choiceCount.get(c.menu_choice_id) ?? 0) + 1);
  const menus: MenuVM[] = ((menuRows ?? []) as unknown as { id: string; title: string; locked_at: string | null; menu_options: { id: string; label: string; diet_tags: string[]; sort: number }[] }[]).map((m) => ({
    id: m.id, title: m.title, locked: !!m.locked_at,
    options: [...(m.menu_options ?? [])].sort((a, b) => a.sort - b.sort).map((o) => ({ id: o.id, label: o.label, diet: o.diet_tags ?? [], count: choiceCount.get(o.id) ?? 0 })),
  }));

  return { schedule, menus };
}
