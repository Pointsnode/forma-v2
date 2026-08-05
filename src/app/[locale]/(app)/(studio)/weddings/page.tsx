import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Button, PhaseDots, SectionTitle, Bento, BentoCard, BentoBig, BentoFoot, Badge, type BadgeTone,
  heroToneAt,
} from "@/components/ui";
import {
  countdownDays, countdownLabel, formatDateRange, formatMoney, phaseLabel, type Phase, type WeddingRow,
} from "@/lib/wedding";

// Closed weddings get the near-ink "settling" hero (prototype).
const CLOSED_TONE = "#1E1E1E";

// Phase → badge tone: sage once the details/wedding are underway, sand while the
// foundations are still forming.
function phaseTone(p: Phase): BadgeTone {
  return p === "details" || p === "wedding_days" || p === "closed" ? "sage" : "sand";
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
      <SectionTitle
        title={t("weddings")}
        accent={t("weddingsHint")}
        action={<Link href="/weddings/new"><Button>{t("createWedding")}</Button></Link>}
        className="mt-1"
      />

      {error || weddings.length === 0 ? (
        <div className="rounded-[var(--radius)] bg-bone p-10 text-center">
          <p className="font-accent text-[17px] text-muted">{t("empty")}</p>
        </div>
      ) : (
        <Bento>
          {weddings.map((w, i) => {
            const days = countdownDays(w.date_start);
            const range = formatDateRange(w.date_start, w.date_end, lang);
            const count = w.wedding_events?.[0]?.count ?? 1;
            const money = formatMoney(w.budget_total, lang);
            const location = [w.location_city, w.location_country].filter(Boolean).join(", ");
            const meta = [
              range,
              count === 1 ? tw("eventCountOne") : tw("eventCountOther", { count }),
              w.guest_target ? tw("guestsLabel", { count: w.guest_target }) : null,
              money,
            ].filter(Boolean).join(" · ");
            return (
              <Link key={w.id} href={`/wedding/${w.id}`} className="group block">
                <BentoCard
                  tone={w.phase === "closed" ? CLOSED_TONE : heroToneAt(i)}
                  heroLeft={location || tw("noDate")}
                  heroRight={
                    w.phase === "closed" ? (
                      <BentoBig size={16}>{tw("settled")}</BentoBig>
                    ) : days != null && days >= 0 ? (
                      <BentoBig>{days}<span className="ml-1 font-sans text-[12px] opacity-80">{tw("days")}</span></BentoBig>
                    ) : (
                      <BentoBig size={16}>{countdownLabel(w.date_start, w.phase, tw) || tp(w.phase)}</BentoBig>
                    )
                  }
                  className="transition-shadow"
                >
                  <p className="flex items-center gap-2 font-display text-[17px] text-ink">
                    {w.couple_display} <PhaseDots phase={w.phase} />
                  </p>
                  <p className="mt-1 text-[12px] text-muted">{meta}</p>
                  <BentoFoot>
                    <Badge tone={phaseTone(w.phase)}>{phaseLabel(w.phase, tp)}</Badge>
                    <span className="ml-auto text-[11.5px] tracking-[0.03em] text-wine group-hover:underline group-hover:underline-offset-2">{tw("openWedding")} →</span>
                  </BentoFoot>
                </BentoCard>
              </Link>
            );
          })}
        </Bento>
      )}
    </div>
  );
}
