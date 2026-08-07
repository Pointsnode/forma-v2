import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { loadFloorPlan } from "@/lib/floor-plan";
import { loadEventTable } from "@/lib/event-table";
import { plateCounts } from "@/lib/plate.mjs";
import { PlateGlyph, type GlyphVariant } from "@/components/wedding/plate-glyph";
import { PrintButton } from "@/components/floor/print-button";
import { DomainStar, Wordmark } from "@/components/ui";
import { formatDateRange } from "@/lib/wedding";
import { intlTag } from "@/lib/intl";

// §4 — the caterer sheet: the document this feature exists for. Print-optimized, ALWAYS bone
// (data-theme="bone"), in the WEDDING's language. Every fact already exists.
export default async function TablePrintPage({ params }: { params: Promise<{ locale: string; id: string; eventId: string }> }) {
  const { locale, id, eventId } = await params;
  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, id);
  if (!ctx || ctx.role === "none") notFound();
  const { wedding, events } = ctx;
  const event = events.find((e) => e.id === eventId);
  if (!event) notFound();

  const wl = wedding.locale ?? locale;
  setRequestLocale(locale);
  const t = await getTranslations({ locale: wl, namespace: "tableSheet" });

  const [floor, { options, guests }, { data: venueRow }] = await Promise.all([
    loadFloorPlan(supabase, eventId),
    loadEventTable(supabase, eventId),
    supabase.from("event_vendors").select("venue_booked, wedding_vendors(vendors(name, kind))").eq("event_id", eventId).eq("venue_booked", true).maybeSingle(),
  ]);
  const venue = (venueRow as unknown as { wedding_vendors: { vendors: { name: string; kind: string } | null } | null } | null)?.wedding_vendors?.vendors ?? null;

  const optByLetter = new Map(options.map((o) => [o.letter, o.label]));
  const optById = new Map(options.map((o) => [o.id, o]));
  const dietaryOf = new Map(guests.map((g) => [g.guestId, g.dietary]));
  const counts = plateCounts(guests, (cid: string) => optById.get(cid)?.letter ?? "");
  const seated = floor.tables.reduce((n, tb) => n + tb.seats.length, 0);
  const dfmt = new Intl.DateTimeFormat(intlTag(wl), { month: "long", day: "numeric", year: "numeric" });
  const dateStr = event.event_date ? dfmt.format(new Date(event.event_date + "T00:00:00")) : (formatDateRange(wedding.date_start, wedding.date_end, wl) ?? "");
  const headMeta = [dateStr, venue?.name, t("nSeated", { n: seated })].filter(Boolean).join(" · ");
  const unseatedYes = guests.filter((g) => g.rsvp === "yes" && g.seatNo == null);

  return (
    <div data-theme="bone" className="mx-auto max-w-[660px] bg-bone p-4 text-ink print:p-0">
      <div className="mb-3 flex items-center justify-between print:hidden">
        <Link href={`/wedding/${id}/event/${eventId}?tab=seating`} className="text-[12.5px] text-muted hover:text-ink">← {t("back")}</Link>
        <PrintButton />
      </div>

      <div className="overflow-hidden rounded-[var(--radius)] border border-hairline">
        {/* charcoal head, star centered (the preflight fix) */}
        <div className="bg-ink px-6 py-7 text-center">
          <div className="flex justify-center"><DomainStar fill="#D7C3A5" size={15} /></div>
          <p className="mt-2.5 text-[10px] font-medium uppercase tracking-[0.24em] text-champagne">{t("kicker")}</p>
          <p className="mt-1.5 font-display text-[23px] text-bone">{event.label} · {wedding.couple_display}</p>
          {headMeta ? <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-champagne">{headMeta}</p> : null}
        </div>

        <div className="px-6 py-4">
          {/* plate-count line, one row wrapping as whole units */}
          {options.length ? (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pb-1 text-[12.5px] text-ink">
              {options.map((o) => (
                <span key={o.id} className="inline-flex items-center gap-1.5"><PlateGlyph letter={o.letter} size={18} />{o.label} · <b className="font-medium tabular-nums">{counts.byLetter[o.letter] ?? 0}</b></span>
              ))}
              <span className="text-wine">{t("countSummary", { unchosen: counts.unchosen, dietary: counts.dietary })}</span>
            </div>
          ) : null}

          {/* every table in seat order */}
          {floor.tables.map((tb) => (
            <div key={tb.id}>
              <p className="border-b border-hairline pb-1.5 pt-3 text-[10px] font-medium uppercase tracking-[0.24em] text-muted">{tb.name} · {t(`shape_${tb.shape}`)} · {t("ofN", { n: tb.capacity })}</p>
              {[...tb.seats].sort((a, b) => a.seatNo - b.seatNo).map((s) => {
                const label = s.letter ? optByLetter.get(s.letter) : null;
                const diet = dietaryOf.get(s.guestId);
                return (
                  <div key={s.seatNo} className="grid grid-cols-[40px_1fr_26px_1fr_auto] items-center gap-3 border-b border-hairline py-2 text-[13px] last:border-b-0">
                    <span className="tabular-nums text-muted">{s.seatNo + 1}</span>
                    <span className="text-ink">{s.name}</span>
                    <span>{s.letter ? <PlateGlyph letter={s.letter} variant={(s.hasDiet ? "dietary" : "standard") as GlyphVariant} size={20} /> : <PlateGlyph variant="empty" size={20} />}</span>
                    <span className="text-ink">{label ?? ""}</span>
                    <span className="text-[11.5px] text-wine">{diet ?? ""}</span>
                  </div>
                );
              })}
            </div>
          ))}

          {/* appendix: yes, but seated nowhere */}
          {unseatedYes.length ? (
            <div className="mt-4">
              <p className="border-b border-hairline pb-1.5 pt-2 text-[10px] font-medium uppercase tracking-[0.24em] text-muted">{t("appendix", { n: unseatedYes.length })}</p>
              {unseatedYes.map((g) => {
                const opt = g.choiceId ? optById.get(g.choiceId) : null;
                return (
                  <div key={g.guestId} className="grid grid-cols-[1fr_26px_1fr] items-center gap-3 border-b border-hairline py-2 text-[13px] last:border-b-0">
                    <span className="text-ink">{g.name}</span>
                    <span>{opt ? <PlateGlyph letter={opt.letter} variant={(g.dietary ? "dietary" : "standard") as GlyphVariant} size={20} /> : <PlateGlyph variant="empty" size={20} />}</span>
                    <span className="text-ink">{opt?.label ?? ""}</span>
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="pt-4 text-center"><Wordmark size={16} /><p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted">{t("footer")}</p></div>
        </div>
      </div>
    </div>
  );
}
