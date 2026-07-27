"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button, cx } from "@/components/ui";
import { addLedgerLine, setLineStatus, payPlannerFee } from "@/app/[locale]/(app)/wedding/[id]/money-actions";

const input = "rounded-lg bg-bone px-2.5 py-1.5 text-[13px] text-ink shadow-card outline-none";

// Couple pays a due planner_fee line → hosted Stripe Checkout (redirect).
export function PayButton({ lineId }: { lineId: string }) {
  const t = useTranslations("money");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <button
        disabled={pending}
        onClick={() => start(async () => {
          const r = await payPlannerFee(lineId);
          if (r.url) window.location.href = r.url;
          else setErr(r.error === "notConfigured" ? t("notConfigured") : t("error"));
        })}
        className="rounded-full bg-wine px-4 py-1.5 text-[12.5px] font-medium text-bone transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {t("pay")}
      </button>
      {err ? <span className="text-[12px] text-wine">{err}</span> : null}
    </span>
  );
}

// Staff moves a tracked line to paid (planner_fee is Stripe-only, guarded server-side).
export function MarkPaid({ lineId }: { lineId: string }) {
  const t = useTranslations("money");
  const [pending, start] = useTransition();
  return (
    <Button variant="ghost" disabled={pending} onClick={() => start(async () => { await setLineStatus(lineId, "paid"); })}>
      {t("markPaid")}
    </Button>
  );
}

export function AddLineForm({ weddingId }: { weddingId: string }) {
  const t = useTranslations("money");
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <button onClick={() => setOpen(true)} className="text-[13px] text-muted hover:text-ink hover:underline hover:underline-offset-2">+ {t("addLine")}</button>;
  return (
    <form
      action={(fd) => start(async () => { const r = await addLedgerLine(weddingId, fd); if (r.error) setErr(t("error")); else { setOpen(false); setErr(null); } })}
      className="flex flex-wrap items-end gap-2"
    >
      <label className="flex flex-col gap-1"><span className="text-[11px] text-muted">{t("lineTitle")}</span><input name="title" required className={cx(input, "w-56")} /></label>
      <label className="flex flex-col gap-1"><span className="text-[11px] text-muted">{t("amount")}</span><input name="amount" inputMode="numeric" required className={cx(input, "w-28")} /></label>
      <label className="flex flex-col gap-1"><span className="text-[11px] text-muted">{t("dueDate")}</span><input name="due_date" type="date" className={input} /></label>
      <Button type="submit" disabled={pending}>{t("addLine")}</Button>
      {err ? <span className="text-[12px] text-wine">{err}</span> : null}
    </form>
  );
}
