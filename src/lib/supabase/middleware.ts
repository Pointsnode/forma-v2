import { createServerClient } from "@supabase/ssr";
import type { NextRequest, NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "@/lib/env";

/** Refreshes the auth session, writing rotated cookies onto `response`, and
 *  returns the current user (or null). Never trust getSession in middleware —
 *  getUser revalidates against the auth server. */
export async function updateSession(request: NextRequest, response: NextResponse) {
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

/** Like updateSession, but also reports whether the user is a platform admin — the
 *  /admin door's defense-in-depth check (the admin layout re-checks server-side; the
 *  mutation routes will re-check again). RLS makes the platform_admins select return the
 *  user's own row iff they are an admin, and nothing otherwise. */
export async function adminSession(request: NextRequest, response: NextResponse): Promise<{ user: unknown; isAdmin: boolean }> {
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, isAdmin: false };
  const { data } = await supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  return { user, isAdmin: !!data };
}
