import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { loadGuestBoard } from "@/lib/guests";
import { loadEventTable } from "@/lib/event-table";
import { WeddingShell } from "@/components/wedding/wedding-shell";
import { GuestBoard } from "@/components/guests/guest-board";
import { SendTouchpoints } from "@/components/guests/send-touchpoints";
import { EventTablePicker } from "@/components/guests/event-table-picker";
import { EventGuestTable } from "@/components/wedding/event-guest-table";

export default async function GuestsTab({ params, searchParams }: { params: Promise<{ locale: string; id: string }>; searchParams: Promise<{ event?: string }> }) {
  const { locale, id } = await params;
  const { event: eventParam } = await searchParams;
  setRequestLocale(locale);
  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, id);
  if (!ctx || ctx.role === "none") notFound();
  const { wedding, events, role } = ctx;
  const board = await loadGuestBoard(supabase, id);

  // §2 — the page-level event picker: only stands with a real event layer.
  const pickable = events.length >= 2;
  const picked = pickable && eventParam ? events.find((e) => e.id === eventParam) ?? null : null;
  const table = picked ? await loadEventTable(supabase, picked.id) : null;

  return (
    <WeddingShell wedding={wedding} events={events} role={role} active="guests">
      {(pickable || role === "staff") ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {pickable ? <EventTablePicker events={events.map((e) => ({ id: e.id, label: e.label }))} value={picked?.id ?? null} /> : <span />}
          {role === "staff" ? <SendTouchpoints weddingId={id} /> : null}
        </div>
      ) : null}
      {picked && table ? <div className="mb-[18px]"><EventGuestTable eventName={picked.label} options={table.options} guests={table.guests} /></div> : null}
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
        seats={board.seats}
        rsvpDeadline={wedding.rsvp_deadline ?? null}
        rsvpOpen={wedding.rsvp_open ?? false}
      />
    </WeddingShell>
  );
}
