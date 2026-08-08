import { formatCents } from "@/lib/admin/money.mjs";

type Report = {
  gross: number; refunds: number; fees: number; netRevenue: number; commissionsAccrued: number;
  payoutsRecorded: number; expensesByCategory: Record<string, number>; expensesTotal: number; net: number;
  perPartnerAnnual: Record<string, number>;
  referralCreditsAccrued: number; referralRedemptionsBill: number; referralRedemptionsCash: number;
};

function Line({ label, cents, strong, muted }: { label: string; cents: number; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-hairline-token py-2 text-[13.5px] last:border-b-0">
      <span className={strong ? "font-medium text-ink" : muted ? "text-text-meta" : "text-text-primary"}>{label}</span>
      <span className={`tabular-nums ${cents < 0 ? "text-wine" : strong ? "font-medium text-ink" : "text-ink"}`}>{formatCents(cents)}</span>
    </div>
  );
}
function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius)] border border-hairline-token bg-surface-card px-[18px] py-2">
      <p className="pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-text-meta">{title}</p>
      {children}
    </div>
  );
}

// Presentational, reused by the Reports screen and the print route. Every figure is computed
// (report.mjs); zeros render as $0.00, never blanks.
export function ReportBlocks({ report, partnerName }: { report: Report; partnerName: Record<string, string> }) {
  const cats = Object.entries(report.expensesByCategory).sort((a, b) => a[0].localeCompare(b[0]));
  const partners = Object.entries(report.perPartnerAnnual).sort((a, b) => b[1] - a[1]);
  return (
    <div className="flex flex-col gap-4">
      <Block title="Income">
        <Line label="Gross cash collected" cents={report.gross} />
        <Line label="Refunds" cents={-report.refunds} />
        <Line label="Stripe fees" cents={-report.fees} />
        <Line label="Net revenue" cents={report.netRevenue} strong />
      </Block>
      <Block title="Commissions and payouts">
        <Line label="Commissions accrued" cents={-report.commissionsAccrued} />
        <Line label="Payouts recorded (cash out)" cents={report.payoutsRecorded} muted />
      </Block>
      <Block title="Expenses">
        {cats.length ? cats.map(([c, v]) => <Line key={c} label={c} cents={-v} />) : <p className="py-2 text-[13px] text-text-meta">No expenses this period.</p>}
        <Line label="Expenses total" cents={-report.expensesTotal} strong />
      </Block>
      <Block title="Referral program">
        <Line label="Credits accrued" cents={report.referralCreditsAccrued} />
        <Line label="Redeemed to bill" cents={-report.referralRedemptionsBill} muted />
        <Line label="Redeemed as cash" cents={-report.referralRedemptionsCash} muted />
      </Block>
      <Block title="Net">
        <Line label="Net (net revenue minus commissions minus expenses)" cents={report.net} strong />
      </Block>
      {partners.length ? (
        <Block title="Per-partner payouts, year to date">
          {partners.map(([id, v]) => <Line key={id} label={partnerName[id] ?? id.slice(0, 8)} cents={v} />)}
        </Block>
      ) : null}
    </div>
  );
}
