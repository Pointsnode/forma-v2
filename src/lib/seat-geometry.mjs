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
// M14 §C `sides` distributes a RECT/BANQUET table's chairs three distinct ways:
//   'all'  (default) — all four sides: the two long sides PLUS one chair at each short end (the
//                      head and foot), so someone sits at the head of the table.
//   'long'           — the two long sides only, ends empty — the "nobody at the head" banquet case.
//   'one'            — a single long side (the sweetheart/imperial case).
// ROUND tables have no long/short sides, so `sides` is ignored there (always the full ring) — the
// UI only offers the selector on rect/banquet. Chairs are laid out in seat_no order so switching
// 'long'→'all' keeps the long-side chairs and only ADDS the two ends.
export function seatPositions(shape, capacity, width, height, rotation = 0, sides = "all") {
  const pts = [];
  const rad = ((rotation || 0) * Math.PI) / 180;
  const rot = (x, y) => ({ x: x * Math.cos(rad) - y * Math.sin(rad), y: x * Math.sin(rad) + y * Math.cos(rad) });
  const n = Math.max(0, capacity);
  const offY = height / 2 + 14; // long sides (top/bottom)
  const offX = width / 2 + 14;  // short ends (left/right)

  if (shape === "round") {
    const r = Math.max(width, height) / 2 + 14; // chairs ring just outside the table
    for (let i = 0; i < n; i++) {
      const a = (i / (n || 1)) * 2 * Math.PI - Math.PI / 2;
      pts.push(rot(Math.cos(a) * r, Math.sin(a) * r));
    }
    return pts;
  }

  if (sides === "one") {
    // all chairs along one long side (top)
    const step = width / (n + 1);
    for (let i = 0; i < n; i++) pts.push(rot(-width / 2 + step * (i + 1), -offY));
    return pts;
  }

  // 'all' reserves one chair for each short end (the head + foot); 'long' reserves none. The rest
  // split across the two long sides, ceil on top. seat_no order: long sides first, then the ends.
  const ends = sides === "all" ? Math.min(n, 2) : 0;
  const longN = n - ends;
  const perTop = Math.ceil(longN / 2);
  for (let i = 0; i < n; i++) {
    if (i < longN) {
      const top = i < perTop;
      const idx = top ? i : i - perTop;
      const count = top ? perTop : longN - perTop;
      const step = width / (count + 1);
      pts.push(rot(-width / 2 + step * (idx + 1), top ? -offY : offY));
    } else {
      // the ends: first the left head, then the right foot
      pts.push(rot(i - longN === 0 ? -offX : offX, 0));
    }
  }
  return pts;
}
