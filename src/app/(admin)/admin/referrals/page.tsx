import Link from "next/link";
import { loadReferralAdmin } from "@/lib/admin/referrals";
import { adminGate } from "@/lib/admin/guard";
import { formatCents } from "@/lib/admin/money.mjs";
import { RedemptionQueue } from "@/components/admin/redemption-queue";
import { cx } from "@/components/ui";

export const dynamic = "force-dynamic";
const STATUSES = ["pending", "matured", "void"];

export default async function ReferralsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const sp = await searchParams;
  const [{ tracker, balances, redemptions }, gate] = await Promise.all([loadReferralAdmin(), adminGate()]);
  const isOwner = gate.state === "ok" && gate.role === "owner";
  const rows = sp.status && STATUSES.includes(sp.status) ? tracker.filter((t) => t.status === sp.status) : tracker;
  const chip = (active: boolean) => cx("rounded-[var(--radius)] px-2.5 py-1 text-[12px]", active ? "bg-surface-card text-teal" : "text-text-meta hover:text-ink");

  return (
    <div className="flex flex-col gap-5">
      <h1 className="font-display text-[26px] text-ink">Referrals</h1>

      <div className="rounded-[var(--radius)] border border-hairline-token bg-surface-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline-token px-[18px] py-3">
          <span className="font-display text-[16px] text-ink">Tracker</span>
          <div className="flex gap-1.5">
            <Link href="/admin/referrals" className={chip(!sp.status)}>all</Link>
            {STATUSES.map((s) => <Link key={s} href={`/admin/referrals?status=${s}`} className={chip(sp.status === s)}>{s}</Link>)}
          </div>
        </div>
        <div className="grid grid-cols-[1.3fr_1.3fr_100px_80px_90px_100px] gap-3 border-b border-hairline-token px-[18px] py-2 text-[10px] uppercase tracking-[0.14em] text-text-meta">
          <span>Referred</span><span>Referrer</span><span>Signed up</span><span>Progress</span><span>Status</span><span>Matured</span>
        </div>
        {rows.length === 0 ? <p className="px-[18px] py-8 text-center text-[13px] text-text-meta">No referrals.</p> : rows.map((t) => (
          <div key={t.referred_workspace_id} className="grid grid-cols-[1.3fr_1.3fr_100px_80px_90px_100px] items-center gap-3 border-b border-hairline-token px-[18px] py-2 text-[12.5px] last:border-b-0">
            <span className="truncate text-text-primary">{t.referred_name}</span>
            <span className="truncate text-text-meta">{t.referrer_name}</span>
            <span className="text-text-meta">{t.created_at.slice(0, 10)}</span>
            <span className="tabular-nums">{t.paid_invoice_count} / 3</span>
            <span className={t.status === "matured" ? "text-teal" : t.status === "void" ? "text-text-meta" : "text-text-primary"}>{t.status}</span>
            <span className="text-text-meta">{t.matured_at ? t.matured_at.slice(0, 10) : "·"}</span>
          </div>
        ))}
      </div>

      <div className="rounded-[var(--radius)] border border-hairline-token bg-surface-card">
        <p className="border-b border-hairline-token px-[18px] py-3 font-display text-[16px] text-ink">Balances</p>
        <div className="grid grid-cols-[1.5fr_110px_110px_120px_auto] gap-3 border-b border-hairline-token px-[18px] py-2 text-[10px] uppercase tracking-[0.14em] text-text-meta">
          <span>Referrer</span><span>Accrued</span><span>Redeemed</span><span>Balance</span><span>Cash</span>
        </div>
        {balances.length === 0 ? <p className="px-[18px] py-8 text-center text-[13px] text-text-meta">No credits yet.</p> : balances.map((b) => (
          <div key={b.workspace_id} className="grid grid-cols-[1.5fr_110px_110px_120px_auto] items-center gap-3 border-b border-hairline-token px-[18px] py-2 text-[12.5px] last:border-b-0">
            <span className="truncate text-text-primary">{b.name}</span>
            <span className="tabular-nums text-text-meta">{formatCents(b.accruedCents)}</span>
            <span className="tabular-nums text-text-meta">{formatCents(b.redeemedCents)}</span>
            <span className="tabular-nums text-ink">{formatCents(b.balanceCents)}</span>
            <span className={cx("text-[11px]", b.cashEligible ? "text-teal" : "text-text-meta")}>{b.cashEligible ? "cash-eligible" : "·"}</span>
          </div>
        ))}
      </div>

      <RedemptionQueue redemptions={redemptions} isOwner={isOwner} />
    </div>
  );
}
