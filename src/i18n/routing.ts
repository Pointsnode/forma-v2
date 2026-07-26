import { defineRouting } from "next-intl/routing";

// es/en, English unprefixed (/), Spanish prefixed (/es) — the v1 pattern, fresh.
export const routing = defineRouting({
  locales: ["en", "es"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];
