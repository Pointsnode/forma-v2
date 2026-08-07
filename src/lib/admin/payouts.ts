import "server-only";
import { createClient } from "@/lib/supabase/server";

// ADM-3 admin reads — RLS-scoped (owner + partner pass is_platform_admin()).

export type Payout = { id: string; partner_id: string; period_label: string | null; total_cents: number; method: string | null; reference: string | null; paid_on: string | null; created_at: string };
export async function loadPayouts(): Promise<Payout[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("payouts").select("id, partner_id, period_label, total_cents, method, reference, paid_on, created_at").order("created_at", { ascending: false });
  return (data ?? []) as Payout[];
}

export type AccruedEntry = { id: string; partner_id: string; workspace_id: string | null; kind: string; amount_cents: number; created_at: string };
export async function loadAccruedEntries(): Promise<AccruedEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("commission_entries").select("id, partner_id, workspace_id, kind, amount_cents, created_at").eq("status", "accrued").order("created_at", { ascending: true });
  return (data ?? []) as AccruedEntry[];
}

// commission_entry_id → payout_id, for the Commissions "paid → statement" link.
export async function loadPayoutByEntry(): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("payout_items").select("payout_id, commission_entry_id");
  const map: Record<string, string> = {};
  for (const r of (data ?? []) as { payout_id: string; commission_entry_id: string }[]) map[r.commission_entry_id] = r.payout_id;
  return map;
}

export type PayoutDetail = {
  payout: Payout | null;
  entries: { id: string; workspace_id: string | null; kind: string; base_amount_cents: number | null; rate_bps: number | null; amount_cents: number; created_at: string }[];
};
export async function loadPayoutDetail(id: string): Promise<PayoutDetail> {
  const supabase = await createClient();
  const { data: payout } = await supabase.from("payouts").select("id, partner_id, period_label, total_cents, method, reference, paid_on, created_at").eq("id", id).maybeSingle();
  const { data: items } = await supabase.from("payout_items").select("commission_entry_id").eq("payout_id", id);
  const ids = (items ?? []).map((i) => (i as { commission_entry_id: string }).commission_entry_id);
  let entries: PayoutDetail["entries"] = [];
  if (ids.length) {
    const { data: rows } = await supabase.from("commission_entries").select("id, workspace_id, kind, base_amount_cents, rate_bps, amount_cents, created_at").in("id", ids).order("created_at", { ascending: true });
    entries = (rows ?? []) as PayoutDetail["entries"];
  }
  return { payout: (payout as Payout) ?? null, entries };
}
