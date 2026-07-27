import assert from "node:assert/strict";
import { runOfShowRank } from "./run-of-show.mjs";

// Stable-sort a run-of-show the way loadEventOps does.
const order = (items) => [...items].sort((a, b) => runOfShowRank(a.time) - runOfShowRank(b.time)).map((i) => i.title);

// The bug: a post-midnight send-off must NOT sort to the top of the evening.
assert.deepEqual(
  order([
    { title: "sendoff", time: "00:30" },
    { title: "ceremony", time: "16:00" },
    { title: "reception", time: "22:00" },
    { title: "firstdance", time: "23:15" },
  ]),
  ["ceremony", "reception", "firstdance", "sendoff"],
);

// The 06:00 cut: 05:59 is still "late night" (next day), 06:00 is morning.
assert.deepEqual(
  order([
    { title: "late", time: "05:59" },
    { title: "brunch", time: "06:00" },
    { title: "getready", time: "09:00" },
  ]),
  ["brunch", "getready", "late"],
);

// Seconds precision parses; equal minutes keep input order (stable).
assert.deepEqual(
  order([
    { title: "a", time: "12:00:00" },
    { title: "b", time: "12:00:59" },
  ]),
  ["a", "b"],
);

// Untimed items sink to the bottom, in their given order.
assert.deepEqual(
  order([
    { title: "tbd2", time: null },
    { title: "dinner", time: "20:00" },
    { title: "tbd1", time: null },
  ]),
  ["dinner", "tbd2", "tbd1"],
);

console.log("run-of-show: late-night ordering ok");
