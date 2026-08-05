"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { WEDDING_DOCS_ACCEPT } from "@/lib/bucket-mime.mjs";
import { uploadDocument } from "@/app/[locale]/(app)/wedding/[id]/ops-actions";

export function DocUpload({ weddingId }: { weddingId: string }) {
  const t = useTranslations("ops");
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return (
    <form action={(fd) => start(async () => { const r = await uploadDocument(weddingId, fd); setErr(r.error ? t("uploadError") : null); })} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col gap-1"><span className="text-[11px] text-muted">{t("docTitle")}</span><input name="title" required className="rounded-[var(--radius)] bg-bone px-2.5 py-1.5 text-[13px] outline-none" /></label>
      <input type="file" name="file" required accept={WEDDING_DOCS_ACCEPT} className="text-[12.5px]" />
      <Button type="submit" variant="ghost" disabled={pending}>{t("upload")}</Button>
      {err ? <span className="text-[12px] text-wine">{err}</span> : null}
    </form>
  );
}
