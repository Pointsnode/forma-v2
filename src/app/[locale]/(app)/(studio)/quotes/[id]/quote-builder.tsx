"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Button, StudioTitleBand, cx } from "@/components/ui";
import { updateQuote, replaceLines, sendQuote, saveAsTemplate, applyTemplate, type LineInput } from "../quote-actions";

export type QuoteRow = {
  id: string; workspace_id: string; lead_id: string | null; wedding_id: string | null; number: number;
  title: string | null; intro: string | null; currency: string; status: string; valid_until: string | null;
  deposit_note: string | null; locale: string | null; access_token: string | null; accepted_at: string | null; accepted_name: string | null;
};
export type LineRow = { id: string; section: string | null; section_sort: number; title: string; description: string | null; amount: number; sort: number };
type Draft = { section: string; title: string; description: string; amount: string };

const CURRENCIES = ["USD", "MXN", "EUR", "GBP", "CAD"];
const input = "w-full rounded-[var(--radius)] border border-hairline-token bg-surface-card px-3 py-2 text-[14px] text-text-primary outline-none";

export function QuoteBuilder({ quote, lines, templates, preparedFor }: { quote: QuoteRow; lines: LineRow[]; templates: { id: string; title: string }[]; preparedFor: string | null }) {
  const t = useTranslations("quotes");
  const uiLocale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [title, setTitle] = useState(quote.title ?? "");
  const [intro, setIntro] = useState(quote.intro ?? "");
  const [currency, setCurrency] = useState(quote.currency);
  const [validUntil, setValidUntil] = useState(quote.valid_until ?? "");
  const [deposit, setDeposit] = useState(quote.deposit_note ?? "");
  const [qlocale, setQlocale] = useState(quote.locale ?? "");
  const [rows, setRows] = useState<Draft[]>(
    lines.length ? lines.map((l) => ({ section: l.section ?? "", title: l.title, description: l.description ?? "", amount: String(l.amount) }))
      : [{ section: "", title: "", description: "", amount: "" }],
  );
  const [saved, setSaved] = useState(false);

  const total = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);

  function setRow(i: number, patch: Partial<Draft>) { setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x))); }
  function addRow() { setRows((r) => [...r, { section: r[r.length - 1]?.section ?? "", title: "", description: "", amount: "" }]); }
  function removeRow(i: number) { setRows((r) => r.filter((_, j) => j !== i)); }
  function move(i: number, d: -1 | 1) { setRows((r) => { const n = [...r]; const j = i + d; if (j < 0 || j >= n.length) return r; [n[i], n[j]] = [n[j], n[i]]; return n; }); }

  function toLineInputs(): LineInput[] {
    // section_sort = order each section first appears
    const order = new Map<string, number>();
    return rows.map((r, i) => {
      const sec = r.section.trim();
      if (!order.has(sec)) order.set(sec, order.size);
      return { section: sec, section_sort: order.get(sec)!, title: r.title, description: r.description || null, amount: Number(r.amount) || 0, sort: i };
    });
  }

  async function persist() { await updateQuote(quote.id, { title, intro, currency, valid_until: validUntil, deposit_note: deposit, locale: qlocale }); await replaceLines(quote.id, toLineInputs()); }
  function save() { start(async () => { await persist(); setSaved(true); setTimeout(() => setSaved(false), 1800); router.refresh(); }); }
  function send() { start(async () => { await persist(); await sendQuote(quote.id); router.refresh(); }); }
  function saveTpl() { const name = window.prompt(t("templateNamePrompt")); if (name) start(async () => { await persist(); await saveAsTemplate(quote.id, name); router.refresh(); }); }
  function pickTemplate(tid: string) { if (tid) start(async () => { await applyTemplate(quote.id, tid); router.refresh(); }); }

  return (
    <>
      <StudioTitleBand kicker={t("kicker")} title={t("builderTitle", { n: quote.number })} accent={preparedFor ? t("preparedFor", { name: preparedFor }) : t("standalone")} action={
        <Link href="/quotes"><Button variant="ghost">{t("allQuotes")}</Button></Link>
      } />

      <div className="mx-auto flex max-w-[760px] flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-[var(--radius)] border border-hairline-token bg-surface-card p-5">
          <label className="text-[12px] text-text-meta">{t("fTitle")}<input value={title} onChange={(e) => setTitle(e.target.value)} className={cx(input, "mt-1")} /></label>
          <label className="text-[12px] text-text-meta">{t("fIntro")}<textarea value={intro} onChange={(e) => setIntro(e.target.value)} rows={2} className={cx(input, "mt-1 font-accent italic")} /></label>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="text-[12px] text-text-meta">{t("fCurrency")}<select value={currency} onChange={(e) => setCurrency(e.target.value)} className={cx(input, "mt-1")}>{CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
            <label className="text-[12px] text-text-meta">{t("fValidUntil")}<input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={cx(input, "mt-1")} /></label>
            <label className="col-span-2 text-[12px] text-text-meta sm:col-span-1">{t("fLanguage")}<select value={qlocale} onChange={(e) => setQlocale(e.target.value)} className={cx(input, "mt-1")}><option value="">{t("langAuto")}</option>{["en", "es", "fr", "it"].map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}</select></label>
            <label className="col-span-2 text-[12px] text-text-meta">{t("fDeposit")}<input value={deposit} onChange={(e) => setDeposit(e.target.value)} className={cx(input, "mt-1")} /></label>
          </div>
        </div>

        {/* Lines */}
        <div className="rounded-[var(--radius)] border border-hairline-token bg-surface-card p-5">
          <div className="mb-2 grid grid-cols-[1fr_1fr_auto_auto] gap-2 text-[11px] uppercase tracking-[0.12em] text-text-meta">
            <span>{t("colSection")}</span><span>{t("colLine")}</span><span>{t("colAmount")}</span><span />
          </div>
          {rows.map((r, i) => (
            <div key={i} className="mb-2 grid grid-cols-[1fr_1fr_auto_auto] items-start gap-2">
              <input value={r.section} onChange={(e) => setRow(i, { section: e.target.value })} placeholder={t("sectionPlaceholder")} className={cx(input, "!py-1.5 !text-[13px]")} />
              <div className="flex flex-col gap-1">
                <input value={r.title} onChange={(e) => setRow(i, { title: e.target.value })} placeholder={t("linePlaceholder")} className={cx(input, "!py-1.5 !text-[13px]")} />
                <input value={r.description} onChange={(e) => setRow(i, { description: e.target.value })} placeholder={t("descPlaceholder")} className={cx(input, "!py-1.5 !text-[12px] text-text-meta")} />
              </div>
              <input value={r.amount} onChange={(e) => setRow(i, { amount: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" placeholder="0" className={cx(input, "!w-24 !py-1.5 text-right tabular-nums")} />
              <div className="flex flex-col text-[11px] text-text-meta">
                <button onClick={() => move(i, -1)} className="hover:text-text-primary" aria-label="up">↑</button>
                <button onClick={() => move(i, 1)} className="hover:text-text-primary" aria-label="down">↓</button>
                <button onClick={() => removeRow(i)} className="hover:text-[color:var(--color-text-danger)]" aria-label="remove">✕</button>
              </div>
            </div>
          ))}
          <button onClick={addRow} className="mt-1 text-[12.5px] text-taupe hover:text-text-primary">+ {t("addLine")}</button>
          <div className="mt-4 flex items-center justify-between border-t border-hairline-token pt-3">
            <span className="text-[12px] uppercase tracking-[0.14em] text-text-meta">{t("total")}</span>
            <span className="font-display text-[20px] tabular-nums text-text-primary">{new Intl.NumberFormat(uiLocale, { style: "currency", currency, maximumFractionDigits: 0 }).format(total)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="dark" disabled={pending} onClick={save}>{t("save")}</Button>
          <Button variant="primary" disabled={pending} onClick={send}>{t("send")}</Button>
          <Button variant="ghost" disabled={pending} onClick={saveTpl}>{t("saveTemplate")}</Button>
          {templates.length ? (
            <select onChange={(e) => pickTemplate(e.target.value)} defaultValue="" className={cx(input, "!w-auto")}>
              <option value="">{t("startFromTemplate")}</option>
              {templates.map((tp) => <option key={tp.id} value={tp.id}>{tp.title}</option>)}
            </select>
          ) : null}
          {saved ? <span className="text-[12.5px] text-teal">{t("saved")}</span> : null}
        </div>
      </div>
    </>
  );
}
