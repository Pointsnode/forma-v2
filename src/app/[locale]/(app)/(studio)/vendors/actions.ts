"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { currentWorkspace as firstWorkspace } from "@/lib/workspace";

export type VendorResult = { ok?: boolean; error?: string; id?: string };

const csv = (s: FormDataEntryValue | null) =>
  String(s ?? "").split(",").map((x) => x.trim()).filter(Boolean);
const txt = (s: FormDataEntryValue | null) => {
  const v = String(s ?? "").trim();
  return v || null;
};

export async function createVendor(formData: FormData): Promise<VendorResult> {
  const supabase = await createClient();
  const ws = await firstWorkspace(supabase);
  if (!ws) return { error: "generic" };
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "invalid" };
  const capRaw = String(formData.get("capacity") ?? "").replace(/[^0-9]/g, "");
  const { data, error } = await supabase.from("vendors").insert({
    workspace_id: ws,
    name,
    kind: (txt(formData.get("kind")) ?? "other"),
    description: txt(formData.get("description")),
    tags: csv(formData.get("tags")),
    cities: csv(formData.get("cities")),
    services: txt(formData.get("services")),
    restrictions: txt(formData.get("restrictions")),
    perks: txt(formData.get("perks")),
    contact_name: txt(formData.get("contact_name")),
    contact_email: txt(formData.get("contact_email")),
    contact_phone: txt(formData.get("contact_phone")),
    capacity: capRaw ? Number(capRaw) : null,
    address: txt(formData.get("address")),
  }).select("id").single();
  if (error || !data) { console.error(`createVendor (${error?.code}): ${error?.message}`); return { error: "generic" }; }
  revalidatePath("/[locale]/vendors", "layout");
  redirect({ href: `/vendors/${data.id}`, locale: await getLocale() });
  return { ok: true, id: data.id };
}

export async function uploadVendorMedia(vendorId: string, kind: "photo" | "file", formData: FormData): Promise<VendorResult> {
  const supabase = await createClient();
  const { data: v } = await supabase.from("vendors").select("workspace_id").eq("id", vendorId).maybeSingle();
  if (!v) return { error: "generic" };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "invalid" };
  if (kind === "photo" && file.size > 5 * 1024 * 1024) return { error: "toobig" };
  if (file.size > 20 * 1024 * 1024) return { error: "toobig" };
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${v.workspace_id}/${vendorId}/${crypto.randomUUID()}.${ext}`;
  const { error: upErr } = await supabase.storage.from("vendor-media").upload(path, file, { contentType: file.type });
  if (upErr) { console.error(`upload (${upErr.message})`); return { error: "generic" }; }
  const error = kind === "photo"
    ? (await supabase.from("vendor_photos").insert({ vendor_id: vendorId, storage_path: path, sort: 0 })).error
    : (await supabase.from("vendor_files").insert({ vendor_id: vendorId, storage_path: path, label: txt(formData.get("label")) ?? "other" })).error;
  if (error) { console.error(`media row (${error.code}): ${error.message}`); return { error: "generic" }; }
  revalidatePath("/[locale]/vendors", "layout");
  return { ok: true };
}

// ── the loop's opening move + lifecycle (all via the M4 rpc layer) ──────────
async function rpc(fn: string, args: Record<string, unknown>): Promise<VendorResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) { console.error(`${fn} (${error.code}): ${error.message}`); return { error: error.code || "generic" }; }
  revalidatePath("/[locale]/wedding/[id]", "layout");
  revalidatePath("/[locale]/vendors", "layout");
  return { ok: true, id: (data as string) ?? undefined };
}

export async function presentVendor(vendorId: string, weddingId: string, eventIds: string[], estimate: string, note: string) {
  return rpc("present_vendor", { p_vendor: vendorId, p_wedding: weddingId, p_event_ids: eventIds, p_estimate: estimate ? Number(estimate.replace(/[^0-9.]/g, "")) : null, p_note: note || null });
}
export async function requestQuote(engagementId: string) { return rpc("request_quote", { p_eng: engagementId }); }
export async function recordQuote(quoteId: string, amount: string, validUntil: string, note: string) {
  return rpc("record_quote", { p_quote: quoteId, p_amount: Number(amount.replace(/[^0-9.]/g, "")) || 0, p_valid_until: validUntil || null, p_note: note || null, p_file: null });
}
export async function acceptQuote(quoteId: string) { return rpc("accept_quote", { p_quote: quoteId }); }
export async function declineQuote(quoteId: string) { return rpc("decline_quote", { p_quote: quoteId }); }
export async function bookEngagement(engagementId: string) { return rpc("book_engagement", { p_eng: engagementId }); }
export async function archiveEngagement(engagementId: string) { return rpc("archive_engagement", { p_eng: engagementId }); }
export async function advancePhase(weddingId: string) { return rpc("advance_phase", { w: weddingId }); }
