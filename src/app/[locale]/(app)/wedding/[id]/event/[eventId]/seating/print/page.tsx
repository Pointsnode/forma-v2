import { notFound } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { loadFloorPlan } from "@/lib/floor-plan";
import { seatLabel } from "@/lib/seat-geometry.mjs";
import { formatDateRange } from "@/lib/wedding";
import { PrintButton } from "@/components/floor/print-button";

// The printable exports (§1E): PDF title block (browser print → PDF) + escort cards.
export default async function SeatingPrint({ params }: { params: Promise<{ locale: string; id: string; eventId: string }> }) {
  const { locale, id, eventId } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, id);
  if (!ctx || ctx.role === "none") notFound();
  const { wedding, events } = ctx;
  const event = events.find((e) => e.id === eventId);
  if (!event) notFound();
  const t = await getTranslations("floor");
  const lang = await getLocale();

  const floor = await loadFloorPlan(supabase, eventId);
  const { data: venueRows } = await supabase.from("event_vendors").select("venue_booked, wedding_vendors(vendors(name, kind))").eq("event_id", eventId);
  const venue = ((venueRows ?? []) as unknown as { venue_booked: boolean; wedding_vendors: { vendors: { name: string; kind: string } | null } | null }[])
    .find((r) => r.venue_booked && r.wedding_vendors?.vendors?.kind === "venue")?.wedding_vendors?.vendors?.name ?? floor.plan?.name ?? "·";
  const date = formatDateRange(event.event_date ?? wedding.date_start, null, lang) ?? "·";
  const escort = floor.tables.flatMap((tb) => tb.seats.map((s) => ({ ...s, tableName: tb.name }))).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div data-theme="bone" className="mx-auto max-w-[860px] bg-bone p-8 text-ink print:p-0">
      <div className="mb-4 flex items-center justify-between print:hidden">
        <a href={`/wedding/${id}/event/${eventId}#seating`} className="text-[12.5px] text-muted hover:text-ink">← {t("backToEditor")}</a>
        <PrintButton />
      </div>

      {/* title block */}
      <header className="mb-6 border-b border-hairline pb-4">
        <h1 className="font-display text-[26px] text-ink">{wedding.couple_display}</h1>
        <p className="font-accent text-[15px] italic text-taupe">{event.label} · {venue} · {date}</p>
        <p className="mt-1 text-[13px] text-muted">{t("titleTotals", { tables: floor.tables.length, seated: floor.seatedCount, attending: floor.attendingCount })}</p>
      </header>

      {/* §L the venue blueprint, so the printed plan shows the room */}
      {floor.plan?.backgroundUrl ? (
        <section className="mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={floor.plan.backgroundUrl} alt={t("blueprint")} className="w-full rounded-[var(--radius)] border border-hairline" />
        </section>
      ) : null}

      {/* by table */}
      <section className="mb-8">
        <h2 className="mb-2 text-[12px] uppercase tracking-[0.14em] text-muted">{t("byTable")}</h2>
        <div className="grid grid-cols-2 gap-4">
          {floor.tables.map((tb) => (
            <div key={tb.id} className="break-inside-avoid rounded-[var(--radius)] border border-hairline p-3">
              <p className="mb-1 flex justify-between font-display text-[15px]">{tb.name}<span className="text-[12px] text-muted">{tb.seats.length}/{tb.capacity}</span></p>
              {tb.seats.sort((a, b) => a.seatNo - b.seatNo).map((s) => (
                <p key={s.seatNo} className="text-[12.5px] text-ink-soft"><b className="text-taupe">{seatLabel(s.seatNo)}</b> · {s.name}{s.diet.length ? ` · ${s.diet.join(", ")}` : ""}</p>
              ))}
              {tb.seats.length === 0 ? <p className="text-[12px] text-muted">{t("emptyTable")}</p> : null}
            </div>
          ))}
        </div>
      </section>

      {/* escort cards */}
      <section>
        <h2 className="mb-2 text-[12px] uppercase tracking-[0.14em] text-muted">{t("escortCards")}</h2>
        <div className="grid grid-cols-3 gap-3">
          {escort.map((e) => (
            <div key={e.guestId} className="break-inside-avoid rounded-[var(--radius)] border border-hairline p-3 text-center">
              <p className="font-display text-[15px] text-ink">{e.name}</p>
              <p className="mt-1 text-[12.5px] text-taupe">{e.tableName} · {t("chair")} {seatLabel(e.seatNo)}</p>
              {e.diet.length ? <p className="mt-0.5 text-[11px] text-wine">{e.diet.join(", ")}</p> : null}
            </div>
          ))}
          {escort.length === 0 ? <p className="col-span-3 py-4 text-center font-accent text-[15px] text-muted">{t("noneSeated")}</p> : null}
        </div>
      </section>
    </div>
  );
}
