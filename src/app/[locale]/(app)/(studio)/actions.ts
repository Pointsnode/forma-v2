"use server";

import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { currentWorkspace } from "@/lib/workspace";

// Advances the cockpit "Since you were away" cursor. Called on mount from the
// overview so the next visit's window starts from now.
export async function touchLastSeen(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await supabase.from("profiles").update({ last_seen_at: new Date().toISOString() }).eq("id", user.id);
}

export type WeddingState = { error?: "invalid" | "generic" } | null;

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "wedding";

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

  const d = parsed.data;
  const base = slugify(d.coupleDisplay);
  // weddings_select reads workspace_id off the row, so INSERT ... RETURNING is
  // safe here (the creator is a workspace member) — no M0-style read-back trap.
  let newId: string | null = null;
  for (let attempt = 0; attempt < 5 && !newId; attempt++) {
    const slug = `${base}-${crypto.randomUUID().slice(0, 6)}`;
    const { data: row, error } = await supabase
      .from("weddings")
      .insert({
        workspace_id: workspaceId,
        slug,
        couple_display: d.coupleDisplay,
        partner_a: d.partnerA,
        partner_b: d.partnerB,
        kind: d.kind,
        location_city: d.locationCity,
        location_country: d.locationCountry,
        guest_target: d.guestTarget,
        budget_total: d.budgetTotal,
      })
      .select("id")
      .single();
    if (!error && row) {
      newId = row.id;
      break;
    }
    if (error?.code === "23505") continue; // slug collision — retry
    console.error(`createWedding: insert failed (${error?.code}): ${error?.message}`);
    return { error: "generic" };
  }
  if (!newId) {
    console.error("createWedding: could not find a unique slug after 5 attempts");
    return { error: "generic" };
  }

  redirect({ href: `/wedding/${newId}`, locale: await getLocale() });
  return null;
}
