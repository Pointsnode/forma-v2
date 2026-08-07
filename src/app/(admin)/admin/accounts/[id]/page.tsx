import { notFound } from "next/navigation";
import Link from "next/link";
import { loadAccounts, loadAccountDetail, stripeObjectUrl } from "@/lib/admin/billing";
import { formatCents } from "@/lib/admin/money.mjs";
import { Panel, PanelHead } from "@/components/ui";

export const dynamic = "force-dynamic";

const cell = "px-[18px] py-2.5 text-[13px] border-b border-hairline-token last:border-b-0";

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const accounts = await loadAccounts();
  const account = accounts.find((a) => a.workspace_id === id);
  if (!account) notFound();
  const { invoices, payments, refunds } = await loadAccountDetail(id);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/admin/accounts" className="text-[12.5px] text-text-meta hover:text-ink">← Accounts</Link>
        <h1 className="mt-1 font-display text-[26px] text-ink">{account.name}</h1>
        <p className="mt-0.5 text-[12.5px] text-text-meta">{account.status} · lifetime cash {formatCents(account.lifetime_cash_cents)}</p>
      </div>

      <Panel>
        <PanelHead title="Invoices" meta={`${invoices.length}`} />
        {invoices.length === 0 ? <p className="px-[18px] py-6 text-center text-[13px] text-text-meta">No invoices.</p> : invoices.map((iv) => (
          <div key={iv.stripe_invoice_id as string} className={`grid grid-cols-[1fr_90px_110px_110px_auto] items-center gap-3 ${cell}`}>
            <span className="text-text-meta">{(iv.period_start as string)?.slice(0, 10)} – {(iv.period_end as string)?.slice(0, 10)}</span>
            <span>{iv.status as string}</span>
            <span className="tabular-nums">{formatCents(iv.total_cents as number, (iv.currency as string) ?? "USD")}</span>
            <span className="tabular-nums text-text-meta">paid {formatCents(iv.amount_paid_cents as number, (iv.currency as string) ?? "USD")}</span>
            {iv.hosted_invoice_url ? <a href={iv.hosted_invoice_url as string} target="_blank" rel="noreferrer" className="text-[12px] text-teal">view</a> : <span />}
          </div>
        ))}
      </Panel>

      <Panel>
        <PanelHead title="Payments" meta={`${payments.length}`} />
        {payments.length === 0 ? <p className="px-[18px] py-6 text-center text-[13px] text-text-meta">No payments.</p> : payments.map((p) => (
          <div key={p.stripe_id as string} className={`grid grid-cols-[110px_1fr_100px_100px_auto] items-center gap-3 ${cell}`}>
            <span className="text-text-meta">{(p.paid_at as string)?.slice(0, 10)}</span>
            <span className="tabular-nums">{formatCents(p.amount_cents as number)}{p.disputed ? <span className="ml-2 text-[color:var(--color-text-danger)]">disputed</span> : null}</span>
            <span className="tabular-nums text-text-meta">fee {p.fee_cents != null ? formatCents(p.fee_cents as number) : "·"}</span>
            <span>{p.status as string}</span>
            <a href={stripeObjectUrl(p.stripe_id as string)} target="_blank" rel="noreferrer" className="text-[12px] text-teal">Stripe ↗</a>
          </div>
        ))}
      </Panel>

      <Panel>
        <PanelHead title="Refunds" meta={`${refunds.length}`} />
        {refunds.length === 0 ? <p className="px-[18px] py-6 text-center text-[13px] text-text-meta">No refunds.</p> : refunds.map((r) => (
          <div key={r.stripe_refund_id as string} className={`grid grid-cols-[110px_1fr_1fr] items-center gap-3 ${cell}`}>
            <span className="text-text-meta">{(r.refunded_at as string)?.slice(0, 10)}</span>
            <span className="tabular-nums">{formatCents(r.amount_cents as number)}</span>
            <span className="text-text-meta">{(r.reason as string) ?? ""}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}
