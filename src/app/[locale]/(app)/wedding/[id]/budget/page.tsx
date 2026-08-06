import { notFound } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { loadLedger, daysOverdue } from "@/lib/money";
import { WeddingShell } from "@/components/wedding/wedding-shell";
import { AddLineForm, PayButton, MarkPaid } from "@/components/money/ledger-controls";
import { Card, Panel, PanelHead, PanelRow, Row, RowMain, Badge, Chip, Button, DomainStar, Tag, type BadgeTone } from "@/components/ui";
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
  const prefs = await loadDatePrefs(supabase, lang);

  const budget = Number(rollup.budget_total ?? 0);
  const committed = Number(rollup.committed ?? 0);
  const paid = Number(rollup.paid ?? 0);
  const pct = (n: number) => (budget > 0 ? Math.min(100, Math.round((n / budget) * 100)) : 0);
  const lineSum = lines.reduce((s, l) => s + Number(l.amount ?? 0), 0);
  const delta = budget - lineSum; // + = under budget, - = over

  return (
    <WeddingShell wedding={wedding} events={events} role={role} active="budget">
      {/* Summary strip — teal (money) domain stars, committed teal bar, paid charcoal bar. */}
      <div className="mb-6 grid gap-4 border-b border-hairline pb-6 sm:grid-cols-3">
        <SummaryCol star label={tm("budget")} value={fmt(rollup.budget_total)} />
        <SummaryCol star label={tm("committed")} value={fmt(rollup.committed)} bar={{ pct: pct(committed), fill: "bg-teal" }} />
        <SummaryCol star label={tm("paid")} value={fmt(rollup.paid)} bar={{ pct: pct(paid), fill: "bg-ink" }} />
      </div>

      <div className="grid gap-[18px] lg:grid-cols-[1.6fr_1fr]">
        <div>
          <Panel>
            <PanelHead
              star={<DomainStar domain="money" size={11} />}
              title={tm("lineByLine")}
              meta={lines.length ? tm("lineCount", { count: lines.length }) : undefined}
            />
            {lines.length === 0 ? (
              <p className="px-[18px] py-8 text-center font-accent text-[15px] text-muted">{tm("empty")}</p>
            ) : (
              <>
                {lines.map((l) => {
                  const od = daysOverdue(l.due_date, l.status);
                  return (
                    <PanelRow key={l.id} cols="1fr auto auto auto">
                      <span className="min-w-0">
                        <span className="text-ink">{l.title}</span>
                        <span className="ml-2 inline-flex flex-wrap items-center gap-1.5 align-middle">
                          {traceFor(l).map((tr, i) => <Tag key={i}>{tr.kind === "quote" ? tm("traceQuote") : tr.label}</Tag>)}
                          {l.due_date ? <span className="text-[12px] text-taupe">· {formatDate(l.due_date, prefs)}</span> : null}
                        </span>
                      </span>
                      <span className="whitespace-nowrap tabular-nums font-medium text-[13.5px] text-ink">{fmt(l.amount)}</span>
                      {od > 0
                        ? <Chip tone="urgent">{tm("overdue", { n: od })}</Chip>
                        : <Badge tone={STATUS_TONE[l.status] ?? "sand"}>{tm(`status_${l.status}`)}</Badge>}
                      {l.kind === "planner_fee" && l.status === "due" && role === "member" ? <PayButton lineId={l.id} />
                        : role === "staff" && l.kind !== "planner_fee" && !["paid", "settled", "void"].includes(l.status) ? <MarkPaid lineId={l.id} />
                        : <span />}
                    </PanelRow>
                  );
                })}
                {/* Charcoal total row — bone text + champagne delta ($X under / $X over). */}
                <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3.5 bg-ink px-[18px] py-3 text-[13px] text-bone">
                  <span className="font-medium">{tm("totalLabel")}</span>
                  <span className="whitespace-nowrap tabular-nums font-medium">{fmt(lineSum)}</span>
                  {budget > 0 ? (
                    <span className="whitespace-nowrap text-[11px] text-champagne">
                      {delta >= 0 ? tm("deltaUnder", { amount: fmt(delta) }) : tm("deltaOver", { amount: fmt(-delta) })}
                    </span>
                  ) : <span />}
                </div>
              </>
            )}
          </Panel>

          {/* Actions — wine "Add a line" + ghost "Export for the couple" (a real print route). */}
          <div className="mt-[18px] flex items-center gap-2.5">
            {role === "staff" ? <AddLineForm weddingId={id} /> : null}
            <Link href={`/wedding/${id}/budget/print`} target="_blank">
              <Button variant="ghost">{tm("exportCouple")}</Button>
            </Link>
            <p className="ml-auto font-accent text-[14px] italic text-taupe">{tm("computedNote")}</p>
          </div>
        </div>

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

function SummaryCol({ label, value, bar }: { star?: boolean; label: string; value: string; bar?: { pct: number; fill: string } }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.24em] text-muted">
        <DomainStar domain="money" size={10} />{label}
      </p>
      <p className="mt-1 font-display text-[30px] leading-none text-ink tabular-nums">{value}</p>
      {bar ? (
        <div className="mt-2.5 h-[3px] max-w-[220px] rounded-[2px] bg-hairline">
          <div className={`h-[3px] rounded-[2px] ${bar.fill}`} style={{ width: `${bar.pct}%` }} />
        </div>
      ) : null}
    </div>
  );
}
