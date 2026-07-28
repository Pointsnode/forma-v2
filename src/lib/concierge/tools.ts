import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ToolDef, DraftRef } from "./agent";
import type { Scope } from "./context";

// The registry IS the draft-first guarantee (Decision C): reads + draft-writes
// only. No send/sign/pay/advance/close tool exists — so even a jailbroken prompt
// has no hands for them, and the 0009 DB guards stand behind that. Wedding-scope
// writes auto-target the scoped wedding (the model can't name another).

export type ToolCtx = { supabase: SupabaseClient; scope: Scope; workspaceId: string | null };

const s = (props: Record<string, unknown>, required: string[] = []) => ({ type: "object", properties: props, required });

export function conciergeTools(scope: Scope): ToolDef[] {
  if (scope.kind === "wedding") {
    return [
      { name: "guests_pending", description: "List guests who have not yet answered their RSVP.", input_schema: s({}) },
      { name: "ledger", description: "List this wedding's money ledger lines (title, amount, status, due date).", input_schema: s({}) },
      { name: "draft_proposal", description: "Create a DRAFT proposal for the couple (never sent). Returns a draft the planner sends from the proposal room.", input_schema: s({ title: { type: "string" }, note: { type: "string" }, estimate_amount: { type: "number" } }, ["title"]) },
      { name: "add_task", description: "Add a task for this wedding.", input_schema: s({ title: { type: "string" }, due_date: { type: "string", description: "YYYY-MM-DD" } }, ["title"]) },
      { name: "draft_contract", description: "Create a DRAFT contract from a studio template (never sent). template is the template name; kind is planner_agreement|vendor|venue.", input_schema: s({ title: { type: "string" }, template: { type: "string" }, kind: { type: "string" } }, ["title"]) },
      { name: "add_ledger_line", description: "Add a manual EXPECTED ledger line (an anticipated cost). Never marks anything paid.", input_schema: s({ title: { type: "string" }, amount: { type: "number" }, due_date: { type: "string" } }, ["title", "amount"]) },
    ];
  }
  return [
    { name: "add_studio_task", description: "Add a studio-level task (not tied to one wedding).", input_schema: s({ title: { type: "string" }, due_date: { type: "string" } }, ["title"]) },
  ];
}

async function rpcId(supabase: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<string> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as string;
}

export async function execTool(ctx: ToolCtx, name: string, input: Record<string, unknown>): Promise<{ content: string; draft?: DraftRef }> {
  const { supabase, scope, workspaceId } = ctx;
  const wid = scope.kind === "wedding" ? scope.weddingId : null;

  switch (name) {
    case "guests_pending": {
      const [{ data: exc }, { data: roll }] = await Promise.all([
        supabase.from("guest_exceptions").select("full_name, reason").eq("wedding_id", wid),
        supabase.from("guest_rsvp_rollup").select("invited, answered, pending").eq("wedding_id", wid).maybeSingle(),
      ]);
      const names = ((exc ?? []) as { full_name: string; reason: string }[]).filter((r) => r.reason === "unanswered").map((r) => r.full_name);
      const r = (roll ?? { invited: 0, answered: 0, pending: 0 }) as { invited: number; answered: number; pending: number };
      const head = `${r.pending} of ${r.invited} still to answer (${r.answered} in).`;
      return { content: names.length ? `${head} Reminded but silent: ${names.join(", ")}` : head };
    }
    case "ledger": {
      const { data } = await supabase.from("ledger_lines").select("title, amount, status, due_date").eq("wedding_id", wid).order("due_date", { ascending: true, nullsFirst: false });
      const rows = (data ?? []) as { title: string; amount: number; status: string; due_date: string | null }[];
      return { content: rows.length ? rows.map((r) => `${r.title}: ${r.amount} (${r.status}${r.due_date ? `, due ${r.due_date}` : ""})`).join("\n") : "No ledger lines yet." };
    }
    case "draft_proposal": {
      const id = await rpcId(supabase, "concierge_draft_proposal", { p_wedding: wid, p_title: input.title, p_note: input.note ?? null, p_estimate: input.estimate_amount ?? null, p_event_ref: null });
      return { content: `Draft proposal created (id ${id}). The planner sends it from the proposal room.`, draft: { kind: "proposal", id, title: String(input.title) } };
    }
    case "add_task": {
      const id = await rpcId(supabase, "concierge_add_task", { p_wedding: wid, p_workspace: null, p_title: input.title, p_due: input.due_date ?? null });
      return { content: `Task added (id ${id}).`, draft: { kind: "task", id, title: String(input.title) } };
    }
    case "add_studio_task": {
      const id = await rpcId(supabase, "concierge_add_task", { p_wedding: null, p_workspace: workspaceId, p_title: input.title, p_due: input.due_date ?? null });
      return { content: `Studio task added (id ${id}).`, draft: { kind: "task", id, title: String(input.title) } };
    }
    case "draft_contract": {
      let templateId: string | null = null;
      if (input.template && workspaceId) {
        const { data: t } = await supabase.from("contract_templates").select("id").eq("workspace_id", workspaceId).ilike("name", `%${String(input.template)}%`).limit(1).maybeSingle();
        templateId = (t?.id as string) ?? null;
      }
      const id = await rpcId(supabase, "concierge_draft_contract", { p_wedding: wid, p_template: templateId, p_title: input.title, p_kind: input.kind ?? "vendor" });
      return { content: `Draft contract created (id ${id}). The planner reviews and sends it from the contract room.`, draft: { kind: "contract", id, title: String(input.title) } };
    }
    case "add_ledger_line": {
      const id = await rpcId(supabase, "concierge_add_ledger_line", { p_wedding: wid, p_title: input.title, p_amount: input.amount, p_due: input.due_date ?? null });
      return { content: `Expected ledger line added (id ${id}).`, draft: { kind: "ledger", id, title: String(input.title) } };
    }
    default:
      throw new Error(`unknown tool ${name}`);
  }
}
