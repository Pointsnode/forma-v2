import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { updateSession } from "@/lib/supabase/middleware";

const intl = createIntlMiddleware(routing);
const PUBLIC = ["/sign-in", "/sign-up", "/reset", "/styleguide"];

export async function middleware(request: NextRequest) {
  // 1. next-intl handles locale routing and returns the base response.
  const response = intl(request);
  // 2. Refresh the Supabase session onto that response.
  const user = await updateSession(request, response);
  // 3. Protect the app shell: unauthenticated users off public routes -> sign-in.
  const path = request.nextUrl.pathname.replace(/^\/(en|es)(?=\/|$)/, "") || "/";
  const isPublic = PUBLIC.some((p) => path === p || path.startsWith(`${p}/`));
  if (!isPublic && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // Skip api, next internals, and files with an extension.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
