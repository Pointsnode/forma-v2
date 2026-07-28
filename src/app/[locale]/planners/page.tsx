import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getDirectory, regionsFromDirectory } from "@/lib/directory";
import { alternates, directoryJsonLd, localeUrl } from "@/lib/seo";
import { JsonLd, PlannerCard, PublicHeader, PublicFooter, SectionKicker } from "@/components/directory/ui";

// Read the live published set on every request — the publish/unpublish gate must
// take effect immediately (and be provable) rather than serving a cached shell.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "directory" });
  const title = t("indexTitle");
  const description = t("indexDescription");
  return {
    title,
    description,
    alternates: alternates(locale, "/planners"),
    openGraph: { title, description, url: localeUrl(locale, "/planners"), type: "website" },
    robots: { index: true, follow: true },
  };
}

export default async function PlannersIndex({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "directory" });
  const cards = await getDirectory();
  const regions = regionsFromDirectory(cards);

  return (
    <div className="min-h-screen bg-bone">
      <JsonLd data={directoryJsonLd(cards, locale, "/planners", t("indexTitle"))} />
      <PublicHeader />

      {/* Editorial hero */}
      <section className="mx-auto max-w-6xl px-6 pb-10 pt-6 text-center">
        <p className="mb-4 text-[11px] uppercase tracking-[0.34em] text-taupe">{t("heroKicker")}</p>
        <h1 className="mx-auto max-w-3xl font-display text-[clamp(34px,6vw,60px)] font-medium leading-[1.05] text-ink">{t("heroTitle")}</h1>
        <p className="mx-auto mt-5 max-w-xl font-accent text-[19px] italic leading-relaxed text-taupe">{t("heroLede")}</p>
      </section>

      {/* Regions — only those with ≥1 published planner */}
      {regions.length > 0 && (
        <section className="mx-auto max-w-6xl px-6 pb-12">
          <div className="flex flex-wrap justify-center gap-2.5">
            {regions.map((r) => (
              <Link
                key={r.slug}
                href={`/planners/${r.slug}`}
                className="rounded-full bg-paper px-4 py-2 text-[13px] text-ink shadow-card transition-shadow hover:shadow-lift"
              >
                {r.region}
                <span className="ml-1.5 text-[11px] text-muted">{r.count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Planner grid */}
      <section className="mx-auto max-w-6xl px-6 pb-8">
        {cards.length === 0 ? (
          <p className="py-20 text-center font-accent text-[18px] italic text-muted">{t("empty")}</p>
        ) : (
          <>
            <SectionKicker>{t("featured")}</SectionKicker>
            <div className="grid grid-cols-1 gap-x-7 gap-y-11 sm:grid-cols-2 lg:grid-cols-3">
              {cards.map((c) => (
                <PlannerCard key={c.slug} card={c} locale={locale} />
              ))}
            </div>
          </>
        )}
      </section>

      <PublicFooter note={t("footerNote")} />
    </div>
  );
}
