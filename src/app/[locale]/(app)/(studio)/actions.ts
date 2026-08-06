"use server";

import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { currentWorkspace, clearanceGate } from "@/lib/workspace";
import { insertWedding } from "@/lib/wedding-create";

// Advances the cockpit "Since you were away" cursor. Called on mount from the
// overview so the next visit's window starts from now.
export async function touchLastSeen(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id);
}

export type WeddingState = { error?: "invalid" | "generic" | "clearance" } | null;

const optionalText = z.string().trim().max(120).optional().or(z.literal("")).transform((v) => (v ? v : null));
const optionalInt = z
  .string().trim().optional().or(z.literal(""))
  .transform((v) => (v ? Number(v.replace(/[^0-9]/g, "")) : null))
  .refine((v) => v == null || (Number.isFinite(v) && v >= 0), { message: "bad number" });

const schema = z.object({
  coupleDisplay: z.string().trim().min(1).max(120),
  partnerA: optionalText,
  partnerB: optionalText,
  kind: z.enum(["city", "destination"]),
  locationCity: optionalText,
  locationCountry: optionalText,
  guestTarget: optionalInt,
  budgetTotal: optionalInt,
});

export async function createWedding(_prev: WeddingState, formData: FormData): Promise<WeddingState> {
  const parsed = schema.safeParse({
    coupleDisplay: formData.get("coupleDisplay"),
    partnerA: formData.get("partnerA") ?? "",
    partnerB: formData.get("partnerB") ?? "",
    kind: formData.get("kind"),
    locationCity: formData.get("locationCity") ?? "",
    locationCountry: formData.get("locationCountry") ?? "",
    guestTarget: formData.get("guestTarget") ?? "",
    budgetTotal: formData.get("budgetTotal") ?? "",
  });
  if (!parsed.success) return { error: "invalid" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "generic" };

  const workspaceId = await currentWorkspace(supabase);
  if (!workspaceId) return { error: "generic" };
  // §G backstop: the DB write goes direct under role-blind RLS, so gate a boxless staff
  // member here (the create button is already hidden for them). Not couple-reachable.
  if (await clearanceGate(supabase, "weddings")) return { error: "clearance" };

  const d = parsed.data;
  const newId = await insertWedding(supabase, workspaceId, {
    coupleDisplay: d.coupleDisplay,
    partnerA: d.partnerA,
    partnerB: d.partnerB,
    kind: d.kind,
    locationCity: d.locationCity,
    locationCountry: d.locationCountry,
    guestTarget: d.guestTarget,
    budgetTotal: d.budgetTotal,
  });
  if (!newId) return { error: "generic" };

  redirect({ href: `/wedding/${newId}`, locale: await getLocale() });
  return null;
}
