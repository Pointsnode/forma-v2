import { loadAccounts } from "@/lib/admin/billing";
import { formatCents } from "@/lib/admin/money.mjs";
import { Panel, PanelHead, PanelRow } from "@/components/ui";

export const dynamic = "force-dynamic";

function statusClass(status: string): string {
  return status === "active" ? "text-teal" : status === "past_due" ? "text-[color:var(--color-text-danger)]" : "text-text-meta";
}

export default async function AccountsPage() {
  const accounts = await loadAccounts();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-[26px] text-ink">Accounts</h1>
        {accounts.length ? (
          // A download (route handler), not a page — Link can't stream the file.
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a href="/admin/accounts/export" className="rounded-[var(--radius)] border border-hairline-token px-3.5 py-1.5 text-[12px] text-text-primary hover:bg-surface-card">Export CSV</a>
        ) : null}
      </div>
      {accounts.length === 0 ? (
        <Panel><p className="px-[18px] py-10 text-center text-[14px] text-text-meta">No billing accounts yet.</p></Panel>
      ) : (
        <Panel>
          <PanelHead title="Billing accounts" meta={`${accounts.length} total`} />
          <div className="grid grid-cols-[1.6fr_100px_110px_120px_1fr] gap-3 border-b border-hairline-token px-[18px] py-2 text-[10px] uppercase tracking-[0.14em] text-text-meta">
            <span>Account</span><span>Status</span><span>Monthly</span><span>Started</span><span>Lifetime cash</span>
          </div>
          {accounts.map((a) => (
            <PanelRow key={a.workspace_id} href={`/admin/accounts/${a.workspace_id}`} cols="1.6fr 100px 110px 120px 1fr">
              <span className="truncate text-text-primary">{a.name}</span>
              <span className={`text-[12px] ${statusClass(a.status)}`}>{a.status}</span>
              <span className="tabular-nums text-[13px]">{a.seats_snapshot?.total != null ? formatCents(Number(a.seats_snapshot.total) * 100) : "·"}</span>
              <span className="text-[12.5px] text-text-meta">{a.started_at?.slice(0, 10) ?? ""}</span>
              <span className="tabular-nums text-[13px]">{formatCents(a.lifetime_cash_cents)}</span>
            </PanelRow>
          ))}
        </Panel>
      )}
    </div>
  );
}
