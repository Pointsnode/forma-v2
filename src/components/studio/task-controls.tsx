"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button, cx } from "@/components/ui";
import { addTask, toggleTask } from "@/app/[locale]/(app)/wedding/[id]/ops-actions";

const input = "rounded-lg bg-bone px-2.5 py-1.5 text-[13px] shadow-card outline-none";

export function AddTask({ workspaceId, weddings }: { workspaceId: string; weddings: { id: string; name: string }[] }) {
  const t = useTranslations("ops");
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  if (!open) return <button onClick={() => setOpen(true)} className="text-[13px] text-muted hover:text-ink">+ {t("addTask")}</button>;
  return (
    <form action={(fd) => start(async () => { await addTask(fd); setOpen(false); })} className="flex flex-wrap items-end gap-2">
      <input name="title" required placeholder={t("taskTitle")} className={cx(input, "w-56")} />
      <input name="due_date" type="date" className={input} />
      <select name="wedding_id" className={input}>
        <option value="">{t("studioTask")}</option>
        {weddings.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
      </select>
      <input type="hidden" name="workspace_id" value={workspaceId} />
      <Button type="submit" disabled={pending}>{t("addTask")}</Button>
    </form>
  );
}

export function TaskToggle({ taskId, done }: { taskId: string; done: boolean }) {
  const [pending, start] = useTransition();
  return (
    <button onClick={() => start(async () => { await toggleTask(taskId, !done); })} disabled={pending}
      className={cx("flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px]", done ? "bg-sage text-ink" : "ring-1 ring-hairline")}>{done ? "✓" : ""}</button>
  );
}
