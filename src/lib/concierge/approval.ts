import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateAction } from "./approval-lane.mjs";
import { assertWeddingReachable } from "./session";
import { ConciergeError } from "./errors";
import { sendContractAction } from "@/app/[locale]/(app)/wedding/[id]/contract-actions";
import { sendTouchpoint } from "@/app/[locale]/(app)/wedding/[id]/ops-actions";
import { setLineStatus } from "@/app/[locale]/(app)/wedding/[id]/money-actions";

export type ApprovalResult = { ok?: boolean; error?: string; message?: string };

// A raw Postgres string must never render on a card. Forma's own coded refusals
// (FM/FS/FV…) are written to be human — pass those; anything else (a type error, a
// constraint name) becomes a generic, non-leaky message.
function humanMsg(error: { code?: string; message?: string }): string {
  return error.code && /^F[A-Z]/.test(error.code)
    ? (error.message ?? "")
    : "the card's details no longer match the room — ask me again and I'll rebuild it";
}
async function rpc(sb: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<ApprovalResult> {
  const { error } = await sb.rpc(fn, args);
  if (error) return { error: error.code || "generic", message: humanMsg(error) };
  return { ok: true };
}

// Execute an approved action as the planner (no acting_as_concierge flag → the resulting activity
// is stamped 'user'). Maps each allowlisted fn to the SAME staff function/action the button runs.
// A function refusal (FM/FV/FS) returns its human message for the card's failed state.
//
// §B THE APPROVE-TIME GUARD: a card can sit for minutes; the only session that matters is the one
// tapping Approve. Before dispatch, re-authorize the card's wedding against the APPROVER's workspace
// — a card minted legitimately but approved by a session no longer entitled (workspace changed,
// membership revoked) is refused with FC010 at the tap, not executed. The two workspace-level actions
// (convert_inquiry, create_workspace_invite) have no wedding; they execute against the approver's own
// workspace and their function's own workspace/clearance guard is the backstop.
export async function executeApproval(
  sb: SupabaseClient, fn: string, args: Record<string, unknown>, approverWorkspaceId: string | null, weddingId?: string | null,
): Promise<ApprovalResult> {
  const v = validateAction(fn, args) as { ok: boolean; error?: string };
  if (!v.ok) return { error: "invalid", message: v.error };

  if (weddingId) {
    try {
      await assertWeddingReachable(sb, weddingId, approverWorkspaceId ?? "");
    } catch (e) {
      const code = e instanceof ConciergeError ? e.code : "FC010";
      return { error: code, message: "That wedding isn't in your studio." };
    }
  } else if (fn === "convert_inquiry" || fn === "create_workspace_invite") {
    if (!approverWorkspaceId) return { error: "FV230", message: "That wedding isn't in your studio." };
  }

  const S = (k: string) => String(args[k]);
  switch (fn) {
    case "send_proposal": return rpc(sb, "send_proposal", { p: S("proposal_id") });
    case "send_contract": { const r = await sendContractAction(S("contract_id")); return r.error ? { error: r.error } : { ok: true }; }
    case "request_quote": return rpc(sb, "request_quote", { p_eng: S("engagement_id") });
    case "record_quote": return rpc(sb, "record_quote", { p_quote: S("quote_id"), p_amount: Number(args.amount) || 0, p_valid_until: args.valid_until ?? null, p_note: args.note ?? null, p_file: null });
    case "accept_quote": return rpc(sb, "accept_quote", { p_quote: S("quote_id") });
    case "decline_quote": return rpc(sb, "decline_quote", { p_quote: S("quote_id") });
    case "book_engagement": return rpc(sb, "book_engagement", { p_eng: S("engagement_id") });
    case "lock_menu": return rpc(sb, "lock_menu", { p_menu: S("menu_id") });
    case "advance_phase": return rpc(sb, "advance_phase", { w: S("wedding_id") });
    case "schedule_touchpoint": { const r = await sendTouchpoint(S("wedding_id"), S("kind") as "menu_collect" | "day_of_schedule"); return r.error ? { error: r.error } : { ok: true }; }
    case "mark_line_paid": { const r = await setLineStatus(S("line_id"), "paid"); return r.error ? { error: r.error } : { ok: true }; }
    case "assign_seat": return rpc(sb, "assign_seat", { p_event: S("event_id"), p_guest: S("guest_id"), p_table: S("table_id"), p_seat_no: Number(args.seat_no) });
    case "unseat": return rpc(sb, "unseat", { p_event: S("event_id"), p_guest: S("guest_id") });
    case "present_vendor": return rpc(sb, "present_vendor", { p_vendor: S("vendor_id"), p_wedding: S("wedding_id"), p_event_ids: Array.isArray(args.event_ids) ? args.event_ids : [], p_estimate: args.estimate ?? null, p_note: args.note ?? null });
    case "send_quote": return rpc(sb, "send_quote", { p_quote: S("quote_id"), p_note: args.note ?? null });
    // ── M16b widened lane ────────────────────────────────────────────────────
    case "complete_task": return rpc(sb, "complete_task", { p_task: S("task_id") });
    case "check_schedule_item": return rpc(sb, "check_schedule_item", { p_item: S("item_id"), p_done: args.done === true });
    case "archive_engagement": return rpc(sb, "archive_engagement", { p_eng: S("engagement_id") });
    case "withdraw_proposal": return rpc(sb, "withdraw_proposal", { p: S("proposal_id") });
    case "unlock_menu": return rpc(sb, "unlock_menu", { p_menu: S("menu_id") });
    case "void_contract": return rpc(sb, "void_contract", { p_contract: S("contract_id") });
    case "add_day_of_extra": return rpc(sb, "add_day_of_extra", { p_wedding: S("wedding_id"), p_event: S("event_id"), p_title: S("title"), p_amount: Number(args.amount) || 0 });
    case "post_proposal_message": return rpc(sb, "post_proposal_message", { p: S("proposal_id"), body: S("body") });
    case "set_couple_can_edit": return rpc(sb, "set_couple_can_edit", { p_plan: S("plan_id"), p_on: args.on === true });
    case "convert_inquiry": return rpc(sb, "convert_inquiry", { p_inquiry: S("inquiry_id") });
    // create_workspace_invite executes into the APPROVER's own workspace (never a workspace named by
    // the model); its own has_clearance(...,'admin') is the backstop.
    case "create_workspace_invite": return rpc(sb, "create_workspace_invite", { p_workspace: approverWorkspaceId, p_email: S("email"), p_grants: Array.isArray(args.grants) ? args.grants : [], p_title: args.title ?? null });
    default: return { error: "invalid" };
  }
}
