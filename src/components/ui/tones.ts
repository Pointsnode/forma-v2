// Solid brand hero tones — no gradients, drawn from the prototype's palette:
// taupe · umber · wine · deep sage · maroon · ink.
const ROTATE = ["#8A7355", "#6B5A41", "#5C2B35", "#4E5C47", "#3A1A20", "#1E1E1E"];

// Stable per-id pick (switcher swatches) — deterministic across renders.
export function heroTone(id: string): string {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return ROTATE[h % ROTATE.length];
}

// Index rotation (bento grids) — guarantees visible variety across a set, so a
// row of cards never repeats the same tone. This is the fix for the maroon repeat.
export function heroToneAt(i: number): string {
  return ROTATE[((i % ROTATE.length) + ROTATE.length) % ROTATE.length];
}
