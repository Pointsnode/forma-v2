// Pure lead-desk helpers (no server imports), shared by the page, the actions, and the tests.

// The board lanes, in order (Lost is terminal and lives off-board, in the list).
export const LANES = ["new", "conversation", "consultation", "quote_out", "won"];
export const STAGES = ["new", "conversation", "consultation", "quote_out", "won", "lost"];
export const LOST_REASONS = ["budget", "date_taken", "went_quiet", "chose_another"];
export const SOURCES = ["directory", "website", "instagram", "referral", "met_at", "other"];

// Parse a free-text "budget feel" into a clean positive integer, or null. STRICT on purpose:
// the conversion carries the number into the wedding budget only when it is unambiguous, so
// we never guess. Currency symbols, thousands separators, spaces and a trailing 3-letter
// currency code are stripped; anything left that is not pure digits (a "k"/"m" shorthand, a
// range, stray words) yields null and the wedding's budget is left empty for the planner.
export function parseBudgetFeel(raw) {
  if (raw == null) return null;
  const s = String(raw).trim().replace(/[$€£¥,\s]/g, "").replace(/(usd|mxn|eur|gbp|cad|jpy)$/i, "");
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// A lead earns a touch when its next step is due (date on or before today). ISO date strings
// (YYYY-MM-DD) compare correctly with a plain string comparison.
export function isNeedTouch(nextStepAt, todayISO) {
  return !!nextStepAt && nextStepAt <= todayISO;
}
