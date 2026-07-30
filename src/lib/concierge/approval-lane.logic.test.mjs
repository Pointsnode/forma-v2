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

// assign_seat: ids must be real UUIDs (never invented slugs) + seat_no an integer
const U = "11111111-2222-3333-4444-555555555555";
assert.equal(validateAction("assign_seat", { event_id: "sangeet", guest_id: "nisha", table_id: "mesa_5", seat_no: "D" }).ok, false); // the gate's exact facade
assert.equal(validateAction("assign_seat", { event_id: U, guest_id: U, table_id: U, seat_no: "D" }).ok, false); // letter seat_no
assert.equal(validateAction("assign_seat", { event_id: U, guest_id: U, table_id: U, seat_no: -1 }).ok, false); // negative
assert.equal(validateAction("assign_seat", { event_id: U, guest_id: U, table_id: U, seat_no: 3 }).ok, true); // real ids + int
assert.equal(validateAction("assign_seat", { event_id: U, guest_id: U, table_id: U, seat_no: "3" }).ok, true); // numeric string ok

// M13: present_vendor + send_quote are propose-only (concierge proposes, planner runs)
assert.equal(isApprovable("present_vendor"), true);
assert.equal(isApprovable("send_quote"), true);
assert.equal(validateAction("present_vendor", { vendor_id: U }).ok, false); // wedding_id missing
assert.equal(validateAction("present_vendor", { vendor_id: U, wedding_id: U }).ok, true);
assert.equal(validateAction("send_quote", {}).ok, false); // quote_id missing
assert.equal(validateAction("send_quote", { quote_id: U }).ok, true);

// the lane is a bounded, explicit set
assert.ok(Object.keys(APPROVAL_FNS).length >= 10);
assert.ok(!("close_wedding" in APPROVAL_FNS));

console.log("approval-lane: allowlist + validation ok");
