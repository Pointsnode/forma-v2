import assert from "node:assert/strict";
import { menuLetter, plateVariant, plateCounts } from "./plate.mjs";

// Letters follow sort order, lowercase.
assert.equal(menuLetter(0), "a");
assert.equal(menuLetter(2), "c");
assert.equal(menuLetter(25), "z");
assert.equal(menuLetter(26), "a"); // wraps (defensive; never expected in practice)

// Variant: chosen → dietary iff a dietary note, else standard; unchosen → empty.
assert.equal(plateVariant(null, null), "empty");
assert.equal(plateVariant("opt1", ""), "standard");
assert.equal(plateVariant("opt1", "  "), "standard");
assert.equal(plateVariant("opt1", "no nuts"), "dietary");

// Counts: chosen per letter, unchosen only for rsvp=yes, dietary among chosen.
const letterOf = (id) => ({ a1: "a", b1: "b" })[id];
const guests = [
  { choiceId: "a1", dietary: null, rsvp: "yes" },
  { choiceId: "a1", dietary: "vegan", rsvp: "yes" },
  { choiceId: "b1", dietary: null, rsvp: "yes" },
  { choiceId: null, dietary: null, rsvp: "yes" },   // unchosen
  { choiceId: null, dietary: null, rsvp: "maybe" },  // NOT counted unchosen (not yes)
];
const c = plateCounts(guests, letterOf);
assert.deepEqual(c.byLetter, { a: 2, b: 1 });
assert.equal(c.unchosen, 1);
assert.equal(c.dietary, 1);

console.log("plate: letters + variant + counts ok");
