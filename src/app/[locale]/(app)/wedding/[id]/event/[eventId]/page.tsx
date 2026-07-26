import { notFound } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { WeddingHeader } from "@/components/wedding/wedding-header";
import { EventEditor } from "@/components/wedding/event-forms";
import { EventPruning } from "@/components/guests/event-pruning";
import { Card, Fact, Heading, WeddingNav } from "@/components/ui";
import { dayNumber, formatTime } from "@/lib/wedding";

export default async function EventPage({
  params,
}: {
  params: Promise<{ locale: string; id: string; eventId: string }>;
}) {
  const { locale, id, eventId } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, id);
  if (!ctx || ctx.role === "none") notFound();
  const { wedding, events, role } = ctx;

  // Single-event law: with no event layer, an event page has no standing — send
  // a direct visitor back to the flat floor.
  if (events.length < 2) redirect({ href: `/wedding/${id}`, locale });

  const event = events.find((e) => e.id === eventId);
  if (!event) notFound();

  const [te, tw, tg] = [await getTranslations("event"), await getTranslations("wedding"), await getTranslations("guests")];
  const lang = await getLocale();
  const n = dayNumber(event.event_date, wedding.date_start);
  const times = [formatTime(event.start_time, lang), formatTime(event.end_time, lang)].filter(Boolean).join(" – ");

  const { data: egData } = await supabase
    .from("event_guests")
    .select("guest_id, invited, rsvp_status, guests(full_name)")
    .eq("event_id", event.id)
    .order("invited", { ascending: false });
  const eventGuests = (egData ?? []).map((r) => {
    const g = r as unknown as { guest_id: string; invited: boolean; rsvp_status: string; guests: { full_name: string } | null };
    return { guest_id: g.guest_id, full_name: g.guests?.full_name ?? "—", invited: g.invited, rsvp_status: g.rsvp_status };
  });

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

      {role === "staff" ? (
        <Card>
          <EventEditor weddingId={wedding.id} event={event} multi />
        </Card>
      ) : null}

      {eventGuests.length > 0 ? (
        <Card>
          <Heading className="mb-2 text-[18px]">{tg("eventGuests")}</Heading>
          <EventPruning weddingId={wedding.id} eventId={event.id} rows={eventGuests} readOnly={role !== "staff"} />
        </Card>
      ) : null}
    </div>
  );
}
