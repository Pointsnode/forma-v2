"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button, Heading, Icon, Row, RowMain } from "@/components/ui";
import { TEMPLATE_KINDS, type TemplateKind } from "@/lib/contract-enums";
import { createTemplate, updateTemplate, deleteTemplate } from "@/app/[locale]/(app)/(studio)/contracts/actions";

const inputCls = "w-full rounded-[var(--radius)] bg-bone px-3.5 py-2.5 text-[14px] text-ink outline-none";

export type TemplateVM = { id: string; name: string; kind: string; body: string; updatedAt: string; usage: number };

function usageLine(t: ReturnType<typeof useTranslations>, usage: number): string {
  return usage === 0 ? t("usedByNone") : usage === 1 ? t("usedByOne") : t("usedByOther", { count: usage });
}

function TemplateForm({ initial, onClose }: { initial?: TemplateVM; onClose: () => void }) {
  const t = useTranslations("contract");
  const [name, setName] = useState(initial?.name ?? "");
  const [kind, setKind] = useState<TemplateKind>((initial?.kind as TemplateKind) ?? "full");
  const [body, setBody] = useState(initial?.body ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit() {
    if (!name.trim()) return;
    setErr(null);
    const fd = new FormData();
    fd.set("name", name); fd.set("kind", kind); fd.set("body", body);
    start(async () => {
      const r = initial ? await updateTemplate(initial.id, fd) : await createTemplate(fd);
      if (r?.error) setErr(t("error"));
      else onClose();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius)] bg-bone p-4">
      <p className="font-display text-[15px] text-ink">{initial ? t("editTemplate") : t("newTemplate")}</p>
      <div className="grid grid-cols-[1.4fr_1fr] gap-3">
        <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("tName")}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} className={inputCls} /></label>
        <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("tKind")}</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as TemplateKind)} className={inputCls}>
            {TEMPLATE_KINDS.map((k) => <option key={k} value={k}>{t(`templateKind_${k}`)}</option>)}
          </select></label>
      </div>
      <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("tBody")}</span>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} className={inputCls} placeholder={t("tBodyHint")} /></label>
      {err ? <p className="text-[13px] text-wine">{err}</p> : null}
      <div className="flex gap-2">
        <Button onClick={submit} disabled={pending || !name.trim()}>{t("save")}</Button>
        <Button variant="ghost" onClick={onClose}>{t("cancel")}</Button>
      </div>
    </div>
  );
}

function TemplateRow({ tpl, lang }: { tpl: TemplateVM; lang: string }) {
  const t = useTranslations("contract");
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (editing) return <TemplateForm initial={tpl} onClose={() => setEditing(false)} />;

  const updated = t("updated", { date: new Date(tpl.updatedAt).toLocaleDateString(lang === "es" ? "es-ES" : "en-US") });
  return (
    <Row className="-mx-2 rounded-[var(--radius)] px-2">
      <Icon>{tpl.name.trim()[0]?.toUpperCase() ?? "T"}</Icon>
      <RowMain title={tpl.name} detail={`${t(`templateKind_${tpl.kind}`)} · ${usageLine(t, tpl.usage)} · ${updated}`} />
      <div className="flex items-center gap-2">
        {err ? <span className="text-[12px] text-wine">{err}</span> : null}
        <button onClick={() => setEditing(true)} className="text-[12.5px] text-muted hover:text-ink">{t("edit")}</button>
        <button
          disabled={pending || tpl.usage > 0}
          title={tpl.usage > 0 ? t("tDeleteInUse", { count: tpl.usage }) : undefined}
          onClick={() => { setErr(null); start(async () => { const r = await deleteTemplate(tpl.id); if (r?.error) setErr(r.error === "inUse" ? t("tDeleteInUse", { count: tpl.usage }) : t("error")); }); }}
          className="text-[12.5px] text-muted hover:text-wine disabled:cursor-not-allowed disabled:opacity-40"
        >
          {t("delete")}
        </button>
      </div>
    </Row>
  );
}

export function TemplatesPanel({ templates, lang }: { templates: TemplateVM[]; lang: string }) {
  const t = useTranslations("contract");
  const [creating, setCreating] = useState(false);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <Heading className="text-[18px]">{t("templates")}</Heading>
        {!creating ? <button onClick={() => setCreating(true)} className="text-[12.5px] text-wine hover:underline hover:underline-offset-2">+ {t("newTemplate")}</button> : null}
      </div>
      <p className="mb-3 text-[12.5px] text-muted">{t("templatesHint")}</p>
      {creating ? <div className="mb-3"><TemplateForm onClose={() => setCreating(false)} /></div> : null}
      {templates.length === 0 && !creating ? (
        <p className="py-4 text-center font-accent text-[15px] text-muted">{t("templatesEmpty")}</p>
      ) : (
        templates.map((tpl) => <TemplateRow key={tpl.id} tpl={tpl} lang={lang} />)
      )}
    </div>
  );
}
