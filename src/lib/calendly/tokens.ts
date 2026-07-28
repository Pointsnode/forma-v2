import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken, encryptToken } from "./crypto.mjs";
import { refreshTokens } from "./api";

// Token refresh, OFF the render path (ported from v1): callers here are the connect
// callback, the backfill, and disconnect — never a page render (the grid reads the
// stored `meetings` rows). If the access token is still valid we decrypt and return
// it; if expired we refresh, re-encrypt both tokens, persist, and return the new one.
type ConnRow = { id: string; access_token_enc: string; refresh_token_enc: string; token_expires_at: string };

export async function getValidAccessToken(admin: SupabaseClient, conn: ConnRow): Promise<string> {
  if (new Date(conn.token_expires_at).getTime() > Date.now()) {
    return decryptToken(conn.access_token_enc);
  }
  const t = await refreshTokens(decryptToken(conn.refresh_token_enc));
  await admin
    .from("calendly_connections")
    .update({ access_token_enc: encryptToken(t.accessToken), refresh_token_enc: encryptToken(t.refreshToken), token_expires_at: t.expiresAt })
    .eq("id", conn.id);
  return t.accessToken;
}
