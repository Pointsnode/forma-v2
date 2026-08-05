"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { DESIGN_MEDIA_ACCEPT } from "@/lib/bucket-mime.mjs";
import { addDesignBoard, addDesignItem } from "@/app/[locale]/(app)/wedding/[id]/ops-actions";

const input = "rounded-[var(--radius)] border border-hairline bg-bone px-2.5 py-1.5 text-[13px] outline-none";

export function AddBoard({ weddingId }: { weddingId: string }) {
  const t = useTranslations("ops");
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [pending, start] = useTransition();
  if (!open) return <button onClick={() => setOpen(true)} className="text-[13px] text-muted hover:text-ink">+ {t("addBoard")}</button>;
  return (
    <div className="flex items-end gap-2">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("boardTitle")} className={input} />
      <Button disabled={pending || !title.trim()} onClick={() => start(async () => { await addDesignBoard(weddingId, title); setTitle(""); setOpen(false); })}>{t("addBoard")}</Button>
    </div>
  );
}

export function AddItem({ boardId, weddingId }: { boardId: string; weddingId: string }) {
  const t = useTranslations("ops");
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <button onClick={() => setOpen(true)} className="text-[12px] text-muted hover:text-ink">+ {t("addItem")}</button>;
  return (
    <form action={(fd) => start(async () => { const r = await addDesignItem(boardId, weddingId, fd); if (r.error) setErr(t("uploadError")); else setOpen(false); })} className="flex flex-wrap items-end gap-2">
      <input name="title" required placeholder={t("itemTitle")} className={input} />
      <input name="note" placeholder={t("itemNote")} className={input} />
      <input type="file" name="file" accept={DESIGN_MEDIA_ACCEPT} className="text-[12px]" />
      <Button type="submit" variant="ghost" disabled={pending}>{t("addItem")}</Button>
      {err ? <span className="text-[12px] text-wine">{err}</span> : null}
    </form>
  );
}
