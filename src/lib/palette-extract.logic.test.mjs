import assert from "node:assert";
import { extractSwatches, hexToRgb } from "./palette-extract.mjs";

// A tiny 2x2 image: two red pixels, one teal, one bone → red dominant, all three distinct.
const px = (r, g, b) => [r, g, b, 255];
const data = [...px(220, 30, 30), ...px(220, 30, 30), ...px(47, 85, 82), ...px(245, 242, 235)];
const sw = extractSwatches(data, 5);
assert.ok(sw.length === 3, `expected 3 distinct swatches, got ${sw.length}`);
assert.ok(/^#[0-9a-f]{6}$/.test(sw[0]), "swatch is a 6-hex");
// red is the most frequent → first
const [r] = hexToRgb(sw[0]);
assert.ok(r > 180, "dominant swatch is the red-ish one");

// near-duplicates collapse: many almost-identical reds yield ONE swatch
const reds = [];
for (let i = 0; i < 20; i++) reds.push(...px(200 + (i % 5), 40, 40));
assert.equal(extractSwatches(reds, 5).length, 1, "near-duplicate reds collapse to one");

// transparent pixels are skipped
const withAlpha = [...px(10, 10, 10).slice(0, 3), 0, ...px(47, 85, 82)];
assert.equal(extractSwatches(withAlpha, 5).length, 1, "transparent pixel ignored");

console.log("palette-extract: dominant + dedup + alpha-skip ok");
