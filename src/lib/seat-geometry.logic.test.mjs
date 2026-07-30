import assert from "node:assert/strict";
import { seatLabel, seatPositions } from "./seat-geometry.mjs";

// codes: 0-based → A
assert.equal(seatLabel(0), "A");
assert.equal(seatLabel(2), "C");
assert.equal(seatLabel(25), "Z");

// round: `capacity` chairs, all on a ring just outside the table
const round = seatPositions("round", 8, 120, 120, 0);
assert.equal(round.length, 8);
for (const p of round) assert.ok(Math.abs(Math.hypot(p.x, p.y) - (60 + 14)) < 1e-6);

// rect/banquet 'long': two long sides only, split evenly, no end chairs
const rect = seatPositions("rect", 6, 200, 90, 0, "long");
assert.equal(rect.length, 6);
assert.equal(rect.filter((p) => p.y < 0).length, 3); // 3 on top, 3 on bottom
assert.equal(rect.filter((p) => Math.abs(p.x) > 100).length, 0); // nothing at the short ends
const banquet = seatPositions("banquet", 5, 240, 100, 0, "long");
assert.equal(banquet.length, 5);
assert.equal(banquet.filter((p) => p.y < 0).length, 3); // ceil(5/2)=3 top, 2 bottom

// rotation actually rotates the ring (90°: the first chair moves off the top axis)
const up = seatPositions("round", 4, 100, 100, 0)[0];
const rotated = seatPositions("round", 4, 100, 100, 90)[0];
assert.ok(Math.abs(up.x) < 1e-6 && up.y < 0);          // first chair at top
assert.ok(Math.abs(rotated.y) < 1e-6 && rotated.x > 0); // rotated to the right

// zero capacity → no chairs
assert.equal(seatPositions("round", 0, 100, 100, 0).length, 0);

// ── M14 §C seat_sides: three DISTINCT rect/banquet layouts ───────────────────
const allRect = seatPositions("rect", 6, 200, 90, 0, "all");
const longRect = seatPositions("rect", 6, 200, 90, 0, "long");
const oneRect = seatPositions("rect", 6, 200, 90, 0, "one");
assert.deepEqual(allRect, seatPositions("rect", 6, 200, 90, 0)); // 'all' is the default
// all three differ from one another
assert.notDeepEqual(allRect, longRect);
assert.notDeepEqual(allRect, oneRect);
assert.notDeepEqual(longRect, oneRect);
// 'all' seats the two short ends (x past the long-side span, y≈0); 'long' seats none
const ends = (ps) => ps.filter((p) => Math.abs(p.x) > 100 && Math.abs(p.y) < 1e-6);
assert.equal(ends(allRect).length, 2);  // head + foot occupied
assert.equal(ends(longRect).length, 0); // nobody at the head
assert.equal(allRect.filter((p) => Math.abs(p.x) <= 100).length, 4); // the rest on the long sides
// 'one' — a single long side (all on top)
assert.equal(oneRect.length, 6);
assert.equal(oneRect.filter((p) => p.y < 0).length, 6);
assert.equal(oneRect.filter((p) => p.y > 0).length, 0);
// round has no long/short sides — sides is ignored, always the full ring
assert.deepEqual(seatPositions("round", 8, 120, 120, 0, "long"), seatPositions("round", 8, 120, 120, 0, "all"));
assert.deepEqual(seatPositions("round", 8, 120, 120, 0, "one"), seatPositions("round", 8, 120, 120, 0, "all"));

console.log("seat-geometry: labels + long/all(+ends)/one + round-ring + rotation ok");
