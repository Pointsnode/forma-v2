import Link from "next/link";
import { loadPayments, loadAccounts, stripeObjectUrl } from "@/lib/admin/billing";
import { formatCents } from "@/lib/admin/money.mjs";
import { Panel, PanelHead, PanelRow, cx } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PaymentsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  const [all, accounts] = await Promise.all([loadPayments(), loadAccounts()]);
  const nameOf = new Map(accounts.map((a) => [a.workspace_id, a.name]));
  const months = [...new Set(all.map((r) => (r.at ?? "").slice(0, 7)).filter(Boolean))].sort().reverse();
  const rows = month ? all.filter((r) => (r.at ?? "").slice(0, 7) === month) : all;
  const exportHref = month ? `/admin/payments/export?month=${month}` : "/admin/payments/export";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-[26px] text-ink">Payments</h1>
        {/* A download (route handler), not a page — a plain anchor (Link can't stream the file). */}
        {rows.length ? <a href={exportHref} className="rounded-[var(--radius)] border border-hairline-token px-3.5 py-1.5 text-[12px] text-text-primary hover:bg-surface-card">Export CSV</a> : null}
      </div>
      {months.length ? (
        <div className="flex flex-wrap gap-2 text-[12px]">
          <Link href="/admin/payments" className={cx("rounded-[var(--radius)] px-2.5 py-1", !month ? "bg-surface-card text-teal" : "text-text-meta hover:text-ink")}>All</Link>
          {months.map((m) => (
            <Link key={m} href={`/admin/payments?month=${m}`} className={cx("rounded-[var(--radius)] px-2.5 py-1 tabular-nums", month === m ? "bg-surface-card text-teal" : "text-text-meta hover:text-ink")}>{m}</Link>
          ))}
        </div>
      ) : null}
      {rows.length === 0 ? (
        <Panel><p className="px-[18px] py-10 text-center text-[14px] text-text-meta">No payments yet.</p></Panel>
      ) : (
        <Panel>
          <PanelHead title={month ? `Payments · ${month}` : "All payments and refunds"} meta={`${rows.length}`} />
          <div className="grid grid-cols-[110px_1fr_90px_110px_100px_auto] gap-3 border-b border-hairline-token px-[18px] py-2 text-[10px] uppercase tracking-[0.14em] text-text-meta">
            <span>Date</span><span>Account</span><span>Kind</span><span>Amount</span><span>Fee</span><span>Stripe</span>
          </div>
          {rows.map((r) => (
            <PanelRow key={`${r.kind}-${r.stripeId}`} cols="110px 1fr 90px 110px 100px auto">
              <span className="text-[12.5px] text-text-meta">{(r.at ?? "").slice(0, 10)}</span>
              <span className="truncate text-[13px] text-text-primary">{r.workspaceId ? nameOf.get(r.workspaceId) ?? r.workspaceId.slice(0, 8) : "·"}</span>
              <span className={cx("text-[12px]", r.kind === "refund" ? "text-[color:var(--color-text-danger)]" : "text-text-meta")}>{r.kind}</span>
              <span className="tabular-nums text-[13px]">{formatCents(r.amountCents)}</span>
              <span className="tabular-nums text-[12.5px] text-text-meta">{r.feeCents != null ? formatCents(r.feeCents) : "·"}</span>
              <a href={stripeObjectUrl(r.stripeId)} target="_blank" rel="noreferrer" className="text-[12px] text-teal">↗</a>
            </PanelRow>
          ))}
        </Panel>
      )}
    </div>
  );
}
