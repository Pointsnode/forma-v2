import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { currentWorkspace } from "@/lib/workspace";
import { exchangeCode, getMe, createWebhookSubscription } from "@/lib/calendly/api";
import { encryptToken } from "@/lib/calendly/crypto.mjs";
import { backfillMeetings } from "@/lib/calendly/backfill";
import { APP_URL } from "@/lib/env";

// OAuth callback: verify CSRF state, exchange the code, read the Calendly user (uri /
// org / timezone), create the invitee webhook subscription (callback carries ?w= so
// the webhook knows the workspace), store the connection with tokens + signing key
// AES-256-GCM-encrypted + the studio timezone, then backfill so the grid isn't empty.
// Under the planner's session — a member may write their own connection under RLS.
export async function GET(req: NextRequest) {
  const url = req.nextUrl;
  const back = (q: string) => NextResponse.redirect(new URL(`/calendar?${q}`, url.origin));
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const jar = await cookies();
  const saved = jar.get("cal_oauth_state")?.value;
  jar.delete("cal_oauth_state");
  if (!code || !state || !saved || state !== saved) return back("error=state");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/sign-in", url.origin));
  const workspaceId = await currentWorkspace(supabase);
  if (!workspaceId) return back("error=workspace");

  try {
    // APP_URL (not SITE_URL): the redirect URI must match connect's, and the webhook
    // callback must stay on the app origin across the cutover (see env.ts).
    const tokens = await exchangeCode(code, `${APP_URL}/api/calendly/callback`);
    const me = await getMe(tokens.accessToken);
    const sub = await createWebhookSubscription(tokens.accessToken, {
      orgUri: me.orgUri,
      userUri: me.uri,
      callbackUrl: `${APP_URL}/api/calendly/webhook?w=${workspaceId}`,
    });
    await supabase.from("calendly_connections").upsert(
      {
        workspace_id: workspaceId,
        calendly_user_uri: me.uri,
        calendly_org_uri: me.orgUri,
        access_token_enc: encryptToken(tokens.accessToken),
        refresh_token_enc: encryptToken(tokens.refreshToken),
        token_expires_at: tokens.expiresAt,
        webhook_subscription_id: sub.subscriptionUri,
        webhook_signing_key_enc: encryptToken(sub.signingKey),
        timezone: me.timezone || "America/Mexico_City",
        status: "active",
      },
      { onConflict: "workspace_id" },
    );
    await backfillMeetings(supabase, { workspaceId, accessToken: tokens.accessToken, orgUri: me.orgUri });
  } catch (e) {
    console.error("calendly connect failed", e);
    return back("error=connect");
  }
  return back("connected=1");
}
