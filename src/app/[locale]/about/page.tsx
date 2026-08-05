import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { alternates, localeUrl } from "@/lib/seo";
import { subMeta } from "@/components/edition-one/meta";
import { EditionOneShell } from "@/components/edition-one/shell";
import { AboutContent } from "./content";

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const { title, description } = subMeta(locale, "about.meta.title", "about.sub");
  return {
    title,
    description,
    alternates: alternates(locale, "/about"),
    openGraph: { title, description, url: localeUrl(locale, "/about"), type: "website" },
    robots: { index: true, follow: true },
  };
}

export default async function AboutPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <EditionOneShell locale={locale}>
      <AboutContent />
    </EditionOneShell>
  );
}
