import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { SUPABASE_URL } from "@/lib/env";
import type { Locale } from "@/i18n/routing";

// The public planner directory's read layer. Reads go through the service-role
// admin client + the `public_planner_*` DEFINER functions (granted to service_role
// ONLY — never anon; see the people.sql matrix). The published+studio gate lives
// inside those functions, so an unpublished profile is invisible here by design.
// This file is on the service-role allowlist (scripts/check-service-role.mjs).

export type Localized = { en?: string; es?: string };
export type Service = { name: string; from_price?: number };
export type ProfileContent = {
  tagline?: Localized;
  about?: Localized;
  hero?: string;
  gallery?: string[];
  services?: Service[];
  booking_url?: string;
  discovery_calls_enabled?: boolean;
  instagram?: string;
  website?: string;
};
export type Area = { country: string; region: string; city?: string | null };
export type DirectoryCard = { slug: string; name: string; profile: ProfileContent; areas: { country: string; region: string }[] };
export type PlannerProfile = { slug: string; name: string; profile: ProfileContent; areas: Area[] };
export type RegionRef = { country: string; region: string };

const BUCKET = "planner-profiles";

/** Pick a localized string, falling back across locales (never returns undefined). */
export function pick(l: Localized | undefined, locale: Locale): string {
  if (!l) return "";
  return l[locale]?.trim() || l.en?.trim() || l.es?.trim() || "";
}

/** URL-safe, diacritic-stripped slug — "Yucatán" → "yucatan". */
export function slugifyRegion(region: string): string {
  return region
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Public image URL for a stored path. Editor uploads are bucket paths; an absolute
    URL (seed/probe imagery) passes through unchanged. Public bucket → no expiry. */
export function publicImageUrl(path?: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${encodeURI(path)}`;
}

export async function getDirectory(): Promise<DirectoryCard[]> {
  const admin = createAdminClient();
  const { data } = await admin.rpc("public_planner_directory");
  return (data as DirectoryCard[] | null) ?? [];
}

export async function getPlannerProfile(slug: string): Promise<PlannerProfile | null> {
  const admin = createAdminClient();
  const { data } = await admin.rpc("public_planner_profile", { p_slug: slug });
  return (data as PlannerProfile | null) ?? null;
}

export async function getPlannerSlugs(): Promise<{ slugs: string[]; regions: RegionRef[] }> {
  const admin = createAdminClient();
  const { data } = await admin.rpc("public_planner_slugs");
  const d = (data as { slugs?: string[]; regions?: RegionRef[] } | null) ?? {};
  return { slugs: d.slugs ?? [], regions: d.regions ?? [] };
}

/** The distinct regions that actually have ≥1 published planner (index list). */
export function regionsFromDirectory(cards: DirectoryCard[]): { slug: string; region: string; country: string; count: number }[] {
  const bySlug = new Map<string, { slug: string; region: string; country: string; count: number }>();
  for (const c of cards) {
    for (const a of c.areas) {
      const slug = slugifyRegion(a.region);
      if (!slug) continue;
      const existing = bySlug.get(slug);
      if (existing) existing.count += 1;
      else bySlug.set(slug, { slug, region: a.region, country: a.country, count: 1 });
    }
  }
  return [...bySlug.values()].sort((x, y) => x.region.localeCompare(y.region));
}

/** Cards whose service areas include the given region slug. */
export function cardsInRegion(cards: DirectoryCard[], regionSlug: string): DirectoryCard[] {
  return cards.filter((c) => c.areas.some((a) => slugifyRegion(a.region) === regionSlug));
}
