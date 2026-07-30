import assert from "node:assert/strict";
import { isInUse, catalogMatches, tally } from "./catalog-filter.mjs";

const V = [
  { id: "a", name: "Flor y Canto", kind: "florals", cities: ["CDMX"], tags: ["boho", "seasonal"], contactName: "Ana", engagements: [{ couple: "P&A", status: "booked" }] },
  { id: "b", name: "Cocina de Humo", kind: "catering", cities: ["Oaxaca"], tags: ["smoke"], contactName: null, engagements: [{ couple: "P&A", status: "declined" }] },
  { id: "c", name: "DJ Selva", kind: "music", cities: ["CDMX", "Tulum"], tags: ["cumbia"], contactName: null, engagements: [] },
  { id: "d", name: "Luz Films", kind: "photography", cities: ["Tulum"], tags: ["documentary"], contactName: "Beatriz", engagements: [{ couple: "P&A", status: "shortlisted" }, { couple: "X", status: "archived" }] },
];

// ── in use / available (DoD 4) ────────────────────────────────────────────────
assert.equal(isInUse(V[0]), true); // booked → in use
assert.equal(isInUse(V[1]), false); // only a declined engagement → available
assert.equal(isInUse(V[2]), false); // no engagements → available
assert.equal(isInUse(V[3]), true); // shortlisted counts even though another is archived
assert.deepEqual(V.filter((v) => catalogMatches(v, { eng: "inuse" })).map((v) => v.id), ["a", "d"]);
assert.deepEqual(V.filter((v) => catalogMatches(v, { eng: "available" })).map((v) => v.id), ["b", "c"]);

// ── search: name / tag / city / contact, case-insensitive ─────────────────────
assert.deepEqual(V.filter((v) => catalogMatches(v, { q: "flor" })).map((v) => v.id), ["a"]); // name
assert.deepEqual(V.filter((v) => catalogMatches(v, { q: "CDMX" })).map((v) => v.id), ["a", "c"]); // city
assert.deepEqual(V.filter((v) => catalogMatches(v, { q: "cumbia" })).map((v) => v.id), ["c"]); // tag
assert.deepEqual(V.filter((v) => catalogMatches(v, { q: "beatriz" })).map((v) => v.id), ["d"]); // contact
assert.deepEqual(V.filter((v) => catalogMatches(v, { q: "  TULUM " })).map((v) => v.id), ["c", "d"]); // trim + case
assert.equal(V.filter((v) => catalogMatches(v, { q: "nope" })).length, 0);

// ── facets: OR within, AND across, and compose with search ────────────────────
assert.deepEqual(V.filter((v) => catalogMatches(v, { kinds: ["florals", "music"] })).map((v) => v.id), ["a", "c"]); // OR within kind
assert.deepEqual(V.filter((v) => catalogMatches(v, { cities: ["Tulum"] })).map((v) => v.id), ["c", "d"]); // city (array membership)
assert.deepEqual(V.filter((v) => catalogMatches(v, { kinds: ["music"], cities: ["CDMX"] })).map((v) => v.id), ["c"]); // AND across
assert.deepEqual(V.filter((v) => catalogMatches(v, { cities: ["CDMX"], q: "flor" })).map((v) => v.id), ["a"]); // facet AND search
assert.equal(V.filter((v) => catalogMatches(v, { kinds: ["florals"], eng: "available" })).length, 0); // florals is in use → empty
assert.equal(V.filter((v) => catalogMatches(v, {})).length, 4); // no constraints → all

// ── tally: distinct present values with counts, sorted, zero-count impossible ──
assert.deepEqual(tally(V, (v) => [v.kind]), [["catering", 1], ["florals", 1], ["music", 1], ["photography", 1]]);
assert.deepEqual(tally(V, (v) => v.cities), [["CDMX", 2], ["Oaxaca", 1], ["Tulum", 2]]); // CDMX appears on a+c
// a chip's count matches the cards it yields (DoD 2): CDMX says 2, and CDMX filter yields 2.
const [, cdmxCount] = tally(V, (v) => v.cities).find(([c]) => c === "CDMX");
assert.equal(cdmxCount, V.filter((v) => catalogMatches(v, { cities: ["CDMX"] })).length);

console.log("catalog-filter: 22 cases ok");
