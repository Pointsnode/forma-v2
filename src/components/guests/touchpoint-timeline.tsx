"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { cx } from "@/components/ui";
import { skipTouchpoint } from "@/app/[locale]/(app)/wedding/[id]/guest-actions";
import type { Touchpoint } from "@/lib/guests";

const KIND_KEY: Record<string, string> = {
  save_the_date: "kindSave_the_date", rsvp_invite: "kindRsvp_invite", rsvp_reminder: "kindRsvp_reminder",
  rsvp_close: "kindRsvp_close", menu_collect: "kindMenu_collect", travel_info: "kindTravel_info", day_of_schedule: "kindDay_of_schedule",
};

export function TouchpointTimeline({
  weddingId, touchpoints, reminderChase, readOnly = false,
}: { weddingId: string; touchpoints: Touchpoint[]; reminderChase: number; readOnly?: boolean }) {
  const t = useTranslations("touchpoints");
  const locale = useLocale();
  const [pending, start] = useTransition();
  const fmt = (d: string) => new Intl.DateTimeFormat(locale === "es" ? "es-ES" : "en-US", { month: "short", day: "numeric" }).format(new Date(`${d}T12:00:00Z`));

  if (touchpoints.length === 0) return <p className="font-accent text-[14.5px] text-muted">{t("none")}</p>;

  return (
    <div className="flex flex-col gap-2">
      {touchpoints.map((tp) => {
        const skipped = tp.status === "skipped";
        const sub = tp.status === "sent" ? t("statusSent", { date: fmt(tp.scheduled_for) })
          : tp.status === "sending" ? t("statusSending")
          : skipped ? t("statusSkipped")
          : t("statusScheduled", { date: fmt(tp.scheduled_for) });
        const aud = tp.audience_rule?.scope === "non_responders" ? t("chases", { count: reminderChase }) : t("toAll");
        return (
          <div key={tp.id} className={cx("flex items-start gap-3 rounded-[var(--radius)] bg-bone px-3 py-2.5", skipped && "opacity-50")}>
            <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-[var(--radius)]", tp.status === "sent" ? "bg-teal" : tp.status === "scheduled" ? "bg-champagne" : "bg-hairline")} />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] text-ink">{t(KIND_KEY[tp.kind] ?? "kindRsvp_invite")}</p>
              <p className="font-accent text-[13px] text-muted">{sub} · {aud}</p>
            </div>
            {!readOnly && tp.status !== "sent" ? (
              <button disabled={pending} onClick={() => start(async () => { await skipTouchpoint(tp.id, weddingId, !skipped); })}
                className="shrink-0 rounded-[var(--radius)] px-3 py-1 text-[12.5px] text-muted hover:text-ink">
                {skipped ? t("unskip") : t("skip")}
              </button>
            ) : null}
          </div>
        );
      })}
      <p className="mt-1 font-accent text-[13px] text-muted">{t("tokenNote")}</p>
    </div>
  );
}
