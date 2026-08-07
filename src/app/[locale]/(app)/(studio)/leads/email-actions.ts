"use server";

import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { DRAFT_MODEL, CONCIERGE_API_KEY, CONCIERGE_API_URL, CONCIERGE_MAX_TOKENS, conciergeConfigured } from "@/lib/concierge/config";
import { emailShell } from "@/lib/email/shell";
import { sendBatch } from "@/lib/email/resend";

export type WriteResult = { ok?: boolean; error?: "no_email" | "no_key" | "invalid" | "generic"; subject?: string; body?: string };

function rv() {
  revalidatePath("/[locale]/(app)/(studio)/leads/[id]", "page");
  revalidatePath("/[locale]/(app)/(studio)/leads", "page");
}
async function ctx() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}
function escapeHtml(s: string): string { return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!); }
const LANGNAME: Record<string, string> = { en: "English", es: "Spanish", fr: "French", it: "Italian" };

// Draft it — asks the concierge brain (DRAFT_MODEL) to write a short email from the lead's
// facts + thread, in the LEAD's language. NEVER auto-sends; returns the draft for the planner
// to edit. Direct model call (the fetch-only house pattern), gated on the key being present.
export async function draftLeadEmail(leadId: string): Promise<WriteResult> {
  if (!conciergeConfigured()) return { error: "no_key" };
  const { supabase } = await ctx();
  const { data: lead } = await supabase.from("leads").select("couple_display, locale, date_feel, city, guest_feel, budget_feel, next_step, stage").eq("id", leadId).maybeSingle();
  if (!lead) return { error: "generic" };
  const { data: events } = await supabase.from("lead_events").select("kind, body").eq("lead_id", leadId).order("created_at", { ascending: true }).limit(20);
  const lang = (lead.locale as string | null) ?? "en";
  const facts = [lead.couple_display, lead.date_feel, lead.city, lead.guest_feel, lead.budget_feel && `budget ${lead.budget_feel}`, `stage ${lead.stage}`, lead.next_step && `next step: ${lead.next_step}`].filter(Boolean).join("; ");
  const history = ((events ?? []) as { kind: string; body: string | null }[]).map((e) => `${e.kind}: ${e.body ?? ""}`).join("\n");
  const system = `You are a wedding planner's assistant drafting a warm, brief, personal email to a prospective couple. Write in ${LANGNAME[lang] ?? "English"}. Keep it to 3-5 sentences, no placeholders, no signature. Never use em dashes or en dashes (the — and – characters); use a comma or a period. Never mention attachments or say anything is attached in any language (no "ci-joint", "adjunto", "allegato"); the email carries a link, never a file, so an attachment can never exist. Respond EXACTLY as:\nSUBJECT: <a short subject line>\n\n<the email body>`;
  const userText = `Lead: ${facts}\n\nHistory (oldest first):\n${history || "(none yet)"}\n\nDraft the next email to move this forward.`;
  let text: string;
  try {
    const res = await fetch(CONCIERGE_API_URL, {
      method: "POST",
      headers: { "x-api-key": CONCIERGE_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: DRAFT_MODEL, max_tokens: CONCIERGE_MAX_TOKENS, system, messages: [{ role: "user", content: userText }] }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) { console.error(`draftLeadEmail ${res.status}`); return { error: "generic" }; }
    const json = (await res.json()) as { content?: { type: string; text?: string }[] };
    text = (json.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join("");
  } catch (e) { console.error(`draftLeadEmail: ${(e as Error).message}`); return { error: "generic" }; }
  const m = text.match(/^\s*SUBJECT:\s*(.+?)\n([\s\S]*)$/i);
  return m ? { ok: true, subject: m[1].trim(), body: m[2].trim() } : { ok: true, subject: "", body: text.trim() };
}

// Send via forma: the STUDIO's name sends through forma's verified domain, reply_to is the
// planner's own email so replies land in her inbox. Logs a lead_events 'email' row (out/forma).
export async function sendLeadEmail(leadId: string, subject: string, body: string): Promise<WriteResult> {
  const s = subject.trim(), b = body.trim();
  if (!s || !b) return { error: "invalid" };
  const { supabase, user } = await ctx();
  const { data: lead } = await supabase.from("leads").select("email, locale, workspace_id").eq("id", leadId).maybeSingle();
  if (!lead) return { error: "generic" };
  if (!lead.email) return { error: "no_email" };
  const [{ data: prof }, { data: ws }] = await Promise.all([
    user ? supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle() : Promise.resolve({ data: null }),
    supabase.from("workspaces").select("name").eq("id", lead.workspace_id).maybeSingle(),
  ]);
  const studio = (ws?.name as string | null) ?? "Forma";
  const plannerName = (prof?.display_name as string | null) ?? user?.email ?? "";
  const t = await getTranslations({ locale: (lead.locale as string | null) ?? "en", namespace: "email" });
  const html = emailShell(`<p style="font-family:Inter,Arial,sans-serif;font-size:15px;white-space:pre-wrap;margin:0">${escapeHtml(b)}</p>`, t("shell.held"));
  try {
    await sendBatch([{ from: `${studio} <leads@forma.events>`, to: [lead.email as string], subject: s, html, text: b, reply_to: user?.email ?? undefined }]);
  } catch (e) { console.error("sendLeadEmail failed", e); return { error: "generic" }; }
  await supabase.from("lead_events").insert({ lead_id: leadId, kind: "email", body: s, meta: { direction: "out", mode: "forma", by: plannerName }, author_id: user?.id ?? null });
  rv();
  return { ok: true };
}

// The escape hatch: the planner opened the composed mail in her own app. forma cannot confirm
// the send, and the honest meta says so.
export async function logMailtoEmail(leadId: string, subject: string): Promise<WriteResult> {
  const { supabase, user } = await ctx();
  const { data: prof } = user ? await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle() : { data: null };
  await supabase.from("lead_events").insert({ lead_id: leadId, kind: "email", body: subject.trim() || "(email)", meta: { direction: "out", mode: "mailto", by: (prof?.display_name as string | null) ?? "", unconfirmed: true }, author_id: user?.id ?? null });
  rv();
  return { ok: true };
}
