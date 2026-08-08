import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { currentWorkspace } from "@/lib/workspace";
import { TopBar, type SwitcherWedding, heroTone } from "@/components/ui";
import { countdownDays, initials, phaseOrdinal, type Phase } from "@/lib/wedding";
import { ConciergeBubble } from "@/components/concierge/concierge-bubble";
import { BoardRailMount } from "@/components/board/board-rail-mount";
import { loadBudget, loadPendingCount } from "@/lib/concierge/session";

// Shared app chrome: the dark top bar (wordmark · workspace · wedding switcher ·
// planner monogram) wraps every studio and wedding surface. The studio nav row
// and the wedding masthead compose beneath it, full-bleed and sticky.
export default async function AppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [tp, tw] = [await getTranslations("phase"), await getTranslations("wedding")];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let workspaceName: string | null = null;
  let monogram = "··";
  let plannerName = "";
  let switcher: SwitcherWedding[] = [];
  let workspaceId: string | null = null;
  let boardWeddings: { id: string; name: string }[] = [];
  let concierge: { weddings: { id: string; name: string }[]; usage: { used: number; cap: number }; pending: number } | null = null;
  // §3 Appearance resolution (signed-in surfaces only — public/marketing routes are NOT in
  // this group, so they never receive the attribute and stay bone). The cookie is the
  // no-flash path (written on save + seeded on sign-in, mirroring NEXT_LOCALE); the profile
  // is the fallback. bone/null → no attribute (byte-for-byte today's render); night → the
  // dark register; default → follow the device via the prefers-color-scheme block in globals.
  let themeAttr: "night" | "default" | null = null;

  if (user) {
    const [{ data: prof }, wsId, { data: weds }] = await Promise.all([
      supabase.from("profiles").select("display_name, appearance").eq("id", user.id).maybeSingle(),
      currentWorkspace(supabase),
      supabase.from("weddings").select("id, couple_display, phase, date_start").order("date_start", { ascending: true, nullsFirst: false }),
    ]);
    const appearance = (await cookies()).get("appearance")?.value ?? (prof?.appearance as string | null) ?? null;
    themeAttr = appearance === "night" ? "night" : appearance === "default" ? "default" : null;
    plannerName = (prof?.display_name as string | null) ?? user.email ?? "";
    monogram = plannerMonogram(plannerName);
    workspaceId = wsId;
    if (wsId) {
      const { data: wsRow } = await supabase.from("workspaces").select("name").eq("id", wsId).maybeSingle();
      workspaceName = (wsRow?.name as string | null) ?? null;
    }
    const weddingRows = (weds ?? []) as { id: string; couple_display: string; phase: Phase; date_start: string | null }[];
    boardWeddings = weddingRows.map((w) => ({ id: w.id, name: w.couple_display }));
    switcher = weddingRows.map((w) => {
      const days = countdownDays(w.date_start);
      const meta = `${tp("ordinal", { n: phaseOrdinal(w.phase) })} · ${tp(w.phase)}${days != null ? ` · ${days} ${tw("days")}` : ""}`;
      return { id: w.id, initials: initials(w.couple_display), name: w.couple_display, meta, tone: heroTone(w.id) };
    });

    // Concierge is per-workspace entitlement — absent (not fake) when disabled.
    if (workspaceId) {
      const budget = await loadBudget(supabase, workspaceId);
      if (budget.enabled) {
        const pending = await loadPendingCount(supabase);
        concierge = { weddings: weddingRows.map((w) => ({ id: w.id, name: w.couple_display })), usage: { used: budget.used, cap: budget.cap }, pending };
      }
    }
  }

  return (
    <div {...(themeAttr ? { "data-theme": themeAttr } : {})} className={themeAttr ? "min-h-screen bg-surface-page text-text-primary" : undefined}>
      {user ? <TopBar workspaceName={workspaceName} weddings={switcher} monogram={monogram} workspaceId={workspaceId} /> : null}
      <main>{children}</main>
      {user && concierge && workspaceId ? (
        <ConciergeBubble weddings={concierge.weddings} usage={concierge.usage} initialPending={concierge.pending} />
      ) : null}
      {user && workspaceId ? (
        <BoardRailMount workspaceId={workspaceId} selfId={user.id} weddings={boardWeddings} locale={locale} />
      ) : null}
    </div>
  );
}

function plannerMonogram(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase() || "··";
}
