"use client";

import { useState, useTransition } from "react";
import { formatCents } from "@/lib/admin/money.mjs";
import { upsertPartner, setAttribution } from "@/app/(admin)/admin/partners/actions";

type Partner = { id: string; display_name: string; type: string; commission_rate_bps: number; activation_fee_cents: number; active: boolean; user_id: string | null };
type Attribution = { workspace_id: string; partner_id: string | null; source: string; first_contact_at: string | null; notes: string | null };
type Account = { workspace_id: string; name: string };

const input = "rounded-[var(--radius)] border border-hairline-token bg-surface-card px-2.5 py-1.5 text-[13px] text-ink outline-none";
const blankPartner = { id: "", display_name: "", type: "founding", rate_bps: "3000", activation_fee_cents: "0", active: true };

export function PartnersManager({ partners, attributions, accounts, isOwner }: {
  partners: Partner[]; attributions: Attribution[]; accounts: Account[]; isOwner: boolean;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [pf, setPf] = useState(blankPartner);
  const [af, setAf] = useState({ workspace_id: accounts[0]?.workspace_id ?? "", partner_id: partners[0]?.id ?? "", source: "manual", first_contact_at: "", notes: "" });

  const partnerName = new Map(partners.map((p) => [p.id, p.display_name]));
  const accountName = new Map(accounts.map((a) => [a.workspace_id, a.name]));

  function savePartner(e: React.FormEvent) {
    e.preventDefault();
    if (!pf.display_name.trim()) { setMsg("A name is required."); return; }
    start(async () => {
      const r = await upsertPartner({ id: pf.id || null, display_name: pf.display_name, type: pf.type as "founding" | "referral" | "reseller", rate_bps: pf.rate_bps, activation_fee_cents: pf.activation_fee_cents, active: pf.active });
      setMsg(r.ok ? "Saved." : `Could not save (${r.error}).`);
      if (r.ok) setPf(blankPartner);
    });
  }
  function saveAttribution(e: React.FormEvent) {
    e.preventDefault();
    const house = af.source === "house";
    start(async () => {
      const r = await setAttribution({ workspace_id: af.workspace_id, partner_id: house ? null : af.partner_id, source: af.source as "manual" | "link" | "house", first_contact_at: af.first_contact_at || null, notes: af.notes || null });
      setMsg(r.ok ? "Attribution set." : `Could not set (${r.error}).`);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {msg ? <p className="text-[12.5px] text-teal">{msg}</p> : null}

      <div className="rounded-[var(--radius)] border border-hairline-token bg-surface-card">
        <p className="border-b border-hairline-token px-[18px] py-3 font-display text-[16px] text-ink">Partners</p>
        <div className="grid grid-cols-[1.4fr_100px_80px_110px_80px_auto] gap-3 border-b border-hairline-token px-[18px] py-2 text-[10px] uppercase tracking-[0.14em] text-text-meta">
          <span>Name</span><span>Type</span><span>Rate</span><span>Activation</span><span>Active</span><span>Linked</span>
        </div>
        {partners.map((p) => (
          <div key={p.id} className="grid grid-cols-[1.4fr_100px_80px_110px_80px_auto] items-center gap-3 border-b border-hairline-token px-[18px] py-2 text-[13px] last:border-b-0">
            <span className="text-text-primary">{p.display_name}</span>
            <span className="text-text-meta">{p.type}</span>
            <span className="tabular-nums">{p.commission_rate_bps / 100}%</span>
            <span className="tabular-nums text-text-meta">{formatCents(p.activation_fee_cents)}</span>
            <span className={p.active ? "text-teal" : "text-text-meta"}>{p.active ? "yes" : "no"}</span>
            <span className="flex items-center gap-2 text-[12px] text-text-meta">{p.user_id ? "account linked" : "no account"}
              {isOwner ? <button onClick={() => setPf({ id: p.id, display_name: p.display_name, type: p.type, rate_bps: String(p.commission_rate_bps), activation_fee_cents: String(p.activation_fee_cents), active: p.active })} className="text-[11px] text-teal hover:underline">edit</button> : null}
            </span>
          </div>
        ))}
        {isOwner ? (
          <form onSubmit={savePartner} className="flex flex-wrap items-end gap-2 px-[18px] py-4">
            <span className="w-full text-[11px] uppercase tracking-[0.14em] text-text-meta">{pf.id ? "Edit partner" : "New partner"}</span>
            <input value={pf.display_name} onChange={(e) => setPf({ ...pf, display_name: e.target.value })} placeholder="name" className={`${input} min-w-[160px]`} />
            <select value={pf.type} onChange={(e) => setPf({ ...pf, type: e.target.value })} className={input}><option value="founding">founding</option><option value="referral">referral</option><option value="reseller">reseller</option></select>
            <input value={pf.rate_bps} onChange={(e) => setPf({ ...pf, rate_bps: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" placeholder="rate bps" className={`${input} w-24`} title="basis points, e.g. 3000 = 30%" />
            <input value={pf.activation_fee_cents} onChange={(e) => setPf({ ...pf, activation_fee_cents: e.target.value.replace(/[^0-9]/g, "") })} inputMode="numeric" placeholder="activation ¢" className={`${input} w-28`} />
            <label className="flex items-center gap-1.5 text-[12px] text-text-meta"><input type="checkbox" checked={pf.active} onChange={(e) => setPf({ ...pf, active: e.target.checked })} />active</label>
            <button type="submit" disabled={pending} className="rounded-[var(--radius)] bg-ink px-4 py-1.5 text-[12px] font-medium text-bone disabled:opacity-60">{pf.id ? "Save" : "Create"}</button>
            {pf.id ? <button type="button" onClick={() => setPf(blankPartner)} className="text-[12px] text-text-meta hover:text-ink">cancel</button> : null}
          </form>
        ) : null}
      </div>

      <div className="rounded-[var(--radius)] border border-hairline-token bg-surface-card">
        <p className="border-b border-hairline-token px-[18px] py-3 font-display text-[16px] text-ink">Attributions</p>
        {attributions.length === 0 ? <p className="px-[18px] py-6 text-center text-[13px] text-text-meta">No attributions yet.</p> : attributions.map((a) => (
          <div key={a.workspace_id} className="grid grid-cols-[1.4fr_1fr_100px_1fr] items-center gap-3 border-b border-hairline-token px-[18px] py-2 text-[13px] last:border-b-0">
            <span className="truncate text-text-primary">{accountName.get(a.workspace_id) ?? a.workspace_id.slice(0, 8)}</span>
            <span className="text-text-meta">{a.source === "house" ? "House (0%)" : partnerName.get(a.partner_id ?? "") ?? "·"}</span>
            <span className="text-text-meta">{a.source}</span>
            <span className="truncate text-[12px] text-text-meta">{a.notes ?? ""}</span>
          </div>
        ))}
        {isOwner && accounts.length ? (
          <form onSubmit={saveAttribution} className="flex flex-wrap items-end gap-2 px-[18px] py-4">
            <span className="w-full text-[11px] uppercase tracking-[0.14em] text-text-meta">Set attribution</span>
            <select value={af.workspace_id} onChange={(e) => setAf({ ...af, workspace_id: e.target.value })} className={input}>{accounts.map((a) => <option key={a.workspace_id} value={a.workspace_id}>{a.name}</option>)}</select>
            <select value={af.source} onChange={(e) => setAf({ ...af, source: e.target.value })} className={input}><option value="manual">manual</option><option value="link">link</option><option value="house">house</option></select>
            {af.source !== "house" ? <select value={af.partner_id} onChange={(e) => setAf({ ...af, partner_id: e.target.value })} className={input}>{partners.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select> : null}
            <input type="date" value={af.first_contact_at} onChange={(e) => setAf({ ...af, first_contact_at: e.target.value })} className={input} title="first contact" />
            <input value={af.notes} onChange={(e) => setAf({ ...af, notes: e.target.value })} placeholder="notes" className={`${input} min-w-[160px] flex-1`} />
            <button type="submit" disabled={pending} className="rounded-[var(--radius)] bg-ink px-4 py-1.5 text-[12px] font-medium text-bone disabled:opacity-60">Set</button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
