import assert from "node:assert/strict";
import { isApprovable, validateAction, APPROVAL_FNS } from "./approval-lane.mjs";

// close_wedding is intentionally OUT of the lane (terminal/destructive).
assert.equal(isApprovable("close_wedding"), false);
assert.equal(isApprovable("send_contract"), true);
assert.equal(isApprovable("send_proposal"), true);

// an unknown fn can never be proposed
assert.equal(validateAction("delete_everything", { x: 1 }).ok, false);
assert.equal(validateAction("close_wedding", { wedding_id: "w" }).ok, false);

// M16b: EVERY *_id arg is now UUID-validated (§1D), so a slug/placeholder id never becomes a card.
const U = "11111111-2222-3333-4444-555555555555";
// required args are enforced
assert.equal(validateAction("send_proposal", {}).ok, false);
assert.equal(validateAction("send_proposal", { proposal_id: "" }).ok, false);
assert.equal(validateAction("send_proposal", { proposal_id: "p1" }).ok, false); // not a UUID → refused
assert.equal(validateAction("send_proposal", { proposal_id: U }).ok, true);
assert.equal(validateAction("record_quote", { quote_id: U }).ok, false); // amount missing
assert.equal(validateAction("record_quote", { quote_id: U, amount: 100 }).ok, true);
assert.equal(validateAction("schedule_touchpoint", { wedding_id: U }).ok, false); // kind missing
assert.equal(validateAction("schedule_touchpoint", { wedding_id: U, kind: "menu_collect" }).ok, true);

// assign_seat: ids must be real UUIDs (never invented slugs) + seat_no an integer
assert.equal(validateAction("assign_seat", { event_id: "sangeet", guest_id: "nisha", table_id: "mesa_5", seat_no: "D" }).ok, false); // the gate's exact facade
assert.equal(validateAction("assign_seat", { event_id: U, guest_id: U, table_id: U, seat_no: "D" }).ok, false); // letter seat_no
assert.equal(validateAction("assign_seat", { event_id: U, guest_id: U, table_id: U, seat_no: -1 }).ok, false); // negative
assert.equal(validateAction("assign_seat", { event_id: U, guest_id: U, table_id: U, seat_no: 3 }).ok, true); // real ids + int
assert.equal(validateAction("assign_seat", { event_id: U, guest_id: U, table_id: U, seat_no: "3" }).ok, true); // numeric string ok

// M14: unseat is propose-only; ids must be real UUIDs
assert.equal(isApprovable("unseat"), true);
assert.equal(validateAction("unseat", { event_id: U }).ok, false); // guest_id missing
assert.equal(validateAction("unseat", { event_id: "sangeet", guest_id: "ana" }).ok, false); // slugs, not UUIDs
assert.equal(validateAction("unseat", { event_id: U, guest_id: U }).ok, true);

// M13: present_vendor + send_quote are propose-only (concierge proposes, planner runs)
assert.equal(isApprovable("present_vendor"), true);
assert.equal(isApprovable("send_quote"), true);
assert.equal(validateAction("present_vendor", { vendor_id: U }).ok, false); // wedding_id missing
assert.equal(validateAction("present_vendor", { vendor_id: U, wedding_id: U }).ok, true);
assert.equal(validateAction("send_quote", {}).ok, false); // quote_id missing
assert.equal(validateAction("send_quote", { quote_id: U }).ok, true);

// ── M16b widened lane (§1C/§1D) — typed validation per new entry ─────────────
// simple id-only actions
for (const [fn, arg] of [["complete_task", "task_id"], ["archive_engagement", "engagement_id"], ["withdraw_proposal", "proposal_id"], ["unlock_menu", "menu_id"], ["void_contract", "contract_id"], ["convert_inquiry", "inquiry_id"]]) {
  assert.equal(validateAction(fn, {}).ok, false); // missing
  assert.equal(validateAction(fn, { [arg]: "not-a-uuid" }).ok, false); // slug refused
  assert.equal(validateAction(fn, { [arg]: U }).ok, true);
}
// check_schedule_item: item_id UUID + done real boolean
assert.equal(validateAction("check_schedule_item", { item_id: U }).ok, false); // done missing
assert.equal(validateAction("check_schedule_item", { item_id: U, done: "yes" }).ok, false); // not a boolean
assert.equal(validateAction("check_schedule_item", { item_id: U, done: true }).ok, true);
// set_couple_can_edit: plan_id UUID + on real boolean
assert.equal(validateAction("set_couple_can_edit", { plan_id: U, on: 1 }).ok, false);
assert.equal(validateAction("set_couple_can_edit", { plan_id: U, on: false }).ok, true);
// add_day_of_extra: wedding_id + event_id UUIDs, title non-empty, amount positive
assert.equal(validateAction("add_day_of_extra", { wedding_id: U, event_id: U, title: "Extra hour", amount: -5 }).ok, false); // amount not positive
assert.equal(validateAction("add_day_of_extra", { wedding_id: U, event_id: U, title: "", amount: 500 }).ok, false); // empty title
assert.equal(validateAction("add_day_of_extra", { wedding_id: U, event_id: U, title: "Extra hour", amount: 500 }).ok, true);
// post_proposal_message: proposal_id UUID + non-empty body
assert.equal(validateAction("post_proposal_message", { proposal_id: U, body: "  " }).ok, false); // blank body
assert.equal(validateAction("post_proposal_message", { proposal_id: U, body: "Loved the venue!" }).ok, true);
// create_workspace_invite: email-shaped + grants a subset of the clearance keys
assert.equal(validateAction("create_workspace_invite", { email: "not-an-email", grants: ["dayof"] }).ok, false);
assert.equal(validateAction("create_workspace_invite", { email: "a@b.com", grants: ["nope"] }).ok, false); // bad box key
assert.equal(validateAction("create_workspace_invite", { email: "a@b.com", grants: ["dayof", "tasks"] }).ok, true);

// the lane is a bounded, explicit set of 26 (15 base incl. M14's unseat + 11 new M16b entries)
assert.equal(Object.keys(APPROVAL_FNS).length, 26);
assert.ok(!("close_wedding" in APPROVAL_FNS));
// the §1G exclusions never crept in
for (const x of ["close_wedding", "record_fee_payment", "publish_profile", "save_profile", "sign_contract_as", "respond_to_proposal", "accept_workspace_invite", "move_floor_item"]) {
  assert.equal(isApprovable(x), false, `${x} must never be approvable`);
}

console.log("approval-lane: allowlist + validation (26 fns) ok");
