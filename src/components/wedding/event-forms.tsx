"use client";

import { useActionState, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button, Pill, cx } from "@/components/ui";
import { addEvent, updateEvent, deleteEvent, type EventState } from "@/app/[locale]/(app)/wedding/[id]/actions";
import { formatTime, type EventKind, type EventRow } from "@/lib/wedding";

const KINDS: EventKind[] = ["ceremony", "reception", "dinner", "party", "ritual", "other"];
const inputCls = "rounded-[var(--radius)] bg-bone px-3 py-2 text-[14px] text-ink outline-none";

function Fields({ e, t, defaultOrderIndex = 0 }: { e?: EventRow; t: (k: string) => string; defaultOrderIndex?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="col-span-2 flex flex-col gap-1">
        <span className="text-[12px] text-muted">{t("label")}</span>
        <input name="label" required maxLength={120} defaultValue={e?.label ?? ""} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[12px] text-muted">{t("kind")}</span>
        <select name="kind" defaultValue={e?.kind ?? "other"} className={inputCls}>
          {KINDS.map((k) => <option key={k} value={k}>{t(`kinds.${k}`)}</option>)}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[12px] text-muted">{t("date")}</span>
        <input type="date" name="event_date" defaultValue={e?.event_date ?? ""} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[12px] text-muted">{t("startTime")}</span>
        <input type="time" name="start_time" defaultValue={e?.start_time?.slice(0, 5) ?? ""} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[12px] text-muted">{t("endTime")}</span>
        <input type="time" name="end_time" defaultValue={e?.end_time?.slice(0, 5) ?? ""} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[12px] text-muted">{t("guestTarget")}</span>
        <input name="guest_target" inputMode="numeric" defaultValue={e?.guest_target ?? ""} className={inputCls} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-[12px] text-muted">{t("orderIndex")}</span>
        <input name="order_index" inputMode="numeric" defaultValue={e?.order_index ?? defaultOrderIndex} className={inputCls} />
      </label>
    </div>
  );
}

export function AddEventForm({ weddingId, nextOrderIndex = 0 }: { weddingId: string; nextOrderIndex?: number }) {
  const t = useTranslations("event");
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<EventState, FormData>(addEvent.bind(null, weddingId), null);
  if (state?.ok && open) setOpen(false);

  if (!open) return <Button variant="ghost" onClick={() => setOpen(true)}>+ {t("add")}</Button>;
  return (
    <form action={action} className="flex flex-col gap-3 rounded-[var(--radius)] bg-bone p-4">
      <p className="font-display text-[16px] text-ink">{t("addTitle")}</p>
      <Fields t={t} defaultOrderIndex={nextOrderIndex} />
      {state?.error ? <p className="text-[13px] text-wine">{t("error")}</p> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{t("save")}</Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
      </div>
    </form>
  );
}

export function EventEditor({
  weddingId,
  event,
  multi,
  linkToPage = false,
}: {
  weddingId: string;
  event: EventRow;
  multi: boolean;
  linkToPage?: boolean;
}) {
  const t = useTranslations("event");
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [state, action, pending] = useActionState<EventState, FormData>(
    updateEvent.bind(null, event.id, weddingId),
    null,
  );
  if (state?.ok && editing) setEditing(false);

  function onDelete() {
    setErr(null);
    startTransition(async () => {
      const r = await deleteEvent(event.id, weddingId);
      if (r?.error === "last_event") setErr(t("lastEventError"));
      else if (r?.error) setErr(t("error"));
    });
  }

  const times = [formatTime(event.start_time, locale), formatTime(event.end_time, locale)].filter(Boolean).join(" – ");
  const label = linkToPage && multi ? (
    <Link href={`/wedding/${weddingId}/event/${event.id}`} className="font-display text-[16px] text-ink hover:text-taupe">
      {event.label}
    </Link>
  ) : (
    <span className="font-display text-[16px] text-ink">{event.label}</span>
  );

  if (editing) {
    return (
      <form action={action} className="flex flex-col gap-3 rounded-[var(--radius)] bg-bone p-4">
        <Fields e={event} t={t} />
        {state?.error ? <p className="text-[13px] text-wine">{t("error")}</p> : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>{t("save")}</Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>{t("cancel")}</Button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 py-3 [box-shadow:inset_0_-1px_0_var(--color-hairline)] last:shadow-none">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {label}
          <Pill tone="sand">{t(`kinds.${event.kind}`)}</Pill>
        </div>
        <p className="font-accent text-[14.5px] text-muted">
          {event.event_date ?? t("undated")}
          {times ? ` · ${times}` : ""}
          {event.guest_target ? ` · ${event.guest_target}` : ""}
        </p>
        {err ? <p className="mt-1 text-[13px] text-wine">{err}</p> : null}
      </div>
      <div className="flex shrink-0 gap-1">
        <button onClick={() => setEditing(true)} className="rounded-[var(--radius)] px-3 py-1 text-[13px] text-muted hover:text-ink">{t("edit")}</button>
        <button onClick={onDelete} disabled={isPending} className={cx("rounded-[var(--radius)] px-3 py-1 text-[13px] hover:text-wine", isPending ? "text-muted" : "text-muted")}>{t("delete")}</button>
      </div>
    </div>
  );
}

export function EventsPanel({ weddingId, events, multi }: { weddingId: string; events: EventRow[]; multi: boolean }) {
  // A fresh event defaults to the end of the running order, so an untouched
  // Orden never front-runs an existing event even within the same day.
  const nextOrderIndex = events.length ? Math.max(...events.map((e) => e.order_index)) + 1 : 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col">
        {events.map((e) => (
          <EventEditor key={e.id} weddingId={weddingId} event={e} multi={multi} linkToPage />
        ))}
      </div>
      <AddEventForm weddingId={weddingId} nextOrderIndex={nextOrderIndex} />
    </div>
  );
}
