import { notFound } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { loadLedger, daysOverdue } from "@/lib/money";
import { WeddingShell } from "@/components/wedding/wedding-shell";
import { AddLineForm, PayButton, MarkPaid } from "@/components/money/ledger-controls";
import { Card, StatRow, Stat, SectionTitle, Row, RowMain, Badge, Chip, Tag, type BadgeTone } from "@/components/ui";
import { formatMoney } from "@/lib/wedding";
import { loadDatePrefs } from "@/lib/prefs";
import { formatDate } from "@/lib/format-date";

const STATUS_TONE: Record<string, BadgeTone> = {
  paid: "sage", settled: "sage", due: "wine", scheduled: "sand", expected: "sand", void: "sand",
};

export default async function BudgetTab({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, id);
  if (!ctx || ctx.role === "none") notFound();
  const { wedding, events, role } = ctx;
  const lang = await getLocale();
  const [tm, te] = [await getTranslations("money"), await getTranslations("event")];

  const { lines, rollup, traceFor, slices } = await loadLedger(supabase, id);
  const eventLabel = new Map(events.map((e) => [e.id, e.label]));
  const fmt = (n: string | number | null) => formatMoney(n, lang) ?? "·";
  // §B4 — ledger due dates honour the account's date-format preference (a DATE-typed
  // value, reordered without a timezone shift).
  const prefs = await loadDatePrefs(supabase, lang);

  return (
    <WeddingShell wedding={wedding} events={events} role={role} active="budget">
      <SectionTitle title={tm("title")} accent={tm("hint")} className="mt-0" />

      <StatRow>
        <Stat value={fmt(rollup.budget_total)} label={tm("budget")} />
        <Stat value={fmt(rollup.paid)} valueClassName="text-teal" label={tm("paid")} />
        <Stat value={fmt(rollup.committed)} label={tm("committed")} />
        <Stat value={fmt(rollup.open)} label={tm("open")} />
      </StatRow>

      <div className="mt-[18px] grid gap-[18px] lg:grid-cols-[1.6fr_1fr]">
        <Card>
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="font-display text-[19px] text-ink">{tm("ledgerTitle")}</h3>
            {role === "staff" ? <AddLineForm weddingId={id} /> : null}
          </div>
          <p className="mb-2 text-[12.5px] text-muted">{tm("ledgerHint")}</p>
          {lines.length === 0 ? (
            <p className="py-6 text-center font-accent text-[15px] text-muted">{tm("empty")}</p>
          ) : (
            lines.map((l) => (
              <Row key={l.id}>
                <RowMain
                  title={l.title}
                  detail={
                    <span className="flex flex-wrap items-center gap-1.5">
                      {traceFor(l).map((tr, i) => (
                        <Tag key={i}>{tr.kind === "quote" ? tm("traceQuote") : tr.label}</Tag>
                      ))}
                      {l.due_date ? <span className="text-taupe">· {formatDate(l.due_date, prefs)}</span> : null}
                    </span>
                  }
                />
                <span className="shrink-0 font-medium text-[13.5px] text-ink">{fmt(l.amount)}</span>
                {(() => {
                  // urgency is earned: a line strictly past its due date (and unsettled) wears
                  // the oxblood urgent chip; every other state keeps its normal status badge.
                  const od = daysOverdue(l.due_date, l.status);
                  return od > 0
                    ? <Chip tone="urgent">{tm("overdue", { n: od })}</Chip>
                    : <Badge tone={STATUS_TONE[l.status] ?? "sand"}>{tm(`status_${l.status}`)}</Badge>;
                })()}
                {l.kind === "planner_fee" && l.status === "due" && role === "member" ? <PayButton lineId={l.id} /> : null}
                {role === "staff" && l.kind !== "planner_fee" && !["paid", "settled", "void"].includes(l.status) ? <MarkPaid lineId={l.id} /> : null}
              </Row>
            ))
          )}
          <p className="mt-3 text-[11.5px] text-muted">{tm("computedNote")}</p>
        </Card>

        {slices.length ? (
          <Card className="self-start">
            <h3 className="mb-1 font-display text-[19px] text-ink">{tm("bySlice")}</h3>
            <p className="mb-2 text-[12.5px] text-muted">{tm("bySliceHint")}</p>
            {slices.map((s) => (
              <Row key={s.event_id}>
                <RowMain title={eventLabel.get(s.event_id) ?? te("undated")} />
                <span className="font-medium text-[13.5px] text-ink">{fmt(s.total)}</span>
              </Row>
            ))}
          </Card>
        ) : null}
      </div>
    </WeddingShell>
  );
}
