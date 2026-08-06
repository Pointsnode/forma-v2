import assert from "node:assert/strict";
import { parseBudgetFeel, isNeedTouch, LANES, STAGES, LOST_REASONS } from "./leads.mjs";

// Clean numbers → the integer (currency symbols, commas, spaces, trailing code all stripped).
assert.equal(parseBudgetFeel("$120,000"), 120000);
assert.equal(parseBudgetFeel("120000 USD"), 120000);
assert.equal(parseBudgetFeel("€90.000".replace(".", ",")), 90000); // comma thousands
assert.equal(parseBudgetFeel("  85000  "), 85000);

// Ambiguous → null (never guess): shorthand, ranges, prose, empty, zero, negatives.
assert.equal(parseBudgetFeel("$120k"), null, "k shorthand is ambiguous");
assert.equal(parseBudgetFeel("100-150k"), null, "a range is not a number");
assert.equal(parseBudgetFeel("around 40000"), null, "residual letters → null");
assert.equal(parseBudgetFeel("open"), null);
assert.equal(parseBudgetFeel(""), null);
assert.equal(parseBudgetFeel(null), null);
assert.equal(parseBudgetFeel("0"), null, "zero is not a budget");

// The needs-a-touch predicate: due on/before today, never for a null next step.
assert.equal(isNeedTouch("2026-08-05", "2026-08-06"), true, "overdue");
assert.equal(isNeedTouch("2026-08-06", "2026-08-06"), true, "due today");
assert.equal(isNeedTouch("2026-08-07", "2026-08-06"), false, "future");
assert.equal(isNeedTouch(null, "2026-08-06"), false, "no next step");

// The lane/stage/reason vocabularies stay in sync with the 0025 check constraints.
assert.deepEqual(LANES, ["new", "conversation", "consultation", "quote_out", "won"]);
assert.equal(STAGES.length, 6);
assert.deepEqual(LOST_REASONS, ["budget", "date_taken", "went_quiet", "chose_another"]);

console.log("leads: budget parse + touch predicate + vocab ok");
