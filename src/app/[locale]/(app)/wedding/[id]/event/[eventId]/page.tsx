import { notFound } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { redirect, Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { WeddingShell } from "@/components/wedding/wedding-shell";
import { EventEditor } from "@/components/wedding/event-forms";
import { EventPruning } from "@/components/guests/event-pruning";
import { ScheduleCard, MenusCard } from "@/components/wedding/event-ops";
import { FloorSection } from "@/components/floor/floor-section";
import { loadEventOps } from "@/lib/event-ops";
import { loadFloorPlan } from "@/lib/floor-plan";
import { Card, Heading, StatRow, Stat } from "@/components/ui";
import { dayNumber, formatTime, formatMoney } from "@/lib/wedding";

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
  const { wedding, events, role, userId } = ctx;

  // Single-event law: with no event layer, an event page has no standing.
  if (events.length < 2) redirect({ href: `/wedding/${id}`, locale });

  const event = events.find((e) => e.id === eventId);
  if (!event) notFound();

  const [te, tg, teng, tops, tm] = [await getTranslations("event"), await getTranslations("guests"), await getTranslations("engagement"), await getTranslations("ops"), await getTranslations("money")];

  const { data: venueRows } = await supabase
    .from("event_vendors")
    .select("venue_booked, wedding_vendors(status, vendors(name, kind, contact_name, contact_email))")
    .eq("event_id", event.id);
  const venues = (venueRows ?? [])
    .map((r) => {
      const x = r as unknown as { venue_booked: boolean; wedding_vendors: { status: string; vendors: { name: string; kind: string; contact_name: string | null; contact_email: string | null } | null } | null };
      return { venue_booked: x.venue_booked, status: x.wedding_vendors?.status ?? "", v: x.wedding_vendors?.vendors ?? null };
    })
    .filter((r) => r.v?.kind === "venue");
  const bookedVenue = venues.find((r) => r.venue_booked);
  const lang = await getLocale();
  const n = dayNumber(event.event_date, wedding.date_start);
  const times = [formatTime(event.start_time, lang), formatTime(event.end_time, lang)].filter(Boolean).join(" – ");

  const { data: sliceRow } = await supabase.from("event_money_slice").select("total").eq("wedding_id", id).eq("event_id", event.id).maybeSingle();
  const slice = sliceRow ? formatMoney((sliceRow as { total: number }).total, lang) : null;

  const ops = await loadEventOps(supabase, id, event.id);
  const live = wedding.phase === "wedding_days";

  // Seating editor — per event. Couple gets the lens (billing member); day_of read-only.
  const floor = await loadFloorPlan(supabase, event.id);
  let floorRole: "staff" | "couple" | "view" = "staff";
  if (role === "member") {
    const { data: m } = await supabase.from("wedding_members").select("role").eq("wedding_id", id).eq("user_id", userId).maybeSingle();
    floorRole = (m?.role as string) === "day_of" ? "view" : "couple";
  }

  // event Budget slice (tagged ledger lines + trace) — role permitting (day_of blind)
  const { data: sliceLines } = await supabase.from("ledger_lines").select("id, title, amount, status, engagement_id, wedding_vendors(vendors(name))").eq("wedding_id", id).eq("event_id", event.id).order("created_at");
  const budgetLines = ((sliceLines ?? []) as unknown as { id: string; title: string; amount: number; status: string; wedding_vendors: { vendors: { name: string } | null } | null }[])
    .map((l) => ({ id: l.id, title: l.title, amount: l.amount, status: l.status, vendor: l.wedding_vendors?.vendors?.name ?? null }));
  // dietary rollup from chosen menu options
  const { data: dietRows } = await supabase.from("event_guests").select("menu_options(diet_tags)").eq("event_id", event.id).not("menu_choice_id", "is", null);
  const dietCount = new Map<string, number>();
  for (const r of (dietRows ?? []) as unknown as { menu_options: { diet_tags: string[] } | null }[]) for (const tag of r.menu_options?.diet_tags ?? []) dietCount.set(tag, (dietCount.get(tag) ?? 0) + 1);
  const dietary = [...dietCount.entries()].map(([tag, count]) => `${count} ${tag}`).join(" · ");

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
    <WeddingShell wedding={wedding} events={events} role={role} activeEventId={event.id} showNav={false}>
      <nav className="mb-4 text-[12.5px] text-muted">
        <Link href={`/wedding/${id}`} className="hover:text-ink hover:underline hover:underline-offset-2">{te("overview")}</Link>
        <span className="mx-2 text-hairline">/</span>
        <span className="font-display text-[15px] text-ink">{event.label}</span>
      </nav>
      {/* event sub-nav (anchor-scroll) */}
      <nav className="mb-5 flex gap-5 overflow-x-auto border-b border-hairline pb-2 text-[13px] text-muted">
        {[["venue", teng("venueSlice")], ["schedule", tops("schedule")], ["menus", tops("menus")], ["seating", tops("seating")], ["guests", tg("tab")], ["slice", te("slice")]].map(([anchor, label]) => (
          <a key={anchor} href={`#${anchor}`} className="whitespace-nowrap hover:text-ink">{label}</a>
        ))}
      </nav>

      <StatRow>
        <Stat value={te(`kinds.${event.kind}`)} label={te("kind")} />
        <Stat value={event.event_date ?? te("undated")} label={te("date")} />
        <Stat value={times || "—"} label={`${te("startTime")} – ${te("endTime")}`} />
        <Stat value={n != null ? te("dayN", { n }) : "—"} label={te("day")} />
        <Stat value={event.guest_target ?? "—"} label={te("guestTarget")} />
        {slice ? <Stat value={slice} label={te("slice")} /> : null}
      </StatRow>

      <div className="mt-[18px] flex flex-col gap-[18px]">
        <Card id="venue">
          <Heading className="mb-2 text-[18px]">{teng("venueSlice")}</Heading>
          {bookedVenue ? (
            <div>
              <p className="font-display text-[16px] text-ink">{bookedVenue.v!.name}</p>
              <p className="font-accent text-[14px] text-muted">{[bookedVenue.v!.contact_name, bookedVenue.v!.contact_email].filter(Boolean).join(" · ") || teng("bookedVenue")}</p>
            </div>
          ) : venues.length ? (
            <ul className="flex flex-col gap-1.5">
              {venues.map((r, i) => (
                <li key={i} className="flex items-center justify-between text-[14px]">
                  <span className="text-ink">{r.v!.name}</span>
                  <span className="font-accent text-[13px] text-muted">{teng(`status${r.status.charAt(0).toUpperCase()}${r.status.slice(1)}`)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="font-accent text-[15px] text-muted">{teng("noVenueYet")}</p>
          )}
        </Card>

        <section id="schedule"><ScheduleCard weddingId={id} eventId={event.id} items={ops.schedule} live={live} /></section>
        <section id="menus"><MenusCard weddingId={id} eventId={event.id} menus={ops.menus} /></section>
        <section id="seating">
          <FloorSection eventId={event.id} weddingId={id} eventLabel={event.label}
            planId={floor.plan?.id ?? null} canvas={floor.plan?.canvas ?? { w: 2000, h: 1200 }} coupleCanEdit={floor.plan?.coupleCanEdit ?? false}
            tables={floor.tables} elements={floor.elements} attendees={floor.attendees} exceptions={floor.exceptions}
            seatedCount={floor.seatedCount} attendingCount={floor.attendingCount} role={floorRole} />
        </section>

        {budgetLines.length ? (
          <section id="slice">
            <Card>
              <Heading className="mb-2 text-[18px]">{te("slice")}</Heading>
              {budgetLines.map((l) => (
                <div key={l.id} className="flex items-center gap-3 py-2 not-last:[box-shadow:inset_0_-1px_0_var(--color-hairline)]">
                  <div className="min-w-0 flex-1"><p className="text-[13.5px] text-ink">{l.title}</p>{l.vendor ? <span className="mr-1 mt-[3px] inline-block rounded-full bg-sand-soft px-[9px] py-[2px] text-[10.5px] text-taupe">{l.vendor}</span> : null}</div>
                  <span className="font-medium text-[13.5px] text-ink">{formatMoney(l.amount, lang)}</span>
                  <span className="rounded-full bg-sand-soft px-2.5 py-[3px] text-[11px] text-taupe">{tm(`status_${l.status}`)}</span>
                </div>
              ))}
            </Card>
          </section>
        ) : null}

        {role === "staff" ? (
          <Card><EventEditor weddingId={wedding.id} event={event} multi /></Card>
        ) : null}

        {eventGuests.length > 0 ? (
          <Card id="guests">
            <Heading className="mb-2 text-[18px]">{tg("eventGuests")}</Heading>
            {dietary ? <p className="mb-2 text-[13px] text-taupe">{tops("dietaryFlags")}: {dietary}</p> : null}
            <EventPruning weddingId={wedding.id} eventId={event.id} rows={eventGuests} readOnly={role !== "staff"} />
          </Card>
        ) : null}
      </div>
    </WeddingShell>
  );
}
