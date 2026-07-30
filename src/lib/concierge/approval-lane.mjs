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
  // M14: move a guest off their seat — propose-only; the DB unseat(p_event, p_guest) runs
  // under the planner's session on approval. Its absence made "move Ana off table 4" a dead end.
  unseat: { args: ["event_id", "guest_id"] },
  // M13: present a vendor to a wedding, and send a recorded quote to the couple —
  // propose-only; the planner approves and their session runs the same function.
  present_vendor: { args: ["vendor_id", "wedding_id"] },
  send_quote: { args: ["quote_id"] },
};

export function isApprovable(fn) {
  return Object.prototype.hasOwnProperty.call(APPROVAL_FNS, fn);
}

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

// Validate a proposed action: fn must be in the lane, every required arg present,
// and typed args must actually be the right type. The typed checks teach the model
// (the failure message instructs it to fetch real ids) — so it can't propose a card
// built from invented slugs, and a bad seat_no can't silently execute as chair A.
export function validateAction(fn, args) {
  if (!isApprovable(fn)) return { ok: false, error: `not an approvable action: ${fn}` };
  const a = args && typeof args === "object" ? args : {};
  for (const k of APPROVAL_FNS[fn].args) {
    if (a[k] === undefined || a[k] === null || a[k] === "") return { ok: false, error: `missing ${k}` };
  }
  if (fn === "assign_seat") {
    for (const k of ["event_id", "guest_id", "table_id"]) {
      if (!UUID.test(String(a[k]))) return { ok: false, error: `${k} must be a real id (a UUID from the seating tool), not a name or slug — call the seating tool first to look them up` };
    }
    const n = Number(a.seat_no);
    if (!Number.isInteger(n) || n < 0) return { ok: false, error: "seat_no must be the 0-based chair number (A=0, B=1, C=2, …), an integer — not a letter" };
  }
  if (fn === "unseat") {
    for (const k of ["event_id", "guest_id"]) {
      if (!UUID.test(String(a[k]))) return { ok: false, error: `${k} must be a real id (a UUID from the seating tool), not a name` };
    }
  }
  // present_vendor: event_ids optional (single-event weddings auto-attach), but when
  // present it must be an array of real event UUIDs — a venue on a multi-event wedding
  // needs them (FV244), and the model must fetch them from the events tool first.
  if (fn === "present_vendor" && a.event_ids !== undefined && a.event_ids !== null) {
    if (!Array.isArray(a.event_ids) || !a.event_ids.every((x) => UUID.test(String(x)))) {
      return { ok: false, error: "event_ids must be an array of real event UUIDs from the events tool — call it first" };
    }
  }
  return { ok: true };
}
