"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type FloorResult = { ok?: boolean; error?: string; message?: string; id?: string };
const rv = () => revalidatePath("/[locale]/wedding/[id]", "layout");

// A plan is created lazily the first time an event's Seating editor opens (staff).
export async function ensurePlan(eventId: string, weddingId: string, name: string): Promise<FloorResult> {
  const supabase = await createClient();
  const { data: existing } = await supabase.from("floor_plans").select("id").eq("event_id", eventId).limit(1).maybeSingle();
  if (existing) return { ok: true, id: existing.id as string };
  const { data, error } = await supabase.from("floor_plans").insert({ event_id: eventId, wedding_id: weddingId, name }).select("id").single();
  if (error || !data) { console.error(`ensurePlan (${error?.code})`); return { error: "generic" }; }
  rv();
  return { ok: true, id: data.id };
}

// ── geometry (staff, direct under RLS) ───────────────────────────────────────
export async function addTable(planId: string, weddingId: string, shape: "round" | "rect" | "banquet", x: number, y: number): Promise<FloorResult> {
  const supabase = await createClient();
  const { count } = await supabase.from("seating_tables").select("id", { count: "exact", head: true }).eq("floor_plan_id", planId);
  const width = shape === "round" ? 120 : 200;
  const height = shape === "round" ? 120 : 90;
  const { data, error } = await supabase.from("seating_tables").insert({ floor_plan_id: planId, wedding_id: weddingId, name: `Table ${(count ?? 0) + 1}`, shape, x, y, width, height, sort: count ?? 0 }).select("id").single();
  if (error || !data) { console.error(`addTable (${error?.code}): ${error?.message}`); return { error: "generic" }; }
  rv();
  return { ok: true, id: data.id };
}

export async function updateTableGeometry(tableId: string, g: { x?: number; y?: number; rotation?: number; width?: number; height?: number }): Promise<FloorResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("seating_tables").update(g).eq("id", tableId);
  if (error) { console.error(`updateTableGeometry (${error.code}): ${error.message}`); return { error: error.code || "generic" }; }
  rv();
  return { ok: true };
}

export async function updateTableProps(tableId: string, props: { name?: string; capacity?: number; seatSides?: "all" | "long" | "one" }): Promise<FloorResult> {
  const supabase = await createClient();
  const upd: Record<string, unknown> = {};
  if (props.name !== undefined) upd.name = props.name.trim() || "Table";
  if (props.capacity !== undefined) upd.capacity = Math.max(1, Math.min(100, props.capacity));
  if (props.seatSides !== undefined && ["all", "long", "one"].includes(props.seatSides)) upd.seat_sides = props.seatSides;
  // The capacity-shrink guard (FS043) surfaces its named message — pass it through for formaError.
  const { error } = await supabase.from("seating_tables").update(upd).eq("id", tableId);
  if (error) { console.error(`updateTableProps (${error.code}): ${error.message}`); return { error: error.code || "generic", message: error.message }; }
  rv();
  return { ok: true };
}

// Duplicate a table (staff) — "another one of those, over there": shape, capacity, size and
// seat_sides copied, offset 24px, NO seats (they belong to a specific guest + chair).
export async function duplicateTable(tableId: string): Promise<FloorResult> {
  const supabase = await createClient();
  const { data: src } = await supabase.from("seating_tables").select("floor_plan_id, wedding_id, name, capacity, shape, x, y, rotation, width, height, seat_sides").eq("id", tableId).maybeSingle();
  if (!src) return { error: "FV000", message: "no such table" };
  const { count } = await supabase.from("seating_tables").select("id", { count: "exact", head: true }).eq("floor_plan_id", src.floor_plan_id as string);
  const { data, error } = await supabase.from("seating_tables").insert({
    floor_plan_id: src.floor_plan_id, wedding_id: src.wedding_id, name: `${src.name} copy`,
    capacity: src.capacity, shape: src.shape, x: (src.x as number) + 24, y: (src.y as number) + 24,
    rotation: src.rotation, width: src.width, height: src.height, seat_sides: src.seat_sides, sort: count ?? 0,
  }).select("id").single();
  if (error || !data) { console.error(`duplicateTable (${error?.code}): ${error?.message}`); return { error: "generic" }; }
  rv();
  return { ok: true, id: data.id };
}

// §D a loose seat is a seating_tables row (is_loose, capacity 1, round) — reuses assign_seat with
// seat_no 0. Draws as a single chair; groupable to a table so reports stay correct.
export async function addLooseSeat(planId: string, weddingId: string, x: number, y: number): Promise<FloorResult> {
  const supabase = await createClient();
  const { count } = await supabase.from("seating_tables").select("id", { count: "exact", head: true }).eq("floor_plan_id", planId);
  const { data, error } = await supabase.from("seating_tables").insert({
    floor_plan_id: planId, wedding_id: weddingId, name: `Seat ${(count ?? 0) + 1}`,
    is_loose: true, capacity: 1, shape: "round", x, y, width: 30, height: 30, sort: count ?? 0,
  }).select("id").single();
  if (error || !data) { console.error(`addLooseSeat (${error?.code}): ${error?.message}`); return { error: "generic" }; }
  rv();
  return { ok: true, id: data.id };
}

// Group / ungroup a loose seat to a table (tableId null = ungroup).
export async function groupLooseSeat(looseId: string, tableId: string | null): Promise<FloorResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("seating_tables").update({ grouped_with: tableId }).eq("id", looseId).eq("is_loose", true);
  if (error) { console.error(`groupLooseSeat (${error.code}): ${error.message}`); return { error: error.code || "generic", message: error.message }; }
  rv();
  return { ok: true };
}

export async function deleteTable(tableId: string): Promise<FloorResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("seating_tables").delete().eq("id", tableId);
  if (error) return { error: "generic" };
  rv();
  return { ok: true };
}

export async function addElement(planId: string, weddingId: string, kind: string, x: number, y: number, label: string | null): Promise<FloorResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("floor_elements").insert({ floor_plan_id: planId, wedding_id: weddingId, kind, label, x, y }).select("id").single();
  if (error || !data) { console.error(`addElement (${error?.code}): ${error?.message}`); return { error: "generic" }; }
  rv();
  return { ok: true, id: data.id };
}

export async function updateElementGeometry(elementId: string, g: { x?: number; y?: number; rotation?: number; width?: number; height?: number; label?: string }): Promise<FloorResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("floor_elements").update(g).eq("id", elementId);
  if (error) return { error: "generic" };
  rv();
  return { ok: true };
}

export async function deleteElement(elementId: string): Promise<FloorResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("floor_elements").delete().eq("id", elementId);
  if (error) return { error: "generic" };
  rv();
  return { ok: true };
}

// ── the couple's locked move (works for staff too — the rpc allows both) ─────
export async function moveItem(kind: "table" | "element", id: string, x: number, y: number, rotation: number | null): Promise<FloorResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("move_floor_item", { p_kind: kind, p_id: id, p_x: x, p_y: y, p_rotation: rotation });
  if (error) { console.error(`moveItem (${error.code}): ${error.message}`); return { error: error.code || "generic" }; }
  rv();
  return { ok: true };
}

// ── seats + lens (function-only lanes) ───────────────────────────────────────
export async function assignSeatAt(eventId: string, guestId: string, tableId: string, seatNo: number): Promise<FloorResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_seat", { p_event: eventId, p_guest: guestId, p_table: tableId, p_seat_no: seatNo });
  if (error) { console.error(`assign_seat (${error.code}): ${error.message}`); return { error: error.code || "generic", message: error.message }; }
  rv();
  return { ok: true };
}

export async function unseatGuest(eventId: string, guestId: string): Promise<FloorResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("unseat", { p_event: eventId, p_guest: guestId });
  if (error) { console.error(`unseat (${error.code}): ${error.message}`); return { error: error.code || "generic", message: error.message }; }
  rv();
  return { ok: true };
}

// ── §L venue blueprint (staff): the file lives in the existing wedding-docs bucket under a
// wedding-scoped path, so its gating is inherited — no new bucket, no new RLS. PNG/JPEG render
// directly; PDF is deferred (no rasteriser shipped) and refused cleanly, never faked.
export async function uploadBackground(planId: string, weddingId: string, form: FormData): Promise<FloorResult> {
  const supabase = await createClient();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "invalid" };
  if (file.type === "application/pdf") return { error: "pdfDeferred" };
  if (file.type !== "image/png" && file.type !== "image/jpeg") return { error: "badType" };
  if (file.size > 20 * 1024 * 1024) return { error: "tooBig" };
  const ext = file.type === "image/png" ? "png" : "jpg";
  const path = `${weddingId}/seating/${planId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("wedding-docs").upload(path, file, { contentType: file.type });
  if (upErr) { console.error(`uploadBackground upload: ${upErr.message}`); return { error: "generic" }; }
  // Replace any previous background file (unreferenced once the path changes).
  const { data: prev } = await supabase.from("floor_plans").select("background").eq("id", planId).maybeSingle();
  const { error } = await supabase.from("floor_plans").update({ background: path, background_settings: { opacity: 0.55, scale: 1, x: 0, y: 0, locked: true } }).eq("id", planId);
  if (error) { console.error(`uploadBackground (${error.code}): ${error.message}`); return { error: error.code || "generic", message: error.message }; }
  if (prev?.background) await supabase.storage.from("wedding-docs").remove([prev.background as string]);
  rv();
  return { ok: true };
}

export async function updateBackgroundSettings(planId: string, settings: { opacity?: number; scale?: number; x?: number; y?: number; locked?: boolean }): Promise<FloorResult> {
  const supabase = await createClient();
  const { data: cur } = await supabase.from("floor_plans").select("background_settings").eq("id", planId).maybeSingle();
  const merged = { ...((cur?.background_settings as Record<string, unknown>) ?? {}), ...settings };
  const { error } = await supabase.from("floor_plans").update({ background_settings: merged }).eq("id", planId);
  if (error) { console.error(`updateBackgroundSettings (${error.code}): ${error.message}`); return { error: error.code || "generic", message: error.message }; }
  rv();
  return { ok: true };
}

export async function removeBackground(planId: string): Promise<FloorResult> {
  const supabase = await createClient();
  const { data: cur } = await supabase.from("floor_plans").select("background").eq("id", planId).maybeSingle();
  const { error } = await supabase.from("floor_plans").update({ background: null, background_settings: {} }).eq("id", planId);
  if (error) { console.error(`removeBackground (${error.code}): ${error.message}`); return { error: error.code || "generic", message: error.message }; }
  if (cur?.background) await supabase.storage.from("wedding-docs").remove([cur.background as string]);
  rv();
  return { ok: true };
}

export async function toggleCoupleEdit(planId: string, on: boolean): Promise<FloorResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_couple_can_edit", { p_plan: planId, p_on: on });
  if (error) { console.error(`set_couple_can_edit (${error.code}): ${error.message}`); return { error: error.code || "generic" }; }
  rv();
  return { ok: true };
}
