// Pure matching for M16a — no DB, no I/O — so test:logic can exercise the disambiguation and
// isolation rules directly (the DB-backed callers in tools.ts/session.ts just feed rows in).

// The weddings matching a free-text query. Each wedding: { id, couple_display, phase, date_start,
// location_city, location_country }. Empty query → all (the model gets the whole list). "the X
// one"/"the X wedding" strip to X so casual phrasing still resolves. Zero and multiple matches are
// both first-class — resolve_wedding returns them and the model asks; it never picks (§C).
export function matchWeddings(weddings, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return weddings.slice();
  const stripped = q.replace(/^the\s+/, "").replace(/\s+(one|wedding)$/, "").trim();
  const hay = (w) => `${w.couple_display} ${w.location_city ?? ""} ${w.location_country ?? ""} ${w.phase} ${w.date_start ?? ""}`.toLowerCase();
  return weddings.filter((w) => hay(w).includes(q) || (stripped.length >= 2 && hay(w).includes(stripped)));
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
