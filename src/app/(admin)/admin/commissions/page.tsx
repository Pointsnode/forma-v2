import { loadLedger, loadPartners, type LedgerEntry } from "@/lib/admin/commissions";
import { loadAccounts } from "@/lib/admin/billing";
import { loadPayoutByEntry } from "@/lib/admin/payouts";
import { adminGate } from "@/lib/admin/guard";
import { CommissionsBoard } from "@/components/admin/commissions-board";

export const dynamic = "force-dynamic";

export default async function CommissionsPage() {
  const [ledger, partners, accounts, payoutByEntry, gate] = await Promise.all([loadLedger(), loadPartners(), loadAccounts(), loadPayoutByEntry(), adminGate()]);
  const isOwner = gate.state === "ok" && gate.role === "owner";
  const partnerName = new Map(partners.map((p) => [p.id, p.display_name]));
  const accountName: Record<string, string> = {};
  for (const a of accounts) accountName[a.workspace_id] = a.name;

  type Grp = { partnerId: string; partnerName: string; accruedCents: number; paidCents: number; months: Map<string, LedgerEntry[]> };
  const map = new Map<string, Grp>();
  for (const e of ledger) {
    let g = map.get(e.partner_id);
    if (!g) { g = { partnerId: e.partner_id, partnerName: partnerName.get(e.partner_id) ?? e.partner_id.slice(0, 8), accruedCents: 0, paidCents: 0, months: new Map() }; map.set(e.partner_id, g); }
    if (e.status === "accrued") g.accruedCents += e.amount_cents;
    if (e.status === "paid") g.paidCents += e.amount_cents;
    const m = e.created_at.slice(0, 7);
    const arr = g.months.get(m) ?? [];
    arr.push(e);
    g.months.set(m, arr);
  }
  const groups = [...map.values()].sort((a, b) => a.partnerName.localeCompare(b.partnerName)).map((g) => ({
    partnerId: g.partnerId, partnerName: g.partnerName, accruedCents: g.accruedCents, paidCents: g.paidCents,
    months: [...g.months.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([month, entries]) => ({ month, entries })),
  }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-[26px] text-ink">Commissions</h1>
        {/* A download (route handler), not a page. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        {ledger.length ? <a href="/admin/commissions/export" className="rounded-[var(--radius)] border border-hairline-token px-3.5 py-1.5 text-[12px] text-text-primary hover:bg-surface-card">Export CSV</a> : null}
      </div>
      <CommissionsBoard
        groups={groups}
        partners={partners.map((p) => ({ id: p.id, display_name: p.display_name }))}
        accounts={accounts.map((a) => ({ workspace_id: a.workspace_id, name: a.name }))}
        accountName={accountName}
        payoutByEntry={payoutByEntry}
        isOwner={isOwner}
      />
    </div>
  );
}
