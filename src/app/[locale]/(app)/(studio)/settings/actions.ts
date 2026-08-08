"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { APP_URL } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { currentWorkspace, loadMyGrants } from "@/lib/workspace";
import { conciergeSeatCount } from "@/lib/seats.mjs";
import { createSubscriptionCheckout, createPortalSession } from "@/lib/stripe";
import { REFERRAL_CASH_THRESHOLD_CENTS } from "@/lib/referral";

export type Result = { ok?: boolean; error?: string };

// REF-1: a member requests a redemption of referral credits. amount <= balance is enforced by
// the DEFINER (the security invariant); the cash >= $500 policy is enforced here + in the UI;
// nothing self-serve moves money (the owner settles/rejects in REF-2).
export async function requestRedemption(kind: "bill" | "cash", amountCents: number): Promise<Result> {
  if (kind !== "bill" && kind !== "cash") return { error: "invalid" };
  if (!Number.isInteger(amountCents) || amountCents <= 0) return { error: "invalid" };
  const supabase = await createClient();
  const ws = await currentWorkspace(supabase);
  if (!ws) return { error: "generic" };
  if (kind === "cash") {
    const { data: bal } = await supabase.rpc("referral_balance", { p_workspace: ws });
    if ((Number(bal) || 0) < REFERRAL_CASH_THRESHOLD_CENTS) return { error: "threshold" };
  }
  const { error } = await supabase.rpc("request_redemption", { p_workspace: ws, p_kind: kind, p_amount_cents: amountCents });
  if (error) return { error: error.code || "generic" };
  revalidatePath("/settings");
  return { ok: true };
}
export type UrlResult = { url?: string; error?: string };

function localePrefix(locale: string): string {
  return locale === routing.defaultLocale ? "" : `/${locale}`;
}

// The live roster for the current workspace (owner-readable via workspace_roster) →
// billable seats. conciergeSeats routes through the shared helper, gated on whether
// concierge is enabled, so Start bills exactly what Team/Settings display.
async function rosterSeats(supabase: Awaited<ReturnType<typeof createClient>>, ws: string): Promise<{ accounts: number; conciergeSeats: number }> {
  const [{ data }, { data: cs }] = await Promise.all([
    supabase.rpc("workspace_roster", { p_workspace: ws }),
    supabase.from("concierge_settings").select("enabled").eq("workspace_id", ws).maybeSingle(),
  ]);
  const rows = ((data ?? []) as { role: string; grants: string[] | null }[]);
  return { accounts: rows.length, conciergeSeats: conciergeSeatCount(rows, !!cs?.enabled) };
}

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

// The Night appearance preference, mirroring setLocalePref: persist profiles.appearance and
// write the `appearance` cookie (the no-flash path the (app) layout reads server-side). The
// client refreshes after this resolves so the server re-renders with the new data-theme.
const APPEARANCES = ["default", "bone", "night"] as const;
export async function setAppearancePref(appearance: string): Promise<Result> {
  if (!APPEARANCES.includes(appearance as (typeof APPEARANCES)[number])) return { error: "invalid" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) await supabase.from("profiles").update({ appearance }).eq("id", user.id);
  const jar = await cookies();
  jar.set("appearance", appearance, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  return { ok: true };
}

// ── §L3 automation — the two lead rules the planner authors (workspace-scoped upsert). ──
const LEAD_RULES = ["consult_confirm", "quiet_follow_up"] as const;
export async function saveLeadRules(rules: { rule: string; enabled: boolean; days: number }[]): Promise<Result> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const workspaceId = user ? await currentWorkspace(supabase) : null;
  if (!workspaceId) return { error: "generic" };
  const rows = rules
    .filter((r) => (LEAD_RULES as readonly string[]).includes(r.rule))
    .map((r) => ({ workspace_id: workspaceId, rule: r.rule, enabled: !!r.enabled, days: Math.min(30, Math.max(1, Number(r.days) || 4)) }));
  if (!rows.length) return { ok: true };
  const { error } = await supabase.from("lead_rules").upsert(rows, { onConflict: "workspace_id,rule" });
  if (error) { console.error(`saveLeadRules (${error.code}): ${error.message}`); return { error: "generic" }; }
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

// ── §F plan & billing: the studio's own Forma subscription ────────────────────────
// Owner-only. Reuses a stored stripe_customer_id (owner-readable) so a resubscribe keeps
// one customer. The client redirects to the returned Checkout URL. Quantities come from
// the live roster; the price is lib/pricing.ts (proven === seatBill inside stripe.ts).
export async function startSubscription(): Promise<UrlResult> {
  const supabase = await createClient();
  const ws = await currentWorkspace(supabase);
  if (!ws) return { error: "generic" };
  if (!(await loadMyGrants(supabase, ws)).includes("admin")) return { error: "forbidden" };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: sub } = await supabase.from("workspace_subscriptions").select("stripe_customer_id").eq("workspace_id", ws).maybeSingle();
  const { accounts, conciergeSeats } = await rosterSeats(supabase, ws);
  // REF-1: a referred workspace gets its first month free via the env-referenced coupon (inert
  // if STRIPE_REFERRAL_COUPON is unset, like the other Stripe env). Referred accounts are never
  // partner-attributed, so commission math is untouched by construction.
  const { data: referral } = await supabase.from("referrals").select("referred_workspace_id").eq("referred_workspace_id", ws).maybeSingle();
  const couponId = referral ? process.env.STRIPE_REFERRAL_COUPON ?? null : null;
  const locale = await getLocale();
  const base = `${APP_URL}${localePrefix(locale)}/settings`;
  try {
    const out = await createSubscriptionCheckout({
      workspaceId: ws,
      accounts,
      conciergeSeats,
      customerId: (sub?.stripe_customer_id as string | null) ?? null,
      customerEmail: user?.email ?? null,
      couponId,
      successUrl: `${base}?sub=started#plan`,
      cancelUrl: `${base}#plan`,
    });
    if (!out) return { error: "unconfigured" };
    return { url: out.url };
  } catch {
    return { error: "generic" };
  }
}

// Customer Portal — manage payment method / cancel. Owner-only; needs a stored customer.
export async function openBillingPortal(): Promise<UrlResult> {
  const supabase = await createClient();
  const ws = await currentWorkspace(supabase);
  if (!ws) return { error: "generic" };
  if (!(await loadMyGrants(supabase, ws)).includes("admin")) return { error: "forbidden" };
  const { data: sub } = await supabase.from("workspace_subscriptions").select("stripe_customer_id").eq("workspace_id", ws).maybeSingle();
  const customerId = sub?.stripe_customer_id as string | null;
  if (!customerId) return { error: "generic" };
  const locale = await getLocale();
  try {
    const out = await createPortalSession({ customerId, returnUrl: `${APP_URL}${localePrefix(locale)}/settings#plan` });
    if (!out) return { error: "unconfigured" };
    return { url: out.url };
  } catch {
    return { error: "generic" };
  }
}
