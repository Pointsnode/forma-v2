"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button, Card, Heading, Badge, Tag, cx } from "@/components/ui";
import {
  addScheduleItem, updateScheduleItem, deleteScheduleItem, checkScheduleItem,
  addMenu, addMenuOption, lockMenu, addTable, assignSeat, unseat, addFloorPlan,
} from "@/app/[locale]/(app)/wedding/[id]/ops-actions";

const input = "rounded-lg bg-bone px-2.5 py-1.5 text-[13px] text-ink shadow-card outline-none";

export type ScheduleItemVM = { id: string; time: string | null; title: string; detail: string | null; done: boolean };
export type MenuVM = { id: string; title: string; locked: boolean; options: { id: string; label: string; diet: string[]; count: number }[] };
export type SeatingVM = {
  plan: { id: string; name: string } | null;
  tables: { id: string; name: string; capacity: number; seated: { guestId: string; name: string }[] }[];
  unseated: { guestId: string; name: string }[];
};

function useRun() {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  return { pending, err, setErr, run: (fn: () => Promise<{ error?: string }>, onErr: (c?: string) => string) => start(async () => { const r = await fn(); setErr(r?.error ? onErr(r.error) : null); }) };
}

// ── Schedule (run of show; live check-off in Phase 4) ────────────────────────
export function ScheduleCard({ weddingId, eventId, items, live }: { weddingId: string; eventId: string; items: ScheduleItemVM[]; live: boolean }) {
  const t = useTranslations("ops");
  const { pending, run } = useRun();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <Card>
      <div className="mb-1 flex items-baseline justify-between">
        <Heading className="text-[18px]">{t("schedule")}</Heading>
        <button onClick={() => setAdding((v) => !v)} className="text-[12.5px] text-muted hover:text-ink">+ {t("addItem")}</button>
      </div>
      <p className="mb-2 text-[12.5px] text-muted">{live ? t("scheduleLive") : t("scheduleDraft")}</p>
      {items.length === 0 ? <p className="py-3 text-center font-accent text-[14px] text-muted">{t("noSchedule")}</p> : null}
      {items.map((it) => editing === it.id ? (
        <form key={it.id} action={(fd) => { run(() => updateScheduleItem(it.id, fd), () => t("error")); setEditing(null); }} className="flex flex-wrap items-end gap-2 py-2.5">
          <input name="time" type="time" defaultValue={it.time?.slice(0, 5) ?? ""} className={input} />
          <input name="title" required defaultValue={it.title} className={cx(input, "w-48")} />
          <input name="detail" defaultValue={it.detail ?? ""} placeholder={t("itemNote")} className={input} />
          <Button type="submit" disabled={pending}>{t("save")}</Button>
          <button type="button" onClick={() => setEditing(null)} className="text-[12px] text-muted">{t("cancel")}</button>
        </form>
      ) : (
        <div key={it.id} className={cx("flex items-center gap-3 py-2.5 not-last:[box-shadow:inset_0_-1px_0_var(--color-hairline)]", it.done && "opacity-55")}>
          {live ? (
            <button onClick={() => run(() => checkScheduleItem(it.id, !it.done), () => t("error"))} disabled={pending}
              className={cx("flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-[11px]", it.done ? "bg-sage text-ink" : "ring-1 ring-hairline")}>{it.done ? "✓" : ""}</button>
          ) : null}
          <span className="w-16 shrink-0 font-accent text-[15px] italic text-taupe">{it.time?.slice(0, 5) ?? ""}</span>
          <div className="min-w-0 flex-1"><p className={cx("text-[13.5px] text-ink", it.done && "line-through")}>{it.title}</p>{it.detail ? <p className="text-[12px] text-muted">{it.detail}</p> : null}</div>
          <button onClick={() => setEditing(it.id)} className="shrink-0 text-[12px] text-muted hover:text-ink">{t("edit")}</button>
          <button onClick={() => run(() => deleteScheduleItem(it.id), () => t("error"))} disabled={pending} className="shrink-0 text-[12px] text-muted hover:text-wine">×</button>
        </div>
      ))}
      {adding ? (
        <form action={(fd) => { run(() => addScheduleItem(weddingId, eventId, fd), () => t("error")); setAdding(false); }} className="mt-3 flex flex-wrap items-end gap-2">
          <input name="time" type="time" className={input} />
          <input name="title" required placeholder={t("itemTitle")} className={cx(input, "w-48")} />
          <input name="detail" placeholder={t("itemNote")} className={input} />
          <Button type="submit" disabled={pending}>{t("add")}</Button>
        </form>
      ) : null}
    </Card>
  );
}

// ── Menus (options + diet tags + counts; lock) ───────────────────────────────
export function MenusCard({ weddingId, eventId, menus }: { weddingId: string; eventId: string; menus: MenuVM[] }) {
  const t = useTranslations("ops");
  const { pending, run } = useRun();
  const [addingMenu, setAddingMenu] = useState(false);
  const [addingOpt, setAddingOpt] = useState<string | null>(null);
  return (
    <Card>
      <div className="mb-2 flex items-baseline justify-between">
        <Heading className="text-[18px]">{t("menus")}</Heading>
        <button onClick={() => setAddingMenu((v) => !v)} className="text-[12.5px] text-muted hover:text-ink">+ {t("addMenu")}</button>
      </div>
      {menus.length === 0 && !addingMenu ? <p className="py-3 text-center font-accent text-[14px] text-muted">{t("noMenu")}</p> : null}
      {menus.map((m) => (
        <div key={m.id} className="mb-3 rounded-xl bg-bone p-3">
          <div className="mb-1.5 flex items-center gap-2">
            <p className="flex-1 font-display text-[15px] text-ink">{m.title}</p>
            {m.locked ? <Badge tone="sage">{t("locked")}</Badge> : null}
            <button onClick={() => run(() => lockMenu(m.id, !m.locked), () => t("error"))} disabled={pending} className="text-[12px] text-muted hover:text-ink">{m.locked ? t("unlock") : t("lock")}</button>
            <button onClick={() => setAddingOpt(addingOpt === m.id ? null : m.id)} className="text-[12px] text-muted hover:text-ink">+ {t("option")}</button>
          </div>
          {m.options.map((o) => (
            <div key={o.id} className="flex items-center gap-2 py-1 text-[13px]">
              <span className="flex-1 text-ink">{o.label}{o.diet.map((d) => <Tag key={d}>{d}</Tag>)}</span>
              <span className="font-accent text-[13px] text-taupe">{t("chosenCount", { count: o.count })}</span>
            </div>
          ))}
          {addingOpt === m.id ? (
            <form action={(fd) => { run(() => addMenuOption(m.id, weddingId, fd), () => t("error")); setAddingOpt(null); }} className="mt-2 flex flex-wrap items-end gap-2">
              <input name="label" required placeholder={t("optionLabel")} className={input} />
              <input name="diet_tags" placeholder={t("dietTags")} className={input} />
              <Button type="submit" variant="ghost" disabled={pending}>{t("add")}</Button>
            </form>
          ) : null}
        </div>
      ))}
      {addingMenu ? (
        <form action={(fd) => { run(() => addMenu(weddingId, eventId, fd), () => t("error")); setAddingMenu(false); }} className="flex flex-wrap items-end gap-2">
          <input name="title" required placeholder={t("menuTitle")} className={input} />
          <Button type="submit" disabled={pending}>{t("addMenu")}</Button>
        </form>
      ) : null}
    </Card>
  );
}

// ── Seating (honest v1: table list + assign/unseat, not a canvas) ────────────
export function SeatingCard({ weddingId, eventId, seating }: { weddingId: string; eventId: string; seating: SeatingVM }) {
  const t = useTranslations("ops");
  const { pending, run } = useRun();
  const [assignTo, setAssignTo] = useState<string | null>(null);
  return (
    <Card>
      <Heading className="mb-1 text-[18px]">{t("seating")}</Heading>
      {!seating.plan ? (
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-muted">{t("noFloorPlan")}</p>
          <Button variant="ghost" disabled={pending} onClick={() => run(() => addFloorPlan(weddingId, eventId, "Main hall"), () => t("error"))}>{t("addFloorPlan")}</Button>
        </div>
      ) : (
        <>
          <p className="mb-2 text-[12.5px] text-muted">{t("seatedCount", { seated: seating.tables.reduce((s, tb) => s + tb.seated.length, 0), total: seating.tables.reduce((s, tb) => s + tb.seated.length, 0) + seating.unseated.length })}</p>
          {seating.tables.map((tb) => (
            <div key={tb.id} className="mb-2 rounded-xl bg-bone p-3">
              <div className="mb-1 flex items-center justify-between">
                <p className="font-display text-[14.5px] text-ink">{tb.name} <span className="text-[12px] text-muted">{tb.seated.length}/{tb.capacity}</span></p>
                <button onClick={() => setAssignTo(assignTo === tb.id ? null : tb.id)} className="text-[12px] text-wine hover:underline">{t("assign")}</button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tb.seated.map((s) => (
                  <button key={s.guestId} onClick={() => run(() => unseat(eventId, s.guestId), () => t("error"))} disabled={pending} className="rounded-full bg-sand-soft px-2.5 py-[2px] text-[11.5px] text-taupe hover:bg-wine-soft hover:text-wine" title={t("unseat")}>{s.name} ×</button>
                ))}
              </div>
              {assignTo === tb.id ? (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {seating.unseated.length === 0 ? <span className="text-[12px] text-muted">{t("allSeated")}</span> : null}
                  {seating.unseated.map((u) => (
                    <button key={u.guestId} onClick={() => run(() => assignSeat(eventId, u.guestId, tb.id), () => t("error"))} disabled={pending} className="rounded-full bg-ink px-2.5 py-[2px] text-[11.5px] text-bone">{u.name}</button>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
          <form action={(fd) => run(() => addTable(seating.plan!.id, weddingId, fd), () => t("error"))} className="mt-2 flex flex-wrap items-end gap-2">
            <input name="name" required placeholder={t("tableName")} className={input} />
            <input name="capacity" inputMode="numeric" placeholder={t("capacity")} className={cx(input, "w-24")} />
            <Button type="submit" variant="ghost" disabled={pending}>{t("addTable")}</Button>
          </form>
        </>
      )}
    </Card>
  );
}
