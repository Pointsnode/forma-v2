"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { formatCents } from "@/lib/admin/money.mjs";
import { voidCommission, addAdjustment } from "@/app/(admin)/admin/commissions/actions";

type Entry = { id: string; workspace_id: string | null; kind: string; base_amount_cents: number | null; rate_bps: number | null; amount_cents: number; status: string; memo: string | null; created_at: string };
type Group = { partnerId: string; partnerName: string; accruedCents: number; paidCents: number; months: { month: string; entries: Entry[] }[] };
type Partner = { id: string; display_name: string };
type Account = { workspace_id: string; name: string };

const KIND: Record<string, string> = { commission: "commission", activation_fee: "activation", clawback: "clawback", adjustment: "adjustment" };

export function CommissionsBoard({ groups, partners, accounts, accountName, payoutByEntry, isOwner }: {
  groups: Group[]; partners: Partner[]; accounts: Account[]; accountName: Record<string, string>; payoutByEntry: Record<string, string>; isOwner: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [adj, setAdj] = useState({ partner_id: partners[0]?.id ?? "", workspace_id: "", amount: "", memo: "" });

  function doVoid(id: string) {
    const memo = window.prompt("Reason for voiding this entry (required):");
    if (!memo || !memo.trim()) return;
    start(async () => {
      const r = await voidCommission({ id, memo });
      setMsg(r.ok ? "Voided." : `Could not void (${r.error}).`);
    });
  }
  function submitAdj(e: React.FormEvent) {
    e.preventDefault();
    if (!adj.partner_id || !adj.amount.trim() || !adj.memo.trim()) { setMsg("Partner, amount and memo are required."); return; }
    start(async () => {
      const r = await addAdjustment({ partner_id: adj.partner_id, workspace_id: adj.workspace_id || null, amount_cents: Math.round(Number(adj.amount) * 100), memo: adj.memo });
      setMsg(r.ok ? "Adjustment added." : `Could not add (${r.error}).`);
      if (r.ok) setAdj({ partner_id: partners[0]?.id ?? "", workspace_id: "", amount: "", memo: "" });
    });
  }

  const input = "rounded-[var(--radius)] border border-hairline-token bg-surface-card px-2.5 py-1.5 text-[13px] text-ink outline-none";

  return (
    <div className="flex flex-col gap-6">
      {msg ? <p className="text-[12.5px] text-teal">{msg}</p> : null}
      {groups.length === 0 ? (
        <div className="rounded-[var(--radius)] border border-hairline-token bg-surface-card"><p className="px-[18px] py-10 text-center text-[14px] text-text-meta">No commission entries yet.</p></div>
      ) : groups.map((g) => (
        <div key={g.partnerId} className="rounded-[var(--radius)] border border-hairline-token bg-surface-card">
          <div className="flex items-center justify-between border-b border-hairline-token px-[18px] py-3">
            <span className="font-display text-[16px] text-ink">{g.partnerName}</span>
            <span className="text-[12px] text-text-meta">unpaid <b className="tabular-nums text-ink">{formatCents(g.accruedCents)}</b> · paid <span className="tabular-nums">{formatCents(g.paidCents)}</span></span>
          </div>
          {g.months.map((m) => (
            <div key={m.month}>
              <p className="border-b border-hairline-token bg-bone px-[18px] py-1.5 text-[10px] uppercase tracking-[0.16em] text-text-meta">{m.month}</p>
              {m.entries.map((e) => (
                <div key={e.id} className="grid grid-cols-[92px_1fr_96px_90px_60px_100px_auto] items-center gap-3 border-b border-hairline-token px-[18px] py-2 text-[12.5px] last:border-b-0">
                  <span className="text-text-meta">{e.created_at.slice(0, 10)}</span>
                  <span className="truncate text-text-primary">{e.workspace_id ? accountName[e.workspace_id] ?? e.workspace_id.slice(0, 8) : "·"}</span>
                  <span className="text-text-meta">{KIND[e.kind] ?? e.kind}</span>
                  <span className="tabular-nums text-text-meta">{e.base_amount_cents != null ? formatCents(e.base_amount_cents) : "·"}</span>
                  <span className="tabular-nums text-text-meta">{e.rate_bps != null ? `${e.rate_bps / 100}%` : "·"}</span>
                  <span className={`tabular-nums ${e.amount_cents < 0 ? "text-[color:var(--color-text-danger)]" : "text-ink"}`}>{formatCents(e.amount_cents)}</span>
                  <span className="flex items-center justify-end gap-2">
                    {e.status === "paid" && payoutByEntry[e.id] ? (
                      <Link href={`/admin/payouts/${payoutByEntry[e.id]}/statement`} className="text-teal hover:underline">paid ↗</Link>
                    ) : (
                      <span className={e.status === "void" ? "text-text-meta line-through" : "text-text-meta"}>{e.status}</span>
                    )}
                    {isOwner && e.status === "accrued" ? <button onClick={() => doVoid(e.id)} disabled={pending} className="text-[11px] text-[color:var(--color-text-danger)] hover:underline">void</button> : null}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}

      {isOwner ? (
        <form onSubmit={submitAdj} className="flex flex-wrap items-end gap-2 rounded-[var(--radius)] border border-hairline-token bg-surface-card p-4">
          <span className="w-full text-[11px] uppercase tracking-[0.14em] text-text-meta">Manual adjustment</span>
          <select value={adj.partner_id} onChange={(e) => setAdj({ ...adj, partner_id: e.target.value })} className={input}>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
          </select>
          <select value={adj.workspace_id} onChange={(e) => setAdj({ ...adj, workspace_id: e.target.value })} className={input}>
            <option value="">no account</option>
            {accounts.map((a) => <option key={a.workspace_id} value={a.workspace_id}>{a.name}</option>)}
          </select>
          <input value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value.replace(/[^0-9.\-]/g, "") })} inputMode="decimal" placeholder="amount ($, +/-)" className={`${input} w-32`} />
          <input value={adj.memo} onChange={(e) => setAdj({ ...adj, memo: e.target.value })} placeholder="memo (required)" className={`${input} min-w-[200px] flex-1`} />
          <button type="submit" disabled={pending} className="rounded-[var(--radius)] bg-ink px-4 py-1.5 text-[12px] font-medium text-bone disabled:opacity-60">Add</button>
        </form>
      ) : null}
    </div>
  );
}
