"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AdminAuthState = { error?: "invalid" } | null;

const creds = z.object({ email: z.string().email(), password: z.string().min(8).max(200) });

// The admin sign-in. Plain Supabase auth (no second identity system); the /admin gate
// (middleware + layout) decides what a signed-in user may see. Non-localized redirect
// straight back to /admin, where the layout renders the shell (admin) or a 404 (not).
export async function adminSignIn(_prev: AdminAuthState, formData: FormData): Promise<AdminAuthState> {
  const parsed = creds.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: "invalid" };
  redirect("/admin");
}

export async function adminSignOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin");
}
