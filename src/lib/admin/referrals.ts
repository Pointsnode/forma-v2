import "server-only";
import { createClient } from "@/lib/supabase/server";
import { REFERRAL_CASH_THRESHOLD_CENTS } from "@/lib/referral";

// REF-2 admin reads — RLS-scoped (admin SELECT on the referral tables). Studio names come from
// the admin_workspace_names DEFINER (workspaces is not admin-readable via RLS).

export type TrackerRow = { referred_workspace_id: string; referrer_workspace_id: string; referred_name: string; referrer_name: string; created_at: string; paid_invoice_count: number; status: string; matured_at: string | null };
export type BalanceRow = { workspace_id: string; name: string; accruedCents: number; redeemedCents: number; balanceCents: number; cashEligible: boolean };
export type RedemptionRow = { id: string; workspace_id: string; name: string; kind: string; amount_cents: number; status: string; reference: string | null; created_at: string };

export async function loadReferralAdmin() {
  const supabase = await createClient();
  const [{ data: referrals }, { data: credits }, { data: redemptions }] = await Promise.all([
    supabase.from("referrals").select("referred_workspace_id, referrer_workspace_id, created_at, paid_invoice_count, status, matured_at").order("created_at", { ascending: false }),
    supabase.from("referral_credits").select("workspace_id, kind, amount_cents, status"),
    supabase.from("referral_redemptions").select("id, workspace_id, kind, amount_cents, status, reference, created_at").order("created_at", { ascending: false }),
  ]);

  const ids = new Set<string>();
  for (const r of (referrals ?? []) as Record<string, string>[]) { ids.add(r.referred_workspace_id); ids.add(r.referrer_workspace_id); }
  for (const c of (credits ?? []) as Record<string, string>[]) ids.add(c.workspace_id);
  for (const rd of (redemptions ?? []) as Record<string, string>[]) ids.add(rd.workspace_id);
  let names: Record<string, string> = {};
  if (ids.size) {
    const { data } = await supabase.rpc("admin_workspace_names", { p_ids: [...ids] });
    names = (data && typeof data === "object" ? data : {}) as Record<string, string>;
  }
  const nm = (id: string) => names[id] ?? id.slice(0, 8);

  const tracker: TrackerRow[] = (referrals ?? []).map((r) => {
    const x = r as { referred_workspace_id: string; referrer_workspace_id: string; created_at: string; paid_invoice_count: number; status: string; matured_at: string | null };
    return { ...x, referred_name: nm(x.referred_workspace_id), referrer_name: nm(x.referrer_workspace_id) };
  });

  const bal = new Map<string, BalanceRow>();
  for (const c of (credits ?? []) as { workspace_id: string; kind: string; amount_cents: number; status: string }[]) {
    let b = bal.get(c.workspace_id);
    if (!b) { b = { workspace_id: c.workspace_id, name: nm(c.workspace_id), accruedCents: 0, redeemedCents: 0, balanceCents: 0, cashEligible: false }; bal.set(c.workspace_id, b); }
    if (c.status !== "void") b.balanceCents += c.amount_cents;
    if (c.kind === "credit" && c.status !== "void") b.accruedCents += c.amount_cents;
    if ((c.kind === "redeem_bill" || c.kind === "redeem_cash") && c.status === "settled") b.redeemedCents += -c.amount_cents;
  }
  const balances = [...bal.values()].map((b) => ({ ...b, cashEligible: b.balanceCents >= REFERRAL_CASH_THRESHOLD_CENTS })).sort((a, b) => b.balanceCents - a.balanceCents);

  const redemptionRows: RedemptionRow[] = (redemptions ?? []).map((rd) => {
    const x = rd as { id: string; workspace_id: string; kind: string; amount_cents: number; status: string; reference: string | null; created_at: string };
    return { ...x, name: nm(x.workspace_id) };
  });

  return { tracker, balances, redemptions: redemptionRows };
}
