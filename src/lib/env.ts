// Centralized env access. Only NEXT_PUBLIC_* is exposed to the client; the
// service-role key is read ONLY in server-only modules (guarded by
// scripts/check-service-role.mjs) and never imported here.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
