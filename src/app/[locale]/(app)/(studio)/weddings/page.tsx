import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { Heading, Button, PhaseDots } from "@/components/ui";
import {
  countdownDays, formatDateRange, formatMoney, phaseOrdinal, type WeddingRow,
} from "@/lib/wedding";

// A muted brand tone per wedding, keyed off the id — no gradients, just a solid
// hero block behind the countdown (the prototype's bento hero).
const HERO_TONES = ["#4E5C47", "#5C2B35", "#8A7355", "#3A1A20", "#4E5147", "#6B4A2F"];
function tone(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return HERO_TONES[h % HERO_TONES.length];
}

export default async function WeddingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tw, tp] = [await getTranslations("studio"), await getTranslations("wedding"), await getTranslations("phase")];
  const lang = await getLocale();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("weddings")
    .select("id, couple_display, phase, kind, location_city, location_country, date_start, date_end, guest_target, budget_total, wedding_events(count)")
    .order("date_start", { ascending: true, nullsFirst: false });
  const weddings = (data ?? []) as unknown as (WeddingRow & { wedding_events: { count: number }[] })[];

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div>
          <Heading className="text-[28px]">{t("weddings")}</Heading>
          <p className="font-accent text-[16px] text-muted">{t("weddingsHint")}</p>
        </div>
        <Link href="/weddings/new"><Button>{t("createWedding")}</Button></Link>
      </div>

      {error || weddings.length === 0 ? (
        <div className="rounded-2xl bg-bone p-10 text-center shadow-card">
          <p className="font-accent text-[17px] text-muted">{t("empty")}</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {weddings.map((w) => {
            const days = countdownDays(w.date_start);
            const range = formatDateRange(w.date_start, w.date_end, lang);
            const count = w.wedding_events?.[0]?.count ?? 1;
            const money = formatMoney(w.budget_total, lang);
            const meta = [
              range,
              count === 1 ? tw("eventCountOne") : tw("eventCountOther", { count }),
              w.guest_target ? tw("guestsLabel", { count: w.guest_target }) : null,
              money,
            ].filter(Boolean).join(" · ");
            return (
              <Link
                key={w.id}
                href={`/wedding/${w.id}`}
                className="group flex flex-col overflow-hidden rounded-2xl bg-paper shadow-card transition-shadow hover:shadow-lift"
              >
                <div className="flex items-end justify-between px-5 py-6 text-bone" style={{ background: tone(w.id) }}>
                  <span className="font-accent text-[15px] opacity-90">
                    {[w.location_city, w.location_country].filter(Boolean).join(", ") || tw("noDate")}
                  </span>
                  {days != null ? (
                    <span className="font-display text-[30px] leading-none">
                      {days}
                      <span className="ml-1 font-sans text-[12px] opacity-80">{tw("days")}</span>
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-col gap-1.5 p-5">
                  <p className="flex items-center gap-2 font-display text-[19px] text-ink">
                    {w.couple_display} <PhaseDots phase={w.phase} />
                  </p>
                  <p className="font-accent text-[15.5px] text-muted">{meta}</p>
                  <p className="mt-1 text-[12.5px] text-taupe">
                    {tp("ordinal", { n: phaseOrdinal(w.phase) })} · {tp(w.phase)}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
