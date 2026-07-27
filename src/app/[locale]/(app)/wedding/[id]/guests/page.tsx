import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { loadGuestBoard } from "@/lib/guests";
import { WeddingShell } from "@/components/wedding/wedding-shell";
import { GuestBoard } from "@/components/guests/guest-board";

export default async function GuestsTab({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, id);
  if (!ctx || ctx.role === "none") notFound();
  const { wedding, events, role } = ctx;
  const board = await loadGuestBoard(supabase, id);

  return (
    <WeddingShell wedding={wedding} events={events} role={role} active="guests">
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
    </WeddingShell>
  );
}
