"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ConvertResult = { ok?: boolean; weddingId?: string; error?: string };
export type ActionResult = { ok?: boolean; error?: string };

// Convert an inquiry → a foundations wedding (the DEFINER fn creates the wedding,
// carries the date onto its default event, marks the inquiry converted, and logs).
export async function convertInquiry(id: string): Promise<ConvertResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("convert_inquiry", { p_inquiry: id });
  if (error) return { error: error.code || "generic" };
  revalidatePath("/");
  return { ok: true, weddingId: data as string };
}

export async function archiveInquiry(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("inquiries").update({ status: "archived" }).eq("id", id);
  if (error) return { error: error.code || "generic" };
  revalidatePath("/");
  return { ok: true };
}

// Opening the mail client is the "reply" — we record it by flipping new → replied
// so the inbox stops flagging it as unanswered (exceptions-first).
export async function markReplied(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("inquiries").update({ status: "replied" }).eq("id", id).eq("status", "new");
  if (error) return { error: error.code || "generic" };
  revalidatePath("/");
  return { ok: true };
}
