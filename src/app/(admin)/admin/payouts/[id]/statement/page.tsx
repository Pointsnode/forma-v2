import { notFound } from "next/navigation";
import Link from "next/link";
import { loadPayoutDetail } from "@/lib/admin/payouts";
import { loadPartners } from "@/lib/admin/commissions";
import { loadAccounts } from "@/lib/admin/billing";
import { formatCents } from "@/lib/admin/money.mjs";
import { payoutTotalCents } from "@/lib/payout.mjs";
import { PrintButton } from "@/components/floor/print-button";
import { DomainStar } from "@/components/ui";

export const dynamic = "force-dynamic";

// The payout statement — the document Jorge sends with the transfer and the accountant files.
// Print-styled (the caterer-sheet pattern; the admin root is already bone), no PDF dependency.
// The AdminShell sidebar is print:hidden, so a browser print gives just this document.
export default async function StatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ payout, entries }, partners, accounts] = await Promise.all([loadPayoutDetail(id), loadPartners(), loadAccounts()]);
  if (!payout) notFound();
  const partnerName = new Map(partners.map((p) => [p.id, p.display_name]));
  const accountName = new Map(accounts.map((a) => [a.workspace_id, a.name]));
  const meta = [payout.paid_on, payout.method, payout.reference].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto max-w-[660px]">
      <div className="mb-3 flex items-center justify-between print:hidden">
        <Link href="/admin/payouts" className="text-[12.5px] text-text-meta hover:text-ink">← Payouts</Link>
        <PrintButton />
      </div>

      <div className="overflow-hidden rounded-[var(--radius)] border border-hairline-token">
        <div className="bg-ink px-6 py-7 text-center">
          <div className="flex justify-center"><DomainStar fill="#D7C3A5" size={15} /></div>
          <p className="mt-2.5 text-[10px] font-medium uppercase tracking-[0.24em] text-champagne">PAYOUT STATEMENT</p>
          <p className="mt-1.5 font-display text-[23px] text-bone">{partnerName.get(payout.partner_id) ?? payout.partner_id}{payout.period_label ? ` · ${payout.period_label}` : ""}</p>
          {meta ? <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-champagne">{meta}</p> : null}
        </div>

        <div className="px-6 py-4">
          <div className="grid grid-cols-[110px_1fr_96px_110px] gap-3 border-b border-hairline-token pb-1.5 text-[10px] uppercase tracking-[0.16em] text-text-meta">
            <span>Date</span><span>Account</span><span>Kind</span><span>Amount</span>
          </div>
          {entries.map((e) => (
            <div key={e.id} className="grid grid-cols-[110px_1fr_96px_110px] items-center gap-3 border-b border-hairline-token py-2 text-[13px] last:border-b-0">
              <span className="text-text-meta">{e.created_at.slice(0, 10)}</span>
              <span className="text-ink">{e.workspace_id ? accountName.get(e.workspace_id) ?? e.workspace_id.slice(0, 8) : "·"}</span>
              <span className="text-text-meta">{e.kind}</span>
              <span className={`tabular-nums ${e.amount_cents < 0 ? "text-wine" : "text-ink"}`}>{formatCents(e.amount_cents)}</span>
            </div>
          ))}
          <div className="mt-2 flex items-center justify-between pt-2 text-[15px]">
            <span className="font-medium text-ink">Total paid</span>
            <span className="font-display tabular-nums text-ink">{formatCents(payout.total_cents)}</span>
          </div>
          {/* Total always equals the item sums, by construction. */}
          {payoutTotalCents(entries) !== payout.total_cents ? <p className="mt-1 text-[11px] text-wine">Note: recorded total differs from the current entry sum.</p> : null}
        </div>
      </div>
    </div>
  );
}
