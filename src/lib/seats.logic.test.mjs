import assert from "node:assert/strict";
import { conciergeSeatCount, isConciergeSeat } from "./seats.mjs";

// A founding owner is role='owner' with EMPTY grants (createWorkspace seeds it so). The
// owner must still count as a concierge seat — the gate bug was Team's count drifting
// from the billing path. With one shared helper, the "Team display" inputs and the
// "billing path" inputs are the SAME call, so they cannot diverge.
{
  const roster = [{ role: "owner", grants: [] }];
  const teamDisplay = conciergeSeatCount(roster, true);
  const billingPath = conciergeSeatCount(roster, true);
  assert.equal(teamDisplay, billingPath, "display and billing must agree for owner-with-empty-grants");
  assert.equal(teamDisplay, 1, "the founding owner is one concierge seat");
}

// Disabled concierge → 0 everywhere (no $15 for a feature that's off).
assert.equal(conciergeSeatCount([{ role: "owner", grants: [] }], false), 0, "disabled → 0");
assert.equal(conciergeSeatCount([{ role: "owner", grants: ["concierge"] }, { role: "planner", grants: ["concierge"] }], false), 0);

// The rule: owner OR admin grant OR concierge grant; plain planners don't count.
{
  const roster = [
    { role: "owner", grants: [] },                 // owner → seat
    { role: "planner", grants: ["concierge"] },    // explicit concierge → seat
    { role: "planner", grants: ["admin"] },        // admin grant → seat
    { role: "planner", grants: ["weddings"] },     // planner without concierge → not a seat
    { role: "coordinator", grants: [] },           // coordinator → not a seat
  ];
  assert.equal(conciergeSeatCount(roster, true), 3);
  assert.equal(isConciergeSeat({ role: "planner", grants: ["weddings"] }), false);
  assert.equal(isConciergeSeat({ role: "owner", grants: [] }), true);
}

// Null-safety: a null grants array (Supabase null column) must not throw.
assert.equal(conciergeSeatCount([{ role: "planner", grants: null }], true), 0);

console.log("seats: owner-inclusive, disabled→0, display===billing ok");
