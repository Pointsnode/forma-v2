import assert from "node:assert/strict";
import { zonedDateKey, monthMatrix, bucketByDate, yearDensity, filterEntries } from "./calendar-grid.mjs";

// ── zonedDateKey: a UTC instant lands on the correct calendar day IN THE ZONE ──
// The across-midnight case the DoD calls out: run the bucketing in the CONNECTION's
// zone, not the server's. Mexico City is UTC-6 year-round (DST abolished 2022).
assert.equal(zonedDateKey("2027-03-10T05:30:00Z", "America/Mexico_City"), "2027-03-09", "05:30Z is still the 9th at UTC-6");
assert.equal(zonedDateKey("2027-03-10T12:00:00Z", "America/Mexico_City"), "2027-03-10", "midday holds the same date");
assert.equal(zonedDateKey("2027-03-10T20:00:00Z", "Asia/Tokyo"), "2027-03-11", "20:00Z is the next day at UTC+9");
assert.equal(zonedDateKey("2027-03-10T00:00:00Z", "UTC"), "2027-03-10", "UTC identity");

// ── monthMatrix: full weeks, right day-count, correct leading based on weekStart ─
// Feb 2027 has 28 days; Feb 1 2027 is a Monday.
const febSun = monthMatrix(2027, 1, 0).flat();
assert.equal(febSun.length % 7, 0, "grid is whole weeks");
const febInMonth = febSun.filter((c) => c.inMonth);
assert.equal(febInMonth.length, 28);
assert.equal(febInMonth[0].key, "2027-02-01");
assert.equal(febInMonth[27].key, "2027-02-28");
assert.equal(febSun[0].key, "2027-01-31", "Sunday-start → one leading day (Jan 31)");
assert.equal(monthMatrix(2027, 1, 1).flat()[0].key, "2027-02-01", "Monday-start → no leading day");
// December → January rollover in the trailing cells
const dec = monthMatrix(2027, 11, 0).flat();
assert.ok(dec.some((c) => c.key.startsWith("2028-01")), "trailing cells roll into next year");

// ── bucketByDate + across-midnight meeting places on the zoned day ────────────
const meetingDate = zonedDateKey("2027-03-10T05:30:00Z", "America/Mexico_City");
const entries = [
  { id: "m1", species: "meeting", date: meetingDate, status: "scheduled" },
  { id: "w1", species: "wedding", date: "2027-03-10", weddingId: "wA" },
  { id: "w2", species: "wedding", date: "2027-06-01", weddingId: "wB" },
  { id: "t1", species: "task", date: "2027-03-10", weddingId: "wA" },
  { id: "t2", species: "task", date: "2027-03-15", weddingId: "wB" },
];
const buckets = bucketByDate(entries);
assert.deepEqual(buckets.get("2027-03-09").map((e) => e.id), ["m1"], "meeting bucketed on the 9th (zoned), not the 10th");
assert.equal(buckets.get("2027-03-10").length, 2, "wedding + task share the 10th");

// ── yearDensity: per-month species counts for the year ───────────────────────
const d = yearDensity(entries, 2027);
assert.equal(d[2].meeting, 1, "March has 1 meeting");
assert.equal(d[2].wedding, 1, "March has 1 wedding day");
assert.equal(d[2].task, 2, "March has 2 tasks");
assert.equal(d[5].wedding, 1, "June has 1 wedding day");
assert.equal(d[0].meeting + d[0].wedding + d[0].task, 0, "January is empty");

// ── filterEntries: species narrows; wedding filter spares meetings ───────────
assert.equal(filterEntries(entries, { species: new Set(["meeting"]) }).length, 1);
assert.equal(filterEntries(entries, { species: new Set(["wedding", "task"]) }).length, 4);
const wA = filterEntries(entries, { weddingIds: new Set(["wA"]) });
assert.ok(wA.some((e) => e.id === "m1"), "meetings are not filtered by wedding (no weddingId)");
assert.deepEqual(wA.filter((e) => e.species !== "meeting").map((e) => e.id).sort(), ["t1", "w1"], "only wA's wedding/task survive");

console.log("calendar-grid: zoning, matrix, density, filter ok");
