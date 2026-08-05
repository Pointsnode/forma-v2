import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type Rollup = { invited: number; answered: number; yes: number; no: number; maybe: number; pending: number };
export type EventCount = { event_id: string; invited: number; confirmed: number; declined: number; maybe: number; pending: number };
export type Exception = { guest_id: string; full_name: string; reason: string };
export type Touchpoint = { id: string; kind: string; scheduled_for: string; status: string; audience_rule: { scope?: string } | null };
export type GuestRow = {
  id: string; full_name: string; email: string | null; phone: string | null;
  side: string; group_label: string | null; plus_one_allowed: boolean; plus_one_name: string | null; dietary: string | null;
};
export type EventGuestRow = { event_id: string; guest_id: string; invited: boolean; rsvp_status: string };
// §F where a guest sits (per event) — feeds the guest list's "Seated at" column.
export type SeatRow = { guest_id: string; seat_no: number; event_id: string; table: string };

export async function loadGuestBoard(supabase: SupabaseClient, weddingId: string) {
  const [rollup, counts, exceptions, touchpoints, guests, eventGuests, seats] = await Promise.all([
    supabase.from("guest_rsvp_rollup").select("invited, answered, yes, no, maybe, pending").eq("wedding_id", weddingId).maybeSingle(),
    supabase.from("event_guest_counts").select("event_id, invited, confirmed, declined, maybe, pending").eq("wedding_id", weddingId),
    supabase.from("guest_exceptions").select("guest_id, full_name, reason").eq("wedding_id", weddingId),
    supabase.from("touchpoints").select("id, kind, scheduled_for, status, audience_rule").eq("wedding_id", weddingId).order("scheduled_for", { ascending: true }),
    supabase.from("guests").select("id, full_name, email, phone, side, group_label, plus_one_allowed, plus_one_name, dietary").eq("wedding_id", weddingId).order("full_name", { ascending: true }),
    supabase.from("event_guests").select("event_id, guest_id, invited, rsvp_status").eq("wedding_id", weddingId),
    supabase.from("seats").select("guest_id, seat_no, event_id, seating_tables(name)").eq("wedding_id", weddingId),
  ]);
  const seatRows = ((seats.data ?? []) as unknown as { guest_id: string; seat_no: number; event_id: string; seating_tables: { name: string } | null }[])
    .map((s) => ({ guest_id: s.guest_id, seat_no: s.seat_no, event_id: s.event_id, table: s.seating_tables?.name ?? "·" }));
  return {
    rollup: (rollup.data as Rollup | null) ?? { invited: 0, answered: 0, yes: 0, no: 0, maybe: 0, pending: 0 },
    counts: (counts.data ?? []) as EventCount[],
    exceptions: (exceptions.data ?? []) as Exception[],
    touchpoints: (touchpoints.data ?? []) as Touchpoint[],
    guests: (guests.data ?? []) as GuestRow[],
    eventGuests: (eventGuests.data ?? []) as EventGuestRow[],
    seats: seatRows as SeatRow[],
  };
}

// Non-touchpoint "reminder-chase" honesty: how many guests a non_responders
// reminder would actually email (invited, have email, not yet answered).
export function reminderChaseCount(guests: GuestRow[], eventGuests: EventGuestRow[]): number {
  const answered = new Set(eventGuests.filter((eg) => eg.invited && eg.rsvp_status !== "pending").map((eg) => eg.guest_id));
  return guests.filter((g) => g.email && !answered.has(g.id)).length;
}

// §F the "Seated at" cell per guest: seated (table + chair, at that event), unseated-but-attending
// (a "Seat…" deep-link into that guest's first event's plan), or none (attends nothing). Pure.
export type SeatCell =
  | { kind: "seated"; table: string; seatNo: number; eventId: string }
  | { kind: "unseated"; eventId: string; count: number }
  | { kind: "none" };
export function seatCells(guests: GuestRow[], eventGuests: EventGuestRow[], seats: SeatRow[]): Record<string, SeatCell> {
  const seatBy = new Map<string, SeatRow>();
  for (const s of seats) if (!seatBy.has(s.guest_id)) seatBy.set(s.guest_id, s); // first seat found
  const attendBy = new Map<string, string[]>();
  for (const eg of eventGuests) if (eg.rsvp_status === "yes") { const a = attendBy.get(eg.guest_id) ?? []; a.push(eg.event_id); attendBy.set(eg.guest_id, a); }
  const out: Record<string, SeatCell> = {};
  for (const g of guests) {
    const s = seatBy.get(g.id);
    if (s) { out[g.id] = { kind: "seated", table: s.table, seatNo: s.seat_no, eventId: s.event_id }; continue; }
    const ev = attendBy.get(g.id) ?? [];
    out[g.id] = ev.length ? { kind: "unseated", eventId: ev[0], count: ev.length } : { kind: "none" };
  }
  return out;
}
