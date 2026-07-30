// The approval lane's allowlist + validation — pure, shared by the propose_action tool, the
// approval endpoint, and the logic tests. This is the SECOND registry lane: leave-the-studio
// actions the concierge may PROPOSE but never execute. Approving runs the SAME staff function the
// button runs, under the planner's session (actor_kind stays 'user'). close_wedding is intentionally
// EXCLUDED — terminal/destructive, never agent-proposable (§1G). Also excluded and never to be
// added: the Stripe payment rails (record_fee_payment — agents never move money on the rails;
// add_day_of_extra only adds an EXPECTED line), the profile/publish family (public content reaches
// the directory by Gio's hand only), couple/identity acts (respond_to_proposal, sign_contract_as,
// accept_workspace_invite), telemetry (mark_*/log_*), and move_floor_item (needs x/y the model can't see).

export const APPROVAL_FNS = {
  // base lane (M7/M13/M14)
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
  unseat: { args: ["event_id", "guest_id"] },
  present_vendor: { args: ["vendor_id", "wedding_id"] },
  send_quote: { args: ["quote_id"] },
  // M16b — the widened lane (§1C). Each names its thing in WORDS on the card (§1D), never an id.
  complete_task: { args: ["task_id"] },
  check_schedule_item: { args: ["item_id", "done"] },
  archive_engagement: { args: ["engagement_id"] },
  withdraw_proposal: { args: ["proposal_id"] },
  unlock_menu: { args: ["menu_id"] },
  void_contract: { args: ["contract_id"] },
  add_day_of_extra: { args: ["wedding_id", "event_id", "title", "amount"] },
  post_proposal_message: { args: ["proposal_id", "body"] },
  set_couple_can_edit: { args: ["plan_id", "on"] },
  convert_inquiry: { args: ["inquiry_id"] },
  create_workspace_invite: { args: ["email", "grants"] },
};

// §1F the clearance box each action needs (M15). A coordinator lacking the box is refused FS050 at
// the tool boundary (courtesy) and again at the function (backstop). Day-of actions gate on a box a
// coordinator holds (tasks/dayof); everything that sends to the couple or moves money/contract/
// vendor/workspace forward gates on send/contracts/vendors/ledger/weddings/admin.
export const FN_BOX = {
  send_proposal: "send", send_contract: "contracts", request_quote: "vendors", record_quote: "vendors",
  accept_quote: "ledger", decline_quote: "send", book_engagement: "vendors", lock_menu: "couples",
  advance_phase: "weddings", schedule_touchpoint: "send", mark_line_paid: "ledger", assign_seat: "dayof",
  unseat: "dayof", present_vendor: "vendors", send_quote: "send",
  complete_task: "tasks", check_schedule_item: "dayof", archive_engagement: "vendors",
  withdraw_proposal: "send", unlock_menu: "couples", void_contract: "contracts",
  add_day_of_extra: "ledger", post_proposal_message: "send", set_couple_can_edit: "dayof",
  convert_inquiry: "weddings", create_workspace_invite: "admin",
};

export function isApprovable(fn) {
  return Object.prototype.hasOwnProperty.call(APPROVAL_FNS, fn);
}

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const CLEARANCE_KEYS = ["admin", "weddings", "couples", "vendors", "contracts", "send", "ledger", "profile", "calendly", "tasks", "dayof", "concierge"];

// Validate a proposed action BEFORE a card is drawn: fn in the lane, every required arg present,
// every *_id arg a real UUID from a read tool (an invented slug can't become a card), and each
// typed non-id arg the right type. The typed checks teach the model to fetch real ids.
export function validateAction(fn, args) {
  if (!isApprovable(fn)) return { ok: false, error: `not an approvable action: ${fn}` };
  const a = args && typeof args === "object" ? args : {};
  for (const k of APPROVAL_FNS[fn].args) {
    const v = a[k];
    if (v === undefined || v === null || v === "") return { ok: false, error: `missing ${k}` };
  }
  // every *_id arg must be a UUID the model fetched from a read tool (never a name or slug)
  for (const k of APPROVAL_FNS[fn].args) {
    if (k.endsWith("_id") && !UUID.test(String(a[k]))) {
      return { ok: false, error: `${k} must be a real id (a UUID from a read tool), not a name or slug — call the matching read tool first to look it up` };
    }
  }
  // typed non-id args
  if (fn === "assign_seat") {
    const n = Number(a.seat_no);
    if (!Number.isInteger(n) || n < 0) return { ok: false, error: "seat_no must be the 0-based chair number (A=0, B=1, …), an integer — not a letter" };
  }
  if (fn === "check_schedule_item" && typeof a.done !== "boolean") return { ok: false, error: "done must be true or false" };
  if (fn === "set_couple_can_edit" && typeof a.on !== "boolean") return { ok: false, error: "on must be true or false" };
  if (fn === "add_day_of_extra") {
    const amt = Number(a.amount);
    if (!(amt > 0)) return { ok: false, error: "amount must be a positive number" };
    if (!String(a.title ?? "").trim()) return { ok: false, error: "title must not be empty" };
  }
  if (fn === "post_proposal_message" && !String(a.body ?? "").trim()) return { ok: false, error: "body must not be empty — write the message" };
  if (fn === "create_workspace_invite") {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(a.email))) return { ok: false, error: "email must be a valid address" };
    if (!Array.isArray(a.grants) || !a.grants.every((x) => CLEARANCE_KEYS.includes(String(x)))) {
      return { ok: false, error: "grants must be a list of clearance box keys (admin, weddings, couples, vendors, contracts, send, ledger, profile, calendly, tasks, dayof, concierge)" };
    }
  }
  if (fn === "present_vendor" && a.event_ids !== undefined && a.event_ids !== null) {
    if (!Array.isArray(a.event_ids) || !a.event_ids.every((x) => UUID.test(String(x)))) {
      return { ok: false, error: "event_ids must be an array of real event UUIDs from the events tool — call it first" };
    }
  }
  return { ok: true };
}
