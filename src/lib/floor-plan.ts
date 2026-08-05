import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SeatVM = { seatNo: number; guestId: string; name: string; diet: string[] };
export type SeatSides = "all" | "long" | "one";
export type TableVM = { id: string; name: string; capacity: number; shape: "round" | "rect" | "banquet"; x: number; y: number; rotation: number; width: number; height: number; seatSides: SeatSides; isLoose: boolean; groupedWith: string | null; seats: SeatVM[] };
export type ElementVM = { id: string; kind: string; label: string | null; x: number; y: number; rotation: number; width: number; height: number };
export type AttendeeVM = { guestId: string; name: string; diet: string[]; seated: boolean };
export type ExceptionVM = { guestId: string; name: string; rsvp: string; tableId: string; seatNo: number };
// §L blueprint display settings live on the plan so reopening restores exactly what was set.
export type BackgroundSettings = { opacity?: number; scale?: number; x?: number; y?: number; locked?: boolean };
export type FloorPlanVM = {
  plan: { id: string; name: string; canvas: { w: number; h: number }; coupleCanEdit: boolean; background: string | null; backgroundUrl: string | null; backgroundSettings: BackgroundSettings } | null;
  tables: TableVM[]; elements: ElementVM[]; attendees: AttendeeVM[]; exceptions: ExceptionVM[];
  seatedCount: number; attendingCount: number;
};

// Everything the editor needs, per event. The seatable population is EXACTLY this
// event's rsvp='yes' guests (kills hole 4); a seated guest who's no longer 'yes'
// becomes an exception (RSVP-flip drift), never a silent lie.
export async function loadFloorPlan(supabase: SupabaseClient, eventId: string): Promise<FloorPlanVM> {
  const { data: planRow } = await supabase.from("floor_plans").select("id, name, canvas, couple_can_edit, background, background_settings").eq("event_id", eventId).order("created_at", { ascending: true }).limit(1).maybeSingle();
  // §L the blueprint is a private wedding-docs file; resolve a short-lived signed URL to draw it.
  let backgroundUrl: string | null = null;
  if (planRow?.background) {
    const { data: signed } = await supabase.storage.from("wedding-docs").createSignedUrl(planRow.background as string, 3600);
    backgroundUrl = signed?.signedUrl ?? null;
  }
  const plan = planRow ? {
    id: planRow.id as string, name: planRow.name as string,
    canvas: (planRow.canvas as { w: number; h: number }) ?? { w: 2000, h: 1200 },
    coupleCanEdit: !!planRow.couple_can_edit,
    background: (planRow.background as string | null) ?? null,
    backgroundUrl,
    backgroundSettings: (planRow.background_settings as BackgroundSettings) ?? {},
  } : null;

  // every event_guest with name, rsvp, and dietary (from their menu choice)
  const { data: egRows } = await supabase.from("event_guests").select("guest_id, rsvp_status, menu_choice_id, guests(full_name)").eq("event_id", eventId);
  const egs = (egRows ?? []) as unknown as { guest_id: string; rsvp_status: string; menu_choice_id: string | null; guests: { full_name: string } | null }[];
  const choiceIds = [...new Set(egs.map((e) => e.menu_choice_id).filter((x): x is string => !!x))];
  const dietBy = new Map<string, string[]>();
  if (choiceIds.length) {
    const { data: opts } = await supabase.from("menu_options").select("id, diet_tags").in("id", choiceIds);
    for (const o of (opts ?? []) as { id: string; diet_tags: string[] }[]) dietBy.set(o.id, o.diet_tags ?? []);
  }
  const nameBy = new Map(egs.map((e) => [e.guest_id, e.guests?.full_name ?? "·"]));
  const rsvpBy = new Map(egs.map((e) => [e.guest_id, e.rsvp_status]));
  const guestDiet = (gid: string) => { const mc = egs.find((e) => e.guest_id === gid)?.menu_choice_id; return mc ? dietBy.get(mc) ?? [] : []; };

  let tables: TableVM[] = [];
  let elements: ElementVM[] = [];
  const exceptions: ExceptionVM[] = [];
  const seatedGuestIds = new Set<string>();

  if (plan) {
    const [{ data: tblRows }, { data: elRows }] = await Promise.all([
      supabase.from("seating_tables").select("id, name, capacity, shape, x, y, rotation, width, height, seat_sides, is_loose, grouped_with").eq("floor_plan_id", plan.id).order("sort"),
      supabase.from("floor_elements").select("id, kind, label, x, y, rotation, width, height").eq("floor_plan_id", plan.id).order("created_at"),
    ]);
    const tbls = (tblRows ?? []) as (Omit<TableVM, "seats" | "seatSides" | "isLoose" | "groupedWith"> & { seat_sides: string | null; is_loose: boolean; grouped_with: string | null })[];
    elements = (elRows ?? []) as ElementVM[];
    const tableIds = tbls.map((t) => t.id);
    const seatsBy = new Map<string, SeatVM[]>();
    if (tableIds.length) {
      const { data: seatRows } = await supabase.from("seats").select("table_id, seat_no, guest_id").in("table_id", tableIds);
      for (const s of (seatRows ?? []) as { table_id: string; seat_no: number; guest_id: string }[]) {
        seatedGuestIds.add(s.guest_id);
        const arr = seatsBy.get(s.table_id) ?? [];
        arr.push({ seatNo: s.seat_no, guestId: s.guest_id, name: nameBy.get(s.guest_id) ?? "·", diet: guestDiet(s.guest_id) });
        seatsBy.set(s.table_id, arr);
        // RSVP-flip drift: seated but no longer attending
        if (rsvpBy.get(s.guest_id) !== "yes") exceptions.push({ guestId: s.guest_id, name: nameBy.get(s.guest_id) ?? "·", rsvp: rsvpBy.get(s.guest_id) ?? "·", tableId: s.table_id, seatNo: s.seat_no });
      }
    }
    tables = tbls.map((t) => ({
      id: t.id, name: t.name, capacity: t.capacity, shape: t.shape, x: t.x, y: t.y, rotation: t.rotation, width: t.width, height: t.height,
      seatSides: (t.seat_sides as SeatSides) ?? "all", isLoose: !!t.is_loose, groupedWith: t.grouped_with ?? null,
      seats: (seatsBy.get(t.id) ?? []).sort((a, b) => a.seatNo - b.seatNo),
    }));
  }

  const attending = egs.filter((e) => e.rsvp_status === "yes");
  const attendees: AttendeeVM[] = attending.map((e) => ({ guestId: e.guest_id, name: e.guests?.full_name ?? "·", diet: guestDiet(e.guest_id), seated: seatedGuestIds.has(e.guest_id) }));
  const seatedCount = attending.filter((e) => seatedGuestIds.has(e.guest_id)).length;

  return { plan, tables, elements, attendees, exceptions, seatedCount, attendingCount: attending.length };
}
