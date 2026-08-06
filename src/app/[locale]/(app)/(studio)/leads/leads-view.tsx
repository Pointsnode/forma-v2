"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Chip, Button, cx } from "@/components/ui";
import { convertLead } from "./leads-actions";

export type LeadRow = {
  id: string;
  couple_display: string;
  date_feel: string | null;
  date_start: string | null;
  city: string | null;
  guest_feel: string | null;
  source: string;
  source_note: string | null;
  stage: string;
  lost_reason: string | null;
  next_step: string | null;
  next_step_at: string | null;
  consult_at: string | null;
  consult_confirmed: boolean;
  wedding_id: string | null;
};

function daysLate(nextAt: string, today: string): number {
  return Math.round((Date.parse(today) - Date.parse(nextAt)) / 86_400_000);
}

// The next-step line (or the one oxblood chip): consultation-today-unconfirmed is the surface's
// single written urgency rule; otherwise taupe normally, danger-token when the step is overdue.
function NextStep({ lead, today }: { lead: LeadRow; today: string }) {
  const t = useTranslations("leads");
  const consultDay = lead.consult_at ? lead.consult_at.slice(0, 10) : null;
  if (consultDay === today && !lead.consult_confirmed) {
    return <Chip tone="urgent">{t("consultTodayUnconfirmed")}</Chip>;
  }
  if (!lead.next_step) return <span className="text-[11px] text-text-meta">{t("needsNextStep")}</span>;
  const overdue = lead.next_step_at && lead.next_step_at < today;
  return (
    <span className={cx("text-[11px]", overdue ? "text-[color:var(--color-text-danger)]" : "text-taupe")}>
      {lead.next_step}{overdue ? ` · ${t("dLate", { days: daysLate(lead.next_step_at!, today) })}` : ""}
    </span>
  );
}

function SourceChip({ lead }: { lead: LeadRow }) {
  const t = useTranslations("leads");
  const label = t(`source_${lead.source}`) + (lead.source_note ? ` · ${lead.source_note}` : "");
  return <Chip tone="pending">{label}</Chip>;
}

function feelLine(lead: LeadRow): string {
  return [lead.date_feel, lead.city, lead.guest_feel].filter(Boolean).join(" · ");
}

function LeadCard({ lead, today }: { lead: LeadRow; today: string }) {
  const t = useTranslations("leads");
  const [pending, start] = useTransition();
  const won = lead.stage === "won";
  return (
    <div className={cx("mb-2.5 rounded-[var(--radius)] border bg-surface-card p-3.5", won ? "border-teal" : "border-hairline-token")}>
      <Link href={`/leads/${lead.id}`} className="block">
        <p className="font-display text-[15.5px] text-text-primary">{lead.couple_display}</p>
        {feelLine(lead) ? <p className="mt-[3px] text-[11.5px] text-text-meta">{feelLine(lead)}</p> : null}
        <div className="mt-2.5 flex items-center justify-between gap-2">
          {won ? <Chip tone="settled">{t("wonChip")}</Chip> : <SourceChip lead={lead} />}
          {won ? <span /> : <NextStep lead={lead} today={today} />}
        </div>
      </Link>
      {won && lead.wedding_id ? (
        <div className="mt-3"><Link href={`/wedding/${lead.wedding_id}`}><span className="text-[11px] text-teal hover:underline">{t("viewWedding")} →</span></Link></div>
      ) : won ? (
        <div className="mt-3"><Button variant="primary" className="!px-3 !py-1.5 !text-[10px]" disabled={pending} onClick={() => start(async () => { await convertLead(lead.id); })}>{t("openWedding")}</Button></div>
      ) : null}
    </div>
  );
}

function StageChip({ stage }: { stage: string }) {
  const t = useTranslations("leads");
  if (stage === "won") return <Chip tone="settled">{t("wonChip")}</Chip>;
  if (stage === "lost") return <Chip tone="pending">{t("lostChip")}</Chip>;
  return <span className="text-[10.5px] uppercase tracking-[0.14em] text-text-meta">{t(`lane_${stage}`)}</span>;
}

export function LeadsView({ board, lost, today, lanes, lostSummary }: {
  board: LeadRow[];
  lost: LeadRow[];
  today: string;
  lanes: string[];
  lostSummary: { total: number; byReason: { reason: string; count: number }[] };
}) {
  const t = useTranslations("leads");
  const [view, setView] = useState<"board" | "list">("board");
  const [sort, setSort] = useState<"next" | "name" | "stage">("next");

  const all = [...board, ...lost];
  const sorted = [...all].sort((a, b) => {
    if (sort === "name") return a.couple_display.localeCompare(b.couple_display);
    if (sort === "stage") return a.stage.localeCompare(b.stage);
    return (a.next_step_at ?? "9999").localeCompare(b.next_step_at ?? "9999"); // soonest touch first, nulls last
  });

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        {(["board", "list"] as const).map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={cx("rounded-[var(--radius)] px-3.5 py-1.5 text-[12px]", view === v ? "bg-surface-chrome text-bone" : "text-text-meta hover:text-text-primary")}>
            {t(v === "board" ? "boardView" : "listView")}
          </button>
        ))}
        {view === "list" ? (
          <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="ml-auto rounded-[var(--radius)] border border-hairline-token bg-surface-card px-2.5 py-1 text-[12px] text-text-primary">
            <option value="next">{t("sortNext")}</option>
            <option value="name">{t("sortName")}</option>
            <option value="stage">{t("sortStage")}</option>
          </select>
        ) : null}
      </div>

      {view === "board" ? (
        <>
          <div className="grid grid-cols-2 items-start gap-3.5 md:grid-cols-3 lg:grid-cols-5">
            {lanes.map((lane) => {
              const cards = board.filter((l) => l.stage === lane);
              return (
                <div key={lane}>
                  <div className="mb-3 flex items-baseline justify-between border-b border-hairline-token px-0.5 pb-2.5">
                    <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-text-primary">{t(`lane_${lane}`)}</span>
                    <span className="text-[11px] text-text-meta">{cards.length}</span>
                  </div>
                  {cards.map((l) => <LeadCard key={l.id} lead={l} today={today} />)}
                </div>
              );
            })}
          </div>
          {lostSummary.total ? (
            <div className="mt-4 text-center text-[11px] text-text-meta">
              {t("lostSeason", { count: lostSummary.total })}
              {lostSummary.byReason.length ? (
                <span className="text-taupe"> · {lostSummary.byReason.map((r) => `${r.count} ${t(`lost_${r.reason}`)}`).join(" · ")}</span>
              ) : null}
            </div>
          ) : null}
        </>
      ) : (
        <div className="overflow-hidden rounded-[var(--radius)] border border-hairline-token bg-surface-card">
          {sorted.length === 0 ? (
            <p className="px-[18px] py-8 text-center font-accent text-[15px] text-text-meta">{t("empty")}</p>
          ) : sorted.map((l) => (
            <Link key={l.id} href={`/leads/${l.id}`} className="grid items-center gap-3 border-b border-hairline-token px-[18px] py-3 text-[13px] last:border-b-0 [grid-template-columns:minmax(140px,1.4fr)_auto_1fr_auto] hover:bg-surface-page">
              <span className="truncate font-display text-[15px] text-text-primary">{l.couple_display}</span>
              <StageChip stage={l.stage} />
              <span className="truncate text-[11.5px] text-text-meta">{t(`source_${l.source}`)}{l.source_note ? ` · ${l.source_note}` : ""}</span>
              <span className="justify-self-end"><NextStep lead={l} today={today} /></span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
