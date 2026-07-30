"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { clearanceGate } from "@/lib/workspace";

export type TaskResult = { ok?: boolean; error?: string; id?: string };

function rv() {
  revalidatePath("/[locale]/wedding/[id]", "layout");
  revalidatePath("/[locale]/tasks", "layout");
  revalidatePath("/[locale]", "layout");
}

export type TaskInput = {
  wedding_id?: string | null; workspace_id?: string | null;
  title?: string; note?: string; due_date?: string; status?: string; flagged?: boolean;
  event_id?: string; link_section?: string;
  assignee_kind?: "team" | "couple" | "vendor" | ""; assignee_member?: string; assignee_vendor?: string;
  proposal_id?: string; contract_id?: string; engagement_id?: string; document_id?: string;
};

// Direct-table writes under staff RLS (the board is a UI-writable surface); the DB
// triggers enforce auto-waiting, completed⇔done_at, and activity. Couple completion
// goes through complete_task (below), never a direct UPDATE.
export async function createTask(input: TaskInput): Promise<TaskResult> {
  const supabase = await createClient();
  const gate = await clearanceGate(supabase, "tasks"); if (gate) return { error: gate };
  const title = (input.title ?? "").trim();
  if (!title) return { error: "invalid" };
  if (!input.wedding_id && !input.workspace_id) return { error: "invalid" };
  const kind = input.assignee_kind || null;
  const inWedding = !!input.wedding_id;
  const { data, error } = await supabase.from("tasks").insert({
    title, note: input.note?.trim() || null, due_date: input.due_date || null,
    flagged: input.flagged === true,
    wedding_id: input.wedding_id || null, workspace_id: inWedding ? null : (input.workspace_id || null),
    event_id: inWedding ? (input.event_id || null) : null,
    link_section: inWedding ? (input.link_section || null) : null,
    assignee_kind: kind,
    assignee_member: kind === "team" ? (input.assignee_member || null) : null,
    assignee_vendor: kind === "vendor" ? (input.assignee_vendor || null) : null,
    proposal_id: inWedding ? (input.proposal_id || null) : null,
    contract_id: inWedding ? (input.contract_id || null) : null,
    engagement_id: inWedding ? (input.engagement_id || null) : null,
    document_id: inWedding ? (input.document_id || null) : null,
  }).select("id").single();
  if (error || !data) { console.error(`createTask (${error?.code}): ${error?.message}`); return { error: error?.code || "generic" }; }
  rv();
  return { ok: true, id: data.id };
}

export async function updateTask(taskId: string, patch: TaskInput): Promise<TaskResult> {
  const supabase = await createClient();
  const gate = await clearanceGate(supabase, "tasks"); if (gate) return { error: gate };
  const upd: Record<string, unknown> = {};
  if (patch.title !== undefined) { const t = patch.title.trim(); if (!t) return { error: "invalid" }; upd.title = t; }
  if (patch.note !== undefined) upd.note = patch.note?.trim() || null;
  if (patch.due_date !== undefined) upd.due_date = patch.due_date || null;
  if (patch.status !== undefined) upd.status = patch.status;
  if (patch.flagged !== undefined) upd.flagged = patch.flagged;
  if (patch.event_id !== undefined) upd.event_id = patch.event_id || null;
  if (patch.assignee_kind !== undefined) {
    const k = patch.assignee_kind || null;
    upd.assignee_kind = k;
    upd.assignee_member = k === "team" ? (patch.assignee_member || null) : null;
    upd.assignee_vendor = k === "vendor" ? (patch.assignee_vendor || null) : null;
  }
  const { error } = await supabase.from("tasks").update(upd).eq("id", taskId);
  if (error) { console.error(`updateTask (${error.code}): ${error.message}`); return { error: error.code || "generic" }; }
  rv();
  return { ok: true };
}

export async function moveTask(taskId: string, status: string): Promise<TaskResult> {
  const supabase = await createClient();
  const gate = await clearanceGate(supabase, "tasks"); if (gate) return { error: gate };
  const { error } = await supabase.from("tasks").update({ status }).eq("id", taskId);
  if (error) { console.error(`moveTask (${error.code}): ${error.message}`); return { error: "generic" }; }
  rv();
  return { ok: true };
}

export async function setFlag(taskId: string, flagged: boolean): Promise<TaskResult> {
  const supabase = await createClient();
  const gate = await clearanceGate(supabase, "tasks"); if (gate) return { error: gate };
  const { error } = await supabase.from("tasks").update({ flagged }).eq("id", taskId);
  if (error) { console.error(`setFlag (${error.code}): ${error.message}`); return { error: "generic" }; }
  rv();
  return { ok: true };
}

// Couple + staff completion path (couple has no direct UPDATE). Logs task_completed
// with the caller as actor via the trigger.
export async function completeTask(taskId: string): Promise<TaskResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("complete_task", { p_task: taskId });
  if (error) { console.error(`complete_task (${error.code}): ${error.message}`); return { error: error.code || "generic" }; }
  rv();
  return { ok: true };
}

export async function deleteTask(taskId: string): Promise<TaskResult> {
  const supabase = await createClient();
  const gate = await clearanceGate(supabase, "tasks"); if (gate) return { error: gate };
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) return { error: "generic" };
  rv();
  return { ok: true };
}
