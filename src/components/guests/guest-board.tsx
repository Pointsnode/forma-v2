import { getTranslations } from "next-intl/server";
import { Card, Heading, SectionLabel, SectionTitle, StatRow, Stat } from "@/components/ui";
import { GuestIntake } from "./guest-intake";
import { AllGuests } from "./all-guests";
import { RsvpControls } from "./rsvp-controls";
import { TouchpointTimeline } from "./touchpoint-timeline";
import { reminderChaseCount, seatCells, type Rollup, type EventCount, type Exception, type Touchpoint, type GuestRow, type EventGuestRow, type SeatRow } from "@/lib/guests";
import type { EventRow } from "@/lib/wedding";

const REASON_KEY: Record<string, string> = { no_email: "reasonNoEmail", missing_plus_one: "reasonMissingPlusOne", unanswered: "reasonUnanswered" };

export async function GuestBoard({
  weddingId, role, events, rollup, counts, exceptions, touchpoints, guests, eventGuests, seats, rsvpDeadline, rsvpOpen,
}: {
  weddingId: string; role: "staff" | "member";
  events: EventRow[]; rollup: Rollup; counts: EventCount[]; exceptions: Exception[];
  touchpoints: Touchpoint[]; guests: GuestRow[]; eventGuests: EventGuestRow[]; seats: SeatRow[];
  rsvpDeadline: string | null; rsvpOpen: boolean;
}) {
  const [t, tt] = [await getTranslations("guests"), await getTranslations("touchpoints")];
  const countFor = (id: string) => counts.find((c) => c.event_id === id);
  const chase = reminderChaseCount(guests, eventGuests);
  const cells = seatCells(guests, eventGuests, seats);
  const empty = guests.length === 0;

  return (
    <div className="flex flex-col gap-6">
      <SectionTitle title={t("title")} accent={t("hint")} className="mb-0 mt-0" />

      {/* Headline rollup — the stat strip */}
      <StatRow>
        <Stat value={rollup.invited} label={t("invited")} />
        <Stat value={rollup.answered} valueClassName="text-sage-ink" label={t("answered")} />
        <Stat value={rollup.yes} label={t("yes")} />
        <Stat value={rollup.pending} valueClassName={rollup.pending ? "text-wine" : undefined} label={t("pending")} />
      </StatRow>

      {empty ? (
        <Card><div className="flex flex-col items-center gap-3 py-4">
          <p className="font-accent text-[16px] text-muted">{t("noGuests")}</p>
          <GuestIntake weddingId={weddingId} existing={guests.map((g) => ({ full_name: g.full_name, email: g.email, phone: g.phone }))} />
        </div></Card>
      ) : (
        <>
          {/* Per-event bars */}
          {events.length >= 2 ? (
            <Card>
              <Heading className="mb-3 text-[18px]">{t("perEventTitle")}</Heading>
              <div className="flex flex-col gap-4">
                {events.map((e) => {
                  const c = countFor(e.id);
                  const inv = c?.invited ?? 0;
                  const pct = (n: number) => (inv ? Math.round((n / inv) * 100) : 0);
                  return (
                    <div key={e.id}>
                      <div className="flex items-baseline justify-between">
                        <span className="text-[14px] text-ink">{e.label}</span>
                        <span className="font-accent text-[13px] text-muted">{c?.confirmed ?? 0} {t("yes").toLowerCase()} · {c?.pending ?? 0} {t("pending").toLowerCase()}</span>
                      </div>
                      <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-sand-soft">
                        <span className="bg-sage" style={{ width: `${pct(c?.confirmed ?? 0)}%` }} />
                        <span className="bg-sand" style={{ width: `${pct(c?.maybe ?? 0)}%` }} />
                        <span className="bg-maroon" style={{ width: `${pct(c?.declined ?? 0)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          ) : null}

          {/* Exceptions — the only people who need a human */}
          <Card>
            <Heading className="text-[18px]">{t("exceptions")}</Heading>
            <SectionLabel className="mb-3 mt-0.5 normal-case tracking-normal text-[12px]">{t("exceptionsHint")}</SectionLabel>
            {exceptions.length === 0 ? (
              <p className="py-3 text-center font-accent text-[15px] text-muted">{t("noExceptions")}</p>
            ) : (
              <ul className="flex flex-col">
                {exceptions.map((x, i) => (
                  <li key={`${x.guest_id}-${x.reason}-${i}`} className="flex items-center gap-3 py-2 [box-shadow:inset_0_-1px_0_var(--color-hairline)] last:shadow-none">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-wine-soft text-[12px] text-wine">!</span>
                    <span className="flex-1 text-[14px] text-ink">{x.full_name}</span>
                    <span className="font-accent text-[13px] text-muted">{t(REASON_KEY[x.reason] ?? "reasonNoEmail")}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Timeline */}
          <Card>
            <Heading className="text-[18px]">{tt("timeline")}</Heading>
            <div className="mt-3"><TouchpointTimeline weddingId={weddingId} touchpoints={touchpoints} reminderChase={chase} readOnly={role === "member"} /></div>
          </Card>

          {/* RSVP controls (staff only) */}
          {role === "staff" ? (
            <Card>
              <Heading className="mb-3 text-[18px]">{t("rsvpControls")}</Heading>
              <RsvpControls weddingId={weddingId} deadline={rsvpDeadline} open={rsvpOpen} />
            </Card>
          ) : null}

          {/* Intake + all guests */}
          <Card>
            <div className="flex flex-col gap-4">
              <GuestIntake weddingId={weddingId} existing={guests.map((g) => ({ full_name: g.full_name, email: g.email, phone: g.phone }))} />
              <AllGuests weddingId={weddingId} guests={guests} canDelete={role === "staff"} seatCells={cells} />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
