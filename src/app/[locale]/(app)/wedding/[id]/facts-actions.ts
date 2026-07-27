"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type FactsResult = { ok?: boolean; error?: string };

// Staff edit of the wedding's foundational facts — the same fields the couple set
// at create, editable after. This only feeds the §9 predicates; the phase itself
// still advances only through advance_wedding_phase (the DB stays the sole writer).
export async function updateWeddingFacts(weddingId: string, form: FormData): Promise<FactsResult> {
  const supabase = await createClient();
  const money = (k: string) => {
    const v = String(form.get(k) ?? "").replace(/[^0-9.]/g, "");
    return v ? Number(v) : null;
  };
  const int = (k: string) => {
    const v = String(form.get(k) ?? "").replace(/[^0-9]/g, "");
    return v ? parseInt(v, 10) : null;
  };
  const txt = (k: string) => {
    const v = String(form.get(k) ?? "").trim();
    return v || null;
  };
  const kindRaw = String(form.get("kind") ?? "");
  const kind = kindRaw === "city" || kindRaw === "destination" ? kindRaw : null;

  const { error } = await supabase
    .from("weddings")
    .update({
      budget_total: money("budget_total"),
      guest_target: int("guest_target"),
      location_city: txt("location_city"),
      location_country: txt("location_country"),
      kind,
    })
    .eq("id", weddingId);
  if (error) {
    console.error(`updateWeddingFacts (${error.code}): ${error.message}`);
    return { error: error.code || "generic" };
  }
  revalidatePath("/[locale]/wedding/[id]", "layout");
  return { ok: true };
}
