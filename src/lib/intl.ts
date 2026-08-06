import type { Locale } from "@/i18n/routing";

// One place that turns an app locale into an Intl (BCP-47) tag, so date/number formatting
// follows the active language for all four. es stays es-MX (its money grouping, unchanged
// from the two-language era); fr/it get their own tags.
const TAG: Record<Locale, string> = { en: "en-US", es: "es-MX", fr: "fr-FR", it: "it-IT" };
export function intlTag(locale: string): string {
  return TAG[locale as Locale] ?? "en-US";
}

// The URL locale prefix (en is the unprefixed default; es/fr/it are prefixed).
export function localePrefix(locale: string): string {
  return locale === "en" ? "" : `/${locale}`;
}

// The week starts Monday everywhere except the US-English default.
export function weekStartsMonday(locale: string): boolean {
  return locale !== "en";
}
