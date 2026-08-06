"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { cx } from "@/components/ui";
import { toggleInvited } from "@/app/[locale]/(app)/wedding/[id]/guest-actions";

type Row = { guest_id: string; full_name: string; invited: boolean; rsvp_status: string };
const RSVP_TONE: Record<string, string> = { yes: "text-teal", no: "text-[color:var(--color-text-danger)]", maybe: "text-taupe", pending: "text-text-meta" };

export function EventPruning({ weddingId, eventId, rows, readOnly }: { weddingId: string; eventId: string; rows: Row[]; readOnly: boolean }) {
  const t = useTranslations("guests");
  return (
    <div className="flex flex-col">
      <p className="mb-2 font-accent text-[14px] text-text-meta">{t("prunedHint")}</p>
      {rows.map((r) => <PruneRow key={r.guest_id} weddingId={weddingId} eventId={eventId} row={r} readOnly={readOnly} />)}
    </div>
  );
}

function PruneRow({ weddingId, eventId, row, readOnly }: { weddingId: string; eventId: string; row: Row; readOnly: boolean }) {
  const t = useTranslations("guests");
  const [invited, setInvited] = useState(row.invited);
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center gap-3 py-2 [box-shadow:inset_0_-1px_0_var(--color-hairline)] last:shadow-none">
      <span className={cx("flex-1 text-[14px]", invited ? "text-text-primary" : "text-text-meta line-through")}>{row.full_name}</span>
      {invited ? <span className={cx("font-accent text-[13px]", RSVP_TONE[row.rsvp_status])}>{t(row.rsvp_status)}</span> : null}
      {readOnly ? null : (
        <button
          disabled={pending}
          onClick={() => start(async () => { const next = !invited; setInvited(next); await toggleInvited(eventId, row.guest_id, weddingId, next); })}
          className={cx("shrink-0 rounded-[var(--radius)] px-3 py-1 text-[12.5px]", invited ? "bg-surface-chrome text-bone" : "bg-surface-card text-text-meta")}
        >
          {t("invitedToggle")}
        </button>
      )}
    </div>
  );
}
