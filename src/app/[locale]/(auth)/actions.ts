"use server";

import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: "invalid" | "generic"; sent?: boolean } | null;

const creds = z.object({ email: z.string().email(), password: z.string().min(8).max(200) });

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
    options: { data: { display_name: parsed.data.displayName || null, locale } },
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
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data);
  return { sent: true }; // always report sent (no account enumeration)
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect({ href: "/sign-in", locale: await getLocale() });
}
