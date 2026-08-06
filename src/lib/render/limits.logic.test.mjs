import assert from "node:assert/strict";
import { renderCapState, RENDERS_PER_WEDDING, RENDERS_PER_DAY, RENDERS_LEFT_HINT, MAX_REF_IMAGES } from "./limits.mjs";

// The product numbers the spec pins.
assert.equal(RENDERS_PER_WEDDING, 25, "per-wedding lifetime budget");
assert.equal(RENDERS_PER_DAY, 15, "per-studio-per-day brake");
assert.equal(MAX_REF_IMAGES, 8, "reference images forwarded to the model");

// Headroom on both → enabled.
assert.deepEqual(renderCapState(10, 10), { disabled: false, reason: null });

// Per-wedding exhausted (the "set the constant to 0" demonstration → count reaches the cap →
// rendersLeft = 0) → disabled with the wedding message, and it wins over a spent day too.
assert.deepEqual(renderCapState(0, 10), { disabled: true, reason: "cap_wedding" });
assert.deepEqual(renderCapState(0, 0), { disabled: true, reason: "cap_wedding" });

// Per-day brake with wedding budget remaining → disabled with the day message.
assert.deepEqual(renderCapState(5, 0), { disabled: true, reason: "cap_day" });

// The low-budget nudge threshold: "{count} left" shows at <= 5, not at 6.
assert.equal(RENDERS_LEFT_HINT, 5);
assert.ok(5 <= RENDERS_LEFT_HINT && !(6 <= RENDERS_LEFT_HINT), "hint shows at 5, hidden at 6");

// A single remaining render is still enabled (the boundary is <= 0, not <= 1).
assert.deepEqual(renderCapState(1, 1), { disabled: false, reason: null });

console.log("render limits: caps + hint threshold ok");
