"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { currentWorkspace, clearanceGate } from "@/lib/workspace";
import { insertWedding } from "@/lib/wedding-create";
import { parseBudgetFeel, LANES, LOST_REASONS, SOURCES } from "@/lib/leads.mjs";

export type LeadResult = { ok?: boolean; error?: "invalid" | "generic" | "forbidden" | "clearance"; id?: string };

// Every lead surface revalidates the desk, the open sheet, and the cockpit (its chase + porch
// counts move with the pipeline).
function rv() {
  revalidatePath("/[locale]/(app)/(studio)/leads", "page");
  revalidatePath("/[locale]/(app)/(studio)/leads/[id]", "page");
  revalidatePath("/[locale]/(app)/(studio)", "page");
}

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const workspaceId = user ? await currentWorkspace(supabase) : null;
  return { supabase, userId: user?.id ?? null, workspaceId };
}

// A minimal create: couple names + email + source are enough; the rest is edited on the sheet.
export async function createLead(formData: FormData): Promise<LeadResult> {
  const parsed = z.object({
    coupleDisplay: z.string().trim().min(1).max(120),
    email: z.string().trim().max(200).optional().or(z.literal("")).transform((v) => v || null),
    source: z.enum(SOURCES as [string, ...string[]]),
  }).safeParse({
    coupleDisplay: formData.get("coupleDisplay"),
    email: formData.get("email") ?? "",
    source: formData.get("source"),
  });
  if (!parsed.success) return { error: "invalid" };
  const { supabase, userId, workspaceId } = await ctx();
  if (!workspaceId) return { error: "generic" };
  const { data, error } = await supabase.from("leads").insert({
    workspace_id: workspaceId, couple_display: parsed.data.coupleDisplay,
    email: parsed.data.email, source: parsed.data.source, stage: "new", created_by: userId,
  }).select("id").single();
  if (error) { console.error(`createLead (${error.code}): ${error.message}`); return { error: "generic" }; }
  rv();
  return { ok: true, id: data.id as string };
}

// Promote a directory inquiry to a lead: copy its facts, log an 'arrived' event carrying the
// message, and link the inquiry (inquiries.lead_id) so it leaves Arrivals. Never touches the
// public inquiry path.
export async function takeToDesk(inquiryId: string): Promise<LeadResult> {
  const { supabase, userId } = await ctx();
  const { data: inq } = await supabase.from("inquiries").select("id, workspace_id, name, partner_name, email, phone, message, lead_id").eq("id", inquiryId).maybeSingle();
  if (!inq) return { error: "forbidden" };
  if (inq.lead_id) return { ok: true, id: inq.lead_id as string }; // already promoted
  const disp = inq.partner_name ? `${inq.name} & ${inq.partner_name}` : (inq.name as string);
  const { data: lead, error } = await supabase.from("leads").insert({
    workspace_id: inq.workspace_id, couple_display: disp, email: inq.email, phone: inq.phone,
    source: "directory", stage: "new", created_by: userId,
  }).select("id").single();
  if (error) { console.error(`takeToDesk lead (${error.code}): ${error.message}`); return { error: "generic" }; }
  await supabase.from("lead_events").insert({ lead_id: lead.id, kind: "arrived", body: inq.message, author_id: userId });
  await supabase.from("inquiries").update({ lead_id: lead.id }).eq("id", inquiryId);
  rv();
  return { ok: true, id: lead.id as string };
}

const factsSchema = z.object({
  couple_display: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(60).nullable().optional(),
  locale: z.enum(["en", "es", "fr", "it"]).nullable().optional(),
  date_feel: z.string().trim().max(120).nullable().optional(),
  date_start: z.string().trim().max(10).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  guest_feel: z.string().trim().max(120).nullable().optional(),
  budget_feel: z.string().trim().max(120).nullable().optional(),
  source: z.enum(SOURCES as [string, ...string[]]).optional(),
  source_note: z.string().trim().max(160).nullable().optional(),
});

// Inline fact edits from the sheet. Empty strings become null so a cleared field really clears.
export async function updateLead(id: string, fields: Record<string, string | null>): Promise<LeadResult> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) clean[k] = v === "" ? null : v;
  const parsed = factsSchema.safeParse(clean);
  if (!parsed.success) return { error: "invalid" };
  const { supabase } = await ctx();
  const { error } = await supabase.from("leads").update(parsed.data).eq("id", id);
  if (error) return { error: "generic" };
  rv();
  return { ok: true };
}

export async function addNote(id: string, body: string): Promise<LeadResult> {
  const clean = z.string().trim().min(1).max(4000).safeParse(body);
  if (!clean.success) return { error: "invalid" };
  const { supabase, userId } = await ctx();
  const { error } = await supabase.from("lead_events").insert({ lead_id: id, kind: "note", body: clean.data, author_id: userId });
  if (error) return { error: "generic" };
  rv();
  return { ok: true };
}

export async function setNextStep(id: string, text: string, date: string): Promise<LeadResult> {
  const { supabase } = await ctx();
  const { error } = await supabase.from("leads").update({ next_step: text.trim() || null, next_step_at: date || null }).eq("id", id);
  if (error) return { error: "generic" };
  rv();
  return { ok: true };
}

export async function setConsult(id: string, at: string, confirmed: boolean): Promise<LeadResult> {
  const { supabase, userId } = await ctx();
  const consultAt = at ? new Date(at).toISOString() : null;
  const { error } = await supabase.from("leads").update({ consult_at: consultAt, consult_confirmed: confirmed }).eq("id", id);
  if (error) return { error: "generic" };
  if (consultAt) await supabase.from("lead_events").insert({ lead_id: id, kind: "consult", body: at, author_id: userId });
  rv();
  return { ok: true };
}

// Stage moves are limited to the four OPEN lanes; Won is reached only by convertLead and Lost
// only by markLost, so the pipeline's terminal states are never set by a stray dropdown.
export async function moveStage(id: string, stage: string): Promise<LeadResult> {
  const open = LANES.filter((s) => s !== "won");
  if (!open.includes(stage)) return { error: "invalid" };
  const { supabase, userId } = await ctx();
  const { error } = await supabase.from("leads").update({ stage }).eq("id", id);
  if (error) return { error: "generic" };
  await supabase.from("lead_events").insert({ lead_id: id, kind: "stage", body: stage, author_id: userId });
  rv();
  return { ok: true };
}

export async function markLost(id: string, reason: string): Promise<LeadResult> {
  if (!LOST_REASONS.includes(reason)) return { error: "invalid" };
  const { supabase, userId } = await ctx();
  const { error } = await supabase.from("leads").update({ stage: "lost", lost_reason: reason }).eq("id", id);
  if (error) return { error: "generic" };
  await supabase.from("lead_events").insert({ lead_id: id, kind: "lost", body: reason, author_id: userId });
  rv();
  return { ok: true };
}

// The sacred conversion. Goes through the SAME insertWedding path /weddings/new uses (same
// defaults, same insert-time triggers), carries the lead's facts, moves the lead to Won, logs
// a 'converted' event, and drops the planner INTO the new wedding. Data only — no contract,
// no invite, no email (the ruling).
export async function convertLead(id: string): Promise<LeadResult> {
  const { supabase } = await ctx();
  if (await clearanceGate(supabase, "weddings")) return { error: "clearance" };
  const { data: lead } = await supabase.from("leads").select("id, workspace_id, couple_display, city, locale, budget_feel, date_start, wedding_id").eq("id", id).maybeSingle();
  if (!lead) return { error: "forbidden" };
  if (lead.wedding_id) redirect({ href: `/wedding/${lead.wedding_id}`, locale: await getLocale() }); // already converted

  const newId = await insertWedding(supabase, lead.workspace_id as string, {
    coupleDisplay: lead.couple_display as string,
    locationCity: (lead.city as string | null) ?? undefined,
    locale: lead.locale as string | null,
    budgetTotal: parseBudgetFeel(lead.budget_feel as string | null),
  });
  if (!newId) return { error: "generic" };
  // Carry a real date onto the default order-0 event; the date-rollup trigger sets the
  // wedding's date_start (mirrors convert_inquiry). Only when a real date exists.
  if (lead.date_start) await supabase.from("wedding_events").update({ event_date: lead.date_start }).eq("wedding_id", newId).eq("order_index", 0);
  await supabase.from("leads").update({ wedding_id: newId, stage: "won" }).eq("id", id);
  await supabase.from("lead_events").insert({ lead_id: id, kind: "converted", body: lead.couple_display as string, meta: { wedding_id: newId } });
  rv();
  redirect({ href: `/wedding/${newId}`, locale: await getLocale() });
  return { ok: true }; // unreachable (redirect navigates); satisfies the typed return
}
