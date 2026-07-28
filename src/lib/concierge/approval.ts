import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { validateAction } from "./approval-lane.mjs";
import { sendContractAction } from "@/app/[locale]/(app)/wedding/[id]/contract-actions";
import { sendTouchpoint } from "@/app/[locale]/(app)/wedding/[id]/ops-actions";
import { setLineStatus } from "@/app/[locale]/(app)/wedding/[id]/money-actions";

export type ApprovalResult = { ok?: boolean; error?: string; message?: string };

async function rpc(sb: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<ApprovalResult> {
  const { error } = await sb.rpc(fn, args);
  if (error) return { error: error.code || "generic", message: error.message };
  return { ok: true };
}

// Execute an approved action as the planner (no acting_as_concierge flag → the
// resulting activity is stamped 'user'). Maps each allowlisted fn to the SAME
// staff function/action the button runs. A function refusal (FM/FV) returns its
// human message for the card's failed state.
export async function executeApproval(sb: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<ApprovalResult> {
  const v = validateAction(fn, args) as { ok: boolean; error?: string };
  if (!v.ok) return { error: "invalid", message: v.error };
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
    default: return { error: "invalid" };
  }
}
