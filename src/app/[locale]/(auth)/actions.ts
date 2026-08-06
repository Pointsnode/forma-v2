"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { safeNextPath } from "@/lib/auth-redirect.mjs";
import { APP_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: "invalid" | "generic" | "weak" | "mismatch" | "expired"; sent?: boolean } | null;

const creds = z.object({ email: z.string().email(), password: z.string().min(8).max(200) });

// Every link Forma emails resolves to APP_URL (the app origin, never the marketing
// site), honouring as-needed prefixing (the default locale carries no prefix). APP_URL
// (from env.ts) carries the VERCEL_URL fallback previews depend on — a hand-rolled
// NEXT_PUBLIC_APP_URL||NEXT_PUBLIC_SITE_URL would be "" on a preview and send a
// relative redirect Supabase refuses. A redirectTo is inert until it's in Supabase's
// Redirect URLs allow-list.
function localePath(locale: string, path: string): string {
  return locale === routing.defaultLocale ? path : `/${locale}${path}`;
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = creds.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "invalid" };
  // §B3 — seed the locale on first authenticated load: honour the saved profiles.locale
  // by setting NEXT_LOCALE (the middleware then keeps the app surface in that locale) and
  // landing directly in it, so a Spanish account doesn't flash English before redirecting.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: prof } = user ? await supabase.from("profiles").select("locale, appearance").eq("id", user.id).maybeSingle() : { data: null };
  // Follow the PROFILE, not the URL the user happened to sign in from — signing in on an
  // /es page with profiles.locale='en' must not seed an es cookie (it would diverge until
  // the next toggle). Fall back to the URL locale only when the profile has none.
  const profLocale = prof?.locale as string | null;
  const savedLocale = profLocale === "es" || profLocale === "en" ? profLocale : await getLocale();
  if (savedLocale === "es") (await cookies()).set("NEXT_LOCALE", "es", { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  // Seed the appearance the same way, so a night account renders dark on its first
  // authenticated paint (no flash of bone). null profile → no cookie → bone (the default).
  const appearance = prof?.appearance as string | null;
  if (appearance) (await cookies()).set("appearance", appearance, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  // Return to the validated deep-link if one rode in (e.g. /join/team/<token>), else the
  // cockpit. safeNextPath rejects anything non-relative, so this can't be an open redirect.
  redirect({ href: safeNextPath(formData.get("next")) ?? "/", locale: savedLocale });
  return null;
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = creds
    .extend({ displayName: z.string().trim().max(120).optional().or(z.literal("")) })
    .safeParse({ email: formData.get("email"), password: formData.get("password"), displayName: formData.get("displayName") ?? "" });
  if (!parsed.success) return { error: "invalid" };
  const locale = await getLocale();
  // Sign-up gets no independent next logic — it routes through the same validated path:
  // carried onto the confirmed sign-in card's ?next, and used directly if a session lands.
  const next = safeNextPath(formData.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName || null, locale },
      // Land on the sign-in card (confirmed) — Supabase's /verify redirects with a
      // ?code that nothing exchanges, so "/" would have no session and bounce to the
      // landing. Sign-in is what the confirmSent copy already promises. (DoD 8 amended
      // from "cockpit" to "sign-in": genuine signed-in landing needs the token-hash
      // handler and is deferred.)
      emailRedirectTo: `${APP_URL}${localePath(locale, "/sign-in")}${next ? `?next=${encodeURIComponent(next)}` : ""}`,
    },
  });
  if (error) return { error: "generic" };
  // Email confirmation on → no session yet. Tell the user to check their inbox
  // instead of redirecting to "/", which would bounce straight back to sign-in.
  if (!data.session) return { sent: true };
  redirect({ href: next ?? "/", locale });
  return null;
}

export async function requestReset(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = z.string().email().safeParse(formData.get("email"));
  if (!email.success) return { error: "invalid" };
  const locale = await getLocale();
  const supabase = await createClient();
  // The link must land on /reset/confirm (the page that sets a new password) at the
  // app origin — without this it fell back to the Site URL (the marketing landing),
  // where nothing consumed the recovery session. Locale-correct so es links keep /es.
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${APP_URL}${localePath(locale, "/reset/confirm")}`,
  });
  return { sent: true }; // always report sent (no account enumeration)
}

// Set a new password. The recovery token arrives as a hidden field and is exchanged
// for a session HERE — a server action can set the session cookie; a Server Component
// render cannot (server.ts swallows the throw), which is why exchanging at render
// produced a form that could never succeed. Password validation runs BEFORE the token
// is spent, so a weak/mismatched password can be retried on the same link. Both link
// shapes work: token_hash (device-independent) and code (same-browser PKCE). In a
// "use server" file every export must be an async function (Turbopack drops
// `export const` — the M13 lesson).
export async function setPassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8 || password.length > 200) return { error: "weak" };
  if (password !== confirm) return { error: "mismatch" };
  const supabase = await createClient();

  const tokenHash = String(formData.get("token_hash") ?? "");
  const code = String(formData.get("code") ?? "");
  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ type: "recovery", token_hash: tokenHash });
    if (error) return { error: "expired" };
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { error: "expired" };
  } else {
    return { error: "expired" };
  }

  // The token is spent by now, so a failure HERE is not an expired link — it's the
  // password itself (e.g. Supabase's policy rejecting it as unchanged / too short).
  // "generic" is honest; saying "expired" would manufacture the state it describes.
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "generic" };
  redirect({ href: "/", locale: await getLocale() });
  return null;
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect({ href: "/sign-in", locale: await getLocale() });
}
