"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { currentWorkspace } from "@/lib/workspace";
import { signStudioLogo } from "@/lib/studio-logo";
import type { ProfileContent, Area } from "@/lib/directory";

const BUCKET = "planner-profiles";

// The studio logo lives in the private vendor-media bucket, workspace-first so the
// existing vendor_media_* prefix policies govern the write.
const LOGO_BUCKET = "vendor-media";
const LOGO_MAX = 1024 * 1024; // 1 MB
const LOGO_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export type SaveResult = { ok?: boolean; error?: string };
export type UploadResult = { ok?: boolean; path?: string; error?: string };
export type LogoResult = { ok?: boolean; url?: string | null; error?: string };

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

// Studio logo — PNG/JPEG/webp, under 1 MB. Uploads to vendor-media under the
// member's own {workspace_id}/studio-logos prefix, then persists the path via the
// member-checked set_studio_logo RPC (workspaces_update is owner-only). Returns a
// signed URL for the immediate thumbnail.
export async function uploadStudioLogo(formData: FormData): Promise<LogoResult> {
  const supabase = await createClient();
  const ws = await currentWorkspace(supabase);
  if (!ws) return { error: "logo" };
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "logo" };
  const ext = LOGO_EXT[file.type];
  if (!ext || file.size > LOGO_MAX || file.size === 0) return { error: "logo" };
  const path = `${ws}/studio-logos/${crypto.randomUUID()}.${ext}`;
  const { error: up } = await supabase.storage.from(LOGO_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (up) return { error: "logo" };
  const { error: rpc } = await supabase.rpc("set_studio_logo", { p_workspace: ws, p_path: path });
  if (rpc) return { error: "logo" };
  revalidatePath("/profile");
  return { ok: true, url: await signStudioLogo(path) };
}

export async function removeStudioLogo(): Promise<LogoResult> {
  const supabase = await createClient();
  const ws = await currentWorkspace(supabase);
  if (!ws) return { error: "logo" };
  const { error } = await supabase.rpc("set_studio_logo", { p_workspace: ws, p_path: null });
  if (error) return { error: "logo" };
  revalidatePath("/profile");
  return { ok: true, url: null };
}
