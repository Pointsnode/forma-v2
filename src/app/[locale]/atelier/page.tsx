import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import type { Locale } from "@/i18n/routing";
import { alternates, localeUrl } from "@/lib/seo";
import { subMeta } from "@/components/edition-one/meta";
import { EditionOneShell } from "@/components/edition-one/shell";
import { AtelierContent } from "./content";

export async function generateMetadata({ params }: { params: Promise<{ locale: Locale }> }): Promise<Metadata> {
  const { locale } = await params;
  const { title, description } = subMeta(locale, "atelier.meta.title", "atelier.sub");
  return {
    title,
    description,
    alternates: alternates(locale, "/atelier"),
    openGraph: { title, description, url: localeUrl(locale, "/atelier"), type: "website" },
    robots: { index: true, follow: true },
  };
}

export default async function AtelierPage({ params }: { params: Promise<{ locale: Locale }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <EditionOneShell locale={locale}>
      <AtelierContent />
    </EditionOneShell>
  );
}
