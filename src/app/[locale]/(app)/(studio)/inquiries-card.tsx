"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Card, Heading, Monogram, Button, cx } from "@/components/ui";
import type { InquiryItem } from "@/lib/cockpit";
import { convertInquiry, archiveInquiry, markReplied } from "./inquiries-actions";

export function InquiriesCard({ inquiries }: { inquiries: InquiryItem[] }) {
  const t = useTranslations("cockpit");
  const router = useRouter();
  const [list, setList] = useState(inquiries);
  const [open, setOpen] = useState<InquiryItem | null>(null);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function initials(inq: InquiryItem) {
    const parts = inq.name.trim().split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "·";
  }

  function reply(inq: InquiryItem) {
    start(async () => {
      await markReplied(inq.id);
      setList((l) => l.map((x) => (x.id === inq.id ? { ...x, status: "replied", isNew: false } : x)));
      window.location.href = `mailto:${inq.email}?subject=${encodeURIComponent(t("replySubject"))}`;
    });
  }

  function convert(inq: InquiryItem) {
    setErr(null);
    start(async () => {
      const r = await convertInquiry(inq.id);
      if (r.ok && r.weddingId) router.push(`/wedding/${r.weddingId}`);
      else setErr(t("convertError"));
    });
  }

  function archive(inq: InquiryItem) {
    start(async () => {
      await archiveInquiry(inq.id);
      setList((l) => l.filter((x) => x.id !== inq.id));
      setOpen(null);
    });
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <Heading className="text-[19px]">{t("inquiries")}</Heading>
        {list.some((i) => i.isNew) ? (
          <span className="rounded-[var(--radius)] bg-surface-card px-2.5 py-[3px] text-[11px] font-medium text-[color:var(--color-text-danger)]">{t("inquiriesNew", { count: list.filter((i) => i.isNew).length })}</span>
        ) : null}
      </div>
      <p className="mb-3 mt-0.5 text-[12.5px] text-text-meta">{t("inquiriesHint")}</p>
      {list.length === 0 ? (
        <p className="py-4 text-center font-accent text-[15px] text-text-meta">{t("inquiriesEmpty")}</p>
      ) : (
        list.map((inq) => (
          <button key={inq.id} onClick={() => { setErr(null); setOpen(inq); }} className="block w-full text-left">
            <div className="-mx-2 flex items-center gap-3 rounded-[var(--radius)] px-2 py-2 hover:bg-surface-card">
              <Monogram initials={initials(inq)} size={28} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[14px] font-medium text-text-primary">
                  {inq.name}
                  {inq.partnerName ? <span className="text-text-meta"> &amp; {inq.partnerName}</span> : null}
                </p>
                <p className="truncate text-[12.5px] text-text-meta">{inq.message}</p>
              </div>
              <span
                className={cx(
                  "shrink-0 rounded-[var(--radius)] px-2.5 py-[3px] text-[11px] font-medium",
                  inq.isNew ? "bg-surface-card text-[color:var(--color-text-danger)]" : "bg-surface-card text-taupe",
                )}
              >
                {inq.isNew ? t("statusNew") : t("statusReplied")}
              </span>
            </div>
          </button>
        ))
      )}

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-surface-chrome/30 p-0 sm:items-center sm:p-6" onClick={() => setOpen(null)}>
          <div className="w-full max-w-md rounded-t-2xl bg-surface-card p-6 sm:rounded-[var(--radius)]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-[22px] text-text-primary">
                  {open.name}
                  {open.partnerName ? <span className="text-taupe"> &amp; {open.partnerName}</span> : null}
                </h3>
                <p className="mt-0.5 text-[12.5px] text-text-meta">
                  {open.email}
                  {open.phone ? ` · ${open.phone}` : ""}
                  {open.weddingDate ? ` · ${open.weddingDate}` : ""}
                </p>
              </div>
              <button onClick={() => setOpen(null)} className="text-[18px] text-text-meta hover:text-text-primary" aria-label={t("close")}>×</button>
            </div>
            <p className="mb-5 whitespace-pre-wrap rounded-[var(--radius)] bg-surface-card p-4 font-accent text-[16px] leading-relaxed text-text-primary-soft">{open.message}</p>
            {err ? <p className="mb-3 text-[13px] text-[color:var(--color-text-danger)]">{err}</p> : null}
            <div className="flex flex-wrap items-center gap-2.5">
              <Button onClick={() => convert(open)} disabled={pending}>{t("convert")}</Button>
              <Button variant="ghost" onClick={() => reply(open)} disabled={pending}>{t("reply")}</Button>
              <button onClick={() => archive(open)} disabled={pending} className="ml-auto text-[13px] text-text-meta hover:text-[color:var(--color-text-danger)] disabled:opacity-50">
                {t("archive")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
