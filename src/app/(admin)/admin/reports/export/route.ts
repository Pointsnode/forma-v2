import { adminGate } from "@/lib/admin/guard";
import { loadReportData } from "@/lib/admin/reports";
import { loadPartners } from "@/lib/admin/commissions";
import { computeReport, periodBounds } from "@/lib/admin/report.mjs";
import { toCsv } from "@/lib/admin/csv.mjs";
import { formatCents } from "@/lib/admin/money.mjs";

export const dynamic = "force-dynamic";

// One combined, admin-gated CSV for the period — every block as labelled Section/Line/Amount
// rows (the accountant gets one file, not a shoebox). Non-admin → plain 404. Formula-guarded.
export async function GET(req: Request) {
  const gate = await adminGate();
  if (gate.state !== "ok") return new Response("Not Found", { status: 404 });
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") === "quarter" || url.searchParams.get("kind") === "year" ? url.searchParams.get("kind")! : "month";
  const value = url.searchParams.get("v") || new Date().toISOString().slice(0, 7);
  const [data, partners] = await Promise.all([loadReportData(), loadPartners()]);
  const partnerName = new Map(partners.map((p) => [p.id, p.display_name]));
  const r = computeReport(periodBounds(kind, value), data);

  const rows: string[][] = [
    ["Income", "Gross cash collected", formatCents(r.gross)],
    ["Income", "Refunds", formatCents(-r.refunds)],
    ["Income", "Stripe fees", formatCents(-r.fees)],
    ["Income", "Net revenue", formatCents(r.netRevenue)],
    ["Commissions", "Accrued", formatCents(-r.commissionsAccrued)],
    ["Payouts", "Recorded (cash out)", formatCents(r.payoutsRecorded)],
    ...Object.entries(r.expensesByCategory).sort((a, b) => a[0].localeCompare(b[0])).map(([c, v]) => ["Expenses", c, formatCents(-v)] as string[]),
    ["Expenses", "Total", formatCents(-r.expensesTotal)],
    ["Net", "Net (revenue minus commissions minus expenses)", formatCents(r.net)],
    ...Object.entries(r.perPartnerAnnual).sort((a, b) => b[1] - a[1]).map(([id, v]) => ["Per-partner YTD payouts", partnerName.get(id) ?? id, formatCents(v)] as string[]),
  ];
  const csv = toCsv(["Section", "Line", "Amount"], rows);
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="forma-report-${value}.csv"` },
  });
}
