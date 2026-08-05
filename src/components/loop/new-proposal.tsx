"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { createProposal } from "@/app/[locale]/(app)/wedding/[id]/loop-actions";

const inputCls = "w-full rounded-[var(--radius)] bg-bone px-3.5 py-2.5 text-[14px] text-ink outline-none";

export function NewProposal({ weddingId, events }: { weddingId: string; events: { id: string; label: string }[] }) {
  const t = useTranslations("proposals");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [estimate, setEstimate] = useState("");
  const [eventRef, setEventRef] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(send: boolean) {
    if (!title.trim()) return;
    setErr(null);
    start(async () => {
      const r = await createProposal(weddingId, { title, note, estimate, eventRef: eventRef || undefined, send });
      if (r?.error) setErr(t("error"));
      else { setTitle(""); setNote(""); setEstimate(""); setEventRef(""); setOpen(false); }
    });
  }

  if (!open) return <Button variant="ghost" onClick={() => setOpen(true)}>+ {t("new")}</Button>;
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius)] bg-bone p-4">
      <p className="font-display text-[16px] text-ink">{t("newTitle")}</p>
      <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("title")}</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputCls} /></label>
      <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("note")}</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputCls} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("estimate")}</span>
          <input value={estimate} onChange={(e) => setEstimate(e.target.value)} inputMode="numeric" className={inputCls} /></label>
        <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("event")}</span>
          <select value={eventRef} onChange={(e) => setEventRef(e.target.value)} className={inputCls}>
            <option value="">{t("noEvent")}</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select></label>
      </div>
      {err ? <p className="text-[13px] text-wine">{err}</p> : null}
      <div className="flex gap-2">
        <Button onClick={() => submit(true)} disabled={pending || !title.trim()}>{t("send")}</Button>
        <Button variant="ghost" onClick={() => submit(false)} disabled={pending || !title.trim()}>{t("saveDraft")}</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
      </div>
    </div>
  );
}
