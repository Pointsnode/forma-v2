"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Button, StudioTitleBand, Chip, cx } from "@/components/ui";
import { formatMoney } from "@/lib/wedding";
import { withdrawQuote, sendQuoteLinkEmail } from "../quote-actions";
import type { QuoteRow, LineRow } from "./quote-builder";

// A sent quote is read-only (the recipient must read the exact document sent). This is the send
// sheet: the public link + copy, the optional email, withdraw, and the accepted state.
export function QuoteSent({ quote, lines, preparedFor, leadHasEmail, publicUrl }: {
  quote: QuoteRow; lines: LineRow[]; preparedFor: string | null; leadHasEmail: boolean; publicUrl: string | null;
}) {
  const t = useTranslations("quotes");
  const uiLocale = useLocale();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const [emailed, setEmailed] = useState(false);

  const accepted = quote.status === "accepted";
  const withdrawn = quote.status === "withdrawn";
  const total = lines.reduce((s, l) => s + Number(l.amount), 0);

  function copy() { if (publicUrl) navigator.clipboard?.writeText(publicUrl).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1600); }); }
  function email() { start(async () => { const r = await sendQuoteLinkEmail(quote.id); if (r.ok) { setEmailed(true); setTimeout(() => setEmailed(false), 2200); } }); }
  function withdraw() { if (window.confirm(t("withdrawConfirm"))) start(async () => { await withdrawQuote(quote.id); router.refresh(); }); }

  return (
    <>
      <StudioTitleBand kicker={t("kicker")} title={t("builderTitle", { n: quote.number })} accent={preparedFor ? t("preparedFor", { name: preparedFor }) : t("standalone")} action={
        <Link href="/quotes"><Button variant="ghost">{t("allQuotes")}</Button></Link>
      } />

      <div className="mx-auto flex max-w-[760px] flex-col gap-4">
        {/* Status + send sheet */}
        <div className="rounded-[var(--radius)] border border-hairline-token bg-surface-card p-5">
          <div className="mb-3 flex items-center gap-2">
            {accepted ? <Chip tone="settled">{t("statusAccepted")}</Chip> : withdrawn ? <Chip tone="pending">{t("statusWithdrawn")}</Chip> : <Chip tone="attention">{t("statusSent")}</Chip>}
            {accepted && quote.accepted_name ? <span className="text-[12.5px] text-text-meta">{t("acceptedBy", { name: quote.accepted_name })}</span> : null}
          </div>

          {!withdrawn && publicUrl ? (
            <>
              <p className="mb-1.5 text-[12px] text-text-meta">{t("publicLink")}</p>
              <div className="flex items-center gap-2">
                <input readOnly value={publicUrl} className="flex-1 truncate rounded-[var(--radius)] border border-hairline-token bg-surface-page px-3 py-2 text-[13px] text-text-primary" />
                <button onClick={copy} className="rounded-[var(--radius)] border border-hairline-token px-3 py-2 text-[12px] text-text-primary hover:bg-surface-page">{copied ? t("copied") : t("copy")}</button>
              </div>
              {!accepted ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {leadHasEmail ? <Button variant="ghost" disabled={pending} onClick={email}>{t("sendByEmail")}</Button> : null}
                  {emailed ? <span className="text-[12.5px] text-teal">{t("emailed")}</span> : null}
                  <Button variant="ghost" disabled={pending} onClick={withdraw}>{t("withdraw")}</Button>
                </div>
              ) : null}
            </>
          ) : withdrawn ? (
            <p className="text-[13px] text-text-meta">{t("withdrawnNote")}</p>
          ) : null}
          <p className="mt-3 text-[11.5px] text-text-meta">{t("readOnlyNote")}</p>
        </div>

        {/* Read-only preview */}
        <div className="rounded-[var(--radius)] border border-hairline-token bg-surface-card p-5">
          <p className="font-display text-[18px] text-text-primary">{quote.title || t("untitled")}</p>
          {quote.intro ? <p className="mt-1 font-accent text-[15px] italic text-text-meta">{quote.intro}</p> : null}
          <div className="mt-3">
            {lines.map((l) => (
              <div key={l.id} className="grid grid-cols-[1fr_auto] gap-3 border-b border-hairline-token py-2 text-[13.5px] last:border-b-0">
                <span><span className="text-text-primary">{l.title}</span>{l.section ? <span className="text-text-meta"> · {l.section}</span> : null}{l.description ? <span className="block text-[12px] text-text-meta">{l.description}</span> : null}</span>
                <span className="tabular-nums text-text-primary">{formatMoney(l.amount, uiLocale, quote.currency)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-hairline-token pt-3">
            <span className="text-[12px] uppercase tracking-[0.14em] text-text-meta">{t("total")}</span>
            <span className={cx("font-display text-[20px] tabular-nums text-text-primary")}>{new Intl.NumberFormat(uiLocale, { style: "currency", currency: quote.currency, maximumFractionDigits: 0 }).format(total)} <span className="text-[11px] text-taupe">{quote.currency}</span></span>
          </div>
          {quote.deposit_note || quote.valid_until ? (
            <div className="mt-3 flex justify-between gap-3 text-[12px] text-text-meta">
              <span>{quote.deposit_note}</span>
              {quote.valid_until ? <span>{t("validUntilNote", { date: quote.valid_until })}</span> : null}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
