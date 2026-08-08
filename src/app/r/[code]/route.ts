import { NextResponse, type NextRequest } from "next/server";
import { REFERRAL_COOKIE, REFERRAL_COOKIE_DAYS } from "@/lib/referral";

// forma.events/r/{code} — capture. Sets a 30-day httpOnly cookie, then 307s to the landing.
// It touches NO database and adds no anon surface: the code is validated later, at workspace
// creation (the record_referral DEFINER, authenticated). A bad code simply writes no referral.
export async function GET(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const { code } = await ctx.params;
  const res = NextResponse.redirect(new URL("/", req.url), 307);
  const clean = (code ?? "").replace(/[^A-Za-z0-9]/g, "").slice(0, 16).toUpperCase();
  if (clean) res.cookies.set(REFERRAL_COOKIE, clean, { httpOnly: true, sameSite: "lax", maxAge: REFERRAL_COOKIE_DAYS * 24 * 3600, path: "/" });
  return res;
}
