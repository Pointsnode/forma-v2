// Dominant-color extraction — pure, dependency-free. The client draws an image onto a
// small canvas and passes the RGBA pixel data here; we bucket colors into a coarse
// histogram (4 bits/channel), average each bucket, and return up to `count` distinct hexes
// by frequency (skipping near-duplicates). This is the palette's "grows from the imagery".

export function hexToRgb(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
function rgbToHex(r, g, b) {
  return "#" + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0")).join("");
}
function dist(a, b) {
  const [r1, g1, b1] = hexToRgb(a), [r2, g2, b2] = hexToRgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

// data: a flat RGBA Uint8ClampedArray (or number[]) from canvas getImageData.
export function extractSwatches(data, count = 5, minDist = 42) {
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue; // skip transparent
    const key = ((data[i] & 0xf0) << 16) | ((data[i + 1] & 0xf0) << 8) | (data[i + 2] & 0xf0);
    const e = buckets.get(key);
    if (e) { e.n++; e.r += data[i]; e.g += data[i + 1]; e.b += data[i + 2]; }
    else buckets.set(key, { n: 1, r: data[i], g: data[i + 1], b: data[i + 2] });
  }
  const sorted = [...buckets.values()].sort((a, b) => b.n - a.n);
  const out = [];
  for (const e of sorted) {
    const hex = rgbToHex(e.r / e.n, e.g / e.n, e.b / e.n);
    if (out.some((h) => dist(h, hex) < minDist)) continue; // skip near-duplicates
    out.push(hex);
    if (out.length >= count) break;
  }
  return out;
}
