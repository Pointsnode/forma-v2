import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type LedgerLine = {
  id: string; title: string; amount: string | number; currency: string;
  status: string; kind: string; category: string | null; due_date: string | null; paid_at: string | null;
  engagement_id: string | null; quote_id: string | null; contract_id: string | null; event_id: string | null;
};
export type Rollup = { budget_total: string | number | null; paid: number; committed: number; open: number };
export type Trace = { kind: "vendor" | "contract" | "event" | "quote"; label: string };

// Trace maps let a line render its FKs as pills (engagement → vendor · contract →
// title · event → tag) without composite-FK embeds in PostgREST.
export async function loadLedger(supabase: SupabaseClient, weddingId: string): Promise<{
  lines: LedgerLine[]; rollup: Rollup; traceFor: (l: LedgerLine) => Trace[]; slices: { event_id: string; total: number }[];
}> {
  const [{ data: lineRows }, { data: rollupRow }, { data: sliceRows }, { data: engRows }, { data: conRows }, { data: evRows }] = await Promise.all([
    supabase.from("ledger_lines").select("id, title, amount, currency, status, kind, category, due_date, paid_at, engagement_id, quote_id, contract_id, event_id").eq("wedding_id", weddingId).order("due_date", { ascending: true, nullsFirst: false }).order("created_at", { ascending: true }),
    supabase.from("wedding_money_rollup").select("budget_total, paid, committed, open").eq("wedding_id", weddingId).maybeSingle(),
    supabase.from("event_money_slice").select("event_id, total").eq("wedding_id", weddingId),
    supabase.from("wedding_vendors").select("id, vendors(name)").eq("wedding_id", weddingId),
    supabase.from("contracts").select("id, title").eq("wedding_id", weddingId),
    supabase.from("wedding_events").select("id, label").eq("wedding_id", weddingId),
  ]);
  const vendorName = new Map((engRows ?? []).map((e) => [e.id, (e as unknown as { vendors: { name: string } | null }).vendors?.name ?? "—"]));
  const contractTitle = new Map((conRows ?? []).map((c: { id: string; title: string }) => [c.id, c.title]));
  const eventLabel = new Map((evRows ?? []).map((e: { id: string; label: string }) => [e.id, e.label]));

  const traceFor = (l: LedgerLine): Trace[] => {
    const t: Trace[] = [];
    if (l.engagement_id) t.push({ kind: "vendor", label: vendorName.get(l.engagement_id) ?? "—" });
    if (l.contract_id) t.push({ kind: "contract", label: contractTitle.get(l.contract_id) ?? "#" });
    if (l.quote_id) t.push({ kind: "quote", label: "quote" });
    if (l.event_id) t.push({ kind: "event", label: eventLabel.get(l.event_id) ?? "—" });
    return t;
  };

  return {
    lines: (lineRows ?? []) as LedgerLine[],
    rollup: (rollupRow as Rollup | null) ?? { budget_total: null, paid: 0, committed: 0, open: 0 },
    traceFor,
    slices: (sliceRows ?? []) as { event_id: string; total: number }[],
  };
}

export type RadarLine = { id: string; wedding_id: string; couple_display: string; title: string; amount: number; due_date: string; status: string; is_fee: boolean };

// Money radar — due within 60d across the workspace (view RLS scopes it). Urgent =
// due today or overdue, fee lines flagged. Both feed the cockpit right column.
export async function loadMoneyRadar(supabase: SupabaseClient): Promise<{ radar: RadarLine[]; urgent: RadarLine[] }> {
  const { data } = await supabase.from("money_radar").select("id, wedding_id, couple_display, title, amount, due_date, status, is_fee").order("due_date", { ascending: true });
  const radar = (data ?? []) as RadarLine[];
  const today = new Date().toISOString().slice(0, 10);
  const urgent = radar.filter((r) => r.due_date <= today || r.status === "due");
  return { radar, urgent };
}
