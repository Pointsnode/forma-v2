import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client — bypasses RLS. ONLY the touchpoint cron uses it (no user
// session exists for a cron run). Never import from a client component or a
// user-facing route. Guarded by scripts/check-service-role.mjs (allowlisted).
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
