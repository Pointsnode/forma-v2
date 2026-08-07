"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatCents } from "@/lib/admin/money.mjs";
import { payoutTotalCents } from "@/lib/payout.mjs";
import { recordPayout } from "@/app/(admin)/admin/payouts/actions";

type Entry = { id: string; partner_id: string; workspace_id: string | null; kind: string; amount_cents: number; created_at: string };
type Partner = { id: string; display_name: string };

const input = "rounded-[var(--radius)] border border-hairline-token bg-surface-card px-2.5 py-1.5 text-[13px] text-ink outline-none";

// Owner-only record flow: pick a partner → check the accrued entries → a live total → confirm.
export function PayoutRecorder({ partners, accrued, accountName }: { partners: Partner[]; accrued: Entry[]; accountName: Record<string, string> }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [partnerId, setPartnerId] = useState(partners[0]?.id ?? "");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({ method: "bank transfer", reference: "", paid_on: "", period_label: "" });

  const rows = useMemo(() => accrued.filter((e) => e.partner_id === partnerId), [accrued, partnerId]);
  const selected = rows.filter((e) => checked[e.id]);
  const total = payoutTotalCents(selected);

  function toggle(id: string) { setChecked((c) => ({ ...c, [id]: !c[id] })); }
  function selectAll() { setChecked(Object.fromEntries(rows.map((e) => [e.id, true]))); }
  function clear() { setChecked({}); }

  function submit() {
    if (!selected.length) { setMsg("Select at least one entry."); return; }
    if (total <= 0) { setMsg("The payout total must be positive."); return; }
    start(async () => {
      const r = await recordPayout({ partner_id: partnerId, entry_ids: selected.map((e) => e.id), method: form.method, reference: form.reference, paid_on: form.paid_on || null, period_label: form.period_label });
      if (r.ok) { setMsg(null); setChecked({}); router.push(`/admin/payouts/${r.id}/statement`); }
      else setMsg(`Could not record (${r.error}).`);
    });
  }

  return (
    <div className="rounded-[var(--radius)] border border-hairline-token bg-surface-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-hairline-token px-[18px] py-3">
        <span className="font-display text-[16px] text-ink">Record a payout</span>
        <select value={partnerId} onChange={(e) => { setPartnerId(e.target.value); setChecked({}); }} className={input}>
          {partners.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}
        </select>
        <span className="ml-auto text-[12px] text-text-meta">selected <b className="tabular-nums text-ink">{formatCents(total)}</b></span>
      </div>
      {msg ? <p className="px-[18px] pt-2 text-[12.5px] text-[color:var(--color-text-danger)]">{msg}</p> : null}
      {rows.length === 0 ? (
        <p className="px-[18px] py-8 text-center text-[13px] text-text-meta">No unpaid entries for this partner.</p>
      ) : (
        <>
          <div className="flex gap-3 px-[18px] pt-2 text-[11px] text-teal">
            <button onClick={selectAll} className="hover:underline">select all</button>
            <button onClick={clear} className="hover:underline">clear</button>
          </div>
          {rows.map((e) => (
            <label key={e.id} className="grid cursor-pointer grid-cols-[24px_110px_1fr_100px_110px] items-center gap-3 border-b border-hairline-token px-[18px] py-2 text-[12.5px] last:border-b-0">
              <input type="checkbox" checked={!!checked[e.id]} onChange={() => toggle(e.id)} />
              <span className="text-text-meta">{e.created_at.slice(0, 10)}</span>
              <span className="truncate text-text-primary">{e.workspace_id ? accountName[e.workspace_id] ?? e.workspace_id.slice(0, 8) : "·"}</span>
              <span className="text-text-meta">{e.kind}</span>
              <span className={`tabular-nums ${e.amount_cents < 0 ? "text-[color:var(--color-text-danger)]" : "text-ink"}`}>{formatCents(e.amount_cents)}</span>
            </label>
          ))}
          <div className="flex flex-wrap items-end gap-2 px-[18px] py-4">
            <input value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })} placeholder="method" className={input} />
            <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="reference" className={input} />
            <input type="date" value={form.paid_on} onChange={(e) => setForm({ ...form, paid_on: e.target.value })} className={input} title="paid on" />
            <input value={form.period_label} onChange={(e) => setForm({ ...form, period_label: e.target.value })} placeholder="period (e.g. Aug 2026)" className={input} />
            <button onClick={submit} disabled={pending || !selected.length} className="rounded-[var(--radius)] bg-ink px-4 py-1.5 text-[12px] font-medium text-bone disabled:opacity-60">Record {formatCents(total)}</button>
          </div>
        </>
      )}
    </div>
  );
}
