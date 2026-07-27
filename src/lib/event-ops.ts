import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ScheduleItemVM, MenuVM, SeatingVM } from "@/components/wedding/event-ops";

export async function loadEventOps(supabase: SupabaseClient, weddingId: string, eventId: string): Promise<{ schedule: ScheduleItemVM[]; menus: MenuVM[]; seating: SeatingVM }> {
  const [{ data: sched }, { data: menuRows }, { data: choices }, { data: plan }, { data: confirmed }, { data: seatRows }] = await Promise.all([
    supabase.from("schedule_items").select("id, time, title, detail, done_at").eq("event_id", eventId).order("sort").order("time", { nullsFirst: false }),
    supabase.from("menus").select("id, title, locked_at, menu_options(id, label, diet_tags, sort)").eq("event_id", eventId),
    supabase.from("event_guests").select("menu_choice_id").eq("event_id", eventId).not("menu_choice_id", "is", null),
    supabase.from("floor_plans").select("id, name").eq("event_id", eventId).order("created_at").limit(1).maybeSingle(),
    supabase.from("event_guests").select("guest_id, guests(full_name)").eq("event_id", eventId).eq("rsvp_status", "yes"),
    supabase.from("seats").select("guest_id, table_id").eq("event_id", eventId),
  ]);

  const schedule: ScheduleItemVM[] = (sched ?? []).map((s: { id: string; time: string | null; title: string; detail: string | null; done_at: string | null }) => ({ id: s.id, time: s.time, title: s.title, detail: s.detail, done: !!s.done_at }));

  const choiceCount = new Map<string, number>();
  for (const c of (choices ?? []) as { menu_choice_id: string }[]) choiceCount.set(c.menu_choice_id, (choiceCount.get(c.menu_choice_id) ?? 0) + 1);
  const menus: MenuVM[] = ((menuRows ?? []) as unknown as { id: string; title: string; locked_at: string | null; menu_options: { id: string; label: string; diet_tags: string[]; sort: number }[] }[]).map((m) => ({
    id: m.id, title: m.title, locked: !!m.locked_at,
    options: [...(m.menu_options ?? [])].sort((a, b) => a.sort - b.sort).map((o) => ({ id: o.id, label: o.label, diet: o.diet_tags ?? [], count: choiceCount.get(o.id) ?? 0 })),
  }));

  const name = new Map(((confirmed ?? []) as unknown as { guest_id: string; guests: { full_name: string } | null }[]).map((g) => [g.guest_id, g.guests?.full_name ?? "—"]));
  const seatByTable = new Map<string, { guestId: string; name: string }[]>();
  const seatedIds = new Set<string>();
  for (const s of (seatRows ?? []) as { guest_id: string; table_id: string }[]) {
    seatedIds.add(s.guest_id);
    const arr = seatByTable.get(s.table_id) ?? [];
    arr.push({ guestId: s.guest_id, name: name.get(s.guest_id) ?? "—" });
    seatByTable.set(s.table_id, arr);
  }
  let tables: SeatingVM["tables"] = [];
  if (plan) {
    const { data: tbl } = await supabase.from("seating_tables").select("id, name, capacity, sort").eq("floor_plan_id", plan.id).order("sort");
    tables = ((tbl ?? []) as { id: string; name: string; capacity: number }[]).map((tb) => ({ id: tb.id, name: tb.name, capacity: tb.capacity, seated: seatByTable.get(tb.id) ?? [] }));
  }
  const unseated = [...name.entries()].filter(([gid]) => !seatedIds.has(gid)).map(([guestId, n]) => ({ guestId, name: n }));

  return { schedule, menus, seating: { plan: plan ? { id: plan.id, name: plan.name } : null, tables, unseated } };
}
