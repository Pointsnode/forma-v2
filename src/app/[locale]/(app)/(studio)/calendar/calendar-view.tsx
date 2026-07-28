"use client";

import { useMemo, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Card, Heading, Button, cx } from "@/components/ui";
import type { CalEntry } from "@/lib/calendar";
import { monthMatrix, bucketByDate, yearDensity, filterEntries } from "@/lib/calendar-grid.mjs";
import { disconnectCalendly } from "./actions";

type Species = "meeting" | "wedding" | "task";
const SPECIES: Species[] = ["meeting", "wedding", "task"];

// species chip colours — meeting=ink, wedding=sand, task=sage (mirrors the badge family)
const DOT: Record<Species, string> = { meeting: "bg-ink", wedding: "bg-sand", task: "bg-sage" };
const CHIP: Record<Species, string> = {
  meeting: "bg-ink text-bone",
  wedding: "bg-sand-soft text-taupe",
  task: "bg-sage-soft text-sage-ink",
};

export function CalendarView({
  entries,
  timezone,
  connected,
  userUri,
  todayKey,
  weekStart,
  configured,
  locale,
  banner,
}: {
  entries: CalEntry[];
  timezone: string;
  connected: boolean;
  userUri: string | null;
  todayKey: string;
  weekStart: number;
  configured: boolean;
  locale: string;
  banner: string | null;
}) {
  const t = useTranslations("calendar");
  const router = useRouter();
  const [pending, start] = useTransition();

  const [ty, tm] = todayKey.split("-").map(Number);
  const [view, setView] = useState<"month" | "year">("month");
  const [cursor, setCursor] = useState({ year: ty, month0: tm - 1 });
  const [species, setSpecies] = useState<Set<Species>>(new Set());
  const [weddingIds, setWeddingIds] = useState<Set<string>>(new Set());
  const [daySheet, setDaySheet] = useState<string | null>(null);
  const [meetingSheet, setMeetingSheet] = useState<CalEntry | null>(null);

  const filtered = useMemo<CalEntry[]>(() => filterEntries(entries, { species, weddingIds }), [entries, species, weddingIds]);
  const buckets = useMemo<Map<string, CalEntry[]>>(() => bucketByDate(filtered), [filtered]);
  const weeks = useMemo(() => monthMatrix(cursor.year, cursor.month0, weekStart), [cursor, weekStart]);

  // wedding filter chips — distinct weddings present as wedding-day entries
  const weddings = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entries) if (e.species === "wedding" && e.weddingId) m.set(e.weddingId, e.tag ?? "·");
    return [...m.entries()].map(([id, tag]) => ({ id, tag }));
  }, [entries]);

  const monthLabel = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(cursor.year, cursor.month0, 1)));
  const weekdays = Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 7 + ((weekStart + i) % 7)))));
  const fmtTime = (iso?: string | null) => (iso ? new Intl.DateTimeFormat(locale, { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : "");
  const fmtFull = (iso?: string | null) => (iso ? new Intl.DateTimeFormat(locale, { timeZone: timezone, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : "");

  function toggleSpecies(s: Species) {
    setSpecies((prev) => { const n = new Set(prev); if (n.has(s)) n.delete(s); else n.add(s); return n; });
  }
  function toggleWedding(id: string) {
    setWeddingIds((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function step(delta: number) {
    setCursor((c) => {
      if (view === "year") return { ...c, year: c.year + delta };
      const m = c.month0 + delta;
      return { year: c.year + Math.floor(m / 12), month0: ((m % 12) + 12) % 12 };
    });
  }
  function goToday() { setCursor({ year: ty, month0: tm - 1 }); setView("month"); }

  function openEntry(e: CalEntry) {
    if (e.species === "meeting") setMeetingSheet(e);
    else if (e.species === "wedding") router.push(`/wedding/${e.weddingId}/event/${e.eventId}`);
    else if (e.href) router.push(e.href);
  }

  function EntryChip({ e, compact = false }: { e: CalEntry; compact?: boolean }) {
    const canceled = e.species === "meeting" && e.status === "canceled";
    return (
      <button
        onClick={() => openEntry(e)}
        className={cx("flex w-full items-center gap-1 truncate rounded-[6px] px-1.5 py-[3px] text-left text-[11px] leading-tight", CHIP[e.species], canceled && "opacity-60")}
        title={e.title}
      >
        {e.species === "meeting" && e.startAt ? <span className={cx("shrink-0 tabular-nums", canceled && "line-through")}>{fmtTime(e.startAt)}</span> : null}
        {e.species === "wedding" ? <span className="shrink-0 font-accent italic">{e.tag}</span> : null}
        <span className={cx("truncate", canceled && "line-through")}>{compact ? e.title : e.species === "meeting" ? e.invitee ?? e.title : e.title}</span>
      </button>
    );
  }

  const density = useMemo(() => yearDensity(filtered, cursor.year), [filtered, cursor.year]);

  return (
    <div>
      {banner ? (
        <div className={cx("mb-4 rounded-xl px-4 py-2.5 text-[13px]", banner === "connected" ? "bg-sage-soft text-sage-ink" : "bg-wine-soft text-wine")}>
          {banner === "connected" ? t("bannerConnected") : t("bannerError")}
        </div>
      ) : null}

      {/* Connect card */}
      <ConnectCard connected={connected} configured={configured} userUri={userUri} pending={pending} onDisconnect={() => start(async () => { await disconnectCalendly(); router.refresh(); })} />

      {/* Controls */}
      <div className="mb-3 mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => step(-1)} className="rounded-full px-2.5 py-1 text-[15px] text-muted hover:bg-bone hover:text-ink" aria-label={t("prev")}>‹</button>
          <span className="min-w-[9rem] text-center font-display text-[20px] capitalize text-ink">{view === "month" ? monthLabel : cursor.year}</span>
          <button onClick={() => step(1)} className="rounded-full px-2.5 py-1 text-[15px] text-muted hover:bg-bone hover:text-ink" aria-label={t("next")}>›</button>
          <button onClick={goToday} className="ml-1 rounded-full bg-bone px-3 py-1 text-[12px] text-ink hover:bg-sand-soft">{t("today")}</button>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-bone p-0.5">
          {(["month", "year"] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={cx("rounded-full px-3 py-1 text-[12.5px]", view === v ? "bg-ink text-bone" : "text-muted hover:text-ink")}>{t(v)}</button>
          ))}
        </div>
      </div>

      {/* Filter row */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {SPECIES.map((s) => {
          const on = species.size === 0 || species.has(s);
          return (
            <button key={s} onClick={() => toggleSpecies(s)} className={cx("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] transition-colors", species.has(s) ? "bg-ink text-bone" : "bg-bone text-muted hover:text-ink")}>
              <span className={cx("h-2 w-2 rounded-full", DOT[s], !on && "opacity-40")} />
              {t(`species_${s}`)}
            </button>
          );
        })}
        {weddings.length > 0 ? <span className="mx-1 h-4 w-px bg-hairline" /> : null}
        {weddings.map((w) => (
          <button key={w.id} onClick={() => toggleWedding(w.id)} className={cx("inline-flex h-7 w-7 items-center justify-center rounded-full font-accent text-[12px] italic transition-colors", weddingIds.has(w.id) ? "bg-ink text-bone" : "bg-bone text-taupe ring-1 ring-hairline hover:text-ink")} title={t("filterWedding")}>
            {w.tag}
          </button>
        ))}
      </div>

      {view === "month" ? (
        <>
          {/* Month grid (sm+) */}
          <Card className="hidden p-0 sm:block">
            <div className="grid grid-cols-7 border-b border-hairline">
              {weekdays.map((d, i) => <div key={i} className="px-2 py-2 text-center text-[11px] uppercase tracking-[0.12em] text-muted">{d}</div>)}
            </div>
            <div className="grid grid-cols-7">
              {weeks.flat().map((cell, i) => {
                const items = buckets.get(cell.key) ?? [];
                const isToday = cell.key === todayKey;
                return (
                  <div key={i} className={cx("min-h-[104px] border-b border-r border-hairline p-1.5 last:border-r-0 [&:nth-child(7n)]:border-r-0", !cell.inMonth && "bg-bone/40")}>
                    <div className={cx("mb-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-[11.5px]", isToday ? "bg-ink text-bone" : cell.inMonth ? "text-ink" : "text-muted")}>
                      {Number(cell.key.slice(8, 10))}
                    </div>
                    <div className="space-y-0.5">
                      {items.slice(0, 3).map((e) => <EntryChip key={e.id} e={e} />)}
                      {items.length > 3 ? <button onClick={() => setDaySheet(cell.key)} className="w-full rounded-[6px] px-1.5 py-[2px] text-left text-[11px] text-muted hover:bg-bone">{t("more", { n: items.length - 3 })}</button> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Mobile agenda */}
          <div className="space-y-3 sm:hidden">
            {weeks.flat().filter((c) => c.inMonth && (buckets.get(c.key)?.length ?? 0) > 0).map((c) => (
              <Card key={c.key} className="p-4">
                <p className={cx("mb-2 font-display text-[16px]", c.key === todayKey ? "text-ink" : "text-ink")}>
                  {new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${c.key}T00:00:00Z`))}
                </p>
                <div className="space-y-1">{(buckets.get(c.key) ?? []).map((e) => <EntryChip key={e.id} e={e} />)}</div>
              </Card>
            ))}
            {weeks.flat().every((c) => !c.inMonth || (buckets.get(c.key)?.length ?? 0) === 0) ? (
              <p className="py-10 text-center font-accent text-[16px] italic text-muted">{t("emptyMonth")}</p>
            ) : null}
          </div>
        </>
      ) : (
        /* Year view — 12 mini-months with density dots */
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 12 }, (_, m0) => {
            const d = density[m0];
            const total = d.meeting + d.wedding + d.task;
            return (
              <button key={m0} onClick={() => { setCursor({ year: cursor.year, month0: m0 }); setView("month"); }} className="rounded-2xl bg-paper p-4 text-left shadow-card transition-shadow hover:shadow-lift">
                <p className="font-display text-[16px] capitalize text-ink">{new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(cursor.year, m0, 1)))}</p>
                {total === 0 ? (
                  <p className="mt-2 text-[12px] text-muted">{t("quiet")}</p>
                ) : (
                  <div className="mt-2.5 flex flex-wrap gap-1">
                    {SPECIES.flatMap((s) => Array.from({ length: Math.min(d[s], 8) }, (_, i) => <span key={`${s}-${i}`} className={cx("h-2 w-2 rounded-full", DOT[s])} />))}
                    {total > 24 ? <span className="text-[11px] text-muted">+{total}</span> : null}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Day sheet (overflow) */}
      {daySheet ? (
        <Overlay onClose={() => setDaySheet(null)}>
          <h3 className="mb-3 font-display text-[20px] text-ink">{new Intl.DateTimeFormat(locale, { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(new Date(`${daySheet}T00:00:00Z`))}</h3>
          <div className="space-y-1">{(buckets.get(daySheet) ?? []).map((e) => <EntryChip key={e.id} e={e} compact />)}</div>
        </Overlay>
      ) : null}

      {/* Meeting sheet */}
      {meetingSheet ? (
        <Overlay onClose={() => setMeetingSheet(null)}>
          <div className="mb-1 flex items-center gap-2">
            <h3 className="font-display text-[22px] text-ink">{meetingSheet.invitee ?? t("meeting")}</h3>
            {meetingSheet.status === "canceled" ? <span className="rounded-full bg-wine-soft px-2.5 py-[3px] text-[11px] font-medium text-wine">{t("canceled")}</span> : null}
          </div>
          {meetingSheet.eventType ? <p className="font-accent text-[16px] italic text-taupe">{meetingSheet.eventType}</p> : null}
          <p className={cx("mt-2 text-[14px] text-ink-soft", meetingSheet.status === "canceled" && "line-through")}>{fmtFull(meetingSheet.startAt)}</p>
          {meetingSheet.email ? <p className="mt-1 text-[13px] text-muted">{meetingSheet.email}</p> : null}
          <div className="mt-4 flex flex-wrap gap-2.5">
            {meetingSheet.status !== "canceled" && meetingSheet.joinUrl ? <a href={meetingSheet.joinUrl} target="_blank" rel="noreferrer" className="rounded-full bg-ink px-4 py-2 text-[13px] font-medium text-bone hover:opacity-90">{t("join")}</a> : null}
            {meetingSheet.status !== "canceled" && meetingSheet.rescheduleUrl ? <a href={meetingSheet.rescheduleUrl} target="_blank" rel="noreferrer" className="rounded-full border border-ink px-4 py-2 text-[13px] text-ink hover:bg-bone">{t("reschedule")}</a> : null}
            {meetingSheet.cancelUrl && meetingSheet.status !== "canceled" ? <a href={meetingSheet.cancelUrl} target="_blank" rel="noreferrer" className="ml-auto self-center text-[12.5px] text-muted hover:text-wine">{t("cancelMeeting")}</a> : null}
          </div>
        </Overlay>
      ) : null}
    </div>
  );
}

function ConnectCard({ connected, configured, userUri, pending, onDisconnect }: { connected: boolean; configured: boolean; userUri: string | null; pending: boolean; onDisconnect: () => void }) {
  const t = useTranslations("calendar");
  return (
    <Card className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-2.5">
          <Heading className="text-[17px]">{t("calendlyTitle")}</Heading>
          <span className={cx("rounded-full px-2.5 py-[3px] text-[11px] font-medium", connected ? "bg-sage-soft text-sage-ink" : "bg-sand-soft text-taupe")}>{connected ? t("connected") : t("notConnected")}</span>
        </div>
        <p className="mt-1 text-[12.5px] text-muted">
          {!configured ? t("notConfigured") : connected ? t("connectedAs", { who: userUri?.split("/").pop() ?? "" }) : t("connectHint")}
        </p>
      </div>
      {configured ? (
        connected ? (
          <Button variant="ghost" onClick={onDisconnect} disabled={pending}>{t("disconnect")}</Button>
        ) : (
          // A full-document navigation into the OAuth API route — deliberately not a
          // next/link (Link would soft-navigate/prefetch and break the redirect flow).
          // eslint-disable-next-line @next/next/no-html-link-for-pages
          <a href="/api/calendly/connect" className="inline-flex items-center justify-center rounded-full bg-ink px-5 py-2.5 text-[14px] font-medium text-bone hover:opacity-90">{t("connect")}</a>
        )
      ) : null}
    </Card>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-paper p-6 shadow-lift sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}
