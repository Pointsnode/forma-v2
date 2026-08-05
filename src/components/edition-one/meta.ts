import sEn from "./subpages.en.json";
import sEs from "./subpages.es.json";
import sFr from "./subpages.fr.json";
import sIt from "./subpages.it.json";

// Server-safe (non-client) metadata lookup for the subpage routes. Titles + descriptions
// come from the approved catalogs; atelier and about use their `sub` string as the
// description, pricing uses `pricing.meta.desc`.
const M: Record<string, Record<string, string>> = { en: sEn, es: sEs, fr: sFr, it: sIt };

export function subMeta(locale: string, titleKey: string, descKey: string): { title: string; description: string } {
  const m = M[locale] ?? sEn;
  return { title: m[titleKey] ?? "", description: m[descKey] ?? "" };
}
