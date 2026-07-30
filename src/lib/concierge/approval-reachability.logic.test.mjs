import assert from "node:assert/strict";
import { APPROVAL_FNS } from "./approval-lane.mjs";
import { READABLE_IDS } from "./read-ids.mjs";

// §1E law 3 — enforced in CI, not by review: every *_id arg (and event_ids) in the approval lane
// must be produced by SOME read tool. So a planner approving a card always had a way to look up its
// ids, and NO future action can join the lane without adding its read tool first — this test fails
// the moment it doesn't. (This is what makes "every button connected to the right place" structural.)
const missing = [];
let idArgs = 0;
for (const [fn, def] of Object.entries(APPROVAL_FNS)) {
  for (const arg of def.args) {
    const idName = arg === "event_ids" ? "event_id" : arg;
    if (!idName.endsWith("_id")) continue;
    idArgs++;
    if (!READABLE_IDS.has(idName)) missing.push(`${fn}.${arg}`);
  }
}
assert.deepEqual(missing, [], `approval args with no read tool that produces them: ${missing.join(", ")}`);

// mark_line_paid is the oldest dead action — assert its id is now reachable (ledger emits line_id).
assert.ok(READABLE_IDS.has("line_id"), "mark_line_paid's line_id must be produced by the ledger tool");
// and the id every new M16b action needs
for (const id of ["engagement_id", "quote_id", "item_id", "menu_id", "inquiry_id", "plan_id"]) {
  assert.ok(READABLE_IDS.has(id), `${id} must be produced by a read tool`);
}

console.log(`approval-reachability: ${idArgs} id-args, all covered by a read tool`);
