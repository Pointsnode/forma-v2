import { loadOverview } from "@/lib/admin/billing";
import { formatCents } from "@/lib/admin/money.mjs";
import { Panel, PanelHead, StatRow, Stat, DomainStar } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const o = await loadOverview();
  const maxCents = Math.max(1, ...o.cashSeries.map((s) => s.cents));
  return (
    <div className="flex flex-col gap-6">
      <h1 className="font-display text-[26px] text-ink">Overview</h1>
      <StatRow>
        <Stat value={formatCents(o.cashThisMonthCents)} label="Cash this month" />
        <Stat value={formatCents(o.refundsThisMonthCents)} label="Refunds this month" />
        <Stat value={formatCents(o.feesThisMonthCents)} label="Stripe fees this month" />
        <Stat value={formatCents(o.mrrCents)} label="MRR" />
        <Stat value={String(o.activeCount)} label="Active" />
        <Stat value={String(o.trialingCount)} label="Trialing" />
        <Stat value={String(o.pastDueCount)} label="Past due" />
      </StatRow>
      <Panel>
        <PanelHead star={<DomainStar domain="money" size={12} />} title="Cash collected" meta="trailing 12 months" />
        <div className="flex items-end gap-2 px-[18px] py-5" style={{ height: 168 }}>
          {o.cashSeries.map((s) => (
            <div key={s.month} className="flex flex-1 flex-col items-center justify-end gap-1.5">
              <span className="text-[9px] tabular-nums text-text-meta">{s.cents ? formatCents(s.cents) : ""}</span>
              <div className="w-full rounded-t bg-teal" style={{ height: `${Math.round((s.cents / maxCents) * 110)}px`, minHeight: s.cents ? 2 : 0 }} />
              <span className="text-[9px] text-text-meta">{s.month.slice(5)}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
