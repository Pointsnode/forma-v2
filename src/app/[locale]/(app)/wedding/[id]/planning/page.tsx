import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import { loadWeddingContext } from "@/lib/load-wedding";
import { loadVenuedEventIds } from "@/lib/vendors";
import { WeddingShell } from "@/components/wedding/wedding-shell";
import { AdvanceButton } from "@/components/wedding/advance-button";
import { AdvanceToDays, DayOfExtra, CloseButton } from "@/components/wedding/phase4";
import { Card, SectionTitle, GateCard, GateRow, Row, RowMain, Badge } from "@/components/ui";
import { gateItems, nextPhase } from "@/lib/wedding";

export default async function PlanningRoom({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, id);
  if (!ctx || ctx.role === "none") notFound();
  if (ctx.role === "member") redirect({ href: `/wedding/${id}`, locale }); // planning is a planner room
  const { wedding, events } = ctx;

  const [t, tp, teng, tops] = [await getTranslations("planning"), await getTranslations("phase"), await getTranslations("engagement"), await getTranslations("ops")];
  const venued = await loadVenuedEventIds(supabase, id);
  const items = gateItems(wedding, events, venued);
  const target = nextPhase(wedding.phase);
  const canAdvance = items.length > 0 && items.every((i) => i.done) && !!target;

  // Phase-4 close predicate (§9): all events past + no open ledger line.
  const today = new Date().toISOString().slice(0, 10);
  const eventsPast = events.filter((e) => e.event_date && e.event_date < today).length;
  const { data: openLines } = await supabase.from("ledger_lines").select("id, title, amount, kind").eq("wedding_id", id).in("status", ["expected", "scheduled", "due"]);
  const open = (openLines ?? []) as { id: string; title: string; amount: number; kind: string }[];
  const allPast = events.length > 0 && eventsPast === events.length;
  const closeBlocked = !allPast || open.length > 0;

  return (
    <WeddingShell wedding={wedding} events={events} role="staff" active="planning" venuedEventIds={venued}>
      <SectionTitle title={t("title")} accent={t("subtitle")} className="mt-0" />
      <div className="max-w-2xl">
        <GateCard title={target ? t("gateTo", { phase: tp(target) }) : t("nextGate")} sub={t("subtitle")}>
          {items.length === 0 ? (
            <p className="py-2 font-accent text-[15px] text-[rgba(247,244,238,0.75)]">{t("allClear")}</p>
          ) : (
            items.map((it) => (
              <GateRow key={it.key} done={it.done} title={t(`items.${it.key}`)} detail={it.pending ? t("venuePending") : undefined} />
            ))
          )}
        </GateCard>
        {canAdvance ? <div className="mt-5"><AdvanceButton weddingId={id} label={teng("advance", { phase: tp(target!) })} /></div> : null}
        {wedding.phase === "details" ? <div className="mt-5"><AdvanceToDays weddingId={id} /></div> : null}
      </div>

      {/* Phase 4 — the day + closing the wedding */}
      {wedding.phase === "wedding_days" ? (
        <div className="mt-8 max-w-2xl">
          <SectionTitle title={tops("theDay")} accent={tops("theDayHint")} />
          <Card className="mb-[18px]">
            <h3 className="mb-1 font-display text-[18px] text-ink">{tops("dayOfExtras")}</h3>
            <p className="mb-3 text-[12.5px] text-muted">{tops("dayOfExtrasHint")}</p>
            {open.filter((l) => l.kind === "day_of_extra").map((l) => (
              <Row key={l.id}><RowMain title={l.title} /><Badge tone="wine">{tops("unsettled")}</Badge></Row>
            ))}
            <div className="mt-3"><DayOfExtra weddingId={id} /></div>
          </Card>
          <GateCard title={tops("closing")} sub={tops("closingHint")}>
            <GateRow done={allPast} title={tops("eventsCelebrated")} detail={tops("eventsCount", { done: eventsPast, total: events.length })} />
            <GateRow done={open.length === 0} title={tops("linesSettled")} detail={open.length ? tops("openLinesDetail", { count: open.length }) : tops("allSettled")} />
          </GateCard>
          <div className="mt-5"><CloseButton weddingId={id} blocked={closeBlocked} /></div>
        </div>
      ) : null}
    </WeddingShell>
  );
}
