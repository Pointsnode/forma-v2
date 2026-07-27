"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type GuestResult = { ok?: boolean; error?: string; added?: number };

function refresh() {
  revalidatePath("/[locale]/wedding/[id]", "layout");
}

type NewGuest = { full_name: string; email?: string | null; phone?: string | null };

export async function importGuests(weddingId: string, rows: NewGuest[]): Promise<GuestResult> {
  if (!rows.length) return { ok: true, added: 0 };
  const supabase = await createClient();
  const { error, count } = await supabase
    .from("guests")
    .insert(rows.map((r) => ({ wedding_id: weddingId, full_name: r.full_name, email: r.email || null, phone: r.phone || null })), { count: "exact" });
  if (error) {
    console.error(`importGuests failed (${error.code}): ${error.message}`);
    return { error: "generic" };
  }
  // One activity row per import (verb localized at render; summary = count only).
  const added = count ?? rows.length;
  const { error: logErr } = await supabase.rpc("log_guest_import", { w: weddingId, n: added });
  if (logErr) console.error(`log_guest_import failed (${logErr.code}): ${logErr.message}`);
  refresh();
  return { ok: true, added };
}

export async function addGuest(weddingId: string, fields: Record<string, unknown>): Promise<GuestResult> {
  const supabase = await createClient();
  const name = String(fields.full_name ?? "").trim();
  if (!name) return { error: "invalid" };
  const { error } = await supabase.from("guests").insert({
    wedding_id: weddingId,
    full_name: name,
    email: (fields.email as string) || null,
    phone: (fields.phone as string) || null,
    side: (fields.side as string) || "none",
    group_label: (fields.group_label as string) || null,
    plus_one_allowed: !!fields.plus_one_allowed,
  });
  if (error) { console.error(`addGuest (${error.code}): ${error.message}`); return { error: "generic" }; }
  refresh();
  return { ok: true };
}

export async function updateGuest(guestId: string, _weddingId: string, fields: Record<string, unknown>): Promise<GuestResult> {
  const supabase = await createClient();
  const patch: Record<string, unknown> = {};
  for (const k of ["full_name", "email", "phone", "side", "group_label", "dietary", "plus_one_name"]) {
    if (k in fields) patch[k] = (fields[k] as string) || (k === "full_name" ? undefined : null);
  }
  if ("plus_one_allowed" in fields) patch.plus_one_allowed = !!fields.plus_one_allowed;
  const { error } = await supabase.from("guests").update(patch).eq("id", guestId);
  if (error) { console.error(`updateGuest (${error.code}): ${error.message}`); return { error: "generic" }; }
  refresh();
  return { ok: true };
}

export async function deleteGuest(guestId: string): Promise<GuestResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("guests").delete().eq("id", guestId);
  if (error) { console.error(`deleteGuest (${error.code}): ${error.message}`); return { error: "generic" }; }
  refresh();
  return { ok: true };
}

export async function toggleInvited(eventId: string, guestId: string, _weddingId: string, invited: boolean): Promise<GuestResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("event_guests").update({ invited }).eq("event_id", eventId).eq("guest_id", guestId);
  if (error) { console.error(`toggleInvited (${error.code}): ${error.message}`); return { error: "generic" }; }
  refresh();
  return { ok: true };
}

export async function setRsvpDeadline(weddingId: string, deadline: string | null): Promise<GuestResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("weddings").update({ rsvp_deadline: deadline || null }).eq("id", weddingId);
  if (error) { console.error(`setRsvpDeadline (${error.code}): ${error.message}`); return { error: "generic" }; }
  refresh();
  return { ok: true };
}

export async function setRsvpOpen(weddingId: string, open: boolean): Promise<GuestResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("weddings").update({ rsvp_open: open }).eq("id", weddingId);
  if (error) { console.error(`setRsvpOpen (${error.code}): ${error.message}`); return { error: "generic" }; }
  refresh();
  return { ok: true };
}

export async function skipTouchpoint(touchpointId: string, _weddingId: string, skip: boolean): Promise<GuestResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("touchpoints").update({ status: skip ? "skipped" : "scheduled" }).eq("id", touchpointId);
  if (error) { console.error(`skipTouchpoint (${error.code}): ${error.message}`); return { error: "generic" }; }
  refresh();
  return { ok: true };
}
