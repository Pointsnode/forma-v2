import { setRequestLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { currentWorkspace, loadMyGrants } from "@/lib/workspace";
import { loadBudget } from "@/lib/concierge/session";
import { conciergeSeatCount } from "@/lib/seats.mjs";
import { Card } from "@/components/ui";
import { TeamView, type RosterMember, type PendingInvite } from "./team-view";

// §F/§H studio surface: the roster with per-account clearance boxes, the invite form, the
// honest seat panel, and (admin-only) concierge settings. Authority is enforced in the
// function lane — this page hides admin controls for non-admins (a courtesy, not a gate).
export default async function TeamPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("team");
  const supabase = await createClient();

  const workspaceId = await currentWorkspace(supabase);
  if (!workspaceId) {
    return (
      <Card>
        <p className="py-6 text-center font-accent text-[16px] text-text-meta">{t("noWorkspace")}</p>
      </Card>
    );
  }

  const grants = await loadMyGrants(supabase, workspaceId);
  const isAdmin = grants.includes("admin");

  const nowISO = new Date().toISOString();
  const [{ data: rosterRows }, invitesRes, budget, { count: weddingsCount }] = await Promise.all([
    supabase.rpc("workspace_roster", { p_workspace: workspaceId }),
    // Pending invites are admin-only under RLS; a non-admin select simply returns nothing.
    isAdmin
      ? supabase.from("workspace_invites").select("id, email, grants, title, token, expires_at").eq("workspace_id", workspaceId).is("accepted_at", null).gt("expires_at", nowISO).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] as PendingInvite[] }),
    loadBudget(supabase, workspaceId),
    supabase.from("weddings").select("id", { count: "exact", head: true }),
  ]);

  const roster: RosterMember[] = ((rosterRows ?? []) as {
    user_id: string; display_name: string | null; avatar_url: string | null; email: string;
    role: string; grants: string[] | null; title: string | null; joined: string;
  }[]).map((m) => ({
    userId: m.user_id,
    name: m.display_name ?? m.email,
    email: m.email,
    avatarUrl: m.avatar_url,
    // role='owner' ⟺ admin box (kept in sync by the functions) — surface it as the box.
    grants: m.role === "owner" ? ["admin"] : (m.grants ?? []),
    title: m.title,
    joined: m.joined,
  }));

  const pending = ((invitesRes.data ?? []) as {
    id: string; email: string; grants: string[] | null; title: string | null; token: string; expires_at: string;
  }[]).map((i) => ({ id: i.id, email: i.email, grants: i.grants ?? [], title: i.title, token: i.token, expiresAt: i.expires_at }));

  // Count from the RAW roster rows (role + real grants) via the shared helper — not the
  // display-mapped `roster` — so Team's number is the same call the billing path makes.
  const conciergeSeats = conciergeSeatCount(rosterRows as { role: string; grants: string[] | null }[], budget.enabled);

  return (
    <TeamView
      locale={locale}
      isAdmin={isAdmin}
      roster={roster}
      pending={pending}
      accounts={roster.length}
      conciergeSeats={conciergeSeats}
      weddingsCount={weddingsCount ?? 0}
      concierge={{ enabled: budget.enabled, used: budget.used, cap: budget.cap }}
    />
  );
}
