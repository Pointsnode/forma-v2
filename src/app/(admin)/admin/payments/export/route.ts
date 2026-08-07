import { adminGate } from "@/lib/admin/guard";
import { loadPayments, loadAccounts } from "@/lib/admin/billing";
import { toCsv } from "@/lib/admin/csv.mjs";
import { formatCents } from "@/lib/admin/money.mjs";

export const dynamic = "force-dynamic";

// Admin-gated CSV of the payment stream (optionally one month). A non-admin gets a 404.
export async function GET(req: Request) {
  const gate = await adminGate();
  if (gate.state !== "ok") return new Response("Not Found", { status: 404 });
  const month = new URL(req.url).searchParams.get("month") ?? undefined;
  const [rows, accounts] = await Promise.all([loadPayments({ month }), loadAccounts()]);
  const nameOf = new Map(accounts.map((a) => [a.workspace_id, a.name]));
  const csv = toCsv(
    ["Date", "Account", "Kind", "Amount", "Fee", "Status", "Stripe id"],
    rows.map((r) => [
      (r.at ?? "").slice(0, 10),
      r.workspaceId ? nameOf.get(r.workspaceId) ?? r.workspaceId : "",
      r.kind,
      formatCents(r.amountCents),
      r.feeCents != null ? formatCents(r.feeCents) : "",
      r.status,
      r.stripeId,
    ]),
  );
  const suffix = month ? `-${month}` : "";
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="forma-payments${suffix}.csv"` },
  });
}
