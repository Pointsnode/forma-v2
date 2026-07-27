// Pure run-of-show ordering, shared by loadEventOps (via wedding.ts re-export)
// and the logic test. Late-night semantics: a 00:30 send-off belongs AFTER the
// 22:00 reception, so times before the 06:00 cut roll to the next day. Untimed
// items sink to the bottom (Infinity), keeping their caller order under a stable
// sort. Time is "HH:MM" or "HH:MM:SS".
export function runOfShowRank(time) {
  if (!time) return Number.POSITIVE_INFINITY;
  const [h, m] = time.split(":").map(Number);
  const v = (h || 0) * 60 + (m || 0);
  return v < 6 * 60 ? v + 24 * 60 : v;
}
