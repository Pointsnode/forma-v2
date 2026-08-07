import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/env";

// Crawl-open for the public directory; the studio app is auth-gated at the
// middleware, so we only need to keep bots out of the API surface. The directory
// is meant to be found — by Google and by answer engines — so we allow-list root.
// /admin is the internal portal: disallowed here AND noindex per-page, never linked.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin"] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
