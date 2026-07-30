// Pure catalog filtering (no DOM, no React) so test:logic can pin the facet composition and the
// in-use/available split directly — the component just wires state to these.

// A vendor is "in use" if it has any engagement that isn't dead (declined/archived).
const DEAD = new Set(["declined", "archived"]);
export function isInUse(vendor) {
  return (vendor.engagements ?? []).some((e) => !DEAD.has(e.status));
}

// Does a card pass the active search + facets? Facets AND across (kind AND city AND engagement),
// OR within (any selected kind, any selected city). Search is case-insensitive across name, contact
// name, tags and cities. Empty query / empty facet = no constraint from that dimension.
/**
 * @param {{ name: string, kind: string, cities?: string[], tags?: string[], contactName?: string|null, engagements?: {status:string}[] }} vendor
 * @param {{ q?: string, kinds?: string[], cities?: string[], eng?: string }} [filters]
 * @returns {boolean}
 */
export function catalogMatches(vendor, filters = {}) {
  const { q = "", kinds = [], cities = [], eng = "" } = filters;
  const kindSet = new Set(kinds);
  const citySet = new Set(cities);
  if (kindSet.size && !kindSet.has(vendor.kind)) return false;
  if (citySet.size && !(vendor.cities ?? []).some((c) => citySet.has(c))) return false;
  if (eng === "inuse" && !isInUse(vendor)) return false;
  if (eng === "available" && isInUse(vendor)) return false;
  const needle = String(q ?? "").trim().toLowerCase();
  if (needle) {
    const hay = [vendor.name, vendor.contactName ?? "", ...(vendor.tags ?? []), ...(vendor.cities ?? [])].join(" ").toLowerCase();
    if (!hay.includes(needle)) return false;
  }
  return true;
}

// Distinct values present across the cards, each with its count — the facet chips. `pick` returns a
// card's values for the facet (e.g. [kind] or cities[]). Never emits a value with zero cards (law 2).
export function tally(vendors, pick) {
  const m = new Map();
  for (const v of vendors) for (const val of pick(v)) if (val) m.set(val, (m.get(val) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])));
}
