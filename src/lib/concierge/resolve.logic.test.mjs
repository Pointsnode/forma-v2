import assert from "node:assert/strict";
import { matchWeddings, otherCoupleIn } from "./resolve.mjs";

const W = [
  { id: "w1", couple_display: "Ana & Beatriz", phase: "planning", date_start: "2026-09-12", location_city: "Ibiza", location_country: "Spain" },
  { id: "w2", couple_display: "Carlos & Diego", phase: "closed", date_start: "2025-03-01", location_city: "Oaxaca", location_country: "Mexico" },
  { id: "w3", couple_display: "Ibiza Collective", phase: "foundations", date_start: null, location_city: "Tulum", location_country: "Mexico" },
];

// ── resolve_wedding matching (§C) ────────────────────────────────────────────
// A couple-name query resolves that one wedding.
assert.deepEqual(matchWeddings(W, "Carlos").map((w) => w.id), ["w2"]);
// A city query — "the Ibiza one" strips to "ibiza" and matches BOTH the Ibiza-city wedding
// and the "Ibiza Collective" couple → ambiguous, the model must ask (FC012), never pick.
assert.deepEqual(matchWeddings(W, "the Ibiza one").map((w) => w.id).sort(), ["w1", "w3"]);
// A more specific query disambiguates to one.
assert.deepEqual(matchWeddings(W, "Ana").map((w) => w.id), ["w1"]);
// Empty query → the whole list (the model gets everything).
assert.equal(matchWeddings(W, "").length, 3);
assert.equal(matchWeddings(W, "   ").length, 3);
// No match → empty (the model asks the planner to clarify).
assert.equal(matchWeddings(W, "nonexistent couple").length, 0);
// Case-insensitive; phase and date are searchable too.
assert.deepEqual(matchWeddings(W, "OAXACA").map((w) => w.id), ["w2"]);
assert.deepEqual(matchWeddings(W, "2026-09-12").map((w) => w.id), ["w1"]);

// ── isolation belt (§F) ──────────────────────────────────────────────────────
// A turn destined for w1's thread must name no OTHER couple. w1's own name is fine.
assert.equal(otherCoupleIn(W, "w1", "The Ana & Beatriz budget is on track."), null);
// If another couple's name appears, it's flagged (→ the route refuses / keeps it in the studio thread).
assert.equal(otherCoupleIn(W, "w1", "Ana & Beatriz vs Carlos & Diego"), "Carlos & Diego");
// keepId excludes only itself; an unrelated keepId still flags w1's name.
assert.equal(otherCoupleIn(W, "w2", "note about Ana & Beatriz"), "Ana & Beatriz");
// Empty / no-couple text is clean.
assert.equal(otherCoupleIn(W, "w1", ""), null);
assert.equal(otherCoupleIn(W, "w1", "just numbers: 12000 due 2026-01-01"), null);

console.log("concierge resolve: 14 cases ok");
