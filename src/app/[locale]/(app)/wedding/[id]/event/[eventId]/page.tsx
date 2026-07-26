import { notFound } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadWedding } from "@/lib/load-wedding";
import { WeddingHeader } from "@/components/wedding/wedding-header";
import { EventEditor } from "@/components/wedding/event-forms";
import { Card, Fact, WeddingNav } from "@/components/ui";
import { dayNumber, formatTime } from "@/lib/wedding";

export default async function EventPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; eventId: string }>;
}) {
  const { locale, id, eventId } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const data = await loadWedding(supabase, id);
  if (!data) notFound();
  const { wedding, events } = data;

  // Single-event law: with no event layer, an event page has no standing — send
  // a direct visitor back to the flat floor.
  if (events.length < 2) redirect({ href: `/wedding/${id}`, locale });

  const event = events.find((e) => e.id === eventId);
  if (!event) notFound();

  const [te, tw] = [await getTranslations("event"), await getTranslations("wedding")];
  const lang = await getLocale();
  const n = dayNumber(event.event_date, wedding.date_start);
  const times = [formatTime(event.start_time, lang), formatTime(event.end_time, lang)].filter(Boolean).join(" – ");

  return (
    <div className="flex flex-col gap-6">
      <WeddingHeader wedding={wedding} events={events} activeEventId={event.id} />
      <WeddingNav items={<span className="text-ink">{te("overview")}</span>} />

      <Card>
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
          <Fact value={te(`kinds.${event.kind}`)} label={te("kind")} />
          <Fact value={event.event_date ?? te("undated")} label={te("date")} />
          <Fact value={times || "—"} label={`${te("startTime")} – ${te("endTime")}`} />
          <Fact value={n != null ? te("dayN", { n }) : "—"} label={tw("facts.date")} />
          <Fact value={event.guest_target ?? "—"} label={te("guestTarget")} />
        </div>
      </Card>

      <Card>
        <EventEditor weddingId={wedding.id} event={event} multi />
      </Card>
    </div>
  );
}
