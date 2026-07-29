"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// The engagement ledger's actions (M13), wedding-scoped. Every one returns the raw
// SQLSTATE AND the DB message so the client's formaError can show the code's mapped
// line, or fall back to the database's own words — never a blank "Couldn't save".
// Status only ever moves through the existing function lane; nothing here writes a
// status column directly.
export type LedgerResult = { ok?: boolean; error?: string; message?: string; id?: string };

async function rpc(fn: string, args: Record<string, unknown>): Promise<LedgerResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    console.error(`${fn} (${error.code}): ${error.message}`);
    return { error: error.code || "generic", message: error.message };
  }
  revalidatePath("/[locale]/wedding/[id]/vendors", "layout");
  return { ok: true, id: (data as string) ?? undefined };
}

const money = (s: string) => Number(String(s).replace(/[^0-9.]/g, "")) || 0;

// In a "use server" module every export must be an async function.
export async function requestQuote(engagementId: string) { return rpc("request_quote", { p_eng: engagementId }); }
export async function acceptQuote(quoteId: string) { return rpc("accept_quote", { p_quote: quoteId }); }
export async function declineQuote(quoteId: string) { return rpc("decline_quote", { p_quote: quoteId }); }
export async function bookEngagement(engagementId: string) { return rpc("book_engagement", { p_eng: engagementId }); }
export async function archiveEngagement(engagementId: string) { return rpc("archive_engagement", { p_eng: engagementId }); }
export async function withdrawProposal(proposalId: string) { return rpc("withdraw_proposal", { p: proposalId }); }
export async function sendQuote(quoteId: string, note: string) { return rpc("send_quote", { p_quote: quoteId, p_note: note || null }); }
// §H — the manual money link: accept_quote lays down the traced expected balance line
// (idempotent on quote_id), covering the couple-accepted case where no line exists yet.
export async function addToBudget(quoteId: string) { return rpc("accept_quote", { p_quote: quoteId }); }

// Couple's round trip rides the proposal lane (respond_to_proposal). Reused for
// Accept / Ask-for-a-new-quote (request_change, message required) / Decline.
export async function coupleRespond(proposalId: string, action: "approve" | "request_change" | "decline", message: string | null) {
  return rpc("respond_to_proposal", { p: proposalId, action, message });
}
export async function markSeen(proposalId: string) { return rpc("mark_proposal_seen", { p: proposalId }); }

// Record a quote WITH its PDF. Order (§E): the RPC writes the file onto the quote
// first; the documents row is filed second, so a failed document insert still leaves
// the quote carrying its file and the ledger link intact. PDF only, ≤20 MB, and the
// path's first segment MUST be the wedding id (wedding_docs_select keys on it — that
// is what keeps one couple's price out of another couple's hands).
export async function recordQuote(quoteId: string, weddingId: string, amount: string, validUntil: string, note: string, form: FormData): Promise<LedgerResult> {
  const supabase = await createClient();
  let storagePath: string | null = null;

  const file = form.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.type !== "application/pdf") return { error: "notpdf" };
    if (file.size > 20 * 1024 * 1024) return { error: "toobig" };
    const path = `${weddingId}/quotes/${quoteId}/${crypto.randomUUID()}.pdf`;
    const { error: upErr } = await supabase.storage.from("wedding-docs").upload(path, file, { contentType: "application/pdf" });
    if (upErr) { console.error(`quote upload: ${upErr.message}`); return { error: "generic" }; }
    storagePath = path;
  }

  const { error } = await supabase.rpc("record_quote", { p_quote: quoteId, p_amount: money(amount), p_valid_until: validUntil || null, p_note: note || null, p_file: storagePath });
  if (error) return { error: error.code || "generic", message: error.message };

  // File the PDF on the Documents tab too (first producer of source='vendor_file'
  // and documents.engagement_id). Best-effort: the quote already carries the file.
  if (storagePath) {
    const { data: q } = await supabase.from("quotes").select("engagement_id, created_at").eq("id", quoteId).maybeSingle();
    const engagementId = (q?.engagement_id as string | undefined) ?? null;
    let title = "Quote";
    if (engagementId) {
      const { data: eng } = await supabase.from("wedding_vendors").select("vendors(name)").eq("id", engagementId).maybeSingle();
      // ordinal = quotes created at or before this one — the SAME ordering the price
      // strip uses in SQL, so a document and its strip rung never disagree.
      const { count } = await supabase.from("quotes").select("id", { count: "exact", head: true }).eq("engagement_id", engagementId).lte("created_at", q!.created_at as string);
      const vname = ((eng?.vendors as unknown as { name: string } | null)?.name) ?? "Vendor";
      title = `${vname} — Quote ${count ?? 1}`;
    }
    await supabase.from("documents").insert({ wedding_id: weddingId, title, source: "vendor_file", storage_path: storagePath, engagement_id: engagementId });
  }

  revalidatePath("/[locale]/wedding/[id]/vendors", "layout");
  revalidatePath("/[locale]/wedding/[id]/documents", "layout");
  return { ok: true };
}
