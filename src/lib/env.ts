// Centralized env access. Only NEXT_PUBLIC_* is exposed to the client; the
// service-role key is read ONLY in server-only modules (guarded by
// scripts/check-service-role.mjs) and never imported here.
export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Public site origin — the canonical host for absolute URLs in the M10 directory's
// SEO surfaces (canonical, hreflang alternates, sitemap, JSON-LD, OG). Falls back
// to the Vercel deployment URL, then localhost, so previews still build.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.NEXT_PUBLIC_VERCEL_URL ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}` : "") ||
  "http://localhost:3000"
).replace(/\/$/, "");
