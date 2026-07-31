import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { signInRedirectPath, safeNextPath } from "@/lib/auth-redirect.mjs";
import { updateSession } from "@/lib/supabase/middleware";

const intl = createIntlMiddleware(routing);
// "/" is the M12 landing (the storefront) for signed-out visitors — crawlable.
// /planners + /p are the M10 public directory. /menu and /sign remain tokenized-
// public via their own guards; the directory + landing are fully open.
// /join/team is public so a signed-out invitee lands on the page (which shows a
// neutral "sign in to view this invitation" + ?next) instead of a bounce that drops
// the token — the page itself reveals zero invite detail until signed in (matrix stays 10).
const PUBLIC = ["/", "/sign-in", "/sign-up", "/reset", "/styleguide", "/rsvp", "/planners", "/p", "/join/team"];

export async function middleware(request: NextRequest) {
  // 1. next-intl handles locale routing and returns the base response.
  const response = intl(request);
  // 2. Refresh the Supabase session onto that response.
  const user = await updateSession(request, response);
  // 3. Protect the app shell: unauthenticated users off public routes -> sign-in.
  const prefix = request.nextUrl.pathname.match(/^\/(en|es)(?=\/|$)/)?.[0] ?? "";
  const path = request.nextUrl.pathname.replace(/^\/(en|es)(?=\/|$)/, "") || "/";

  // Carry the rotated sb-* auth cookies updateSession wrote onto `response` across a
  // fresh redirect — a redirect for a SIGNED-IN user that drops them discards a token
  // rotation and silently logs the user out on the next refresh (the Supabase-SSR
  // footgun). Only redirects that can run while signed-in need this.
  const withSession = (url: URL) => {
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  // The landing is never exposed as its own URL: a DIRECT hit on /landing (any locale,
  // signed-in or out) redirects to the locale root, which serves the landing (signed-
  // out) or the cockpit (signed-in) at the canonical "/".
  if (path === "/landing") {
    const url = request.nextUrl.clone();
    url.pathname = prefix || "/";
    return withSession(url);
  }

  const isPublic = PUBLIC.some((p) => (p === "/" ? path === "/" : path === p || path.startsWith(`${p}/`)));
  if (!isPublic && !user) {
    const url = request.nextUrl.clone();
    // Locale-aware bounce: /es/* -> /es/sign-in, unprefixed -> /sign-in.
    url.pathname = signInRedirectPath(request.nextUrl.pathname, routing.locales, routing.defaultLocale);
    // Carry the intended (locale-stripped) destination so sign-in can return there —
    // the invite deep-link /join/team/<token> depended on this and it was being dropped.
    // Drop any incoming query first, then set only a validated relative next.
    url.search = "";
    const next = safeNextPath(path);
    if (next && next !== "/") url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }
  // Signed-out root → the public landing (internal rewrite; the URL stays "/").
  // Only the CANONICAL roots rewrite — "/" (default locale) and "/es"; a bare "/en"
  // is left to next-intl's as-needed redirect to "/", so there's no /en duplicate.
  // Signed-in root falls through to the cockpit. The rewrite target MUST carry a
  // locale segment: "/" rewrites to `/{defaultLocale}/landing`, else the single
  // "landing" segment is read as the [locale] param and hasLocale() 404s (the gate blocker).
  const prefixedRoots = routing.locales.filter((l) => l !== routing.defaultLocale).map((l) => `/${l}`);
  const isCanonicalRoot = request.nextUrl.pathname === "/" || prefixedRoots.includes(request.nextUrl.pathname);
  if (isCanonicalRoot && !user) {
    const loc = request.nextUrl.pathname === "/" ? routing.defaultLocale : request.nextUrl.pathname.slice(1);
    const url = request.nextUrl.clone();
    url.pathname = `/${loc}/landing`;
    return NextResponse.rewrite(url);
  }

  // §B3 — app-only locale honouring. A SIGNED-IN user whose saved locale is Spanish
  // (NEXT_LOCALE=es) hitting an unprefixed (default-locale) path is sent to the /es
  // equivalent, so the Settings language choice survives reloads and deep-links without
  // typing /es. Gated on `user`, so the signed-out marketing landing keeps its own EN/ES
  // toggle and is never redirected (we deliberately do NOT enable next-intl's global
  // localeDetection, which would also govern the landing). No loop: an /es path already
  // has `prefix` set and is skipped; 'en' is the unprefixed default so only 'es' redirects.
  if (user && !prefix && request.cookies.get("NEXT_LOCALE")?.value === "es") {
    const url = request.nextUrl.clone();
    url.pathname = request.nextUrl.pathname === "/" ? "/es" : `/es${request.nextUrl.pathname}`;
    // Signed-in hot path — must carry the rotated auth cookies (see withSession above).
    return withSession(url);
  }
  return response;
}

export const config = {
  // Skip api, next internals, and files with an extension.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
