import { getLocale, getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Monogram } from "@/components/ui";
import { cx } from "@/components/ui";
import {
  countdownDays, dayNumber, formatDateRange, formatMoney, initials,
  type EventRow, type WeddingRow,
} from "@/lib/wedding";

// The dark wedding hero + the event chip strip. Chips appear only when the
// wedding has ≥ 2 events — the single-event law: a 1-event wedding shows no
// event machinery at all. On an event page (activeEventId set) a breadcrumb
// leads back to the whole wedding and the active chip marks the event.
export async function WeddingHeader({
  wedding,
  events,
  activeEventId = null,
}: {
  wedding: WeddingRow;
  events: EventRow[];
  activeEventId?: string | null;
}) {
  const [tw, te] = [await getTranslations("wedding"), await getTranslations("event")];
  const lang = await getLocale();

  const range = formatDateRange(wedding.date_start, wedding.date_end, lang);
  const days = countdownDays(wedding.date_start);
  const money = formatMoney(wedding.budget_total, lang);
  const eyebrow = [
    wedding.kind ? tw(`create.kind${wedding.kind === "city" ? "City" : "Destination"}`) : null,
    [wedding.location_city, wedding.location_country].filter(Boolean).join(", ") || null,
  ].filter(Boolean).join(" · ");
  const meta = [
    range,
    events.length === 1 ? tw("eventCountOne") : tw("eventCountOther", { count: events.length }),
    wedding.guest_target ? tw("guestsLabel", { count: wedding.guest_target }) : null,
    money,
  ].filter(Boolean).join("  ·  ");

  const multi = events.length >= 2;
  const active = activeEventId ? events.find((e) => e.id === activeEventId) : null;

  return (
    <div className="flex flex-col gap-4">
      {active ? (
        <nav className="text-[13px] text-muted">
          <Link href={`/wedding/${wedding.id}`} className="hover:text-ink">
            {tw("wholeWedding")}
          </Link>
          <span className="mx-2">/</span>
          <span className="text-ink">{active.label}</span>
        </nav>
      ) : null}

      <section className="rounded-3xl bg-ink px-8 py-9 text-bone shadow-hero">
        <div className="flex items-start gap-5">
          <Monogram initials={initials(wedding.couple_display)} size={56} dark />
          <div className="min-w-0 flex-1">
            {eyebrow ? <p className="font-accent text-[16px] text-[rgba(247,244,238,0.7)]">{eyebrow}</p> : null}
            <h1 className="mt-1 font-display text-[34px] leading-tight">{wedding.couple_display}</h1>
            <p className="mt-2 font-accent text-[16px] text-[rgba(247,244,238,0.82)]">
              {meta || tw("noDate")}
              {days != null ? <span className="ml-3 text-[rgba(247,244,238,0.6)]">{days} {tw("days")}</span> : null}
            </p>
          </div>
        </div>
      </section>

      {multi ? (
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <Chip href={`/wedding/${wedding.id}`} active={!active}>
            {tw("wholeWedding")}
          </Chip>
          {events.map((e) => {
            const n = dayNumber(e.event_date, wedding.date_start);
            const sub = [
              n != null ? te("dayN", { n }) : null,
              e.guest_target ? tw("guestsLabel", { count: e.guest_target }) : null,
            ].filter(Boolean).join(" · ");
            return (
              <Chip
                key={e.id}
                href={`/wedding/${wedding.id}/event/${e.id}`}
                active={active?.id === e.id}
                sub={sub || undefined}
              >
                {e.label}
              </Chip>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Chip({
  href,
  active,
  sub,
  children,
}: {
  href: React.ComponentProps<typeof Link>["href"];
  active: boolean;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "flex shrink-0 flex-col rounded-2xl px-4 py-2 text-[13px] transition-colors",
        active ? "bg-ink text-bone" : "bg-bone text-ink hover:bg-sand-soft",
      )}
    >
      <span className="font-medium">{children}</span>
      {sub ? <span className={cx("font-accent text-[12.5px]", active ? "text-[rgba(247,244,238,0.7)]" : "text-muted")}>{sub}</span> : null}
    </Link>
  );
}
