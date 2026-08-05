import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { alternates, localeUrl } from "@/lib/seo";
import { Landing } from "./landing";

// The storefront (M12). Signed-out "/" is rewritten here by middleware; the browser
// URL stays "/", which is what we canonicalize and what search engines index. It is
// crawlable in both locales and reads ONLY real published planners (no fabrication).
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "landing" });
  const title = t("metaTitle");
  const description = t("metaDescription");
  return {
    title,
    description,
    alternates: alternates(locale, "/"),
    openGraph: { title, description, url: localeUrl(locale, "/"), type: "website" },
    robots: { index: true, follow: true },
  };
}

export default async function LandingPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  // Edition One is self-contained: the directory cards on this marketing page are
  // illustrative fictional studios (approved for launch), NOT real directory listings,
  // so no directory read happens here.
  return <Landing locale={locale} />;
}
