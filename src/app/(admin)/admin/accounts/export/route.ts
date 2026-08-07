import { adminGate } from "@/lib/admin/guard";
import { loadAccounts } from "@/lib/admin/billing";
import { toCsv } from "@/lib/admin/csv.mjs";
import { formatCents } from "@/lib/admin/money.mjs";

export const dynamic = "force-dynamic";

// Admin-gated CSV. A non-admin gets a plain 404 (same as the /admin door), never data.
export async function GET() {
  const gate = await adminGate();
  if (gate.state !== "ok") return new Response("Not Found", { status: 404 });
  const accounts = await loadAccounts();
  const csv = toCsv(
    ["Account", "Status", "Monthly", "Started", "Lifetime cash"],
    accounts.map((a) => [
      a.name,
      a.status,
      a.seats_snapshot?.total != null ? formatCents(Number(a.seats_snapshot.total) * 100) : "",
      a.started_at?.slice(0, 10) ?? "",
      formatCents(a.lifetime_cash_cents),
    ]),
  );
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="forma-accounts.csv"' },
  });
}
