import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { authorizeUrl, calendlyConfigured } from "@/lib/calendly/api";
import { APP_URL } from "@/lib/env";

// Start OAuth: set a CSRF state cookie, then bounce to Calendly's consent screen.
// Runs under the planner's session (no service role — connect is a member action).
export async function GET(req: NextRequest) {
  if (!calendlyConfigured()) return NextResponse.redirect(new URL("/calendar?error=config", req.nextUrl.origin));
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/sign-in", req.nextUrl.origin));

  const state = randomBytes(16).toString("hex");
  const jar = await cookies();
  jar.set("cal_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 600 });
  // APP_URL (not SITE_URL): the Calendly redirect URI is pinned to the app origin and
  // must not move when SITE_URL flips to the marketing domain at cutover.
  return NextResponse.redirect(authorizeUrl(`${APP_URL}/api/calendly/callback`, state));
}
