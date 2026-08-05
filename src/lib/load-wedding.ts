import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventRow, WeddingRow } from "@/lib/wedding";

const WEDDING_COLS =
  "id, workspace_id, couple_display, partner_a, partner_b, phase, kind, location_city, location_country, date_start, date_end, guest_target, budget_total, rsvp_deadline, rsvp_open, locale";
const EVENT_COLS = "id, label, kind, event_date, start_time, end_time, order_index, guest_target";

export type WeddingRole = "staff" | "member" | "none";

// The viewer's relationship to a wedding decides the lens: staff (a member of the
// owning workspace) get the planner floor; a wedding_member who is NOT staff gets
// the couple lens. A self-planning couple is staff of their own workspace → planner.
export async function resolveWeddingRole(
  supabase: SupabaseClient,
  weddingWorkspaceId: string,
  weddingId: string,
  userId: string,
): Promise<WeddingRole> {
  const [{ data: staff }, { data: member }] = await Promise.all([
    supabase.from("workspace_members").select("user_id").eq("workspace_id", weddingWorkspaceId).eq("user_id", userId).maybeSingle(),
    supabase.from("wedding_members").select("user_id").eq("wedding_id", weddingId).eq("user_id", userId).maybeSingle(),
  ]);
  if (staff) return "staff";
  if (member) return "member";
  return "none";
}

// Wedding + events + the viewer's role in one call — the entry point every
// wedding-scoped page uses to decide the lens and gate edit controls.
export async function loadWeddingContext(
  supabase: SupabaseClient,
  id: string,
): Promise<{ wedding: WeddingRow; events: EventRow[]; role: WeddingRole; userId: string } | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const data = await loadWedding(supabase, id);
  if (!data) return null;
  const role = await resolveWeddingRole(supabase, data.wedding.workspace_id!, id, user.id);
  return { ...data, role, userId: user.id };
}

// RLS-scoped load of a wedding + its events (ordered). Returns null when the row
// isn't visible to the caller — the page turns that into notFound().
export async function loadWedding(
  supabase: SupabaseClient,
  id: string,
): Promise<{ wedding: WeddingRow; events: EventRow[] } | null> {
  const { data: wedding } = await supabase.from("weddings").select(WEDDING_COLS).eq("id", id).maybeSingle();
  if (!wedding) return null;
  // Deterministic order everywhere events render (chip bar, Events card, event
  // pages all read this). CHRONOLOGY IS THE TRUTH: date first, then start time;
  // order_index only arranges events WITHIN the same date/time; created_at breaks
  // any final tie. order_index must never let an event jump across days. Undated /
  // untimed events sort last.
  const { data: events } = await supabase
    .from("wedding_events")
    .select(EVENT_COLS)
    .eq("wedding_id", id)
    .order("event_date", { ascending: true, nullsFirst: false })
    .order("start_time", { ascending: true, nullsFirst: false })
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true });
  return { wedding: wedding as WeddingRow, events: (events ?? []) as EventRow[] };
}
