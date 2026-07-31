import { defineRouting } from "next-intl/routing";

// es/en, English unprefixed (/), Spanish prefixed (/es) — the v1 pattern, fresh.
// localeDetection is OFF: next-intl never auto-redirects on Accept-Language/cookie, so
// the crawlable marketing landing stays deterministic (canonical "/" = en, /es via its
// explicit toggle). The persisted-locale honouring (§B3) is done explicitly in the
// middleware, gated on a signed-in user — the app surface only, never the landing.
export const routing = defineRouting({
  locales: ["en", "es"],
  defaultLocale: "en",
  localePrefix: "as-needed",
  localeDetection: false,
});

export type Locale = (typeof routing.locales)[number];
