"use client";

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cx } from "@/components/ui";
import { PlannerCard, SectionKicker } from "@/components/directory/ui";
import { PRICE_ADMIN, PRICE_ADDITIONAL, PRICE_CONCIERGE } from "@/lib/pricing";
import type { DirectoryCard } from "@/lib/directory-shared";
import type { Locale } from "@/i18n/routing";

const SIDES = ["planner", "couple", "vendors", "guests"] as const;
type Side = (typeof SIDES)[number];
const IMG: Record<Side, string> = {
  planner: "/landing/planner.webp",
  couple: "/landing/couple.webp",
  vendors: "/landing/vendors.webp",
  guests: "/landing/guests.webp",
};
type Panel = "pricing" | "about" | "features";
const ROMAN = ["i", "ii", "iii"];

export function Landing({ locale, cards, regions }: { locale: Locale; cards: DirectoryCard[]; regions: { slug: string; region: string; country: string; count: number }[] }) {
  const t = useTranslations("landing");
  const [side, setSide] = useState<Side | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);

  return (
    <div className="bg-bone text-ink">
      {/* Nav */}
      <nav className="fixed inset-x-0 top-0 z-40 flex items-center justify-between px-5 py-4 sm:px-8">
        <Link href="/" className="font-display text-[20px] tracking-[0.04em] text-bone mix-blend-difference">Forma</Link>
        <div className="flex items-center gap-3 text-[12px] text-bone mix-blend-difference sm:gap-5">
          <button onClick={() => setPanel("pricing")} className="hidden uppercase tracking-[0.14em] hover:opacity-70 sm:inline">{t("navPricing")}</button>
          <button onClick={() => setPanel("about")} className="hidden uppercase tracking-[0.14em] hover:opacity-70 sm:inline">{t("navAbout")}</button>
          <button onClick={() => setPanel("features")} className="hidden uppercase tracking-[0.14em] hover:opacity-70 sm:inline">{t("navFeatures")}</button>
          <span className="flex items-center gap-1 uppercase tracking-[0.1em]">
            <Link href="/" locale="en" className={cx(locale === "en" ? "font-semibold" : "opacity-60")}>EN</Link>
            <span className="opacity-40">/</span>
            <Link href="/" locale="es" className={cx(locale === "es" ? "font-semibold" : "opacity-60")}>ES</Link>
          </span>
          <Link href="/sign-in" className="uppercase tracking-[0.14em] hover:opacity-70">{t("logIn")}</Link>
          <Link href="/sign-up" className="rounded-full bg-bone px-3.5 py-1.5 uppercase tracking-[0.1em] text-ink hover:opacity-90">{t("signUp")}</Link>
        </div>
      </nav>

      {/* Four-panel hero */}
      <section className="relative">
        <div className="grid grid-cols-1 md:grid-cols-4">
          {SIDES.map((s, i) => (
            <div key={s} className="group relative flex min-h-[62vh] flex-col justify-end overflow-hidden md:min-h-screen">
              {/* eslint-disable-next-line @next/next/no-img-element -- local webp hero, treated to the v2 palette */}
              <img src={IMG[s]} alt="" className="absolute inset-0 h-full w-full object-cover grayscale transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-ink/55" />
              <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/10 to-ink/45" />
              {/* md:pb-16 clears the fixed bottom marquee line so EXPLORE never collides with it */}
              <div className="relative p-6 text-bone md:pb-16">
                <div className="font-accent text-[15px] italic text-bone/70">0{i + 1}</div>
                <h2 className="mt-1 font-display text-[26px] leading-tight">{t(`side_${s}_name`)}</h2>
                <p className="mt-2 font-accent text-[17px] leading-snug text-bone/85">{t(`side_${s}_tag1`)}<br />{t(`side_${s}_tag2`)}</p>
                <button onClick={() => setSide(s)} className="mt-4 inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-bone hover:gap-2.5">
                  {t("explore")} <span aria-hidden>→</span>
                </button>
              </div>
            </div>
          ))}
        </div>
        {/* centered wordmark overlay */}
        <div className="pointer-events-none absolute inset-0 hidden items-center justify-center md:flex">
          <div className="text-center text-bone mix-blend-difference">
            <div className="font-display text-[clamp(48px,7vw,104px)] leading-none tracking-[0.02em]">Forma</div>
            <div className="mt-3 text-[12px] uppercase tracking-[0.42em] text-bone/90">{t("wordmarkTag")}</div>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-5 text-center text-[11px] uppercase tracking-[0.34em] text-bone/85 mix-blend-difference">{t("heroBottom")}</div>
      </section>

      {/* Mission band */}
      <section className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="font-display text-[clamp(30px,5vw,52px)] font-medium leading-[1.08]">{t("missionTitle")}</h2>
        <p className="mx-auto mt-6 max-w-xl font-accent text-[19px] italic leading-relaxed text-taupe">{t("missionBody")}</p>
        <Link href="/sign-up" className="mt-8 inline-flex rounded-full bg-ink px-6 py-3 text-[14px] font-medium text-bone hover:opacity-90">{t("signUp")}</Link>
      </section>

      {/* The directory */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="mb-8 text-center">
          <SectionKicker>{t("dirKicker")}</SectionKicker>
          <h2 className="font-display text-[clamp(28px,4vw,44px)] font-medium leading-tight">{t("dirTitle")}</h2>
          <p className="mx-auto mt-3 max-w-lg font-accent text-[17px] italic text-taupe">{t("dirLede")}</p>
        </div>
        {cards.length === 0 ? (
          <div className="rounded-2xl bg-paper px-6 py-16 text-center shadow-card">
            <p className="mx-auto max-w-md font-display text-[24px] leading-snug text-ink">{t("dirEmptyTitle")}</p>
            <p className="mx-auto mt-3 max-w-md font-accent text-[17px] italic text-taupe">{t("dirEmptyBody")}</p>
            <Link href="/planners" className="mt-6 inline-flex rounded-full border border-ink px-5 py-2.5 text-[13px] font-medium text-ink hover:bg-ink hover:text-bone">{t("browseAll")}</Link>
          </div>
        ) : (
          <>
            {regions.length > 0 && (
              <div className="mb-8 flex flex-wrap justify-center gap-2.5">
                {regions.map((r) => (
                  <Link key={r.slug} href={`/planners/${r.slug}`} className="rounded-full bg-paper px-4 py-2 text-[13px] text-ink shadow-card hover:shadow-lift">
                    {r.region}<span className="ml-1.5 text-[11px] text-muted">{r.count}</span>
                  </Link>
                ))}
              </div>
            )}
            <div className="grid grid-cols-1 gap-x-7 gap-y-11 sm:grid-cols-2 lg:grid-cols-3">
              {cards.slice(0, 6).map((c) => <PlannerCard key={c.slug} card={c} locale={locale} />)}
            </div>
            <div className="mt-12 text-center">
              <Link href="/planners" className="inline-flex rounded-full border border-ink px-5 py-2.5 text-[13px] font-medium text-ink hover:bg-ink hover:text-bone">{t("browseAll")}</Link>
            </div>
          </>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-hairline bg-paper">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 py-12 text-center sm:flex-row sm:justify-between sm:text-left">
          <div>
            <div className="font-display text-[20px] tracking-[0.04em]">Forma</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.34em] text-taupe">{t("wordmarkTag")}</div>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 text-[12px] uppercase tracking-[0.14em] text-muted">
            <button onClick={() => setPanel("pricing")} className="hover:text-ink">{t("navPricing")}</button>
            <button onClick={() => setPanel("about")} className="hover:text-ink">{t("navAbout")}</button>
            <button onClick={() => setPanel("features")} className="hover:text-ink">{t("navFeatures")}</button>
            <Link href="/planners" className="hover:text-ink">{t("navDirectory")}</Link>
            <Link href="/sign-up" className="hover:text-ink">{t("signUp")}</Link>
          </div>
          <div className="text-[11px] text-muted">{t("copyright")}</div>
        </div>
      </footer>

      {/* Explore overlay */}
      {side ? (
        <Overlay onClose={() => setSide(null)}>
          <p className="text-[11px] uppercase tracking-[0.28em] text-taupe">{t("oneOfFour")}</p>
          <h3 className="mt-1 font-display text-[clamp(30px,5vw,48px)] leading-tight">{t(`side_${side}_name`)}</h3>
          <p className="mt-4 max-w-lg font-accent text-[20px] italic leading-relaxed text-ink-soft">{t(`explore_${side}_line`)}</p>
          <ol className="mt-8 space-y-4">
            {["1", "2", "3"].map((n, i) => (
              <li key={n} className="flex gap-4">
                <span className="mt-0.5 font-accent text-[16px] italic text-taupe">{ROMAN[i]}</span>
                <span className="text-[16px] leading-snug text-ink">{t(`explore_${side}_${n}`)}</span>
              </li>
            ))}
          </ol>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/sign-up" className="rounded-full bg-ink px-6 py-3 text-[14px] font-medium text-bone hover:opacity-90">{t("signUp")}</Link>
            <button onClick={() => { setSide(null); setPanel("features"); }} className="rounded-full border border-ink px-6 py-3 text-[14px] text-ink hover:bg-bone">{t("allFeatures")}</button>
          </div>
        </Overlay>
      ) : null}

      {/* Panels */}
      {panel === "pricing" ? (
        <Overlay onClose={() => setPanel(null)}>
          <SectionKicker>{t("navPricing")}</SectionKicker>
          <h3 className="font-display text-[clamp(28px,5vw,44px)] font-medium">{t("pricingTitle")}</h3>
          <div className="mt-7 divide-y divide-hairline border-y border-hairline">
            {[
              // Prices come from the shared pricing module so the storefront and the /team
              // seat panel can never drift (M15: additional was a stale $59, now $49).
              { name: t("pricingStartName"), price: `$${PRICE_ADMIN}`, suffix: t("perMonth"), desc: t("pricingStartDesc") },
              { name: t("pricingAddName"), price: `$${PRICE_ADDITIONAL}`, suffix: t("perMonthEach"), desc: t("pricingAddDesc") },
              { name: t("pricingAiName"), price: `+$${PRICE_CONCIERGE}`, suffix: t("perMonthAccount"), desc: t("pricingAiDesc") },
            ].map((row) => (
              <div key={row.name} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                <div>
                  <div className="font-display text-[20px] text-ink">{row.name}</div>
                  <div className="mt-0.5 font-accent text-[15px] italic text-taupe">{row.desc}</div>
                </div>
                <div className="shrink-0 whitespace-nowrap">
                  <span className="font-display text-[24px] text-ink">{row.price}</span>
                  <span className="ml-1 text-[13px] text-muted">{row.suffix}</span>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[12.5px] text-muted">{t("pricingFootnote")}</p>
          <Link href="/sign-up" className="mt-6 inline-flex rounded-full bg-ink px-6 py-3 text-[14px] font-medium text-bone hover:opacity-90">{t("signUp")}</Link>
        </Overlay>
      ) : null}

      {panel === "about" ? (
        <Overlay onClose={() => setPanel(null)}>
          <SectionKicker>{t("navAbout")}</SectionKicker>
          <h3 className="font-display text-[clamp(28px,5vw,44px)] font-medium">{t("aboutTitle")}</h3>
          <div className="mt-5 max-w-xl space-y-4 font-accent text-[19px] leading-relaxed text-ink-soft">
            {t("aboutBody").split("\n\n").map((p, i) => <p key={i}>{p}</p>)}
          </div>
          <Link href="/sign-up" className="mt-7 inline-flex rounded-full bg-ink px-6 py-3 text-[14px] font-medium text-bone hover:opacity-90">{t("signUp")}</Link>
        </Overlay>
      ) : null}

      {panel === "features" ? (
        <Overlay onClose={() => setPanel(null)}>
          <SectionKicker>{t("navFeatures")}</SectionKicker>
          <h3 className="font-display text-[clamp(28px,5vw,44px)] font-medium">{t("featuresTitle")}</h3>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2">
            {["1", "2", "3", "4", "5", "6"].map((n) => (
              <li key={n} className="flex gap-3">
                <span className="font-accent text-[16px] italic text-taupe">0{n}</span>
                <span className="text-[16px] leading-snug text-ink">{t(`feat_${n}`)}</span>
              </li>
            ))}
          </ol>
          <Link href="/sign-up" className="mt-8 inline-flex rounded-full bg-ink px-6 py-3 text-[14px] font-medium text-bone hover:opacity-90">{t("signUp")}</Link>
        </Overlay>
      ) : null}
    </div>
  );
}

function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl bg-bone p-8 shadow-lift sm:rounded-3xl sm:p-10" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="mb-4 ml-auto block text-[20px] leading-none text-muted hover:text-ink" aria-label="Close">×</button>
        {children}
      </div>
    </div>
  );
}
