"use server";

import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: "invalid" | "generic" | "weak" | "mismatch" | "expired"; sent?: boolean } | null;

const creds = z.object({ email: z.string().email(), password: z.string().min(8).max(200) });

// Every link Forma emails must resolve to the APP origin (never the marketing site),
// honouring as-needed prefixing (the default locale carries no prefix). Origin is the
// M12 var; a redirectTo is inert until it's in Supabase's Redirect URLs allow-list.
function authOrigin(): string {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "";
}
function localePath(locale: string, path: string): string {
  return locale === routing.defaultLocale ? path : `/${locale}${path}`;
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = creds.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "invalid" };
  redirect({ href: "/", locale: await getLocale() });
  return null;
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = creds
    .extend({ displayName: z.string().trim().max(120).optional().or(z.literal("")) })
    .safeParse({ email: formData.get("email"), password: formData.get("password"), displayName: formData.get("displayName") ?? "" });
  if (!parsed.success) return { error: "invalid" };
  const locale = await getLocale();
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName || null, locale },
      emailRedirectTo: `${authOrigin()}${localePath(locale, "/")}`,
    },
  });
  if (error) return { error: "generic" };
  // Email confirmation on → no session yet. Tell the user to check their inbox
  // instead of redirecting to "/", which would bounce straight back to sign-in.
  if (!data.session) return { sent: true };
  redirect({ href: "/", locale });
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
    redirectTo: `${authOrigin()}${localePath(locale, "/reset/confirm")}`,
  });
  return { sent: true }; // always report sent (no account enumeration)
}

// Set a new password from a recovery session (established by /reset/confirm). In a
// "use server" file every export must be an async function (an `export const`
// action is silently dropped by Turbopack — the M13 lesson).
export async function setPassword(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (password.length < 8 || password.length > 200) return { error: "weak" };
  if (password !== confirm) return { error: "mismatch" };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "expired" }; // no live recovery session → the link lapsed
  redirect({ href: "/", locale: await getLocale() });
  return null;
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect({ href: "/sign-in", locale: await getLocale() });
}
