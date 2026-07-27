import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "vendor-media";

// Short-lived signed URLs — the bucket is private; the app never exposes a path.
export async function signedUrl(supabase: SupabaseClient, path: string | null, expires = 3600): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, expires);
  return data?.signedUrl ?? null;
}

export async function signedUrlMap(supabase: SupabaseClient, paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const clean = [...new Set(paths.filter((p): p is string => !!p))];
  if (!clean.length) return new Map();
  const { data } = await supabase.storage.from(BUCKET).createSignedUrls(clean, 3600);
  const m = new Map<string, string>();
  for (const d of data ?? []) if (d.signedUrl && d.path) m.set(d.path, d.signedUrl);
  return m;
}
