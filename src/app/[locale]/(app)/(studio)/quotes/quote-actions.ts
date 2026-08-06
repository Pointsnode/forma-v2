"use server";

import crypto from "node:crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { currentWorkspace } from "@/lib/workspace";
import { APP_URL } from "@/lib/env";
import { quoteEmail } from "@/lib/email/quote-email";
import { sendBatch } from "@/lib/email/resend";

export type QuoteResult = { ok?: boolean; error?: "invalid" | "generic" | "forbidden" | "locked"; id?: string; token?: string };
export type LineInput = { section: string; section_sort: number; title: string; description: string | null; amount: number; sort: number };

function rv() {
  revalidatePath("/[locale]/(app)/(studio)/quotes", "page");
  revalidatePath("/[locale]/(app)/(studio)/quotes/[id]", "page");
  revalidatePath("/[locale]/(app)/(studio)/contracts", "page");
}

async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const workspaceId = user ? await currentWorkspace(supabase) : null;
  return { supabase, userId: user?.id ?? null, workspaceId };
}

// A per-workspace number is assigned at CREATE (the column is NOT NULL); the access token is
// assigned at SEND. Retries on the unique (workspace_id, number) race.
async function nextNumber(supabase: Awaited<ReturnType<typeof createClient>>, workspaceId: string): Promise<number> {
  const { data } = await supabase.from("client_quotes").select("number").eq("workspace_id", workspaceId).order("number", { ascending: false }).limit(1).maybeSingle();
  return ((data?.number as number | null) ?? 0) + 1;
}

async function insertDraft(fields: { workspace_id: string; lead_id?: string | null; wedding_id?: string | null; locale?: string | null; created_by: string | null }): Promise<QuoteResult> {
  const { supabase } = await ctx();
  for (let attempt = 0; attempt < 5; attempt++) {
    const number = await nextNumber(supabase, fields.workspace_id);
    const { data, error } = await supabase.from("client_quotes").insert({ ...fields, number, status: "draft" }).select("id").single();
    if (!error && data) { rv(); return { ok: true, id: data.id as string }; }
    if (error?.code === "23505") continue;
    console.error(`insertDraft (${error?.code}): ${error?.message}`);
    return { error: "generic" };
  }
  return { error: "generic" };
}

export async function createQuote(): Promise<QuoteResult> {
  const { userId, workspaceId } = await ctx();
  if (!workspaceId) return { error: "generic" };
  return insertDraft({ workspace_id: workspaceId, created_by: userId });
}

// The L1 lead sheet's "Quote" button comes alive: a draft pre-filled from the lead (its
// language, and the link) — the couple name is derived at lookup from the lead, so no copy.
export async function createQuoteForLead(leadId: string): Promise<QuoteResult> {
  const { supabase, userId } = await ctx();
  const { data: lead } = await supabase.from("leads").select("workspace_id, locale").eq("id", leadId).maybeSingle();
  if (!lead) return { error: "forbidden" };
  return insertDraft({ workspace_id: lead.workspace_id as string, lead_id: leadId, locale: lead.locale as string | null, created_by: userId });
}

async function assertDraft(supabase: Awaited<ReturnType<typeof createClient>>, id: string): Promise<boolean> {
  const { data } = await supabase.from("client_quotes").select("status").eq("id", id).maybeSingle();
  return data?.status === "draft"; // a sent quote is read-only — the recipient must read the exact document sent
}

const factsSchema = z.object({
  title: z.string().trim().max(160).nullable().optional(),
  intro: z.string().trim().max(2000).nullable().optional(),
  currency: z.string().trim().length(3).optional(),
  valid_until: z.string().trim().max(10).nullable().optional(),
  deposit_note: z.string().trim().max(400).nullable().optional(),
  locale: z.enum(["en", "es", "fr", "it"]).nullable().optional(),
});

export async function updateQuote(id: string, fields: Record<string, string | null>): Promise<QuoteResult> {
  const { supabase } = await ctx();
  if (!(await assertDraft(supabase, id))) return { error: "locked" };
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) clean[k] = v === "" ? null : v;
  const parsed = factsSchema.safeParse(clean);
  if (!parsed.success) return { error: "invalid" };
  const { error } = await supabase.from("client_quotes").update(parsed.data).eq("id", id);
  if (error) return { error: "generic" };
  rv();
  return { ok: true };
}

// Replace all lines atomically (the builder sends the whole set on save). Draft-only.
export async function replaceLines(id: string, lines: LineInput[]): Promise<QuoteResult> {
  const { supabase } = await ctx();
  if (!(await assertDraft(supabase, id))) return { error: "locked" };
  const clean = lines
    .filter((l) => (l.title ?? "").trim())
    .map((l, i) => ({
      quote_id: id, section: (l.section ?? "").trim() || null, section_sort: Number(l.section_sort) || 0,
      title: l.title.trim(), description: (l.description ?? "").trim() || null,
      amount: Math.max(0, Number(l.amount) || 0), sort: i,
    }));
  await supabase.from("client_quote_lines").delete().eq("quote_id", id);
  if (clean.length) {
    const { error } = await supabase.from("client_quote_lines").insert(clean);
    if (error) { console.error(`replaceLines (${error.code}): ${error.message}`); return { error: "generic" }; }
  }
  rv();
  return { ok: true };
}

export async function saveAsTemplate(id: string, templateTitle: string): Promise<QuoteResult> {
  const title = z.string().trim().min(1).max(160).safeParse(templateTitle);
  if (!title.success) return { error: "invalid" };
  const { supabase, userId, workspaceId } = await ctx();
  if (!workspaceId) return { error: "generic" };
  const { data: q } = await supabase.from("client_quotes").select("intro, deposit_note, currency").eq("id", id).maybeSingle();
  const { data: lines } = await supabase.from("client_quote_lines").select("section, section_sort, title, description, amount, sort").eq("quote_id", id).order("section_sort").order("sort");
  const payload = { intro: q?.intro ?? null, deposit_note: q?.deposit_note ?? null, currency: q?.currency ?? "USD", lines: lines ?? [] };
  const { error } = await supabase.from("client_quote_templates").insert({ workspace_id: workspaceId, title: title.data, payload, created_by: userId });
  if (error) return { error: "generic" };
  rv();
  return { ok: true };
}

export async function applyTemplate(id: string, templateId: string): Promise<QuoteResult> {
  const { supabase } = await ctx();
  if (!(await assertDraft(supabase, id))) return { error: "locked" };
  const { data: tpl } = await supabase.from("client_quote_templates").select("payload").eq("id", templateId).maybeSingle();
  if (!tpl) return { error: "forbidden" };
  const p = tpl.payload as { intro?: string | null; deposit_note?: string | null; currency?: string; lines?: LineInput[] };
  await supabase.from("client_quotes").update({ intro: p.intro ?? null, deposit_note: p.deposit_note ?? null, currency: p.currency ?? "USD" }).eq("id", id);
  await supabase.from("client_quote_lines").delete().eq("quote_id", id);
  const lines = (p.lines ?? []).map((l, i) => ({ quote_id: id, section: l.section ?? null, section_sort: Number(l.section_sort) || 0, title: l.title, description: l.description ?? null, amount: Math.max(0, Number(l.amount) || 0), sort: i }));
  if (lines.length) await supabase.from("client_quote_lines").insert(lines);
  rv();
  return { ok: true };
}

// Send: assign the 16-hex access token, status → sent. The document is read-only thereafter.
export async function sendQuote(id: string): Promise<QuoteResult> {
  const { supabase } = await ctx();
  const { data: q } = await supabase.from("client_quotes").select("status, access_token").eq("id", id).maybeSingle();
  if (!q) return { error: "forbidden" };
  if (q.status !== "draft") return { error: "locked" };
  const token = (q.access_token as string | null) ?? crypto.randomBytes(8).toString("hex");
  const { error } = await supabase.from("client_quotes").update({ status: "sent", access_token: token }).eq("id", id);
  if (error) return { error: "generic" };
  rv();
  return { ok: true, token };
}

export async function withdrawQuote(id: string): Promise<QuoteResult> {
  const { supabase } = await ctx();
  const { error } = await supabase.from("client_quotes").update({ status: "withdrawn" }).eq("id", id).eq("status", "sent");
  if (error) return { error: "generic" };
  rv();
  return { ok: true };
}

// ONE minimal transactional email through the M4 shell (subject + one line + wine button).
// EN/ES inline, FR/IT → EN (the documented gap; the full composer/namespace is L3).
export async function sendQuoteLinkEmail(id: string): Promise<QuoteResult> {
  const { supabase } = await ctx();
  const { data: q } = await supabase.from("client_quotes").select("access_token, lead_id, locale, status").eq("id", id).maybeSingle();
  if (!q || q.status !== "sent" || !q.access_token) return { error: "locked" };
  if (!q.lead_id) return { error: "forbidden" };
  const { data: lead } = await supabase.from("leads").select("email, couple_display, locale").eq("id", q.lead_id).maybeSingle();
  if (!lead?.email) return { error: "forbidden" };
  const locale = (q.locale as string | null) ?? (lead.locale as string | null) ?? "en";
  const email = quoteEmail({ to: lead.email as string, coupleName: lead.couple_display as string, quoteUrl: `${APP_URL}/quote/${q.access_token}`, locale });
  try { await sendBatch([email]); } catch (e) { console.error("quote email send failed", e); return { error: "generic" }; }
  return { ok: true };
}
