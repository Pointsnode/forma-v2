// The ONE shared source for chair codes + chair positions (kills v1's hole 3 +
// the "code tied to a guest"). Used by the canvas, the seat list, PNG/PDF export,
// and escort cards. Pure. seat_no is 0-based → chair A.
export function seatLabel(n) {
  return String.fromCharCode(65 + n);
}

// Chair positions for a table, in its local frame (center origin), rotated by
// `rotation` degrees — a ring for round tables, the two long sides for rect/banquet.
// Returns [{x,y}] of length `capacity`.
//
// M14 §C `sides` distributes the chairs: 'all' (default = today's behaviour: the full ring /
// the two long sides) · 'long' (the two long sides — the head-table/banquet case; for this app's
// geometry the short ends are never seated, so it coincides with 'all' on a rect/banquet) · 'one'
// (a single side — the sweetheart/imperial case: one long side for rect/banquet, a front arc for
// round). The 6th arg is OPTIONAL and defaults to today's layout, so the 5-arg callers and the
// existing logic test stay green.
export function seatPositions(shape, capacity, width, height, rotation = 0, sides = "all") {
  const pts = [];
  const rad = ((rotation || 0) * Math.PI) / 180;
  const rot = (x, y) => ({ x: x * Math.cos(rad) - y * Math.sin(rad), y: x * Math.sin(rad) + y * Math.cos(rad) });
  const n = Math.max(0, capacity);
  if (shape === "round") {
    const r = Math.max(width, height) / 2 + 14; // chairs ring just outside the table
    if (sides === "one") {
      // sweetheart/imperial — a front arc across the lower semicircle
      for (let i = 0; i < n; i++) {
        const a = Math.PI * ((i + 0.5) / (n || 1));
        pts.push(rot(Math.cos(a) * r, Math.sin(a) * r));
      }
    } else {
      for (let i = 0; i < n; i++) {
        const a = (i / (n || 1)) * 2 * Math.PI - Math.PI / 2;
        pts.push(rot(Math.cos(a) * r, Math.sin(a) * r));
      }
    }
  } else if (sides === "one") {
    // all chairs along one long side (top)
    const offY = height / 2 + 14;
    const step = width / (n + 1);
    for (let i = 0; i < n; i++) pts.push(rot(-width / 2 + step * (i + 1), -offY));
  } else {
    // 'all' / 'long' — the two long sides, ceil(n/2) top and the rest bottom (today's math)
    const perSide = Math.ceil(n / 2);
    const offY = height / 2 + 14;
    for (let i = 0; i < n; i++) {
      const top = i < perSide;
      const idx = top ? i : i - perSide;
      const count = top ? perSide : n - perSide;
      const step = width / (count + 1);
      const x = -width / 2 + step * (idx + 1);
      pts.push(rot(x, top ? -offY : offY));
    }
  }
  return pts;
}
