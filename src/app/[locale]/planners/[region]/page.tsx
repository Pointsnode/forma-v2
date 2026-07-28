import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getDirectory, cardsInRegion } from "@/lib/directory";
import { alternates, directoryJsonLd, localeUrl, regionLabelFor } from "@/lib/seo";
import { JsonLd, PlannerCard, PublicHeader, PublicFooter, SectionKicker } from "@/components/directory/ui";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: Locale; region: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, region } = await params;
  const cards = await getDirectory();
  const inRegion = cardsInRegion(cards, region);
  if (inRegion.length === 0) return { title: "Not found", robots: { index: false, follow: false } };
  const label = regionLabelFor(cards, region);
  const t = await getTranslations({ locale, namespace: "directory" });
  const name = label?.region ?? region;
  const title = t("regionTitle", { region: name });
  const description = t("regionDescription", { region: name, count: inRegion.length });
  return {
    title,
    description,
    alternates: alternates(locale, `/planners/${region}`),
    openGraph: { title, description, url: localeUrl(locale, `/planners/${region}`), type: "website" },
    robots: { index: true, follow: true },
  };
}

export default async function RegionPage({ params }: Props) {
  const { locale, region } = await params;
  setRequestLocale(locale);
  const cards = await getDirectory();
  const inRegion = cardsInRegion(cards, region);
  // Fix (4): a region page only exists when a published planner serves it.
  if (inRegion.length === 0) notFound();
  const label = regionLabelFor(cards, region);
  const t = await getTranslations({ locale, namespace: "directory" });
  const name = label?.region ?? region;

  return (
    <div className="min-h-screen bg-bone">
      <JsonLd data={directoryJsonLd(inRegion, locale, `/planners/${region}`, t("regionTitle", { region: name }))} />
      <PublicHeader />

      <section className="mx-auto max-w-6xl px-6 pb-10 pt-6 text-center">
        <p className="mb-4 text-[11px] uppercase tracking-[0.34em] text-taupe">{label?.country ?? ""}</p>
        <h1 className="font-display text-[clamp(30px,5vw,52px)] font-medium leading-[1.06] text-ink">{t("regionHeroTitle", { region: name })}</h1>
        <p className="mx-auto mt-4 max-w-xl font-accent text-[18px] italic text-taupe">{t("regionLede", { region: name, count: inRegion.length })}</p>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-8">
        <SectionKicker>{t("plannersHere")}</SectionKicker>
        <div className="grid grid-cols-1 gap-x-7 gap-y-11 sm:grid-cols-2 lg:grid-cols-3">
          {inRegion.map((c) => (
            <PlannerCard key={c.slug} card={c} locale={locale} />
          ))}
        </div>
        <div className="mt-12 text-center">
          <Link href="/planners" className="font-accent text-[16px] italic text-taupe underline-offset-4 hover:underline">
            {t("backToAll")}
          </Link>
        </div>
      </section>

      <PublicFooter note={t("footerNote")} />
    </div>
  );
}
