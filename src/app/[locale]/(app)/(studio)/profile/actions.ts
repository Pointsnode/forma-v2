"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ProfileContent, Area } from "@/lib/directory";

const BUCKET = "planner-profiles";

export type SaveResult = { ok?: boolean; error?: string };
export type UploadResult = { ok?: boolean; path?: string; error?: string };

async function currentWorkspace(supabase: Awaited<ReturnType<typeof createClient>>): Promise<string | undefined> {
  const { data } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.workspace_id as string | undefined) ?? undefined;
}

// Persist content + areas together (both member-checked DEFINER wrappers). Slug is
// saved separately because it can fail on format/taken and needs its own message.
export async function saveProfile(profile: ProfileContent, areas: Area[]): Promise<SaveResult> {
  const supabase = await createClient();
  const ws = await currentWorkspace(supabase);
  if (!ws) return { error: "generic" };
  const { error: e1 } = await supabase.rpc("save_profile", { p_workspace: ws, p_profile: profile });
  if (e1) return { error: e1.code || "generic" };
  const { error: e2 } = await supabase.rpc("set_service_areas", { p_workspace: ws, p_areas: areas });
  if (e2) return { error: e2.code || "generic" };
  revalidatePath("/profile");
  return { ok: true };
}

export async function saveSlug(slug: string): Promise<SaveResult> {
  const supabase = await createClient();
  const ws = await currentWorkspace(supabase);
  if (!ws) return { error: "generic" };
  const { error } = await supabase.rpc("set_profile_slug", { p_workspace: ws, p_slug: slug });
  if (error) return { error: error.code || "generic" };
  revalidatePath("/profile");
  return { ok: true };
}

export async function publishProfile(): Promise<SaveResult> {
  const supabase = await createClient();
  const ws = await currentWorkspace(supabase);
  if (!ws) return { error: "generic" };
  const { error } = await supabase.rpc("publish_profile", { p_workspace: ws });
  if (error) return { error: error.code || "generic" };
  revalidatePath("/profile");
  return { ok: true };
}

export async function unpublishProfile(): Promise<SaveResult> {
  const supabase = await createClient();
  const ws = await currentWorkspace(supabase);
  if (!ws) return { error: "generic" };
  const { error } = await supabase.rpc("unpublish_profile", { p_workspace: ws });
  if (error) return { error: error.code || "generic" };
  revalidatePath("/profile");
  return { ok: true };
}

// Photo upload — the RLS insert policy on storage.objects checks is_workspace_member
// on the {workspace_id} path prefix, so a member can only write under their own.
export async function uploadPhoto(formData: FormData): Promise<UploadResult> {
  const supabase = await createClient();
  const ws = await currentWorkspace(supabase);
  if (!ws) return { error: "generic" };
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "generic" };
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${ws}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) return { error: "upload" };
  return { ok: true, path };
}
