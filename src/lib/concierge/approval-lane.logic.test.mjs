import assert from "node:assert/strict";
import { isApprovable, validateAction, APPROVAL_FNS } from "./approval-lane.mjs";

// close_wedding is intentionally OUT of the lane (terminal/destructive).
assert.equal(isApprovable("close_wedding"), false);
assert.equal(isApprovable("send_contract"), true);
assert.equal(isApprovable("send_proposal"), true);

// an unknown fn can never be proposed
assert.equal(validateAction("delete_everything", { x: 1 }).ok, false);
assert.equal(validateAction("close_wedding", { wedding_id: "w" }).ok, false);

// required args are enforced
assert.equal(validateAction("send_proposal", {}).ok, false);
assert.equal(validateAction("send_proposal", { proposal_id: "" }).ok, false);
assert.equal(validateAction("send_proposal", { proposal_id: "p1" }).ok, true);
assert.equal(validateAction("record_quote", { quote_id: "q" }).ok, false); // amount missing
assert.equal(validateAction("record_quote", { quote_id: "q", amount: 100 }).ok, true);
assert.equal(validateAction("schedule_touchpoint", { wedding_id: "w" }).ok, false); // kind missing
assert.equal(validateAction("schedule_touchpoint", { wedding_id: "w", kind: "menu_collect" }).ok, true);

// the lane is a bounded, explicit set
assert.ok(Object.keys(APPROVAL_FNS).length >= 10);
assert.ok(!("close_wedding" in APPROVAL_FNS));

console.log("approval-lane: allowlist + validation ok");
