"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { sendTouchpoint } from "@/app/[locale]/(app)/wedding/[id]/ops-actions";

// Staff schedules a guest touchpoint (menu collection · day-of schedules); the cron
// delivers it. Confirmation copy is honest — it's queued, not proof of delivery.
export function SendTouchpoints({ weddingId }: { weddingId: string }) {
  const t = useTranslations("ops");
  const [pending, start] = useTransition();
  const [done, setDone] = useState<string | null>(null);
  const send = (kind: "menu_collect" | "day_of_schedule") => start(async () => { const r = await sendTouchpoint(weddingId, kind); setDone(r.ok ? t("queued") : t("error")); });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="ghost" disabled={pending} onClick={() => send("menu_collect")}>{t("sendMenu")}</Button>
      <Button variant="ghost" disabled={pending} onClick={() => send("day_of_schedule")}>{t("sendSchedules")}</Button>
      {done ? <span className="text-[12.5px] text-taupe">{done}</span> : null}
    </div>
  );
}
