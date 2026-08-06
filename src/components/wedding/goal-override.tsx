"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { setGoalOverride } from "@/app/[locale]/(app)/wedding/[id]/ops-actions";

// Mark-done / dismiss on a goal detection can't see (detection auto-wins upward).
export function GoalOverride({ weddingId, goalKey, current }: { weddingId: string; goalKey: string; current: "manual_done" | "dismissed" | null }) {
  const t = useTranslations("ops");
  const [pending, start] = useTransition();
  const set = (status: "manual_done" | "dismissed" | null) => start(async () => { await setGoalOverride(weddingId, goalKey, status, ""); });
  if (current) return <button onClick={() => set(null)} disabled={pending} className="text-[11.5px] text-text-meta hover:text-text-primary">{t("undoOverride")}</button>;
  return (
    <span className="flex gap-2">
      <button onClick={() => set("manual_done")} disabled={pending} className="text-[11.5px] text-teal hover:underline">{t("markDone")}</button>
      <button onClick={() => set("dismissed")} disabled={pending} className="text-[11.5px] text-text-meta hover:text-text-primary">{t("dismiss")}</button>
    </span>
  );
}
