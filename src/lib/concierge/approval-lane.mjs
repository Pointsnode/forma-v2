// The approval lane's allowlist + validation — pure, shared by the propose_action
// tool, the approval endpoint, and the logic test. This is the SECOND registry
// lane (Decision C / §1C): leave-the-studio actions the concierge may PROPOSE but
// never execute. Approving runs the SAME staff function the button runs, under the
// planner's session (actor_kind stays 'user'). close_wedding is intentionally
// EXCLUDED — terminal/destructive, never agent-proposable.

export const APPROVAL_FNS = {
  send_proposal: { args: ["proposal_id"] },
  send_contract: { args: ["contract_id"] },
  request_quote: { args: ["engagement_id"] },
  record_quote: { args: ["quote_id", "amount"] },
  accept_quote: { args: ["quote_id"] },
  decline_quote: { args: ["quote_id"] },
  book_engagement: { args: ["engagement_id"] },
  lock_menu: { args: ["menu_id"] },
  advance_phase: { args: ["wedding_id"] },
  schedule_touchpoint: { args: ["wedding_id", "kind"] },
  mark_line_paid: { args: ["line_id"] },
  assign_seat: { args: ["event_id", "guest_id", "table_id", "seat_no"] },
};

export function isApprovable(fn) {
  return Object.prototype.hasOwnProperty.call(APPROVAL_FNS, fn);
}

// Validate a proposed action: fn must be in the lane and every required arg present.
export function validateAction(fn, args) {
  if (!isApprovable(fn)) return { ok: false, error: `not an approvable action: ${fn}` };
  const a = args && typeof args === "object" ? args : {};
  for (const k of APPROVAL_FNS[fn].args) {
    if (a[k] === undefined || a[k] === null || a[k] === "") return { ok: false, error: `missing ${k}` };
  }
  return { ok: true };
}
