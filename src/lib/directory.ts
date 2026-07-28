import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { DirectoryCard, PlannerProfile, RegionRef } from "@/lib/directory-shared";

// The public planner directory's READ layer (service-role). Reads go through the
// admin client + the `public_planner_*` DEFINER functions (granted to service_role
// ONLY — never anon; see the people.sql matrix). The published+studio gate lives
// inside those functions, so an unpublished profile is invisible here by design.
// This file is on the service-role allowlist (scripts/check-service-role.mjs).
//
// Pure/client-safe helpers + types live in ./directory-shared and are re-exported
// so `@/lib/directory` stays the one server-side import surface.
export * from "@/lib/directory-shared";

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
