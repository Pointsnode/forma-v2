import { setRequestLocale, getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { currentWorkspace, loadMyGrants } from "@/lib/workspace";
import { loadBudget } from "@/lib/concierge/session";
import { conciergeSeatCount } from "@/lib/seats.mjs";
import { stripeConfigured } from "@/lib/stripe";
import { SITE_URL } from "@/lib/env";
import type { DateFormat } from "@/lib/format-date";
import { SettingsView, type SettingsData } from "./settings-view";
import type { ReferralData } from "./referrals-section";

// §A3 — the single Settings surface: sectioned (Language · Plan · Account · Privacy ·
// Usage), workspace-gated sections hidden for a non-workspace user (a couple gets
// Language + Account only). One page, in-page nav; /settings#plan opens Plan.
export default async function SettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const lang = await getLocale();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: prof } = await supabase.from("profiles").select("display_name, locale, timezone, date_format, appearance").eq("id", user!.id).maybeSingle();

  const workspaceId = await currentWorkspace(supabase);
  let plan: SettingsData["plan"] = null;
  let usage: SettingsData["usage"] = null;
  let subscription: SettingsData["subscription"] = null;
  let isOwner = false;
  let deletionRequestedAt: string | null = null;
  let leadRules: SettingsData["leadRules"] = [];
  let referral: SettingsData["referral"] = null;

  if (workspaceId) {
    const { data: ruleRows } = await supabase.from("lead_rules").select("rule, enabled, days").eq("workspace_id", workspaceId);
    leadRules = (ruleRows ?? []) as SettingsData["leadRules"];
    const [{ data: rosterRows }, grants, budget, { data: wsRow }, { data: subRow }] = await Promise.all([
      supabase.rpc("workspace_roster", { p_workspace: workspaceId }),
      loadMyGrants(supabase, workspaceId),
      loadBudget(supabase, workspaceId),
      supabase.from("workspaces").select("deletion_requested_at").eq("id", workspaceId).maybeSingle(),
      // Owner-select only (0019 RLS); a non-owner read simply returns null → treated as 'none'.
      supabase.from("workspace_subscriptions").select("status, current_period_end").eq("workspace_id", workspaceId).maybeSingle(),
    ]);
    const roster = ((rosterRows ?? []) as { role: string; grants: string[] | null }[]);
    const conciergeSeats = conciergeSeatCount(roster, budget.enabled);
    plan = { accounts: roster.length, conciergeSeats };
    usage = { used: budget.used, cap: budget.cap };
    isOwner = grants.includes("admin");
    deletionRequestedAt = (wsRow?.deletion_requested_at as string | null) ?? null;
    subscription = {
      status: (subRow?.status as string | null) ?? "none",
      currentPeriodEnd: (subRow?.current_period_end as string | null) ?? null,
    };

    // REF-1: the referral surface. ensure_referral_code mints (idempotently) on first visit.
    const [{ data: code }, { data: funnel }, { data: balance }, { data: redemptions }] = await Promise.all([
      supabase.rpc("ensure_referral_code", { p_workspace: workspaceId }),
      supabase.rpc("referral_funnel", { p_workspace: workspaceId }),
      supabase.rpc("referral_balance", { p_workspace: workspaceId }),
      supabase.from("referral_redemptions").select("id, kind, amount_cents, status, reference, created_at").eq("workspace_id", workspaceId).order("created_at", { ascending: false }),
    ]);
    referral = {
      link: `${SITE_URL}/r/${(code as string) ?? ""}`,
      code: (code as string) ?? "",
      funnel: (Array.isArray(funnel) ? funnel : []) as ReferralData["funnel"],
      balanceCents: Number(balance) || 0,
      redemptions: (redemptions ?? []) as ReferralData["redemptions"],
    };
  }

  const data: SettingsData = {
    locale: lang,
    appearance: ((prof?.appearance as SettingsData["appearance"] | null) ?? "bone"),
    leadRules,
    hasWorkspace: workspaceId != null,
    isOwner,
    displayName: (prof?.display_name as string | null) ?? "",
    email: user?.email ?? "",
    timezone: (prof?.timezone as string | null) ?? "America/Mexico_City",
    dateFormat: ((prof?.date_format as DateFormat | null) ?? "auto"),
    plan,
    usage,
    subscription,
    stripeConfigured: stripeConfigured(),
    deletionRequestedAt,
    referral,
  };

  return <SettingsView data={data} />;
}
