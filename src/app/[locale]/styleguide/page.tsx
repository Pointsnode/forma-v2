import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  Card, Heading, Accent, SectionLabel, Button, Monogram, Fact,
  HeroShell, EventBar, EventChips, Badge, Chip, DomainStar,
  type BadgeTone, type ChipTone, type Domain,
} from "@/components/ui";

// The Edition One living reference (foundation milestone). Public (allowlisted in
// middleware) so the gate can view it without auth.
const SWATCHES: { name: string; var: string; on?: "bone" | "ink" }[] = [
  { name: "charcoal", var: "--color-ink", on: "ink" },
  { name: "bone", var: "--color-bone" },
  { name: "hairline", var: "--color-hairline" },
  { name: "graphite", var: "--color-graphite", on: "ink" },
  { name: "ash", var: "--color-ash", on: "ink" },
  { name: "champagne", var: "--color-champagne" },
  { name: "taupe", var: "--color-taupe", on: "ink" },
  { name: "wine", var: "--color-wine", on: "ink" },
  { name: "oxblood", var: "--color-oxblood", on: "ink" },
  { name: "teal", var: "--color-teal", on: "ink" },
];
const DOMAINS: { domain: Domain; label: string; note: string }[] = [
  { domain: "money", label: "Money", note: "teal" },
  { domain: "time", label: "Time", note: "champagne" },
  { domain: "people", label: "People", note: "taupe" },
];
const CHIPS: { tone: ChipTone; label: string }[] = [
  { tone: "settled", label: "Paid" },
  { tone: "attention", label: "Due" },
  { tone: "pending", label: "Quoted" },
  { tone: "time", label: "74 days" },
];
const BADGES: BadgeTone[] = ["sage", "wine", "sand", "maroon", "ink"];

export default async function StyleguidePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("styleguide");

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <p className="font-display text-[30px] tracking-tight text-ink">{t("title")}</p>
      <p className="mb-10 font-accent text-[18px] text-muted">Edition One foundation, one corner, one grammar.</p>

      <div className="flex flex-col gap-12">
        {/* Top bar */}
        <section>
          <SectionLabel>Top bar</SectionLabel>
          <div className="mt-3 flex h-[62px] items-center gap-7 rounded-[var(--radius)] bg-ink px-8 text-bone">
            <span className="font-display text-[20px] leading-none"><i>f</i>orma</span>
            <span className="border-l border-hairline-dark pl-5 text-[12px] text-champagne">Atelier Demo Studio</span>
            <div className="flex-1" />
            <span className="text-[11px] uppercase tracking-[0.16em] text-champagne">3 pending</span>
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[var(--radius)] border border-hairline-dark font-display text-[13px]">FP</span>
          </div>
        </section>

        {/* Tokens */}
        <section>
          <SectionLabel>Tokens</SectionLabel>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {SWATCHES.map((s) => (
              <div key={s.name} className="rounded-[var(--radius)] border border-hairline p-3" style={{ background: `var(${s.var})`, color: s.on === "ink" ? "#F5F2EB" : "#111111" }}>
                <div className="text-[12px] font-medium">{s.name}</div>
                <div className="text-[10.5px] opacity-70">{s.var}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Domain roles */}
        <section>
          <SectionLabel>The four domains</SectionLabel>
          <div className="mt-3 flex flex-wrap items-center gap-8">
            {DOMAINS.map((d) => (
              <span key={d.domain} className="inline-flex items-center gap-2 text-[14px] text-ink">
                <DomainStar domain={d.domain} size={13} /> {d.label} <span className="text-muted">({d.note})</span>
              </span>
            ))}
            <span className="inline-flex items-center gap-2 text-[14px] text-muted">
              <DomainStar fill="#111111" size={13} /> Places = photography, framed in charcoal, never tinted
            </span>
          </div>
        </section>

        {/* Chip grammar */}
        <section>
          <SectionLabel>Chip grammar (the only place status colour lives)</SectionLabel>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {CHIPS.map((c) => <Chip key={c.tone} tone={c.tone}>{c.label}</Chip>)}
          </div>
          <p className="mt-3 text-[12px] text-muted">Legacy Badge tones map onto the same grammar:</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {BADGES.map((b) => <Badge key={b} tone={b}>{b}</Badge>)}
          </div>
        </section>

        {/* Buttons */}
        <section>
          <SectionLabel>Buttons</SectionLabel>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary (wine)</Button>
            <Button variant="dark">Dark</Button>
            <Button variant="ghost">Ghost</Button>
          </div>
        </section>

        {/* Cards */}
        <section>
          <SectionLabel>Cards (bone, hairline, no shadow)</SectionLabel>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Card>
              <div className="flex items-center gap-2"><DomainStar domain="money" /><Heading className="text-[18px]">Money radar</Heading></div>
              <p className="mt-1 font-accent text-[16px] text-taupe">Three payments due within 60 days.</p>
              <div className="mt-4 flex items-center gap-3">
                <Fact value="$18,400" label="due soon" />
                <Badge tone="wine">Due</Badge>
                <Badge tone="sage">Paid</Badge>
              </div>
            </Card>
            <Card>
              <Heading className="text-[18px]">The chase list</Heading>
              <p className="mt-1 font-accent text-[16px] text-taupe">Two proposals waiting on the couple.</p>
              <div className="mt-4 flex items-center gap-3">
                <Monogram initials="MC" />
                <Accent>Marigold Catering · quote sent 4 days ago</Accent>
              </div>
            </Card>
          </div>
        </section>

        {/* Hero band */}
        <section>
          <SectionLabel>Hero band (flat charcoal, no radius, no shadow)</SectionLabel>
          <div className="mt-3">
            <HeroShell
              monogram="P&A"
              eyebrow="Destination wedding"
              title="Priya & Arjun"
              facts={
                <>
                  <span className="flex flex-col gap-0.5"><span className="font-display text-[26px] leading-none text-bone">184</span><span className="font-accent text-[15px] text-champagne">guests</span></span>
                  <span className="flex flex-col gap-0.5"><span className="font-display text-[26px] leading-none text-bone">3</span><span className="font-accent text-[15px] text-champagne">events</span></span>
                  <span className="flex flex-col gap-0.5"><span className="font-display text-[26px] leading-none text-bone">$142,000</span><span className="font-accent text-[15px] text-champagne">total budget</span></span>
                </>
              }
            />
            <div className="mt-3">
              <EventBar chips={<EventChips labels={["Whole wedding", "Mehndi", "Ceremony", "Reception"]} activeIndex={0} />} />
            </div>
          </div>
        </section>

        {/* Corner system */}
        <section>
          <SectionLabel>The Soft corner (var(--radius) = 4px, everywhere)</SectionLabel>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <span className="rounded-[var(--radius)] border border-hairline bg-bone px-4 py-2 text-[13px]">Container</span>
            <Button variant="dark">Button</Button>
            <Chip tone="settled">Chip</Chip>
            <Monogram initials="FP" size={40} />
            <input className="rounded-[var(--radius)] border border-hairline bg-bone px-3 py-2 text-[13px] outline-none focus:border-ink" placeholder="Input" />
          </div>
        </section>
      </div>
    </main>
  );
}
