import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { loadFloorPlan } from "@/lib/floor-plan";
import { WeddingShell } from "@/components/wedding/wedding-shell";
import { FloorSection } from "@/components/floor/floor-section";
import { cx } from "@/components/ui";

// §A The reachable Seating surface — its OWN wedding-level route, deliberately NOT subject to
// the event page's single-event redirect. It selects one event (a chip row only when there are
// 2+; nothing for a one-event wedding), ensures that event's plan exists on first visit (staff),
// and mounts the existing FloorSection unchanged. role is derived exactly as the event page does.
export default async function SeatingPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<{ event?: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, id);
  if (!ctx || ctx.role === "none") notFound();
  const { wedding, events, role, userId } = ctx;
  if (events.length === 0) notFound();

  const wantEvent = (await searchParams).event;
  const event = events.find((e) => e.id === wantEvent) ?? events[0];

  // Couple gets the lens (billing member); day_of read-only — identical to the event page.
  let floorRole: "staff" | "couple" | "view" = "staff";
  if (role === "member") {
    const { data: m } = await supabase.from("wedding_members").select("role").eq("wedding_id", id).eq("user_id", userId).maybeSingle();
    floorRole = (m?.role as string) === "day_of" ? "view" : "couple";
  }

  // Ensure the plan exists so a planner never lands on a "no plan" state they must resolve (§A).
  // Direct find-or-create (staff RLS) — no revalidate during render.
  if (floorRole === "staff") {
    const { data: existing } = await supabase.from("floor_plans").select("id").eq("event_id", event.id).limit(1).maybeSingle();
    if (!existing) await supabase.from("floor_plans").insert({ event_id: event.id, wedding_id: id, name: `${event.label} — seating` });
  }

  const floor = await loadFloorPlan(supabase, event.id);

  return (
    <WeddingShell wedding={wedding} events={events} role={role === "staff" ? "staff" : "member"} active="seating">
      {events.length >= 2 ? (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {events.map((e) => (
            <Link
              key={e.id}
              href={{ pathname: `/wedding/${id}/seating`, query: { event: e.id } }}
              className={cx(
                "rounded-full px-3 py-1 text-[12.5px] transition",
                e.id === event.id ? "bg-ink text-bone" : "border border-hairline text-muted hover:border-ink hover:text-ink",
              )}
            >
              {e.label}
            </Link>
          ))}
        </div>
      ) : null}

      <FloorSection
        eventId={event.id}
        weddingId={id}
        eventLabel={event.label}
        planId={floor.plan?.id ?? null}
        canvas={floor.plan?.canvas ?? { w: 2000, h: 1200 }}
        coupleCanEdit={floor.plan?.coupleCanEdit ?? false}
        tables={floor.tables}
        elements={floor.elements}
        attendees={floor.attendees}
        exceptions={floor.exceptions}
        seatedCount={floor.seatedCount}
        attendingCount={floor.attendingCount}
        role={floorRole}
      />
    </WeddingShell>
  );
}
