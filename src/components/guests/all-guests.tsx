"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button, Pill } from "@/components/ui";
import { updateGuest, deleteGuest } from "@/app/[locale]/(app)/wedding/[id]/guest-actions";
import type { GuestRow } from "@/lib/guests";

const inputCls = "rounded-lg bg-bone px-2.5 py-1.5 text-[13px] text-ink shadow-card outline-none focus:shadow-lift";

function Row({ weddingId, g, canDelete }: { weddingId: string; g: GuestRow; canDelete: boolean }) {
  const t = useTranslations("guests");
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const [f, setF] = useState({ full_name: g.full_name, email: g.email ?? "", dietary: g.dietary ?? "", plus_one_name: g.plus_one_name ?? "" });

  if (editing) {
    return (
      <div className="flex flex-col gap-2 rounded-xl bg-paper p-3 shadow-card">
        <div className="grid grid-cols-2 gap-2">
          <input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} placeholder={t("fullName")} className={inputCls} />
          <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder={t("email")} className={inputCls} />
          {g.plus_one_allowed ? <input value={f.plus_one_name} onChange={(e) => setF({ ...f, plus_one_name: e.target.value })} placeholder={t("plusOne")} className={inputCls} /> : null}
          <input value={f.dietary} onChange={(e) => setF({ ...f, dietary: e.target.value })} placeholder={t("dietary")} className={inputCls} />
        </div>
        <div className="flex gap-2">
          <Button disabled={pending} onClick={() => start(async () => { await updateGuest(g.id, weddingId, f); setEditing(false); })}>{t("save")}</Button>
          <Button variant="ghost" onClick={() => setEditing(false)}>{t("cancel")}</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3 py-2 [box-shadow:inset_0_-1px_0_var(--color-hairline)] last:shadow-none">
      <div className="min-w-0 flex-1">
        <p className="text-[14px] text-ink">{g.full_name}{g.plus_one_allowed ? <span className="ml-1.5 text-muted">+1</span> : null}</p>
        <p className="font-accent text-[13px] text-muted">{g.email ?? "—"}{g.group_label ? ` · ${g.group_label}` : ""}</p>
      </div>
      {g.side !== "none" ? <Pill tone="sand">{g.side === "both" ? t("sideBoth") : g.side === "a" ? t("sideA") : t("sideB")}</Pill> : null}
      <button onClick={() => setEditing(true)} className="shrink-0 rounded-full px-2.5 py-1 text-[12.5px] text-muted hover:text-ink">{t("edit")}</button>
      {canDelete ? <button disabled={pending} onClick={() => start(async () => { await deleteGuest(g.id); })} className="shrink-0 rounded-full px-2.5 py-1 text-[12.5px] text-muted hover:text-wine">✕</button> : null}
    </div>
  );
}

export function AllGuests({ weddingId, guests, canDelete }: { weddingId: string; guests: GuestRow[]; canDelete: boolean }) {
  const t = useTranslations("guests");
  const [q, setQ] = useState("");
  const [show, setShow] = useState(false);
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? guests.filter((g) => g.full_name.toLowerCase().includes(s) || (g.email ?? "").toLowerCase().includes(s)) : guests;
  }, [q, guests]);

  if (!show) return <Button variant="ghost" onClick={() => setShow(true)}>{t("allGuests")} ({guests.length})</Button>;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("search")} className="flex-1 rounded-xl bg-bone px-3 py-2 text-[14px] text-ink shadow-card outline-none focus:shadow-lift" />
        <Button variant="ghost" onClick={() => setShow(false)}>{t("hideAll")}</Button>
      </div>
      {filtered.length === 0 ? <p className="py-3 text-center font-accent text-[15px] text-muted">{t("noGuests")}</p> :
        <div className="flex flex-col">{filtered.map((g) => <Row key={g.id} weddingId={weddingId} g={g} canDelete={canDelete} />)}</div>}
    </div>
  );
}
