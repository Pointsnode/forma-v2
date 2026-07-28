// The ONE shared source for chair codes + chair positions (kills v1's hole 3 +
// the "code tied to a guest"). Used by the canvas, the seat list, PNG/PDF export,
// and escort cards. Pure. seat_no is 0-based → chair A.
export function seatLabel(n) {
  return String.fromCharCode(65 + n);
}

// Chair positions for a table, in its local frame (center origin), rotated by
// `rotation` degrees — v1's seatPositions math: a ring for round tables, the two
// long sides for rect/banquet. Returns [{x,y}] of length `capacity`.
export function seatPositions(shape, capacity, width, height, rotation = 0) {
  const pts = [];
  const rad = ((rotation || 0) * Math.PI) / 180;
  const rot = (x, y) => ({ x: x * Math.cos(rad) - y * Math.sin(rad), y: x * Math.sin(rad) + y * Math.cos(rad) });
  const n = Math.max(0, capacity);
  if (shape === "round") {
    const r = Math.max(width, height) / 2 + 14; // chairs ring just outside the table
    for (let i = 0; i < n; i++) {
      const a = (i / (n || 1)) * 2 * Math.PI - Math.PI / 2;
      pts.push(rot(Math.cos(a) * r, Math.sin(a) * r));
    }
  } else {
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
