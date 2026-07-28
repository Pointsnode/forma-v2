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

// The APPLICATION origin — where the signed-in app + its OAuth callbacks/webhooks
// live. Today SITE_URL and APP_URL are the same (app.forma.events). At the cutover
// SITE_URL flips to the marketing domain (forma.events) for public canonicals, but
// APP_URL must STAY on app.forma.events so the pinned Calendly redirect URI + the
// live webhook subscription keep resolving. Anything that must not move at cutover
// (Calendly OAuth/webhook, auth-email + payment return URLs) builds from APP_URL.
// Falls back to SITE_URL when unset, so nothing changes until the runbook sets it.
export const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || SITE_URL).replace(/\/$/, "");
