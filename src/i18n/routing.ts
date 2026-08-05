import { defineRouting } from "next-intl/routing";

// Four languages as equals: en · es · fr · it. English is unprefixed (the canonical "/"),
// the other three are prefixed (/es, /fr, /it) — the as-needed pattern.
// localeDetection is OFF: next-intl never auto-redirects on Accept-Language/cookie, so
// the crawlable marketing landing stays deterministic (canonical "/" = en, others via the
// explicit toggle). The persisted-locale honouring (§B3) is done explicitly in the
// middleware, gated on a signed-in user — the app surface only, never the landing.
export const routing = defineRouting({
  locales: ["en", "es", "fr", "it"],
  defaultLocale: "en",
  localePrefix: "as-needed",
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
