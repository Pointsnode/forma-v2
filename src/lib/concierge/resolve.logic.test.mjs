import assert from "node:assert/strict";
import { matchWeddings, otherCoupleIn, subjectWedding } from "./resolve.mjs";

const W = [
  { id: "w1", couple_display: "Ana & Beatriz", phase: "planning", date_start: "2026-09-12", location_city: "Ibiza", location_country: "Spain" },
  { id: "w2", couple_display: "Carlos & Diego", phase: "closed", date_start: "2025-03-01", location_city: "Oaxaca", location_country: "Mexico" },
  { id: "w3", couple_display: "Ibiza Collective", phase: "foundations", date_start: null, location_city: "Tulum", location_country: "Mexico" },
  { id: "w4", couple_display: "Priya & Arjun", phase: "details", date_start: "2027-01-15", location_city: "Mexico City", location_country: "Mexico" },
];

// ── the round-3 blocker: the couple's EXACT display name must resolve ──────────
// The live walk failed here — "Priya & Arjun" (and the model's "Priya and Arjun" rewrite) matched
// nothing because the old matcher was a literal substring test.
assert.deepEqual(matchWeddings(W, "Priya & Arjun").map((w) => w.id), ["w4"]); // exact card string
assert.deepEqual(matchWeddings(W, "Priya and Arjun").map((w) => w.id), ["w4"]); // & normalized to and
assert.deepEqual(matchWeddings(W, "Priya").map((w) => w.id), ["w4"]); // bare first name
assert.deepEqual(matchWeddings(W, "Arjun").map((w) => w.id), ["w4"]); // bare second name
assert.deepEqual(matchWeddings(W, "the Arjun wedding").map((w) => w.id), ["w4"]); // casual phrasing
assert.deepEqual(matchWeddings(W, "how's Priya Arjun budget").map((w) => w.id), ["w4"]); // reordered/padded → token overlap

// ── resolve_wedding matching (§C) ────────────────────────────────────────────
// A couple-name query resolves that one wedding.
assert.deepEqual(matchWeddings(W, "Carlos").map((w) => w.id), ["w2"]);
// A city query — "the Ibiza one" strips to "ibiza" and matches BOTH the Ibiza-city wedding
// and the "Ibiza Collective" couple → ambiguous, the model must ask (FC012), never pick.
assert.deepEqual(matchWeddings(W, "the Ibiza one").map((w) => w.id).sort(), ["w1", "w3"]);
// A more specific query disambiguates to one.
assert.deepEqual(matchWeddings(W, "Ana").map((w) => w.id), ["w1"]);
// Empty query → the whole list (the model gets everything).
assert.equal(matchWeddings(W, "").length, 4);
assert.equal(matchWeddings(W, "   ").length, 4);
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

// ── routing subject (§E) — robust to which read tool the model used ──────────
// The blocker: a budget answered from weddings_overview READ nothing, so touched was empty and the
// turn never routed. Now an unambiguous resolve alone routes the turn to that wedding.
assert.equal(subjectWedding(new Set(), new Set(["w1"])), "w1"); // resolved only, no read → still routes
assert.equal(subjectWedding(new Set(["w1"]), new Set()), "w1"); // read only
assert.equal(subjectWedding(new Set(["w1"]), new Set(["w1"])), "w1"); // both agree
assert.equal(subjectWedding(new Set(["w1"]), new Set(["w2"])), null); // conflict → studio thread
assert.equal(subjectWedding(new Set(["w1", "w2"]), new Set()), null); // two reads → studio thread
assert.equal(subjectWedding(new Set(), new Set()), null); // nothing → studio thread
assert.equal(subjectWedding(undefined, undefined), null); // defensive

console.log("concierge resolve: 27 cases ok");
