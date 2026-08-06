"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button, cx } from "@/components/ui";
import { setRsvpDeadline, setRsvpOpen } from "@/app/[locale]/(app)/wedding/[id]/guest-actions";

export function RsvpControls({ weddingId, deadline, open }: { weddingId: string; deadline: string | null; open: boolean }) {
  const t = useTranslations("guests");
  const [date, setDate] = useState(deadline ?? "");
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className={cx("h-2 w-2 rounded-[var(--radius)]", open ? "bg-teal" : "bg-[color:var(--color-hairline-token)]")} />
        <span className="text-[14px] text-text-primary">{open ? t("rsvpIsOpen") : t("rsvpIsClosed")}</span>
        <Button className="ml-auto" variant={open ? "ghost" : "solid"} disabled={pending}
          onClick={() => start(async () => { await setRsvpOpen(weddingId, !open); })}>
          {open ? t("rsvpIsClosed") : t("openRsvp")}
        </Button>
      </div>
      <label className="flex items-center gap-2">
        <span className="text-[13px] text-text-meta">{t("deadline")}</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="rounded-[var(--radius)] bg-surface-card px-3 py-2 text-[14px] text-text-primary outline-none" />
        <Button variant="ghost" disabled={pending} onClick={() => start(async () => { await setRsvpDeadline(weddingId, date || null); })}>
          {t("setDeadline")}
        </Button>
      </label>
      <p className="font-accent text-[13.5px] text-text-meta">{t("openHint")}</p>
    </div>
  );
}
