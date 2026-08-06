import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// The ONE wedding-insert path. /weddings/new (createWedding) and lead conversion (convertLead)
// both go through here, so the row's columns, the slug retry, and every insert-time trigger
// (the default order-0 event, the phase machinery, the date rollup) stay identical — the
// conversion can never drift from creation as the creation logic evolves.

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "wedding";

export type NewWeddingFields = {
  coupleDisplay: string;
  partnerA?: string | null;
  partnerB?: string | null;
  kind?: "city" | "destination" | null;
  locationCity?: string | null;
  locationCountry?: string | null;
  guestTarget?: number | null;
  budgetTotal?: number | null;
  locale?: string | null;
};

// Inserts a wedding with a unique slug (retrying on collision) and returns its id, or null on
// failure. Only the fields provided are written; the rest fall to their column defaults, so a
// lead conversion (which knows fewer facts) still lands the same shape as the full form.
export async function insertWedding(
  supabase: SupabaseClient,
  workspaceId: string,
  fields: NewWeddingFields,
): Promise<string | null> {
  const base = slugify(fields.coupleDisplay);
  for (let attempt = 0; attempt < 5; attempt++) {
    const insert: Record<string, unknown> = {
      workspace_id: workspaceId,
      slug: `${base}-${crypto.randomUUID().slice(0, 6)}`,
      couple_display: fields.coupleDisplay,
    };
    if (fields.partnerA !== undefined) insert.partner_a = fields.partnerA;
    if (fields.partnerB !== undefined) insert.partner_b = fields.partnerB;
    if (fields.kind != null) insert.kind = fields.kind;
    if (fields.locationCity !== undefined) insert.location_city = fields.locationCity;
    if (fields.locationCountry !== undefined) insert.location_country = fields.locationCountry;
    if (fields.guestTarget !== undefined) insert.guest_target = fields.guestTarget;
    if (fields.budgetTotal !== undefined) insert.budget_total = fields.budgetTotal;
    if (fields.locale != null) insert.locale = fields.locale;

    // weddings_select reads workspace_id off the row, so INSERT ... RETURNING is safe (the
    // creator is a workspace member) — no read-back trap.
    const { data: row, error } = await supabase.from("weddings").insert(insert).select("id").single();
    if (!error && row) return row.id as string;
    if (error?.code === "23505") continue; // slug collision — retry
    console.error(`insertWedding: insert failed (${error?.code}): ${error?.message}`);
    return null;
  }
  console.error("insertWedding: no unique slug after 5 attempts");
  return null;
}
