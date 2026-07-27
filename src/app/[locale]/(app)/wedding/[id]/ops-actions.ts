"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type OpsResult = { ok?: boolean; error?: string; id?: string };
const rv = () => revalidatePath("/[locale]/wedding/[id]", "layout");
const num = (v: FormDataEntryValue | null) => { const s = String(v ?? "").replace(/[^0-9.]/g, ""); return s ? Number(s) : 0; };
const txt = (v: FormDataEntryValue | null) => { const s = String(v ?? "").trim(); return s || null; };

// ── schedule (run of show) ───────────────────────────────────────────────────
export async function addScheduleItem(weddingId: string, eventId: string, form: FormData): Promise<OpsResult> {
  const supabase = await createClient();
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "invalid" };
  const sortRaw = await supabase.from("schedule_items").select("sort").eq("event_id", eventId).order("sort", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("schedule_items").insert({ wedding_id: weddingId, event_id: eventId, title, time: txt(form.get("time")), detail: txt(form.get("detail")), sort: (sortRaw.data?.sort ?? 0) + 1 });
  if (error) return { error: error.code || "generic" };
  rv(); return { ok: true };
}
export async function updateScheduleItem(itemId: string, form: FormData): Promise<OpsResult> {
  const supabase = await createClient();
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "invalid" };
  const { error } = await supabase.from("schedule_items").update({ title, time: txt(form.get("time")), detail: txt(form.get("detail")) }).eq("id", itemId);
  if (error) return { error: "generic" }; rv(); return { ok: true };
}
export async function deleteScheduleItem(itemId: string): Promise<OpsResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("schedule_items").delete().eq("id", itemId);
  if (error) return { error: "generic" }; rv(); return { ok: true };
}
export async function checkScheduleItem(itemId: string, done: boolean): Promise<OpsResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("check_schedule_item", { p_item: itemId, p_done: done });
  if (error) return { error: error.code || "generic" }; rv(); return { ok: true };
}

// ── menus ────────────────────────────────────────────────────────────────────
export async function addMenu(weddingId: string, eventId: string, form: FormData): Promise<OpsResult> {
  const supabase = await createClient();
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "invalid" };
  const { data, error } = await supabase.from("menus").insert({ wedding_id: weddingId, event_id: eventId, title, notes: txt(form.get("notes")) }).select("id").single();
  if (error || !data) return { error: "generic" }; rv(); return { ok: true, id: data.id };
}
export async function addMenuOption(menuId: string, weddingId: string, form: FormData): Promise<OpsResult> {
  const supabase = await createClient();
  const label = String(form.get("label") ?? "").trim();
  if (!label) return { error: "invalid" };
  const diet = String(form.get("diet_tags") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  const { error } = await supabase.from("menu_options").insert({ menu_id: menuId, wedding_id: weddingId, label, diet_tags: diet });
  if (error) return { error: "generic" }; rv(); return { ok: true };
}
export async function lockMenu(menuId: string, lock: boolean): Promise<OpsResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(lock ? "lock_menu" : "unlock_menu", { p_menu: menuId });
  if (error) return { error: error.code || "generic" }; rv(); return { ok: true };
}

// ── seating ──────────────────────────────────────────────────────────────────
export async function addFloorPlan(weddingId: string, eventId: string, name: string): Promise<OpsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("floor_plans").insert({ wedding_id: weddingId, event_id: eventId, name: name.trim() || "Floor plan" }).select("id").single();
  if (error || !data) return { error: "generic" }; rv(); return { ok: true, id: data.id };
}
export async function addTable(planId: string, weddingId: string, form: FormData): Promise<OpsResult> {
  const supabase = await createClient();
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "invalid" };
  const { error } = await supabase.from("seating_tables").insert({ floor_plan_id: planId, wedding_id: weddingId, name, capacity: num(form.get("capacity")) || 8 });
  if (error) return { error: "generic" }; rv(); return { ok: true };
}
export async function assignSeat(eventId: string, guestId: string, tableId: string): Promise<OpsResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("assign_seat", { p_event: eventId, p_guest: guestId, p_table: tableId });
  if (error) return { error: error.code || "generic" }; rv(); return { ok: true };
}
export async function unseat(eventId: string, guestId: string): Promise<OpsResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("unseat", { p_event: eventId, p_guest: guestId });
  if (error) return { error: "generic" }; rv(); return { ok: true };
}

// ── day-of extras + close ────────────────────────────────────────────────────
export async function addDayOfExtra(weddingId: string, eventId: string | null, form: FormData): Promise<OpsResult> {
  const supabase = await createClient();
  const title = String(form.get("title") ?? "").trim();
  const amount = num(form.get("amount"));
  if (!title || !amount) return { error: "invalid" };
  const { error } = await supabase.rpc("add_day_of_extra", { p_wedding: weddingId, p_event: eventId, p_title: title, p_amount: amount });
  if (error) return { error: error.code || "generic" }; rv(); return { ok: true };
}
export async function advancePhase(weddingId: string): Promise<OpsResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("advance_phase", { w: weddingId });
  if (error) return { error: error.code || "generic" }; rv(); return { ok: true };
}
export async function closeWedding(weddingId: string): Promise<OpsResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_wedding", { w: weddingId });
  if (error) return { error: error.code || "generic" }; rv(); return { ok: true };
}

// ── guest touchpoints (menu collection · day-of schedules) ──────────────────
// Schedules the touchpoint for today; the cron builds the audience + sends via
// Resend on its next run (stamping only what Resend accepts — the M3 honesty rule).
export async function sendTouchpoint(weddingId: string, kind: "menu_collect" | "day_of_schedule"): Promise<OpsResult> {
  const supabase = await createClient();
  const { data: existing } = await supabase.from("touchpoints").select("id").eq("wedding_id", weddingId).eq("kind", kind).in("status", ["scheduled", "sending"]).maybeSingle();
  if (!existing) {
    const { error } = await supabase.from("touchpoints").insert({ wedding_id: weddingId, kind, scheduled_for: new Date().toISOString().slice(0, 10), audience_rule: { scope: kind === "menu_collect" ? "menu_attendees" : "confirmed" } });
    if (error) return { error: error.code || "generic" };
  }
  rv(); return { ok: true };
}

// ── tasks + goal overrides ───────────────────────────────────────────────────
export async function addTask(form: FormData): Promise<OpsResult> {
  const supabase = await createClient();
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "invalid" };
  const weddingId = txt(form.get("wedding_id"));
  const workspaceId = txt(form.get("workspace_id"));
  if (!weddingId && !workspaceId) return { error: "invalid" };
  const { error } = await supabase.from("tasks").insert({ title, due_date: txt(form.get("due_date")), wedding_id: weddingId, workspace_id: weddingId ? null : workspaceId });
  if (error) return { error: error.code || "generic" }; rv(); return { ok: true };
}
export async function toggleTask(taskId: string, done: boolean): Promise<OpsResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update({ done_at: done ? new Date().toISOString() : null }).eq("id", taskId);
  if (error) return { error: "generic" }; rv(); return { ok: true };
}
// ── documents + design (storage-backed) ─────────────────────────────────────
async function uploadTo(bucket: string, weddingId: string, file: File): Promise<{ path?: string; error?: string }> {
  const supabase = await createClient();
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${weddingId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type });
  if (error) { console.error(`upload ${bucket}: ${error.message}`); return { error: "generic" }; }
  return { path };
}
export async function uploadDocument(weddingId: string, form: FormData): Promise<OpsResult> {
  const supabase = await createClient();
  const file = form.get("file");
  const title = String(form.get("title") ?? "").trim();
  if (!(file instanceof File) || file.size === 0 || !title) return { error: "invalid" };
  if (file.size > 20 * 1024 * 1024) return { error: "toobig" };
  const up = await uploadTo("wedding-docs", weddingId, file);
  if (up.error || !up.path) return { error: "generic" };
  const { error } = await supabase.from("documents").insert({ wedding_id: weddingId, title, source: "upload", storage_path: up.path });
  if (error) return { error: error.code || "generic" }; rv(); return { ok: true };
}
export async function addDesignBoard(weddingId: string, title: string): Promise<OpsResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("design_boards").insert({ wedding_id: weddingId, title: title.trim() || "Board" }).select("id").single();
  if (error || !data) return { error: "generic" }; rv(); return { ok: true, id: data.id };
}
export async function addDesignItem(boardId: string, weddingId: string, form: FormData): Promise<OpsResult> {
  const supabase = await createClient();
  const title = String(form.get("title") ?? "").trim();
  if (!title) return { error: "invalid" };
  let path: string | null = null;
  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > 20 * 1024 * 1024) return { error: "toobig" };
    const up = await uploadTo("design-media", weddingId, file);
    if (up.error) return { error: "generic" };
    path = up.path ?? null;
  }
  const { error } = await supabase.from("design_items").insert({ board_id: boardId, wedding_id: weddingId, title, note: txt(form.get("note")), storage_path: path });
  if (error) return { error: error.code || "generic" }; rv(); return { ok: true };
}

export async function setGoalOverride(weddingId: string, goalKey: string, status: "manual_done" | "dismissed" | null, note: string): Promise<OpsResult> {
  const supabase = await createClient();
  if (status === null) {
    const { error } = await supabase.from("wedding_goal_overrides").delete().eq("wedding_id", weddingId).eq("goal_key", goalKey);
    if (error) return { error: "generic" };
  } else {
    const { error } = await supabase.from("wedding_goal_overrides").upsert({ wedding_id: weddingId, goal_key: goalKey, status, note: note || null }, { onConflict: "wedding_id,goal_key" });
    if (error) return { error: "generic" };
  }
  rv(); return { ok: true };
}
