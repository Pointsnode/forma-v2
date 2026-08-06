"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { CONTRACT_KINDS, type ContractKind } from "@/lib/contract-enums";
import { createContract } from "@/app/[locale]/(app)/wedding/[id]/contract-actions";

const inputCls = "w-full rounded-[var(--radius)] bg-surface-card px-3.5 py-2.5 text-[14px] text-text-primary outline-none";

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
    <div className="flex flex-col gap-3 rounded-[var(--radius)] bg-surface-card p-4">
      <p className="font-display text-[16px] text-text-primary">{t("newContract")}</p>
      <label className="flex flex-col gap-1"><span className="text-[12px] text-text-meta">{t("pickTemplate")}</span>
        <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} className={inputCls}>
          <option value="">{t("blankContract")}</option>
          {templates.map((tp) => <option key={tp.id} value={tp.id}>{tp.name}</option>)}
        </select></label>
      <div className="grid grid-cols-[1.4fr_1fr] gap-3">
        <label className="flex flex-col gap-1"><span className="text-[12px] text-text-meta">{t("cTitle")}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputCls} /></label>
        <label className="flex flex-col gap-1"><span className="text-[12px] text-text-meta">{t("cKind")}</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as ContractKind)} className={inputCls}>
            {CONTRACT_KINDS.map((k) => <option key={k} value={k}>{t(`kind_${k}`)}</option>)}
          </select></label>
      </div>
      {err ? <p className="text-[13px] text-[color:var(--color-text-danger)]">{err}</p> : null}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending || !title.trim()}>{t("create")}</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
      </div>
    </div>
  );
}
