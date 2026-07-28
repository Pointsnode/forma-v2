import assert from "node:assert/strict";
import { taskHref } from "./task-href.mjs";
import { compareTasks, taskRank } from "./task-sort.mjs";

// ── taskHref: at most one link; event honors its section anchor ──────────────
assert.equal(taskHref({ wedding_id: null }), "/tasks");
assert.equal(taskHref({ wedding_id: "w1" }), "/wedding/w1");
assert.equal(taskHref({ wedding_id: "w1", contractId: "c9" }), "/wedding/w1/contracts/c9");
assert.equal(taskHref({ wedding_id: "w1", proposalId: "p9" }), "/wedding/w1/proposals");
assert.equal(taskHref({ wedding_id: "w1", engagementId: "e9" }), "/wedding/w1/vendors");
assert.equal(taskHref({ wedding_id: "w1", documentId: "d9" }), "/wedding/w1/documents");
assert.equal(taskHref({ wedding_id: "w1", eventId: "ev9" }), "/wedding/w1/event/ev9");
// the finding: an event-section link lands ON the section anchor, not the page top
assert.equal(taskHref({ wedding_id: "w1", eventId: "ev9", linkSection: "menus" }), "/wedding/w1/event/ev9#menus");

// ── within-column order: flagged above overdue above the rest ────────────────
const T = "2026-07-28";
const flagged = { flagged: true, status: "pending", due_date: "2026-08-10" };
const overdue = { flagged: false, status: "pending", due_date: "2026-07-01" };
const soon = { flagged: false, status: "pending", due_date: "2026-08-01" };
const undated = { flagged: false, status: "pending", due_date: null };
assert.equal(taskRank(flagged, T), 0);
assert.equal(taskRank(overdue, T), 1);
assert.equal(taskRank(soon, T), 2);
assert.equal(taskRank({ flagged: true, status: "completed", due_date: "2026-07-01" }, T), 3); // completed never flagged/overdue

const ordered = [soon, undated, overdue, flagged].sort((a, b) => compareTasks(a, b, T));
assert.deepEqual(ordered, [flagged, overdue, soon, undated]);

console.log("task-href + sort: link anchors + flagged-above-overdue ok");
