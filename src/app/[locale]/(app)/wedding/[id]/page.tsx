import { notFound } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { loadWedding } from "@/lib/load-wedding";
import { WeddingHeader } from "@/components/wedding/wedding-header";
import { PhaseLine } from "@/components/wedding/phase-line";
import { EventsPanel } from "@/components/wedding/event-forms";
import { Card, Fact, Heading, WeddingNav } from "@/components/ui";
import { formatDateRange, formatMoney, phaseOrdinal } from "@/lib/wedding";

export default async function WeddingFloor({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const data = await loadWedding(supabase, id);
  if (!data) notFound();
  const { wedding, events } = data;

  const [tw, tp] = [await getTranslations("wedding"), await getTranslations("phase")];
  const lang = await getLocale();
  const range = formatDateRange(wedding.date_start, wedding.date_end, lang);
  const money = formatMoney(wedding.budget_total, lang);
  const location = [wedding.location_city, wedding.location_country].filter(Boolean).join(", ");

  return (
    <div className="flex flex-col gap-6">
      <WeddingHeader wedding={wedding} events={events} />
      <PhaseLine wedding={wedding} events={events} />
      <WeddingNav items={<span className="text-ink">{tw("overview")}</span>} />

      <Card>
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3">
          <Fact value={range ?? tw("noDate")} label={tw("facts.date")} />
          <Fact value={events.length} label={tw("facts.events")} />
          <Fact value={wedding.guest_target ?? "—"} label={tw("facts.guests")} />
          <Fact value={money ?? "—"} label={tw("facts.budget")} />
          <Fact value={`${tp("ordinal", { n: phaseOrdinal(wedding.phase) })} · ${tp(wedding.phase)}`} label={tw("facts.phase")} />
          <Fact value={location || "—"} label={tw("facts.location")} />
        </div>
      </Card>

      <Card>
        <Heading className="mb-3 text-[19px]">{tw("facts.events")}</Heading>
        <EventsPanel weddingId={wedding.id} events={events} multi={events.length >= 2} />
      </Card>
    </div>
  );
}
