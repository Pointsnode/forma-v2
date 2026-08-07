import "server-only";
import { createAdminClient } from "./supabase/admin";

// The studio logo lives in the private vendor-media bucket at
// {workspace_id}/studio-logos/{uuid}. It heads quotes — including the anon,
// logged-out /quote/[token] page, where the viewer has no way to sign a private
// object. So all logo signing runs through the service-role client here: it is
// the ONE surface that must serve a member's private object to a public viewer,
// and it also sidesteps the vendor_media_select policy (which casts path segment
// 2 to uuid — fine for {vendor_id}, an error for the literal 'studio-logos').
// Isolated to this allowlisted lib; callers pass only their own workspace's path.
const BUCKET = "vendor-media";

export async function signStudioLogo(path: string | null | undefined, expires = 3600): Promise<string | null> {
  if (!path) return null;
  const admin = createAdminClient();
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(path, expires);
  return data?.signedUrl ?? null;
}
