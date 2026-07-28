"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { CONTRACT_KINDS, type ContractKind } from "@/lib/contract-enums";
import { createContract } from "@/app/[locale]/(app)/wedding/[id]/contract-actions";

const inputCls = "w-full rounded-xl bg-bone px-3.5 py-2.5 text-[14px] text-ink shadow-card outline-none focus:shadow-lift";

export function NewContract({ weddingId, templates }: { weddingId: string; templates: { id: string; name: string; kind: string }[] }) {
  const t = useTranslations("contract");
  const [open, setOpen] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ContractKind>("vendor");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    if (!title.trim()) return;
    setErr(null);
    start(async () => {
      const r = await createContract(weddingId, { templateId: templateId || null, title, kind });
      if (r?.error) setErr(t("error")); // success redirects to the room
    });
  }

  if (!open) return <Button variant="ghost" onClick={() => setOpen(true)}>+ {t("newContract")}</Button>;
  return (
    <div className="flex flex-col gap-3 rounded-2xl bg-paper p-4 shadow-card">
      <p className="font-display text-[16px] text-ink">{t("newContract")}</p>
      <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("pickTemplate")}</span>
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={inputCls}>
          <option value="">{t("blankContract")}</option>
          {templates.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
        </select></label>
      <div className="grid grid-cols-[1.4fr_1fr] gap-3">
        <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("cTitle")}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputCls} /></label>
        <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("cKind")}</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as ContractKind)} className={inputCls}>
            {CONTRACT_KINDS.map((k) => <option key={k} value={k}>{t(`kind_${k}`)}</option>)}
          </select></label>
      </div>
      {err ? <p className="text-[13px] text-wine">{err}</p> : null}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending || !title.trim()}>{t("create")}</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
      </div>
    </div>
  );
}
