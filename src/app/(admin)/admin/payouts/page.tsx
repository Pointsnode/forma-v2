import Link from "next/link";
import { loadPayouts, loadAccruedEntries } from "@/lib/admin/payouts";
import { loadPartners } from "@/lib/admin/commissions";
import { loadAccounts } from "@/lib/admin/billing";
import { adminGate } from "@/lib/admin/guard";
import { formatCents } from "@/lib/admin/money.mjs";
import { PayoutRecorder } from "@/components/admin/payout-recorder";
import { Panel, PanelHead, PanelRow } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function PayoutsPage() {
  const [payouts, accrued, partners, accounts, gate] = await Promise.all([loadPayouts(), loadAccruedEntries(), loadPartners(), loadAccounts(), adminGate()]);
  const isOwner = gate.state === "ok" && gate.role === "owner";
  const partnerName = new Map(partners.map((p) => [p.id, p.display_name]));
  const accountName: Record<string, string> = {};
  for (const a of accounts) accountName[a.workspace_id] = a.name;

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-[26px] text-ink">Payouts</h1>

      {isOwner ? (
        <PayoutRecorder partners={partners.map((p) => ({ id: p.id, display_name: p.display_name }))} accrued={accrued} accountName={accountName} />
      ) : null}

      <Panel>
        <PanelHead title="History" meta={`${payouts.length}`} />
        {payouts.length === 0 ? (
          <p className="px-[18px] py-8 text-center text-[14px] text-text-meta">No payouts recorded yet.</p>
        ) : (
          <>
            <div className="grid grid-cols-[1.2fr_120px_110px_120px_1fr_auto] gap-3 border-b border-hairline-token px-[18px] py-2 text-[10px] uppercase tracking-[0.14em] text-text-meta">
              <span>Partner</span><span>Period</span><span>Total</span><span>Paid on</span><span>Reference</span><span>Statement</span>
            </div>
            {payouts.map((po) => (
              <PanelRow key={po.id} cols="1.2fr 120px 110px 120px 1fr auto">
                <span className="truncate text-text-primary">{partnerName.get(po.partner_id) ?? po.partner_id.slice(0, 8)}</span>
                <span className="text-[12.5px] text-text-meta">{po.period_label ?? "·"}</span>
                <span className="tabular-nums text-[13px]">{formatCents(po.total_cents)}</span>
                <span className="text-[12.5px] text-text-meta">{po.paid_on ?? "·"}</span>
                <span className="truncate text-[12.5px] text-text-meta">{[po.method, po.reference].filter(Boolean).join(" · ") || "·"}</span>
                <Link href={`/admin/payouts/${po.id}/statement`} className="text-[12px] text-teal">statement ↗</Link>
              </PanelRow>
            ))}
          </>
        )}
      </Panel>
    </div>
  );
}
