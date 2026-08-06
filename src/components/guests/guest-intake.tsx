"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { parseGuestRows, dedupeGuests } from "@/lib/guest-import.mjs";
import { importGuests } from "@/app/[locale]/(app)/wedding/[id]/guest-actions";

type Existing = { full_name: string; email: string | null; phone: string | null };

export function GuestIntake({ weddingId, existing }: { weddingId: string; existing: Existing[] }) {
  const t = useTranslations("guests");
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const { toAdd, duplicates } = useMemo(() => dedupeGuests(parseGuestRows(text), existing), [text, existing]);

  function commit() {
    if (!toAdd.length) return;
    setErr(null);
    start(async () => {
      const r = await importGuests(weddingId, toAdd);
      if (r.error) setErr(t("error"));
      else { setText(""); setOpen(false); }
    });
  }

  if (!open) return <Button variant="ghost" onClick={() => setOpen(true)}>+ {t("addGuests")}</Button>;
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius)] bg-surface-card p-4">
      <p className="font-display text-[16px] text-text-primary">{t("intakeTitle")}</p>
      <label className="flex flex-col gap-1">
        <span className="text-[12px] text-text-meta">{t("pasteLabel")}</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} placeholder={t("pastePlaceholder")}
          className="w-full rounded-[var(--radius)] bg-surface-card px-3 py-2 font-mono text-[13px] text-text-primary outline-none" />
      </label>
      {text.trim() ? (
        <p className="font-accent text-[14.5px] text-text-meta">
          {t("previewNew", { count: toAdd.length })}
          {duplicates > 0 ? ` · ${t("previewDuplicates", { count: duplicates })}` : ""}
        </p>
      ) : null}
      {err ? <p className="text-[13px] text-[color:var(--color-text-danger)]">{err}</p> : null}
      <div className="flex gap-2">
        <Button onClick={commit} disabled={pending || !toAdd.length}>{t("commit")}</Button>
        <Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
      </div>
    </div>
  );
}
