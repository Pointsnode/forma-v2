"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button, cx } from "@/components/ui";
import { addDayOfExtra, closeWedding, advancePhase } from "@/app/[locale]/(app)/wedding/[id]/ops-actions";

const input = "rounded-[var(--radius)] border border-hairline-token bg-surface-card px-2.5 py-1.5 text-[13px] outline-none";

export function AdvanceToDays({ weddingId }: { weddingId: string }) {
  const t = useTranslations("ops");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <Button disabled={pending} onClick={() => start(async () => { const r = await advancePhase(weddingId); setErr(r.error === "FV301" ? t("notArrived") : r.error ? t("error") : null); })}>{t("advanceToDays")}</Button>
      {err ? <span className="text-[12.5px] text-[color:var(--color-text-danger)]">{err}</span> : null}
    </span>
  );
}

export function DayOfExtra({ weddingId }: { weddingId: string }) {
  const t = useTranslations("ops");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <form action={(fd) => start(async () => { const r = await addDayOfExtra(weddingId, null, fd); setErr(r.error ? t("error") : null); })} className="flex flex-wrap items-end gap-2">
      <input name="title" required placeholder={t("extraTitle")} className={cx(input, "w-56")} />
      <input name="amount" inputMode="numeric" required placeholder={t("amount")} className={cx(input, "w-28")} />
      <Button type="submit" variant="ghost" disabled={pending}>{t("addExtra")}</Button>
      {err ? <span className="text-[12px] text-[color:var(--color-text-danger)]">{err}</span> : null}
    </form>
  );
}

export function CloseButton({ weddingId, blocked }: { weddingId: string; blocked: boolean }) {
  const t = useTranslations("ops");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const msg = (c?: string) => (c === "FV403" ? t("closeOpenLines") : c === "FV402" ? t("closeFutureEvents") : t("error"));
  return (
    <span className="flex items-center gap-2">
      <button disabled={pending || blocked} onClick={() => start(async () => { const r = await closeWedding(weddingId); setErr(r.error ? msg(r.error) : null); })}
        className="rounded-[var(--radius)] bg-surface-chrome px-5 py-2.5 text-[14px] font-medium text-bone transition-opacity hover:opacity-90 disabled:opacity-50">{t("closeWedding")}</button>
      {err ? <span className="text-[12.5px] text-[color:var(--color-text-danger)]">{err}</span> : null}
    </span>
  );
}
