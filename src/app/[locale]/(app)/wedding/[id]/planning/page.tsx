import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import { loadWeddingContext } from "@/lib/load-wedding";
import { loadVenuedEventIds } from "@/lib/vendors";
import { WeddingShell } from "@/components/wedding/wedding-shell";
import { AdvanceButton } from "@/components/wedding/advance-button";
import { SectionTitle, GateCard, GateRow } from "@/components/ui";
import { gateItems, nextPhase } from "@/lib/wedding";

export default async function PlanningRoom({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, id);
  if (!ctx || ctx.role === "none") notFound();
  if (ctx.role === "member") redirect({ href: `/wedding/${id}`, locale }); // planning is a planner room
  const { wedding, events } = ctx;

  const [t, tp, teng] = [await getTranslations("planning"), await getTranslations("phase"), await getTranslations("engagement")];
  const venued = await loadVenuedEventIds(supabase, id);
  const items = gateItems(wedding, events, venued);
  const target = nextPhase(wedding.phase);
  const canAdvance = items.length > 0 && items.every((i) => i.done) && !!target;

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
      </div>
    </WeddingShell>
  );
}
