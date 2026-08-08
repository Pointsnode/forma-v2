"use client";

import { useState, useTransition } from "react";
import { formatCents } from "@/lib/admin/money.mjs";
import { settleRedemption, rejectRedemption } from "@/app/(admin)/admin/referrals/actions";
import type { RedemptionRow } from "@/lib/admin/referrals";

export function RedemptionQueue({ redemptions, isOwner }: { redemptions: RedemptionRow[]; isOwner: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const requested = redemptions.filter((r) => r.status === "requested");
  const history = redemptions.filter((r) => r.status !== "requested");
  const cols = "grid grid-cols-[110px_1fr_80px_110px_auto] items-center gap-3 px-[18px] py-2 text-[12.5px]";

  function settle(r: RedemptionRow) {
    let ref: string | undefined;
    if (r.kind === "cash") { const v = window.prompt("Bank transfer reference:"); if (!v || !v.trim()) return; ref = v.trim(); }
    else if (!window.confirm(`Push a ${formatCents(Math.abs(r.amount_cents))} Stripe bill credit to ${r.name}?`)) return;
    start(async () => { const res = await settleRedemption(r.id, ref); setMsg(res.ok ? "Settled." : `Could not settle (${res.error}).`); });
  }
  function reject(r: RedemptionRow) {
    const memo = window.prompt("Reason for rejecting (required):");
    if (!memo || !memo.trim()) return;
    start(async () => { const res = await rejectRedemption(r.id, memo); setMsg(res.ok ? "Rejected." : `Could not reject (${res.error}).`); });
  }

  return (
    <div className="rounded-[var(--radius)] border border-hairline-token bg-surface-card">
      <p className="border-b border-hairline-token px-[18px] py-3 font-display text-[16px] text-ink">Redemption queue</p>
      {msg ? <p className="px-[18px] pt-2 text-[12.5px] text-teal">{msg}</p> : null}
      {requested.length === 0 ? (
        <p className="px-[18px] py-6 text-center text-[13px] text-text-meta">No pending redemptions.</p>
      ) : requested.map((r) => (
        <div key={r.id} className={`${cols} border-b border-hairline-token`}>
          <span className="text-text-meta">{r.created_at.slice(0, 10)}</span>
          <span className="truncate text-text-primary">{r.name}</span>
          <span className="text-text-meta">{r.kind}</span>
          <span className="tabular-nums">{formatCents(Math.abs(r.amount_cents))}</span>
          <span className="flex justify-end gap-2">
            {isOwner ? (
              <>
                <button onClick={() => settle(r)} disabled={pending} className="text-[11px] text-teal hover:underline">approve</button>
                <button onClick={() => reject(r)} disabled={pending} className="text-[11px] text-[color:var(--color-text-danger)] hover:underline">reject</button>
              </>
            ) : <span className="text-[11px] text-text-meta">requested</span>}
          </span>
        </div>
      ))}
      {history.length ? (
        <>
          <p className="border-y border-hairline-token bg-bone px-[18px] py-1.5 text-[10px] uppercase tracking-[0.16em] text-text-meta">History</p>
          {history.map((r) => (
            <div key={r.id} className={`${cols} border-b border-hairline-token last:border-b-0`}>
              <span className="text-text-meta">{r.created_at.slice(0, 10)}</span>
              <span className="truncate text-text-primary">{r.name}</span>
              <span className="text-text-meta">{r.kind}</span>
              <span className="tabular-nums">{formatCents(Math.abs(r.amount_cents))}</span>
              <span className="text-right text-text-meta">{r.status}</span>
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}
