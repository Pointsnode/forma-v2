import assert from "node:assert/strict";
import { foldHistory } from "./history.mjs";

// A turn = an answer row + its card rows. The draft/action ids must reach the
// model, and consecutive concierge rows merge into ONE assistant message.
{
  const rows = [
    { role: "planner", content: "draft a welcome dinner proposal", draft_ref: null, action_ref: null },
    { role: "concierge", content: "Done, I drafted it.", draft_ref: null, action_ref: null },
    { role: "concierge", content: "", draft_ref: { kind: "proposal", id: "437296c2-aaaa", title: "Welcome Dinner Mariachi Upgrade" }, action_ref: null },
  ];
  const h = foldHistory(rows);
  assert.equal(h.length, 2);
  assert.equal(h[0].role, "user");
  assert.equal(h[1].role, "assistant");
  // the merged assistant turn carries the answer AND the created id
  assert.ok(h[1].content.includes("Done, I drafted it."));
  assert.ok(h[1].content.includes("437296c2-aaaa"));
  assert.ok(h[1].content.includes("Welcome Dinner Mariachi Upgrade"));
}

// Multiple proposed actions in one turn: BOTH ids/fns survive into history.
{
  const rows = [
    { role: "planner", content: "prep two sends", draft_ref: null, action_ref: null },
    { role: "concierge", content: "Two cards ready.", draft_ref: null, action_ref: null },
    { role: "concierge", content: "", draft_ref: null, action_ref: { fn: "send_proposal", args: { proposal_id: "p1" }, status: "pending" } },
    { role: "concierge", content: "", draft_ref: null, action_ref: { fn: "send_contract", args: { contract_id: "c1" }, status: "pending" } },
  ];
  const h = foldHistory(rows);
  assert.equal(h.length, 2);
  assert.ok(h[1].content.includes("send_proposal") && h[1].content.includes("p1"));
  assert.ok(h[1].content.includes("send_contract") && h[1].content.includes("c1"));
}

// Empty rows never reach the model; roles alternate cleanly.
{
  const h = foldHistory([
    { role: "planner", content: "hi", draft_ref: null, action_ref: null },
    { role: "concierge", content: "", draft_ref: null, action_ref: null },
    { role: "planner", content: "still there?", draft_ref: null, action_ref: null },
  ]);
  assert.deepEqual(h.map((m) => m.role), ["user", "user"]);
  assert.ok(h.every((m) => m.content.trim().length > 0));
}

console.log("concierge history: fold + merge ok");
