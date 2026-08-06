"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button, Heading, Row, RowMain } from "@/components/ui";
import { MERGE_SOURCES, SIGNER_ROLES, type MergeSource, type SignerRole } from "@/lib/contract-enums";
import {
  saveDraftBody, addField, removeField, addSigner, removeSigner, reorderSigner,
} from "@/app/[locale]/(app)/wedding/[id]/contract-actions";

const inputCls = "w-full rounded-[var(--radius)] bg-surface-card px-3.5 py-2.5 text-[14px] text-text-primary outline-none";

export type FieldVM = { id: string; field_key: string; label: string; merge_source: string; signer_order: number | null; required: boolean };
export type SignerVM = { id: string; sign_order: number; role: string; name: string; email: string | null };

export function DraftBody({ contractId, body }: { contractId: string; body: string }) {
  const t = useTranslations("contract");
  const [val, setVal] = useState(body);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={val}
        onChange={(e) => { setVal(e.target.value); setSaved(false); }}
        rows={10}
        placeholder={t("tBodyHint")}
        className={`${inputCls} font-mono text-[13px] leading-[1.7]`}
      />
      <div className="flex items-center gap-2">
        <Button onClick={() => start(async () => { const r = await saveDraftBody(contractId, val); if (!r?.error) setSaved(true); })} disabled={pending}>{t("saveBody")}</Button>
        {saved ? <span className="text-[12.5px] text-teal">{t("savedNote")}</span> : null}
      </div>
    </div>
  );
}

export function FieldsEditor({ contractId, fields }: { contractId: string; fields: FieldVM[] }) {
  const t = useTranslations("contract");
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [key, setKey] = useState("");
  const [source, setSource] = useState<MergeSource>("couple_names");
  const [signerOrder, setSignerOrder] = useState("1");
  const [required, setRequired] = useState(false);
  const [pending, start] = useTransition();

  function submit() {
    if (!label.trim() || !key.trim()) return;
    start(async () => {
      const r = await addField(contractId, { label, field_key: key, merge_source: source, signer_order: source === "manual" ? Number(signerOrder) || 1 : null, required });
      if (!r?.error) { setLabel(""); setKey(""); setSource("couple_names"); setRequired(false); setAdding(false); }
    });
  }

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <Heading className="text-[18px]">{t("fieldsTitle")}</Heading>
        {!adding ? <button onClick={() => setAdding(true)} className="text-[12.5px] text-[color:var(--color-text-danger)] hover:underline hover:underline-offset-2">+ {t("addField")}</button> : null}
      </div>
      {fields.map((f) => (
        <Row key={f.id} className="-mx-2 rounded-[var(--radius)] px-2">
          <RowMain
            title={<span className="inline-flex items-center gap-2">{f.label}<code className="rounded bg-surface-card px-1.5 py-0.5 text-[11px] text-text-meta">{`{${f.field_key}}`}</code></span>}
            detail={`${t(`mergeSource_${f.merge_source}`)}${f.required ? ` · ${t("fRequired")}` : ""}`}
          />
          <button onClick={() => start(async () => { await removeField(f.id); })} disabled={pending} className="text-[12.5px] text-text-meta hover:text-[color:var(--color-text-danger)]">{t("remove")}</button>
        </Row>
      ))}
      {fields.length === 0 && !adding ? <p className="py-2 text-[13px] text-text-meta">{t("fieldsEmpty")}</p> : null}
      {adding ? (
        <div className="mt-2 flex flex-col gap-3 rounded-[var(--radius)] bg-surface-card p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1"><span className="text-[12px] text-text-meta">{t("fLabel")}</span>
              <input value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} /></label>
            <label className="flex flex-col gap-1"><span className="text-[12px] text-text-meta">{t("fKey")}</span>
              <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="couple_names" className={inputCls} /></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1"><span className="text-[12px] text-text-meta">{t("fSource")}</span>
              <select value={source} onChange={(e) => setSource(e.target.value as MergeSource)} className={inputCls}>
                {MERGE_SOURCES.map((s) => <option key={s} value={s}>{t(`mergeSource_${s}`)}</option>)}
              </select></label>
            {source === "manual" ? (
              <label className="flex flex-col gap-1"><span className="text-[12px] text-text-meta">{t("fSignerOrder")}</span>
                <input value={signerOrder} onChange={(e) => setSignerOrder(e.target.value)} inputMode="numeric" className={inputCls} /></label>
            ) : <div />}
          </div>
          <label className="flex items-center gap-2 text-[13px] text-text-primary"><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> {t("fRequired")}</label>
          <div className="flex gap-2">
            <Button onClick={submit} disabled={pending || !label.trim() || !key.trim()}>{t("save")}</Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>{t("cancel")}</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SignersEditor({ contractId, signers }: { contractId: string; signers: SignerVM[] }) {
  const t = useTranslations("contract");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [role, setRole] = useState<SignerRole>("couple");
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();

  function submit() {
    if (!name.trim()) return;
    start(async () => {
      const r = await addSigner(contractId, { name, role, email: email || null });
      if (!r?.error) { setName(""); setEmail(""); setRole("couple"); setAdding(false); }
    });
  }

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <Heading className="text-[18px]">{t("signersTitle")}</Heading>
        {!adding ? <button onClick={() => setAdding(true)} className="text-[12.5px] text-[color:var(--color-text-danger)] hover:underline hover:underline-offset-2">+ {t("addSigner")}</button> : null}
      </div>
      {signers.map((s, i) => (
        <Row key={s.id} className="-mx-2 rounded-[var(--radius)] px-2">
          <span className="font-accent text-[14px] italic text-taupe">{s.sign_order}</span>
          <RowMain title={s.name} detail={<span className="inline-flex items-center gap-2">{t(`role_${s.role}`)}{s.email ? ` · ${s.email}` : ""}</span>} />
          <div className="flex items-center gap-1.5 text-[13px] text-text-meta">
            <button onClick={() => start(async () => { await reorderSigner(s.id, "up"); })} disabled={pending || i === 0} className="hover:text-text-primary disabled:opacity-30">↑</button>
            <button onClick={() => start(async () => { await reorderSigner(s.id, "down"); })} disabled={pending || i === signers.length - 1} className="hover:text-text-primary disabled:opacity-30">↓</button>
            <button onClick={() => start(async () => { await removeSigner(s.id); })} disabled={pending} className="hover:text-[color:var(--color-text-danger)]">{t("remove")}</button>
          </div>
        </Row>
      ))}
      {signers.length === 0 && !adding ? <p className="py-2 text-[13px] text-text-meta">{t("signersEmpty")}</p> : null}
      {adding ? (
        <div className="mt-2 flex flex-col gap-3 rounded-[var(--radius)] bg-surface-card p-4">
          <div className="grid grid-cols-[1.2fr_1fr] gap-3">
            <label className="flex flex-col gap-1"><span className="text-[12px] text-text-meta">{t("sName")}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></label>
            <label className="flex flex-col gap-1"><span className="text-[12px] text-text-meta">{t("sRole")}</span>
              <select value={role} onChange={(e) => setRole(e.target.value as SignerRole)} className={inputCls}>
                {SIGNER_ROLES.map((r) => <option key={r} value={r}>{t(`role_${r}`)}</option>)}
              </select></label>
          </div>
          <label className="flex flex-col gap-1"><span className="text-[12px] text-text-meta">{t("sEmail")}</span>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={inputCls} /></label>
          <div className="flex gap-2">
            <Button onClick={submit} disabled={pending || !name.trim()}>{t("save")}</Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>{t("cancel")}</Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
