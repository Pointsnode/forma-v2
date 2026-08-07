import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { menuLetter } from "./plate.mjs";

// The one truth for §2/§4: per-event guests with RSVP, seat, and plate, plus the event's menu
// options in letter order. Every column already exists (event_guests, seats.seat_no,
// menu_options.sort, guests.dietary) — this is a query, not a migration. RLS-scoped.

export type PlateOption = { id: string; letter: string; label: string };
export type TableGuest = {
  guestId: string; name: string; rsvp: string; invited: boolean;
  tableName: string | null; seatNo: number | null;
  choiceId: string | null; dietary: string | null;
};

export async function loadEventTable(supabase: SupabaseClient, eventId: string): Promise<{ options: PlateOption[]; guests: TableGuest[] }> {
  const [{ data: menuRows }, { data: egs }, { data: seatRows }] = await Promise.all([
    supabase.from("menus").select("id, menu_options(id, label, sort)").eq("event_id", eventId),
    supabase.from("event_guests").select("guest_id, invited, rsvp_status, menu_choice_id, guests(full_name, dietary)").eq("event_id", eventId).eq("invited", true),
    supabase.from("seats").select("guest_id, seat_no, seating_tables(name)").eq("event_id", eventId),
  ]);
  const opts = ((menuRows ?? []) as { menu_options: { id: string; label: string; sort: number }[] | null }[])
    .flatMap((m) => m.menu_options ?? []).sort((a, b) => a.sort - b.sort);
  const options: PlateOption[] = opts.map((o, i) => ({ id: o.id, letter: menuLetter(i), label: o.label }));

  const seatOf = new Map(((seatRows ?? []) as unknown as { guest_id: string; seat_no: number | null; seating_tables: { name: string } | null }[]).map((s) => [s.guest_id, { table: s.seating_tables?.name ?? null, seatNo: s.seat_no }]));
  const guests: TableGuest[] = ((egs ?? []) as unknown as { guest_id: string; invited: boolean; rsvp_status: string; menu_choice_id: string | null; guests: { full_name: string; dietary: string | null } | null }[])
    .map((e) => ({
      guestId: e.guest_id, name: e.guests?.full_name ?? "·", rsvp: e.rsvp_status, invited: e.invited,
      tableName: seatOf.get(e.guest_id)?.table ?? null, seatNo: seatOf.get(e.guest_id)?.seatNo ?? null,
      choiceId: e.menu_choice_id, dietary: e.guests?.dietary ?? null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { options, guests };
}
