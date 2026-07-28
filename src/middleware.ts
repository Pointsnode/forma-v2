import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { signInRedirectPath } from "@/lib/auth-redirect.mjs";
import { updateSession } from "@/lib/supabase/middleware";

const intl = createIntlMiddleware(routing);
// "/" is the M12 landing (the storefront) for signed-out visitors — crawlable.
// /planners + /p are the M10 public directory. /menu and /sign remain tokenized-
// public via their own guards; the directory + landing are fully open.
const PUBLIC = ["/", "/sign-in", "/sign-up", "/reset", "/styleguide", "/rsvp", "/planners", "/p"];

export async function middleware(request: NextRequest) {
  // 1. next-intl handles locale routing and returns the base response.
  const response = intl(request);
  // 2. Refresh the Supabase session onto that response.
  const user = await updateSession(request, response);
  // 3. Protect the app shell: unauthenticated users off public routes -> sign-in.
  const path = request.nextUrl.pathname.replace(/^\/(en|es)(?=\/|$)/, "") || "/";
  const isPublic = PUBLIC.some((p) => (p === "/" ? path === "/" : path === p || path.startsWith(`${p}/`)));
  if (!isPublic && !user) {
    const url = request.nextUrl.clone();
    // Locale-aware bounce: /es/* -> /es/sign-in, unprefixed -> /sign-in.
    url.pathname = signInRedirectPath(request.nextUrl.pathname, routing.locales, routing.defaultLocale);
    return NextResponse.redirect(url);
  }
  // Signed-out root → the public landing (internal rewrite; the URL stays "/").
  // Signed-in root falls through to the cockpit. The landing route is never exposed
  // as its own URL — only reachable via this rewrite, so there's no duplicate of "/".
  if (path === "/" && !user) {
    const prefix = request.nextUrl.pathname.match(/^\/(en|es)(?=\/|$)/)?.[0] ?? "";
    const url = request.nextUrl.clone();
    url.pathname = `${prefix}/landing`;
    return NextResponse.rewrite(url);
  }
  return response;
}

export const config = {
  // Skip api, next internals, and files with an extension.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
