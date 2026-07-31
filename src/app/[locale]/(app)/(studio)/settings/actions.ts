"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { APP_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { currentWorkspace } from "@/lib/workspace";

export type Result = { ok?: boolean; error?: string };

// ── §B language & region ─────────────────────────────────────────────────────────
const REGION = z.object({
  timezone: z.string().min(1).max(64),
  dateFormat: z.enum(["auto", "DMY", "MDY", "YMD"]),
});

// A valid IANA zone only — a bad string would throw in Intl.DateTimeFormat({timeZone})
// at every date render for that account. Fall back to a membership check when the
// runtime lacks supportedValuesOf.
function isValidZone(tz: string): boolean {
  try {
    const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
    if (supported) return supported("timeZone").includes(tz);
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function saveRegion(timezone: string, dateFormat: string): Promise<Result> {
  const parsed = REGION.safeParse({ timezone, dateFormat });
  if (!parsed.success || !isValidZone(parsed.data.timezone)) return { error: "invalid" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "generic" };
  // Self-update only — the table-level profiles_update policy (id = auth.uid()) is the guard.
  const { error } = await supabase.from("profiles").update({ timezone: parsed.data.timezone, date_format: parsed.data.dateFormat }).eq("id", user.id);
  if (error) return { error: "generic" };
  revalidatePath("/settings");
  return { ok: true };
}

// Persist the locale choice AND set the NEXT_LOCALE cookie, so the preference survives
// reloads on the app surface (the middleware honours the cookie for signed-in users
// only — the marketing landing is untouched). The client navigates to the localized
// path after this resolves.
export async function setLocalePref(locale: string): Promise<Result> {
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) return { error: "invalid" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await supabase.from("profiles").update({ locale }).eq("id", user.id);
  const jar = await cookies();
  jar.set("NEXT_LOCALE", locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return { ok: true };
}

// ── §C account ─────────────────────────────────────────────────────────────────
export async function saveDisplayName(name: string): Promise<Result> {
  const clean = z.string().trim().min(1).max(120).safeParse(name);
  if (!clean.success) return { error: "invalid" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "generic" };
  const { error } = await supabase.from("profiles").update({ display_name: clean.data }).eq("id", user.id);
  if (error) return { error: "generic" };
  revalidatePath("/settings");
  return { ok: true };
}

// Triggers Supabase's email-change verification (confirmation to BOTH addresses). No
// plaintext handling here — the build never stores an email until Supabase confirms it.
export async function changeEmail(email: string): Promise<Result> {
  const parsed = z.string().email().safeParse(email);
  if (!parsed.success) return { error: "invalid" };
  const supabase = await createClient();
  const locale = await getLocale();
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  const { error } = await supabase.auth.updateUser(
    { email: parsed.data },
    { emailRedirectTo: `${APP_URL}${prefix}/settings` },
  );
  if (error) return { error: "generic" };
  return { ok: true };
}

// Kicks off the M2 recovery flow (a reset email to the account address). The build
// never sets or handles a password value — credentials are the user's to set.
export async function sendPasswordReset(): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "generic" };
  const locale = await getLocale();
  const prefix = locale === routing.defaultLocale ? "" : `/${locale}`;
  await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: `${APP_URL}${prefix}/reset/confirm` });
  return { ok: true };
}

// Sign out of EVERY session (scope 'global'), distinct from the menu's plain sign-out.
export async function signOutEverywhere(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "global" });
  redirect({ href: "/sign-in", locale: await getLocale() });
}

// ── §D privacy ───────────────────────────────────────────────────────────────────
// Assemble the workspace's own rows into a JSON string — RLS-scoped to exactly what the
// caller can already read, no new anon surface, no service-role. Any table that errors
// (absent / not readable) is skipped rather than failing the whole export.
const EXPORT_TABLES = [
  "weddings", "wedding_events", "guests", "event_guests", "wedding_vendors",
  "contracts", "ledger_lines", "tasks", "proposals", "meetings", "inquiries",
] as const;

export type ExportResult = { ok?: boolean; error?: string; json?: string; filename?: string };

export async function exportData(): Promise<ExportResult> {
  const supabase = await createClient();
  const ws = await currentWorkspace(supabase);
  if (!ws) return { error: "generic" };
  const bundle: Record<string, unknown> = { exported_at: new Date().toISOString(), workspace_id: ws };
  for (const table of EXPORT_TABLES) {
    const { data, error } = await supabase.from(table).select("*");
    if (!error && data) bundle[table] = data;
  }
  return { ok: true, json: JSON.stringify(bundle, null, 2), filename: `forma-export-${ws}.json` };
}

// Windowed, reversible deletion request — owner-only via workspaces_update
// (is_workspace_owner). NOT a purge: it sets the flag; the hard-delete is an ops step.
export async function requestDeletion(): Promise<Result> {
  const supabase = await createClient();
  const ws = await currentWorkspace(supabase);
  if (!ws) return { error: "generic" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("workspaces").update({ deletion_requested_at: new Date().toISOString(), deletion_requested_by: user?.id ?? null }).eq("id", ws);
  if (error) return { error: "generic" };
  revalidatePath("/settings");
  return { ok: true };
}

export async function undoDeletion(): Promise<Result> {
  const supabase = await createClient();
  const ws = await currentWorkspace(supabase);
  if (!ws) return { error: "generic" };
  const { error } = await supabase.from("workspaces").update({ deletion_requested_at: null, deletion_requested_by: null }).eq("id", ws);
  if (error) return { error: "generic" };
  revalidatePath("/settings");
  return { ok: true };
}
