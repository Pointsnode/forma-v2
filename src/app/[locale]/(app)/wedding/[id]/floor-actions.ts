"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type FloorResult = { ok?: boolean; error?: string; id?: string };
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

export async function updateTableProps(tableId: string, props: { name?: string; capacity?: number }): Promise<FloorResult> {
  const supabase = await createClient();
  const upd: Record<string, unknown> = {};
  if (props.name !== undefined) upd.name = props.name.trim() || "Table";
  if (props.capacity !== undefined) upd.capacity = Math.max(1, Math.min(100, props.capacity));
  const { error } = await supabase.from("seating_tables").update(upd).eq("id", tableId);
  if (error) { console.error(`updateTableProps (${error.code}): ${error.message}`); return { error: error.code || "generic" }; }
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
  if (error) { console.error(`assign_seat (${error.code}): ${error.message}`); return { error: error.code || "generic" }; }
  rv();
  return { ok: true };
}

export async function unseatGuest(eventId: string, guestId: string): Promise<FloorResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("unseat", { p_event: eventId, p_guest: guestId });
  if (error) { console.error(`unseat (${error.code}): ${error.message}`); return { error: error.code || "generic" }; }
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
