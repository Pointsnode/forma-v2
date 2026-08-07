"use client";

import { useState, useTransition } from "react";
import { formatCents } from "@/lib/admin/money.mjs";
import { upsertExpense, voidExpense } from "@/app/(admin)/admin/reports/actions";
import type { ExpenseRow } from "@/lib/admin/reports";

const CATS = ["infrastructure", "tooling", "services", "fees", "other"] as const;
const input = "rounded-[var(--radius)] border border-hairline-token bg-surface-card px-2.5 py-1.5 text-[13px] text-ink outline-none";

// Owner-only expense register. Partners see the list read-only (isOwner=false → no form/void).
export function ExpensesManager({ expenses, isOwner }: { expenses: ExpenseRow[]; isOwner: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [f, setF] = useState({ paid_on: "", vendor: "", category: "infrastructure", amount: "", memo: "" });

  function add(e: React.FormEvent) {
    e.preventDefault();
    if (!f.paid_on || !f.amount.trim() || Number(f.amount) <= 0) { setMsg("A date and a positive amount are required."); return; }
    start(async () => {
      const r = await upsertExpense({ id: null, paid_on: f.paid_on, vendor: f.vendor || null, category: f.category as (typeof CATS)[number], amount_cents: Math.round(Number(f.amount) * 100), currency: "USD", memo: f.memo || null });
      setMsg(r.ok ? "Added." : `Could not add (${r.error}).`);
      if (r.ok) setF({ paid_on: "", vendor: "", category: "infrastructure", amount: "", memo: "" });
    });
  }
  function doVoid(id: string) {
    const memo = window.prompt("Reason for voiding this expense (required):");
    if (!memo || !memo.trim()) return;
    start(async () => { const r = await voidExpense({ id, memo }); setMsg(r.ok ? "Voided." : `Could not void (${r.error}).`); });
  }

  return (
    <div className="rounded-[var(--radius)] border border-hairline-token bg-surface-card">
      <p className="border-b border-hairline-token px-[18px] py-3 font-display text-[16px] text-ink">Expenses</p>
      {msg ? <p className="px-[18px] pt-2 text-[12.5px] text-teal">{msg}</p> : null}
      <div className="grid grid-cols-[100px_1fr_120px_100px_1fr_auto] gap-3 border-b border-hairline-token px-[18px] py-2 text-[10px] uppercase tracking-[0.14em] text-text-meta">
        <span>Date</span><span>Vendor</span><span>Category</span><span>Amount</span><span>Memo</span><span></span>
      </div>
      {expenses.length === 0 ? <p className="px-[18px] py-6 text-center text-[13px] text-text-meta">No expenses yet.</p> : expenses.map((e) => (
        <div key={e.id} className={`grid grid-cols-[100px_1fr_120px_100px_1fr_auto] items-center gap-3 border-b border-hairline-token px-[18px] py-2 text-[12.5px] last:border-b-0 ${e.voided ? "opacity-50" : ""}`}>
          <span className="text-text-meta">{e.paid_on}</span>
          <span className="truncate text-text-primary">{e.vendor ?? "·"}</span>
          <span className="text-text-meta">{e.category}</span>
          <span className={`tabular-nums ${e.voided ? "line-through" : ""}`}>{formatCents(e.amount_cents, e.currency)}</span>
          <span className="truncate text-text-meta">{e.voided ? `voided: ${e.void_memo ?? ""}` : e.memo ?? ""}</span>
          {isOwner && !e.voided ? <button onClick={() => doVoid(e.id)} disabled={pending} className="text-[11px] text-[color:var(--color-text-danger)] hover:underline">void</button> : <span />}
        </div>
      ))}
      {isOwner ? (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2 px-[18px] py-4">
          <span className="w-full text-[11px] uppercase tracking-[0.14em] text-text-meta">Add expense</span>
          <input type="date" value={f.paid_on} onChange={(e) => setF({ ...f, paid_on: e.target.value })} className={input} />
          <input value={f.vendor} onChange={(e) => setF({ ...f, vendor: e.target.value })} placeholder="vendor" className={input} />
          <select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className={input}>{CATS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <input value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" placeholder="amount $" className={`${input} w-28`} />
          <input value={f.memo} onChange={(e) => setF({ ...f, memo: e.target.value })} placeholder="memo" className={`${input} min-w-[160px] flex-1`} />
          <button type="submit" disabled={pending} className="rounded-[var(--radius)] bg-ink px-4 py-1.5 text-[12px] font-medium text-bone disabled:opacity-60">Add</button>
        </form>
      ) : null}
    </div>
  );
}
