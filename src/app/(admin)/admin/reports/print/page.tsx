import Link from "next/link";
import { loadReportData } from "@/lib/admin/reports";
import { loadPartners } from "@/lib/admin/commissions";
import { computeReport, periodBounds } from "@/lib/admin/report.mjs";
import { ReportBlocks } from "@/components/admin/report-blocks";
import { PrintButton } from "@/components/floor/print-button";
import { DomainStar } from "@/components/ui";

export const dynamic = "force-dynamic";

// The accountant's report, print-styled (the admin root is already bone; the shell sidebar is
// print:hidden). No PDF dependency — browser print-to-PDF.
export default async function ReportPrintPage({ searchParams }: { searchParams: Promise<{ kind?: string; v?: string }> }) {
  const sp = await searchParams;
  const kind = sp.kind === "quarter" || sp.kind === "year" ? sp.kind : "month";
  const value = sp.v || new Date().toISOString().slice(0, 7);
  const [data, partners] = await Promise.all([loadReportData(), loadPartners()]);
  const partnerName: Record<string, string> = {};
  for (const p of partners) partnerName[p.id] = p.display_name;
  const report = computeReport(periodBounds(kind, value), data);

  return (
    <div className="mx-auto max-w-[660px]">
      <div className="mb-3 flex items-center justify-between print:hidden">
        <Link href="/admin/reports" className="text-[12.5px] text-text-meta hover:text-ink">← Reports</Link>
        <PrintButton />
      </div>
      <div className="overflow-hidden rounded-[var(--radius)] border border-hairline-token">
        <div className="bg-ink px-6 py-7 text-center">
          <div className="flex justify-center"><DomainStar fill="#D7C3A5" size={15} /></div>
          <p className="mt-2.5 text-[10px] font-medium uppercase tracking-[0.24em] text-champagne">FINANCIAL REPORT</p>
          <p className="mt-1.5 font-display text-[23px] text-bone">{value}</p>
        </div>
        <div className="px-6 py-5"><ReportBlocks report={report} partnerName={partnerName} /></div>
      </div>
    </div>
  );
}
