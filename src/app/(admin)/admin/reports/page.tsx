import Link from "next/link";
import { loadReportData } from "@/lib/admin/reports";
import { loadPartners } from "@/lib/admin/commissions";
import { adminGate } from "@/lib/admin/guard";
import { computeReport, periodBounds } from "@/lib/admin/report.mjs";
import { PeriodPicker } from "@/components/admin/period-picker";
import { ReportBlocks } from "@/components/admin/report-blocks";
import { ExpensesManager } from "@/components/admin/expenses-manager";

export const dynamic = "force-dynamic";

function defaults(kind: string): string {
  const now = new Date();
  if (kind === "year") return String(now.getUTCFullYear());
  if (kind === "quarter") return `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
  return now.toISOString().slice(0, 7);
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ kind?: string; v?: string }> }) {
  const sp = await searchParams;
  const kind = sp.kind === "quarter" || sp.kind === "year" ? sp.kind : "month";
  const value = sp.v || defaults(kind);
  const [data, partners, gate] = await Promise.all([loadReportData(), loadPartners(), adminGate()]);
  const isOwner = gate.state === "ok" && gate.role === "owner";
  const partnerName: Record<string, string> = {};
  for (const p of partners) partnerName[p.id] = p.display_name;
  const report = computeReport(periodBounds(kind, value), data);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-[26px] text-ink">Reports</h1>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodPicker kind={kind} value={value} />
          {/* download (route handler) — dynamic href, not flagged */}
          <a href={`/admin/reports/export?kind=${kind}&v=${value}`} className="rounded-[var(--radius)] border border-hairline-token px-3 py-1.5 text-[12px] text-text-primary hover:bg-surface-card">CSV</a>
          <Link href={{ pathname: "/admin/reports/print", query: { kind, v: value } }} target="_blank" className="rounded-[var(--radius)] border border-hairline-token px-3 py-1.5 text-[12px] text-text-primary hover:bg-surface-card">Print</Link>
        </div>
      </div>
      <ReportBlocks report={report} partnerName={partnerName} />
      <ExpensesManager expenses={data.expenses} isOwner={isOwner} />
    </div>
  );
}
