import "server-only";
import { createClient } from "@/lib/supabase/server";

// ADM-2 admin reads — RLS-scoped (owner AND partner pass is_platform_admin()). Account names
// come from the admin_accounts() map (loadAccounts), like the Payments screen.

export type Partner = { id: string; display_name: string; type: string; commission_rate_bps: number; activation_fee_cents: number; active: boolean; user_id: string | null };
export async function loadPartners(): Promise<Partner[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("partners").select("id, display_name, type, commission_rate_bps, activation_fee_cents, active, user_id").order("display_name");
  return (data ?? []) as Partner[];
}

export type Attribution = { workspace_id: string; partner_id: string | null; source: string; first_contact_at: string | null; notes: string | null };
export async function loadAttributions(): Promise<Attribution[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("partner_attributions").select("workspace_id, partner_id, source, first_contact_at, notes");
  return (data ?? []) as Attribution[];
}

export type LedgerEntry = {
  id: string; partner_id: string; workspace_id: string | null; kind: string; source_ref: string;
  base_amount_cents: number | null; rate_bps: number | null; amount_cents: number; status: string; memo: string | null; created_at: string;
};
export async function loadLedger(): Promise<LedgerEntry[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("commission_entries")
    .select("id, partner_id, workspace_id, kind, source_ref, base_amount_cents, rate_bps, amount_cents, status, memo, created_at")
    .order("created_at", { ascending: false });
  return (data ?? []) as LedgerEntry[];
}
