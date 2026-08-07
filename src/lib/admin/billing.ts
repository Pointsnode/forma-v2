import "server-only";
import { createClient } from "@/lib/supabase/server";

// Admin billing reads. All RLS-scoped: the signed-in platform admin passes is_platform_admin(),
// so the billing_* SELECT policies open cross-workspace; names + subscription status come from
// the admin_accounts() DEFINER (workspaces/workspace_subscriptions are not admin-readable directly).

export type AdminAccount = {
  workspace_id: string; name: string; status: string;
  current_period_end: string | null; seats_snapshot: { total?: number } | null;
  started_at: string; lifetime_cash_cents: number;
};

export async function loadAccounts(): Promise<AdminAccount[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("admin_accounts");
  return (Array.isArray(data) ? data : []) as AdminAccount[];
}

export type PaymentRow = {
  kind: "payment" | "refund"; stripeId: string; workspaceId: string | null;
  amountCents: number; feeCents: number | null; status: string; at: string | null;
};

export async function loadPayments(opts: { month?: string; status?: string } = {}): Promise<PaymentRow[]> {
  const supabase = await createClient();
  const [{ data: pays }, { data: refs }] = await Promise.all([
    supabase.from("billing_payments").select("stripe_id, workspace_id, amount_cents, fee_cents, status, paid_at").order("paid_at", { ascending: false }),
    supabase.from("billing_refunds").select("stripe_refund_id, workspace_id, amount_cents, reason, refunded_at").order("refunded_at", { ascending: false }),
  ]);
  const rows: PaymentRow[] = [];
  for (const p of (pays ?? []) as Record<string, unknown>[])
    rows.push({ kind: "payment", stripeId: p.stripe_id as string, workspaceId: (p.workspace_id as string) ?? null, amountCents: (p.amount_cents as number) ?? 0, feeCents: (p.fee_cents as number) ?? null, status: (p.status as string) ?? "", at: (p.paid_at as string) ?? null });
  for (const r of (refs ?? []) as Record<string, unknown>[])
    rows.push({ kind: "refund", stripeId: r.stripe_refund_id as string, workspaceId: (r.workspace_id as string) ?? null, amountCents: -((r.amount_cents as number) ?? 0), feeCents: null, status: (r.reason as string) ?? "refund", at: (r.refunded_at as string) ?? null });
  let out = rows;
  if (opts.month) out = out.filter((r) => (r.at ?? "").slice(0, 7) === opts.month);
  if (opts.status) out = out.filter((r) => r.status === opts.status);
  return out.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
}

export type Overview = {
  cashThisMonthCents: number; refundsThisMonthCents: number; feesThisMonthCents: number; mrrCents: number;
  activeCount: number; trialingCount: number; pastDueCount: number;
  cashSeries: { month: string; cents: number }[];
};

function last12Months(): string[] {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const out: string[] = [];
  for (let i = 11; i >= 0; i--) out.push(new Date(Date.UTC(y, m - i, 1)).toISOString().slice(0, 7));
  return out;
}

export async function loadOverview(): Promise<Overview> {
  const supabase = await createClient();
  const month = new Date().toISOString().slice(0, 7);
  const [{ data: pays }, { data: refs }, accounts] = await Promise.all([
    supabase.from("billing_payments").select("amount_cents, fee_cents, status, paid_at"),
    supabase.from("billing_refunds").select("amount_cents, refunded_at"),
    loadAccounts(),
  ]);
  let cash = 0, fees = 0, refunds = 0;
  const series = new Map<string, number>();
  for (const p of (pays ?? []) as Record<string, unknown>[]) {
    if (p.status !== "succeeded" || !p.paid_at) continue;
    const m = String(p.paid_at).slice(0, 7);
    series.set(m, (series.get(m) ?? 0) + ((p.amount_cents as number) ?? 0));
    if (m === month) { cash += (p.amount_cents as number) ?? 0; fees += (p.fee_cents as number) ?? 0; }
  }
  for (const r of (refs ?? []) as Record<string, unknown>[])
    if (String(r.refunded_at ?? "").slice(0, 7) === month) refunds += (r.amount_cents as number) ?? 0;
  const active = accounts.filter((a) => a.status === "active");
  return {
    cashThisMonthCents: cash, refundsThisMonthCents: refunds, feesThisMonthCents: fees,
    mrrCents: active.reduce((s, a) => s + (Number(a.seats_snapshot?.total) || 0) * 100, 0),
    activeCount: active.length,
    trialingCount: accounts.filter((a) => a.status === "trialing").length,
    pastDueCount: accounts.filter((a) => a.status === "past_due").length,
    cashSeries: last12Months().map((m) => ({ month: m, cents: series.get(m) ?? 0 })),
  };
}

export async function loadAccountDetail(workspaceId: string) {
  const supabase = await createClient();
  const [{ data: invoices }, { data: payments }, { data: refunds }] = await Promise.all([
    supabase.from("billing_invoices").select("stripe_invoice_id, status, currency, total_cents, amount_paid_cents, paid_at, hosted_invoice_url, period_start, period_end").eq("workspace_id", workspaceId).order("period_end", { ascending: false, nullsFirst: false }),
    supabase.from("billing_payments").select("stripe_id, amount_cents, fee_cents, net_cents, status, disputed, paid_at").eq("workspace_id", workspaceId).order("paid_at", { ascending: false }),
    supabase.from("billing_refunds").select("stripe_refund_id, amount_cents, reason, refunded_at").eq("workspace_id", workspaceId).order("refunded_at", { ascending: false }),
  ]);
  return {
    invoices: (invoices ?? []) as Record<string, unknown>[],
    payments: (payments ?? []) as Record<string, unknown>[],
    refunds: (refunds ?? []) as Record<string, unknown>[],
  };
}

// Stripe dashboard deep link for a payment/charge id (the console for money actions in v1).
export function stripeObjectUrl(stripeId: string): string {
  const seg = stripeId.startsWith("ch_") ? "charges" : stripeId.startsWith("re_") ? "refunds" : "payments";
  return `https://dashboard.stripe.com/${seg}/${stripeId}`;
}
