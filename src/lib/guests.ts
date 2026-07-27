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

export async function loadGuestBoard(supabase: SupabaseClient, weddingId: string) {
  const [rollup, counts, exceptions, touchpoints, guests, eventGuests] = await Promise.all([
    supabase.from("guest_rsvp_rollup").select("invited, answered, yes, no, maybe, pending").eq("wedding_id", weddingId).maybeSingle(),
    supabase.from("event_guest_counts").select("event_id, invited, confirmed, declined, maybe, pending").eq("wedding_id", weddingId),
    supabase.from("guest_exceptions").select("guest_id, full_name, reason").eq("wedding_id", weddingId),
    supabase.from("touchpoints").select("id, kind, scheduled_for, status, audience_rule").eq("wedding_id", weddingId).order("scheduled_for", { ascending: true }),
    supabase.from("guests").select("id, full_name, email, phone, side, group_label, plus_one_allowed, plus_one_name, dietary").eq("wedding_id", weddingId).order("full_name", { ascending: true }),
    supabase.from("event_guests").select("event_id, guest_id, invited, rsvp_status").eq("wedding_id", weddingId),
  ]);
  return {
    rollup: (rollup.data as Rollup | null) ?? { invited: 0, answered: 0, yes: 0, no: 0, maybe: 0, pending: 0 },
    counts: (counts.data ?? []) as EventCount[],
    exceptions: (exceptions.data ?? []) as Exception[],
    touchpoints: (touchpoints.data ?? []) as Touchpoint[],
    guests: (guests.data ?? []) as GuestRow[],
    eventGuests: (eventGuests.data ?? []) as EventGuestRow[],
  };
}

// Non-touchpoint "reminder-chase" honesty: how many guests a non_responders
// reminder would actually email (invited, have email, not yet answered).
export function reminderChaseCount(guests: GuestRow[], eventGuests: EventGuestRow[]): number {
  const answered = new Set(eventGuests.filter((eg) => eg.invited && eg.rsvp_status !== "pending").map((eg) => eg.guest_id));
  return guests.filter((g) => g.email && !answered.has(g.id)).length;
}
