import { setRequestLocale } from "next-intl/server";
import {
  Card, Heading, SectionLabel, Button, Monogram, Fact,
  HeroShell, EventBar, EventChips, Badge, Chip, DomainStar, DomainHeadCard,
  type BadgeTone, type ChipTone, type Domain,
} from "@/components/ui";

// The Edition One living reference (foundation milestone). Public (allowlisted in
// middleware) so the gate can view it without auth. ?theme=night flips the semantic
// surface/type tokens to the Night register — proving the theme architecture without
// exposing users to un-QA'd surfaces (no user route sets data-theme).
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
  { tone: "urgent", label: "Overdue 4 days" },
  { tone: "pending", label: "Quoted" },
  { tone: "time", label: "74 days" },
];
const BADGES: BadgeTone[] = ["sage", "wine", "sand", "maroon", "ink"];

// Night tokens (the second block in globals.css). Listed here for the reference readout.
const NIGHT_TOKENS: { role: string; day: string; night: string }[] = [
  { role: "surface-page (the room)", day: "#F5F2EB", night: "#161513" },
  { role: "surface-card (raised)", day: "#F5F2EB", night: "#1C1A18" },
  { role: "surface-chrome (top bar)", day: "#111111", night: "#0D0C0B" },
  { role: "text-primary", day: "#111111", night: "#F5F2EB" },
  { role: "text-meta", day: "#6B655B", night: "#8F887B" },
  { role: "hairline", day: "#E4DFD3", night: "rgba(245,242,235,.12)" },
];

export default async function StyleguidePage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ theme?: string }> }) {
  const { locale } = await params;
  const { theme } = await searchParams;
  setRequestLocale(locale);
  const night = theme === "night";

  return (
    <main {...(night ? { "data-theme": "night" } : {})} className="min-h-screen bg-surface-page">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <p className="font-display text-[30px] tracking-tight text-text-primary">Edition One</p>
        <p className="mb-10 font-accent text-[18px] text-text-meta">One corner, one grammar{night ? " · Night register" : ""}. Append <span className="font-sans">?theme=night</span> to preview Night.</p>

        <div className="flex flex-col gap-12">
        {/* Top bar */}
        <section>
          <SectionLabel>Top bar</SectionLabel>
          <div className="mt-3 flex h-[62px] items-center gap-7 rounded-[var(--radius)] bg-surface-chrome px-8 text-bone">
            <span className="font-display text-[20px] leading-none"><i>f</i>orma</span>
            <span className="border-l border-hairline-dark pl-5 text-[12px] text-champagne">Atelier Demo Studio</span>
            <div className="flex-1" />
            <span className="text-[11px] uppercase tracking-[0.16em] text-champagne">3 pending</span>
            <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[var(--radius)] border border-hairline-dark font-display text-[13px]">FP</span>
          </div>
        </section>

        {/* Tokens */}
        <section>
          <SectionLabel>Tokens (the raw palette — accents never flip)</SectionLabel>
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
              <span key={d.domain} className="inline-flex items-center gap-2 text-[14px] text-text-primary">
                <DomainStar domain={d.domain} size={13} /> {d.label} <span className="text-text-meta">({d.note})</span>
              </span>
            ))}
            <span className="inline-flex items-center gap-2 text-[14px] text-text-meta">
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
          <p className="mt-2 text-[12px] text-text-meta">settled teal · attention wine · <span className="text-oxblood">urgent oxblood (earned only — a written overdue rule)</span> · pending taupe outline · time champagne.</p>
          <p className="mt-3 text-[12px] text-text-meta">Legacy Badge tones map onto the same grammar:</p>
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

        {/* Cards + money head */}
        <section>
          <SectionLabel>Cards (bone, hairline, no shadow) · the sanctioned money head</SectionLabel>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Card>
              <div className="flex items-center gap-2"><DomainStar domain="money" /><Heading className="text-[18px]">Money radar</Heading></div>
              <p className="mt-1 font-accent text-[16px] text-taupe">Three payments due within 60 days.</p>
              <div className="mt-4 flex items-center gap-3">
                <Fact value="$18,400" label="due soon" />
                <Chip tone="urgent">Overdue 4 days</Chip>
                <Chip tone="settled">Paid</Chip>
              </div>
            </Card>
            <DomainHeadCard domain="money" title="Money radar" meta="Radar">
              <p className="font-accent text-[16px] text-taupe">The one sanctioned domain field: a teal head. The body stays bone.</p>
              <div className="mt-3 flex items-center justify-between text-[13px]">
                <span className="text-text-body">Luz Films, deposit</span>
                <span className="flex items-center gap-2"><span className="font-medium text-text-primary">$2,600</span><Chip tone="attention">Due Fri</Chip></span>
              </div>
            </DomainHeadCard>
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
            <span className="rounded-[var(--radius)] border border-hairline bg-bone px-4 py-2 text-[13px] text-ink">Container</span>
            <Button variant="dark">Button</Button>
            <Chip tone="settled">Chip</Chip>
            <Monogram initials="FP" size={40} />
            <input className="rounded-[var(--radius)] border border-hairline bg-bone px-3 py-2 text-[13px] text-ink outline-none focus:border-ink" placeholder="Input" />
          </div>
        </section>

        {/* Night register — the theme-token architecture, self-contained proof */}
        <section>
          <SectionLabel>Night register (the theme-token wiring; Night mode ships later)</SectionLabel>
          <p className="mt-1 text-[12.5px] text-text-meta">A self-contained <span className="font-sans">data-theme=&quot;night&quot;</span> panel: the semantic surface/type tokens invert while the seven accents stay fills. This block renders Night regardless of the page theme.</p>
          <div data-theme="night" className="mt-3 rounded-[var(--radius)] border border-hairline-token bg-surface-page p-6">
            <div className="rounded-[var(--radius)] border border-hairline-token bg-surface-card p-5">
              <p className="font-display text-[19px] text-text-primary">The room turns down</p>
              <p className="mt-1 text-[13px] text-text-body">Same seven colours, same geometry — only surfaces and type flip. Wine, teal, oxblood and champagne are fills, never text on the dark ground.</p>
              <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-text-meta">Meta / labels</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Chip tone="settled">Paid</Chip><Chip tone="attention">Due</Chip><Chip tone="urgent">Overdue 4 days</Chip>
              </div>
            </div>
            <div className="mt-4">
              <DomainHeadCard domain="money" title="Money radar" meta="Radar">
                <p className="text-[13px] text-text-body">The teal head holds; the card body follows the raised night surface.</p>
              </DomainHeadCard>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left text-[12.5px] text-text-body">
              <thead><tr className="text-text-meta"><th className="py-1 pr-6 font-medium">role</th><th className="py-1 pr-6 font-medium">day</th><th className="py-1 font-medium">night</th></tr></thead>
              <tbody>
                {NIGHT_TOKENS.map((r) => (
                  <tr key={r.role} className="border-t border-hairline-token"><td className="py-1 pr-6">{r.role}</td><td className="py-1 pr-6">{r.day}</td><td className="py-1">{r.night}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        </div>
      </div>
    </main>
  );
}
