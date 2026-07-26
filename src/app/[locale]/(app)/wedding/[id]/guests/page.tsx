import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { loadGuestBoard } from "@/lib/guests";
import { WeddingHeader } from "@/components/wedding/wedding-header";
import { GuestBoard } from "@/components/guests/guest-board";
import { WeddingNav, cx } from "@/components/ui";

export default async function GuestsTab({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, id);
  if (!ctx || ctx.role === "none") notFound();
  const { wedding, events, role } = ctx;
  const board = await loadGuestBoard(supabase, id);
  const [tw, tp, tg] = [await getTranslations("wedding"), await getTranslations("proposals"), await getTranslations("guests")];

  return (
    <div className="flex flex-col gap-6">
      <WeddingHeader wedding={wedding} events={events} />
      <WeddingNav
        items={
          <>
            <Link href={`/wedding/${id}`} className="text-muted hover:text-ink">{tw("overview")}</Link>
            {role === "staff" ? <Link href={`/wedding/${id}/proposals`} className="text-muted hover:text-ink">{tp("tab")}</Link> : null}
            <Link href={`/wedding/${id}/guests`} className={cx("text-ink")}>{tg("tab")}</Link>
          </>
        }
      />
      <GuestBoard
        weddingId={id}
        role={role}
        events={events}
        rollup={board.rollup}
        counts={board.counts}
        exceptions={board.exceptions}
        touchpoints={board.touchpoints}
        guests={board.guests}
        eventGuests={board.eventGuests}
        rsvpDeadline={wedding.rsvp_deadline ?? null}
        rsvpOpen={wedding.rsvp_open ?? false}
      />
    </div>
  );
}
