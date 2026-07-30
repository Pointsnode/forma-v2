// §1E The ids each concierge READ tool surfaces to the model. This registry is the thing the
// reachability CI test checks the approval lane against: no action may join APPROVAL_FNS without a
// read tool that produces its ids, so a planner approving a card always had a way to look them up.
// KEEP IN SYNC with the tool handlers in tools.ts — the handlers must actually emit these ids in
// their content, and the reachability test fails the moment an approval arg has no entry here.
export const READ_TOOL_IDS = {
  resolve_wedding: ["wedding_id"],
  ledger: ["line_id"], // M16b: the ledger tool now emits each line's id, for mark_line_paid
  list_proposals: ["proposal_id"],
  list_contracts: ["contract_id"],
  list_tasks: ["task_id"],
  seating: ["event_id", "table_id", "guest_id", "plan_id"], // M16b: seating now emits the plan id too
  list_vendors: ["vendor_id"],
  events: ["event_id"],
  guests_pending: ["guest_id"],
  engagements: ["engagement_id", "quote_id"], // M16b new read tool
  schedule: ["item_id"], // M16b new read tool
  menus: ["menu_id"], // M16b new read tool
  inquiries: ["inquiry_id"], // M16b new read tool
};

export const READABLE_IDS = new Set(Object.values(READ_TOOL_IDS).flat());
