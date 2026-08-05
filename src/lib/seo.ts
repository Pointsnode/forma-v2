import type { Metadata } from "next";
import { SITE_URL } from "@/lib/env";
import { routing, type Locale } from "@/i18n/routing";
import type { DirectoryCard, PlannerProfile, ProfileContent, Area } from "@/lib/directory-shared";
import { pick, publicImageUrl, slugifyRegion } from "@/lib/directory-shared";

// SEO / answer-engine machinery for the M10 directory. Every public page is
// server-rendered with a canonical URL, hreflang alternates for both locales, an
// OpenGraph hero, and JSON-LD (ProfessionalService for a planner, ItemList for the
// index/region) — the structured signals Google and LLMs cite.

/** Locale-aware absolute URL. as-needed prefixing: en unprefixed, es under /es. */
export function localeUrl(locale: Locale, path: string): string {
  return locale === "en" ? `${SITE_URL}${path}` : `${SITE_URL}/${locale}${path}`;
}

/** canonical (current locale) + hreflang alternates for all four locales + x-default. */
export function alternates(locale: Locale, path: string): Metadata["alternates"] {
  const languages: Record<string, string> = { "x-default": localeUrl("en", path) };
  for (const l of routing.locales) languages[l] = localeUrl(l, path);
  return { canonical: localeUrl(locale, path), languages };
}

/** ProfessionalService JSON-LD for a planner profile page. */
export function plannerJsonLd(p: PlannerProfile, locale: Locale, path: string) {
  const prof: ProfileContent = p.profile ?? {};
  const hero = publicImageUrl(prof.hero);
  const images = (prof.gallery ?? []).map((g) => publicImageUrl(g)).filter(Boolean) as string[];
  const areaServed = (p.areas ?? []).map((a: Area) => ({
    "@type": "AdministrativeArea",
    name: [a.city, a.region, a.country].filter(Boolean).join(", "),
  }));
  return {
    "@context": "https://schema.org",
    "@type": "ProfessionalService",
    name: p.name,
    url: localeUrl(locale, path),
    ...(prof.tagline ? { slogan: pick(prof.tagline, locale) } : {}),
    ...(prof.about ? { description: pick(prof.about, locale) } : {}),
    ...(hero ? { image: [hero, ...images] } : images.length ? { image: images } : {}),
    ...(prof.website ? { sameAs: [prof.website, prof.instagram].filter(Boolean) } : prof.instagram ? { sameAs: [prof.instagram] } : {}),
    serviceType: "Wedding planning",
    ...(areaServed.length ? { areaServed } : {}),
    ...((prof.services ?? []).length
      ? {
          makesOffer: (prof.services ?? []).map((s) => ({
            "@type": "Offer",
            itemOffered: { "@type": "Service", name: s.name },
            ...(typeof s.from_price === "number" ? { priceSpecification: { "@type": "PriceSpecification", minPrice: s.from_price } } : {}),
          })),
        }
      : {}),
  };
}

/** ItemList JSON-LD for the directory index or a region page. */
export function directoryJsonLd(cards: DirectoryCard[], locale: Locale, path: string, name: string) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    url: localeUrl(locale, path),
    numberOfItems: cards.length,
    itemListElement: cards.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: localeUrl(locale, `/p/${c.slug}`),
      name: c.name,
    })),
  };
}

/** Region label for a slug from the cards (first area whose slug matches). */
export function regionLabelFor(cards: DirectoryCard[], regionSlug: string): { region: string; country: string } | null {
  for (const c of cards) {
    for (const a of c.areas) if (slugifyRegion(a.region) === regionSlug) return { region: a.region, country: a.country };
  }
  return null;
}
