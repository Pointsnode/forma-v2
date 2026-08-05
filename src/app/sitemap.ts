import type { MetadataRoute } from "next";
import { getPlannerSlugs, slugifyRegion } from "@/lib/directory";
import { localeUrl } from "@/lib/seo";

// Built per request from the live published set — never prerendered against a
// stale snapshot (and so the build never needs the service-role key or network).
export const dynamic = "force-dynamic";

// Per-locale sitemap for the public directory. Only PUBLISHED planners + the
// regions that actually have one appear (the DEFINER fn already gates on
// published+studio), so there are never empty shells. Each URL carries both-locale
// hreflang alternates — the crawl signal that en and es are the same page.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { slugs, regions } = await getPlannerSlugs();

  const paths = [
    "/", // the landing (M12) — the page search engines should index first
    "/atelier",
    "/pricing",
    "/about",
    "/planners",
    ...[...new Set(regions.map((r) => slugifyRegion(r.region)))].filter(Boolean).map((r) => `/planners/${r}`),
    ...slugs.map((s) => `/p/${s}`),
  ];

  return paths.map((path) => ({
    url: localeUrl("en", path),
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : path === "/planners" ? 0.9 : 0.8,
    alternates: {
      languages: {
        en: localeUrl("en", path),
        es: localeUrl("es", path),
      },
    },
  }));
}
