import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  Card, Heading, Accent, SectionLabel, Pill, Button, Monogram, Fact,
  HeroShell, WeddingNav, EventBar, EventChips, type PillTone,
} from "@/components/ui";

const TONES: PillTone[] = ["ink", "bone", "sand", "wine", "sage"];

/** DoD 4: the M0 design system rendered from the canonical prototype's tokens.
 *  Public (allowlisted in middleware) so the gate can view it without auth. */
export default async function StyleguidePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("styleguide");

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <p className="font-display text-[30px] tracking-tight text-ink">{t("title")}</p>
      <p className="mb-10 font-accent text-[18px] text-muted">{t("subtitle")}</p>

      <div className="flex flex-col gap-10">
        <section>
          <SectionLabel>Hero shell</SectionLabel>
          <div className="mt-3">
            <HeroShell
              monogram="P&A"
              eyebrow="Destination wedding"
              title="Priya & Arjun"
              facts={
                <>
                  <Fact value="184" label="guests" />
                  <Fact value="3" label="events" />
                  <Fact value="$142,000" label="total budget" />
                </>
              }
            />
          </div>
        </section>

        <section>
          <SectionLabel>Event bar + sub-nav shells</SectionLabel>
          <div className="mt-3">
            <EventBar
              chips={<EventChips labels={["Whole wedding", "Mehndi", "Ceremony", "Reception"]} activeIndex={0} />}
              subnav={
                <>
                  <span className="text-ink">Overview</span>
                  <span>Venue</span>
                  <span>Itinerary</span>
                  <span>Budget</span>
                </>
              }
            />
          </div>
        </section>

        <section>
          <SectionLabel>Wedding nav shell</SectionLabel>
          <WeddingNav
            className="mt-3"
            items={
              <>
                <span className="text-ink">Cockpit</span>
                <span>Weddings</span>
                <span>Calendar</span>
                <span>Catalog</span>
              </>
            }
          />
        </section>

        <section>
          <SectionLabel>Cards + type</SectionLabel>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Card>
              <Heading>Money radar</Heading>
              <p className="mt-1 font-accent text-[16px] text-taupe">Three payments due within 60 days.</p>
              <div className="mt-4 flex gap-6">
                <Fact value="$18,400" label="due soon" />
                <Fact value="$96,200" label="paid" />
              </div>
            </Card>
            <Card lift>
              <Heading>The chase list</Heading>
              <p className="mt-1 font-accent text-[16px] text-taupe">Two proposals waiting on the couple.</p>
              <div className="mt-4 flex items-center gap-3">
                <Monogram initials="MC" />
                <Accent>Marigold Catering — quote sent 4 days ago</Accent>
              </div>
            </Card>
          </div>
        </section>

        <section>
          <SectionLabel>Pills</SectionLabel>
          <div className="mt-3 flex flex-wrap gap-2">
            {TONES.map((tone) => (
              <Pill key={tone} tone={tone}>{tone}</Pill>
            ))}
          </div>
        </section>

        <section>
          <SectionLabel>Buttons + monograms</SectionLabel>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="ghost">Ghost</Button>
            <Monogram initials="F" />
            <Monogram initials="P&A" size={56} />
          </div>
        </section>
      </div>
    </main>
  );
}
