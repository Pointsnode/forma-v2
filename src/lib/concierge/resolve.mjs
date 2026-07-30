// Pure matching for M16a — no DB, no I/O — so test:logic can exercise the disambiguation and
// isolation rules directly (the DB-backed callers in tools.ts/session.ts just feed rows in).

// The weddings matching a free-text query. Each wedding: { id, couple_display, phase, date_start,
// location_city, location_country }. Empty query → all (the model gets the whole list). Zero and
// multiple matches are both first-class — resolve_wedding returns them and the model asks; it never
// picks (§C).
//
// Matching is NORMALIZED, not literal: "&" ↔ "and" and all punctuation collapse to spaces on both
// sides, so "Priya & Arjun" (the exact card string), "Priya and Arjun" (the model's rewrite), and a
// bare "Priya" or "Arjun" all resolve to the one wedding. Two ways to hit: the normalized query is a
// substring of the wedding's haystack (couple + city + country + phase + date — carries "the Ibiza
// one" → city, a date, a phase), OR the query shares a significant NAME token with the couple (so a
// reordered/padded name like "Priya Arjun budget" still resolves). "the X one"/"the X wedding" strip
// to X for casual phrasing.
const STOP = new Set(["and", "the", "wedding", "one", "of", "for", "on"]);
const norm = (s) => String(s ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
const nameTokens = (s) => norm(s).split(" ").filter((t) => t.length >= 2 && !STOP.has(t));

export function matchWeddings(weddings, query) {
  const nq = norm(query);
  if (!nq) return weddings.slice();
  const stripped = nq.replace(/^the /, "").replace(/ (one|wedding)$/, "").trim();
  const qTokens = new Set(nameTokens(stripped));
  return weddings.filter((w) => {
    const hay = norm(`${w.couple_display} ${w.location_city ?? ""} ${w.location_country ?? ""} ${w.phase} ${w.date_start ?? ""}`);
    if (hay.includes(nq) || (stripped.length >= 2 && hay.includes(stripped))) return true;
    return nameTokens(w.couple_display).some((t) => qTokens.has(t));
  });
}

// The couple_display of any wedding OTHER than keepId whose name appears in text, or null. The
// isolation belt (§F): a turn destined for wedding keepId's thread must name no other couple.
export function otherCoupleIn(weddings, keepId, text) {
  const t = String(text ?? "");
  for (const w of weddings) {
    if (w.id !== keepId && w.couple_display && t.includes(w.couple_display)) return w.couple_display;
  }
  return null;
}

// The single wedding a studio turn concerns — the union of the weddings it READ (touched) and any
// it unambiguously RESOLVED — or null if none or more than one. §E routing keys off this so a turn
// about one wedding lands in its thread regardless of which read tool the model happened to use
// (the blocker: a budget answered from weddings_overview touched nothing, so it never routed).
export function subjectWedding(touched, resolved) {
  const s = new Set([...(touched ?? []), ...(resolved ?? [])]);
  return s.size === 1 ? [...s][0] : null;
}
