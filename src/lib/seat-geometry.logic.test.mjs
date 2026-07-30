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

// rect/banquet: two long sides, split evenly
const rect = seatPositions("rect", 6, 200, 90, 0);
assert.equal(rect.length, 6);
assert.equal(rect.filter((p) => p.y < 0).length, 3); // 3 on top, 3 on bottom
const banquet = seatPositions("banquet", 5, 240, 100, 0);
assert.equal(banquet.length, 5);
assert.equal(banquet.filter((p) => p.y < 0).length, 3); // ceil(5/2)=3 top, 2 bottom

// rotation actually rotates the ring (90°: the first chair moves off the top axis)
const up = seatPositions("round", 4, 100, 100, 0)[0];
const rotated = seatPositions("round", 4, 100, 100, 90)[0];
assert.ok(Math.abs(up.x) < 1e-6 && up.y < 0);          // first chair at top
assert.ok(Math.abs(rotated.y) < 1e-6 && rotated.x > 0); // rotated to the right

// zero capacity → no chairs
assert.equal(seatPositions("round", 0, 100, 100, 0).length, 0);

// ── M14 §C seat_sides ─────────────────────────────────────────────────────────
// 'all' (default) is unchanged, and 'long' coincides with it for this geometry.
const allRect = seatPositions("rect", 6, 200, 90, 0, "all");
const longRect = seatPositions("rect", 6, 200, 90, 0, "long");
assert.deepEqual(longRect, allRect); // long == all for a rect (short ends are never seated)
assert.deepEqual(allRect, seatPositions("rect", 6, 200, 90, 0)); // 'all' == the 5-arg default
// 'one' puts every chair on a single long side (all on top, y<0).
const oneRect = seatPositions("rect", 6, 200, 90, 0, "one");
assert.equal(oneRect.length, 6);
assert.equal(oneRect.filter((p) => p.y < 0).length, 6); // all on the top side
assert.equal(oneRect.filter((p) => p.y > 0).length, 0);
// 'one' on a round table is a front arc across the lower semicircle (all y>=0).
const oneRound = seatPositions("round", 5, 120, 120, 0, "one");
assert.equal(oneRound.length, 5);
assert.ok(oneRound.every((p) => p.y >= -1e-9)); // lower half only
// round ignores 'long' (no long sides) → still the full ring == 'all'.
assert.deepEqual(seatPositions("round", 8, 120, 120, 0, "long"), seatPositions("round", 8, 120, 120, 0, "all"));

console.log("seat-geometry: labels + ring/side positions + rotation + seat_sides ok");
