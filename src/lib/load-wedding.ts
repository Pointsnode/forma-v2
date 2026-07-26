import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventRow, WeddingRow } from "@/lib/wedding";

const WEDDING_COLS =
  "id, couple_display, partner_a, partner_b, phase, kind, location_city, location_country, date_start, date_end, guest_target, budget_total";
const EVENT_COLS = "id, label, kind, event_date, start_time, end_time, order_index, guest_target";

// RLS-scoped load of a wedding + its events (ordered). Returns null when the row
// isn't visible to the caller — the page turns that into notFound().
export async function loadWedding(
  supabase: SupabaseClient,
  id: string,
): Promise<{ wedding: WeddingRow; events: EventRow[] } | null> {
  const { data: wedding } = await supabase.from("weddings").select(WEDDING_COLS).eq("id", id).maybeSingle();
  if (!wedding) return null;
  // Deterministic, chronological order everywhere events render (chip bar, Events
  // card, event pages all read this): order_index, then date, then start time,
  // then created_at — undated / untimed events sort last, never ahead of a dated
  // one. Without the tie-break, equal order_index left the order undefined.
  const { data: events } = await supabase
    .from("wedding_events")
    .select(EVENT_COLS)
    .eq("wedding_id", id)
    .order("order_index", { ascending: true })
    .order("event_date", { ascending: true, nullsFirst: false })
    .order("start_time", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  return { wedding: wedding as WeddingRow, events: (events ?? []) as EventRow[] };
}
