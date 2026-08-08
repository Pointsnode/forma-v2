import "server-only";
import { createClient } from "@/lib/supabase/server";

export type ExpenseRow = { id: string; paid_on: string; vendor: string | null; category: string; amount_cents: number; currency: string; memo: string | null; voided: boolean; void_memo: string | null; created_at: string };

// All the raw rows the report re-aggregates (RLS: the admin reads billing_* + ledger + payouts
// + expenses cross-workspace via is_platform_admin()). Nothing is pre-summed here.
export async function loadReportData() {
  const supabase = await createClient();
  const [{ data: payments }, { data: refunds }, { data: commissions }, { data: payouts }, { data: expenses }, { data: referralCredits }, { data: referralRedemptions }] = await Promise.all([
    supabase.from("billing_payments").select("amount_cents, fee_cents, status, paid_at"),
    supabase.from("billing_refunds").select("amount_cents, refunded_at"),
    supabase.from("commission_entries").select("partner_id, amount_cents, status, created_at"),
    supabase.from("payouts").select("partner_id, total_cents, paid_on"),
    supabase.from("expense_entries").select("id, paid_on, vendor, category, amount_cents, currency, memo, voided, void_memo, created_at").order("paid_on", { ascending: false }),
    supabase.from("referral_credits").select("kind, amount_cents, status, created_at"),
    supabase.from("referral_redemptions").select("kind, amount_cents, status, settled_at"),
  ]);
  return {
    payments: (payments ?? []) as Record<string, unknown>[],
    refunds: (refunds ?? []) as Record<string, unknown>[],
    commissions: (commissions ?? []) as Record<string, unknown>[],
    payouts: (payouts ?? []) as Record<string, unknown>[],
    expenses: (expenses ?? []) as ExpenseRow[],
    referralCredits: (referralCredits ?? []) as Record<string, unknown>[],
    referralRedemptions: (referralRedemptions ?? []) as Record<string, unknown>[],
  };
}
