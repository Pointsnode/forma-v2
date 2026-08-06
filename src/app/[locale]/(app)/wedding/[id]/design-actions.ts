"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type DesignResult = { ok?: boolean; error?: string };
const HEX = /^#[0-9a-fA-F]{6}$/;
const revalidate = () => revalidatePath("/[locale]/(app)/wedding/[id]/design", "page");

// Save a swatch to the WEDDING's palette (RLS: staff or couple of this wedding).
export async function addWeddingSwatch(weddingId: string, hex: string, sourceItemId?: string | null): Promise<DesignResult> {
  if (!HEX.test(hex)) return { error: "bad_hex" };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("design_palette_swatches").insert({
    wedding_id: weddingId, hex: hex.toLowerCase(), source_item_id: sourceItemId ?? null, created_by: user?.id,
  });
  if (error) return { error: error.code || "generic" };
  revalidate();
  return { ok: true };
}

export async function removeWeddingSwatch(id: string): Promise<DesignResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("design_palette_swatches").delete().eq("id", id);
  if (error) return { error: error.code || "generic" };
  revalidate();
  return { ok: true };
}

// "Keep for the studio" — copy a swatch to the workspace palette (RLS: staff only).
export async function keepSwatchForStudio(weddingId: string, hex: string): Promise<DesignResult> {
  if (!HEX.test(hex)) return { error: "bad_hex" };
  const supabase = await createClient();
  const { data: w } = await supabase.from("weddings").select("workspace_id").eq("id", weddingId).maybeSingle();
  const workspaceId = (w as { workspace_id?: string } | null)?.workspace_id;
  if (!workspaceId) return { error: "no_workspace" };
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("workspace_palette_swatches").insert({
    workspace_id: workspaceId, hex: hex.toLowerCase(), created_by: user?.id,
  });
  if (error) return { error: error.code || "generic" };
  revalidate();
  return { ok: true };
}

// Pin a guide to a budget category or a vendor engagement (read-only association, staff).
export async function pinGuide(boardId: string, weddingId: string, budgetCategory: string | null, engagementId: string | null): Promise<DesignResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("design_boards")
    .update({ budget_category: budgetCategory, engagement_id: engagementId })
    .eq("id", boardId).eq("wedding_id", weddingId);
  if (error) return { error: error.code || "generic" };
  revalidate();
  return { ok: true };
}

// Set a guide's category and/or cover image (staff/couple).
export async function updateGuide(boardId: string, weddingId: string, patch: { category?: string | null; cover_item_id?: string | null }): Promise<DesignResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("design_boards").update(patch).eq("id", boardId).eq("wedding_id", weddingId);
  if (error) return { error: error.code || "generic" };
  revalidate();
  return { ok: true };
}
