import { adminGate } from "@/lib/admin/guard";
import { loadLedger, loadPartners } from "@/lib/admin/commissions";
import { loadAccounts } from "@/lib/admin/billing";
import { toCsv } from "@/lib/admin/csv.mjs";
import { formatCents } from "@/lib/admin/money.mjs";

export const dynamic = "force-dynamic";

// Admin-gated CSV of the whole ledger. A non-admin gets a plain 404.
export async function GET() {
  const gate = await adminGate();
  if (gate.state !== "ok") return new Response("Not Found", { status: 404 });
  const [ledger, partners, accounts] = await Promise.all([loadLedger(), loadPartners(), loadAccounts()]);
  const partnerName = new Map(partners.map((p) => [p.id, p.display_name]));
  const accountName = new Map(accounts.map((a) => [a.workspace_id, a.name]));
  const csv = toCsv(
    ["Date", "Partner", "Account", "Kind", "Base", "Rate", "Amount", "Status", "Memo"],
    ledger.map((e) => [
      e.created_at.slice(0, 10),
      partnerName.get(e.partner_id) ?? e.partner_id,
      e.workspace_id ? accountName.get(e.workspace_id) ?? e.workspace_id : "",
      e.kind,
      e.base_amount_cents != null ? formatCents(e.base_amount_cents) : "",
      e.rate_bps != null ? `${e.rate_bps / 100}%` : "",
      formatCents(e.amount_cents),
      e.status,
      e.memo ?? "",
    ]),
  );
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="forma-commissions.csv"' },
  });
}
