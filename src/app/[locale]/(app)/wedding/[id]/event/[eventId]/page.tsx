import { notFound } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { redirect, Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { WeddingShell } from "@/components/wedding/wedding-shell";
import { EventEditor } from "@/components/wedding/event-forms";
import { EventPruning } from "@/components/guests/event-pruning";
import { EventGuestTable } from "@/components/wedding/event-guest-table";
import { ScheduleCard, MenusCard } from "@/components/wedding/event-ops";
import { FloorSection } from "@/components/floor/floor-section";
import { loadEventOps } from "@/lib/event-ops";
import { loadFloorPlan } from "@/lib/floor-plan";
import { loadEventTable } from "@/lib/event-table";
import { Card, Heading, StatRow, Stat, cx } from "@/components/ui";
import { dayNumber, formatTime, formatMoney } from "@/lib/wedding";

const TAB_KEYS = ["overview", "guests", "menu", "seating", "slice"] as const;
type Tab = (typeof TAB_KEYS)[number];

export default async function EventPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string; id: string; eventId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { locale, id, eventId } = await params;
  const { tab: tabParam } = await searchParams;
  setRequestLocale(locale);
  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, id);
  if (!ctx || ctx.role === "none") notFound();
  const { wedding, events, role, userId } = ctx;

  // Single-event law: with no event layer, an event page has no standing.
  if (events.length < 2) redirect({ href: `/wedding/${id}`, locale });

  const event = events.find((e) => e.id === eventId);
  if (!event) notFound();

  const tab: Tab = (TAB_KEYS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "overview";
  const [te, tg, teng, tops, tm] = [await getTranslations("event"), await getTranslations("guests"), await getTranslations("engagement"), await getTranslations("ops"), await getTranslations("money")];
  const lang = await getLocale();

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
  const n = dayNumber(event.event_date, wedding.date_start);
  const times = [formatTime(event.start_time, lang), formatTime(event.end_time, lang)].filter(Boolean).join(" – ");

  const { data: sliceRow } = await supabase.from("event_money_slice").select("total").eq("wedding_id", id).eq("event_id", event.id).maybeSingle();
  const slice = sliceRow ? formatMoney((sliceRow as { total: number }).total, lang) : null;

  const ops = await loadEventOps(supabase, id, event.id);
  const live = wedding.phase === "wedding_days";

  const floor = await loadFloorPlan(supabase, event.id);
  let floorRole: "staff" | "couple" | "view" = "staff";
  if (role === "member") {
    const { data: m } = await supabase.from("wedding_members").select("role").eq("wedding_id", id).eq("user_id", userId).maybeSingle();
    floorRole = (m?.role as string) === "day_of" ? "view" : "couple";
  }

  const { data: sliceLines } = await supabase.from("ledger_lines").select("id, title, amount, status, engagement_id, wedding_vendors(vendors(name))").eq("wedding_id", id).eq("event_id", event.id).order("created_at");
  const budgetLines = ((sliceLines ?? []) as unknown as { id: string; title: string; amount: number; status: string; wedding_vendors: { vendors: { name: string } | null } | null }[])
    .map((l) => ({ id: l.id, title: l.title, amount: l.amount, status: l.status, vendor: l.wedding_vendors?.vendors?.name ?? null }));

  const table = await loadEventTable(supabase, event.id);

  const bandMeta = [event.event_date, event.guest_target ? te("guestsN", { n: event.guest_target }) : null, bookedVenue?.v?.name].filter(Boolean).join(" · ");
  const TABS: { key: Tab; label: string }[] = [
    { key: "overview", label: te("overview") },
    { key: "guests", label: tg("tab") },
    { key: "menu", label: tops("menus") },
    { key: "seating", label: tops("seating") },
    { key: "slice", label: te("slice") },
  ];

  return (
    <WeddingShell wedding={wedding} events={events} role={role} activeEventId={event.id} showNav={false}>
      {/* §1 event band + tabs (mock A) */}
      <div className="mb-5 overflow-hidden rounded-[var(--radius)] border border-hairline-token">
        <div className="bg-surface-chrome px-6 pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-champagne">{wedding.couple_display}{n != null ? ` · ${te("dayN", { n })}` : ""}</p>
              <p className="mt-1.5 font-display text-[24px] text-bone">{event.label}</p>
            </div>
            {bandMeta ? <span className="text-[11px] uppercase tracking-[0.16em] text-champagne">{bandMeta}</span> : null}
          </div>
          <div className="mt-4 flex gap-6 overflow-x-auto">
            {TABS.map((tb) => (
              <Link key={tb.key} href={{ pathname: `/wedding/${id}/event/${event.id}`, query: { tab: tb.key } }}
                className={cx("whitespace-nowrap border-b-2 pb-3 text-[12.5px]", tab === tb.key ? "border-champagne text-bone" : "border-transparent text-[rgba(245,242,235,0.55)] hover:text-bone")}>
                {tb.label}
              </Link>
            ))}
          </div>
        </div>
      </div>

      {tab === "overview" ? (
        <div className="flex flex-col gap-[18px]">
          <StatRow>
            <Stat value={te(`kinds.${event.kind}`)} label={te("kind")} />
            <Stat value={event.event_date ?? te("undated")} label={te("date")} />
            <Stat value={times || "·"} label={`${te("startTime")} – ${te("endTime")}`} />
            <Stat value={n != null ? te("dayN", { n }) : "·"} label={te("day")} />
            <Stat value={event.guest_target ?? "·"} label={te("guestTarget")} />
            {slice ? <Stat value={slice} label={te("slice")} /> : null}
          </StatRow>
          <Card>
            <Heading className="mb-2 text-[18px]">{teng("venueSlice")}</Heading>
            {bookedVenue ? (
              <div>
                <p className="font-display text-[16px] text-text-primary">{bookedVenue.v!.name}</p>
                <p className="font-accent text-[14px] text-text-meta">{[bookedVenue.v!.contact_name, bookedVenue.v!.contact_email].filter(Boolean).join(" · ") || teng("bookedVenue")}</p>
              </div>
            ) : venues.length ? (
              <ul className="flex flex-col gap-1.5">
                {venues.map((r, i) => (
                  <li key={i} className="flex items-center justify-between text-[14px]"><span className="text-text-primary">{r.v!.name}</span><span className="font-accent text-[13px] text-text-meta">{teng(`status${r.status.charAt(0).toUpperCase()}${r.status.slice(1)}`)}</span></li>
                ))}
              </ul>
            ) : <p className="font-accent text-[15px] text-text-meta">{teng("noVenueYet")}</p>}
          </Card>
          <ScheduleCard weddingId={id} eventId={event.id} items={ops.schedule} live={live} />
          {role === "staff" ? <Card><EventEditor weddingId={wedding.id} event={event} multi /></Card> : null}
        </div>
      ) : null}

      {tab === "guests" ? (
        <div className="flex flex-col gap-[18px]">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[12.5px] text-text-meta">{tg("tableHint")}</span>
            <Link href={`/wedding/${id}/event/${event.id}/table/print`} target="_blank" className="rounded-[var(--radius)] border border-ink px-4 py-2 text-[11px] font-medium uppercase tracking-[0.16em] text-text-primary hover:bg-surface-card">{tg("exportTable")}</Link>
          </div>
          <EventGuestTable eventName={event.label} options={table.options} guests={table.guests} />
          {role === "staff" ? <Card><Heading className="mb-2 text-[18px]">{tg("manageInvites")}</Heading><EventPruning weddingId={wedding.id} eventId={event.id} rows={table.guests.map((g) => ({ guest_id: g.guestId, full_name: g.name, invited: g.invited, rsvp_status: g.rsvp }))} readOnly={false} /></Card> : null}
        </div>
      ) : null}

      {tab === "menu" ? <MenusCard weddingId={id} eventId={event.id} menus={ops.menus} /> : null}

      {tab === "seating" ? (
        <FloorSection eventId={event.id} weddingId={id} eventLabel={event.label}
          planId={floor.plan?.id ?? null} canvas={floor.plan?.canvas ?? { w: 2000, h: 1200 }} coupleCanEdit={floor.plan?.coupleCanEdit ?? false}
          tables={floor.tables} elements={floor.elements} attendees={floor.attendees} exceptions={floor.exceptions}
          seatedCount={floor.seatedCount} attendingCount={floor.attendingCount} role={floorRole}
          background={floor.plan?.background ?? null} backgroundUrl={floor.plan?.backgroundUrl ?? null}
          backgroundSettings={floor.plan?.backgroundSettings ?? {}} printHref={`/wedding/${id}/event/${event.id}/seating/print`}
          menuOptions={table.options} tablePrintHref={`/wedding/${id}/event/${event.id}/table/print`} />
      ) : null}

      {tab === "slice" ? (
        <Card>
          <Heading className="mb-2 text-[18px]">{te("slice")}</Heading>
          {budgetLines.length === 0 ? <p className="py-4 text-center font-accent text-[15px] text-text-meta">{te("sliceEmpty")}</p> : budgetLines.map((l) => (
            <div key={l.id} className="flex items-center gap-3 py-2 not-last:[box-shadow:inset_0_-1px_0_var(--color-hairline-token)]">
              <div className="min-w-0 flex-1"><p className="text-[13.5px] text-text-primary">{l.title}</p>{l.vendor ? <span className="mr-1 mt-[3px] inline-block rounded-[var(--radius)] bg-surface-card px-[9px] py-[2px] text-[10.5px] text-taupe">{l.vendor}</span> : null}</div>
              <span className="font-medium text-[13.5px] text-text-primary">{formatMoney(l.amount, lang)}</span>
              <span className="rounded-[var(--radius)] bg-surface-card px-2.5 py-[3px] text-[11px] text-taupe">{tm(`status_${l.status}`)}</span>
            </div>
          ))}
        </Card>
      ) : null}
    </WeddingShell>
  );
}
