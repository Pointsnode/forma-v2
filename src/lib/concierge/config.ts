import "server-only";

// The concierge model + key live in server-only env — NEVER NEXT_PUBLIC_* (the
// check:public-env guard would reject a *_KEY there). The key is the studio's to
// create and paste; the app reads it here and nowhere else. When it is absent the
// concierge degrades honestly: persisted threads still load in the panel (GET
// /api/concierge), and a send is saved with a "not configured" reply.
export const CONCIERGE_MODEL = process.env.CONCIERGE_MODEL || "claude-haiku-4-5-20251001";
export const CONCIERGE_API_KEY = process.env.CONCIERGE_API_KEY || "";
export const CONCIERGE_API_URL = "https://api.anthropic.com/v1/messages";
export const CONCIERGE_MAX_TOKENS = 1024;

export function conciergeConfigured(): boolean {
  return CONCIERGE_API_KEY.length > 0;
}
