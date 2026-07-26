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
