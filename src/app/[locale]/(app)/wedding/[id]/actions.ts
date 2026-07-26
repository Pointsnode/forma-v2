"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type EventState = { error?: "invalid" | "last_event" | "generic"; ok?: boolean } | null;

const EVENT_KINDS = ["ceremony", "reception", "dinner", "party", "ritual", "other"] as const;
const opt = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : s;
};
const optInt = (v: FormDataEntryValue | null) => {
  const s = typeof v === "string" ? v.replace(/[^0-9]/g, "") : "";
  return s === "" ? null : Number(s);
};

const fields = z.object({
  label: z.string().trim().min(1).max(120),
  kind: z.enum(EVENT_KINDS).catch("other"),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
  order_index: z.number().int().min(0).max(999).catch(0),
  guest_target: z.number().int().min(0).nullable(),
});

function parse(formData: FormData) {
  return fields.safeParse({
    label: formData.get("label"),
    kind: opt(formData.get("kind")) ?? "other",
    event_date: opt(formData.get("event_date")),
    start_time: opt(formData.get("start_time")),
    end_time: opt(formData.get("end_time")),
    order_index: optInt(formData.get("order_index")) ?? 0,
    guest_target: optInt(formData.get("guest_target")),
  });
}

// The wedding floor + event pages sit under /[locale]/wedding/[id]; revalidating
// that segment as a LAYOUT refreshes the hero, chips and derived dates in place
// (both locales — the pattern covers /es too), no client reload. (v1's #96 lesson,
// adapted to the v2 route.)
function refresh(weddingId: string) {
  void weddingId;
  revalidatePath("/[locale]/wedding/[id]", "layout");
}

export async function addEvent(weddingId: string, _prev: EventState, formData: FormData): Promise<EventState> {
  const parsed = parse(formData);
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.from("wedding_events").insert({ wedding_id: weddingId, ...parsed.data });
  if (error) {
    console.error(`addEvent failed (${error.code}): ${error.message}`);
    return { error: "generic" };
  }
  refresh(weddingId);
  return { ok: true };
}

export async function updateEvent(eventId: string, weddingId: string, _prev: EventState, formData: FormData): Promise<EventState> {
  const parsed = parse(formData);
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.from("wedding_events").update(parsed.data).eq("id", eventId);
  if (error) {
    console.error(`updateEvent failed (${error.code}): ${error.message}`);
    return { error: "generic" };
  }
  refresh(weddingId);
  return { ok: true };
}

export async function deleteEvent(eventId: string, weddingId: string): Promise<EventState> {
  const supabase = await createClient();
  const { error } = await supabase.from("wedding_events").delete().eq("id", eventId);
  if (error) {
    if (error.code === "FV210") return { error: "last_event" }; // last-event guard
    console.error(`deleteEvent failed (${error.code}): ${error.message}`);
    return { error: "generic" };
  }
  refresh(weddingId);
  return { ok: true };
}
