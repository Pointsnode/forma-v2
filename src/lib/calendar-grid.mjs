// Pure calendar math for the M11 grid. The tz-sensitive step (placing a UTC meeting
// timestamp on a calendar day) is `zonedDateKey`, run SERVER-side in the connection's
// timezone; the resulting date-key strings are what the client buckets, so the client
// does NO timezone math and a meeting never drifts across day-cells. Wedding days and
// task due dates are DATE-typed already — zone-free by construction, used as-is.

const pad = (n) => String(n).padStart(2, "0");
export const ymd = (y, m0, d) => `${y}-${pad(m0 + 1)}-${pad(d)}`;

/** A UTC instant → 'YYYY-MM-DD' as it falls in `timeZone` (across-midnight correct). */
export function zonedDateKey(utcInstant, timeZone) {
  const d = utcInstant instanceof Date ? utcInstant : new Date(utcInstant);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Weeks × 7 cells covering the month, with leading/trailing days from neighbors.
    weekStart: 0=Sunday (en), 1=Monday (es). Each cell = { key, inMonth }. */
export function monthMatrix(year, month0, weekStart = 0) {
  const firstDow = new Date(Date.UTC(year, month0, 1)).getUTCDay();
  const lead = (firstDow - weekStart + 7) % 7;
  const daysInMonth = new Date(Date.UTC(year, month0 + 1, 0)).getUTCDate();
  const daysInPrev = new Date(Date.UTC(year, month0, 0)).getUTCDate();

  const cells = [];
  for (let i = lead - 1; i >= 0; i--) {
    const d = daysInPrev - i;
    const m = month0 === 0 ? 11 : month0 - 1;
    const y = month0 === 0 ? year - 1 : year;
    cells.push({ key: ymd(y, m, d), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) cells.push({ key: ymd(year, month0, d), inMonth: true });
  while (cells.length % 7 !== 0) {
    const idx = cells.length - (lead + daysInMonth) + 1;
    const m = month0 === 11 ? 0 : month0 + 1;
    const y = month0 === 11 ? year + 1 : year;
    cells.push({ key: ymd(y, m, idx), inMonth: false });
  }
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Group entries by their date-key. Entries carry a precomputed `date` ('YYYY-MM-DD'). */
export function bucketByDate(entries) {
  const map = new Map();
  for (const e of entries) {
    if (!map.has(e.date)) map.set(e.date, []);
    map.get(e.date).push(e);
  }
  return map;
}

/** Per-month species counts for a year — the year view's density dots. */
export function yearDensity(entries, year) {
  const prefix = `${year}-`;
  const months = Array.from({ length: 12 }, () => ({ meeting: 0, wedding: 0, task: 0 }));
  for (const e of entries) {
    if (!e.date.startsWith(prefix)) continue;
    const m0 = Number(e.date.slice(5, 7)) - 1;
    if (e.species in months[m0]) months[m0][e.species] += 1;
  }
  return months;
}

/** The species + wedding filter reducer. species/weddingIds empty = show all. */
export function filterEntries(entries, { species, weddingIds } = {}) {
  const sp = species && species.size ? species : null;
  const wid = weddingIds && weddingIds.size ? weddingIds : null;
  return entries.filter((e) => {
    if (sp && !sp.has(e.species)) return false;
    if (wid && (e.species === "wedding" || e.species === "task") && e.weddingId && !wid.has(e.weddingId)) return false;
    return true;
  });
}
