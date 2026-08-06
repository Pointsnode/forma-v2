"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cx } from "./cn";
import { Wordmark } from "./primitives";
import { signOut } from "@/app/[locale]/(auth)/actions";
import { QuickAddTask } from "@/components/tasks/quick-add";

export type SwitcherWedding = { id: string; initials: string; name: string; meta: string; tone: string };

// The global dark top bar — wordmark, workspace identity, the wedding switcher
// (drives navigation) and the planner monogram. Full-bleed, sticky. Wraps every
// studio and wedding surface via the app layout.
export function TopBar({
  workspaceName,
  weddings,
  monogram,
  workspaceId,
}: {
  workspaceName: string | null;
  weddings: SwitcherWedding[];
  monogram: string;
  workspaceId?: string | null;
}) {
  const t = useTranslations("app");
  const ts = useTranslations("studio");
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const activeId = path.startsWith("/wedding/") ? path.split("/")[2] : null;
  const active = activeId ? weddings.find((w) => w.id === activeId) : null;
  const label = active ? active.name : ts("allWeddings");

  return (
    <div className="sticky top-0 z-50 flex h-[62px] items-center gap-7 bg-ink px-8 text-bone">
      <Link href="/" aria-label={t("name")}>
        <Wordmark size={20} className="!text-bone" />
      </Link>

      {workspaceName ? (
        <Link href="/" className="border-l border-hairline-dark pl-5 text-[12px] text-[#B8AFA2] hover:opacity-90">
          <b className="block text-[13px] font-medium text-bone">{workspaceName}</b>
          {ts("plannerStudio")}
        </Link>
      ) : null}

      <div className="flex-1" />

      {workspaceId ? (
        <QuickAddTask weddings={weddings.map((w) => ({ id: w.id, name: w.name }))} workspaceId={workspaceId} defaultWeddingId={activeId ?? undefined} />
      ) : null}

      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2.5 rounded-[var(--radius)] bg-[#1E1E1E] px-4 py-2 text-[12.5px] text-bone"
        >
          <span>{label}</span>
          <span className="text-[9px] text-[#948C7F]">▼</span>
        </button>
        {open ? (
          <>
            <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-[46px] z-20 min-w-[300px] overflow-hidden rounded-[var(--radius)] border border-hairline bg-bone text-ink">
              {/* session-aware: the studio entry exists only for a workspace member */}
              {workspaceName ? (
                <Link
                  href="/"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-[12.5px] not-last:[box-shadow:inset_0_-1px_0_var(--color-hairline)] hover:bg-bone"
                >
                  <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[var(--radius)] bg-ink text-[9px] font-semibold text-bone">{monogram}</span>
                  <span>
                    <span className="block font-medium">{ts("switcherStudio")}</span>
                    <span className="block text-[11px] text-muted">{ts("switcherStudioHint")}</span>
                  </span>
                </Link>
              ) : null}
              {weddings.map((w) => (
                <Link
                  key={w.id}
                  href={`/wedding/${w.id}`}
                  onClick={() => setOpen(false)}
                  className={cx(
                    "flex items-center gap-3 px-4 py-3 text-[12.5px] not-last:[box-shadow:inset_0_-1px_0_var(--color-hairline)] hover:bg-bone",
                    active?.id === w.id && "bg-bone",
                  )}
                >
                  <span className="flex h-[26px] w-[26px] items-center justify-center rounded-[var(--radius)] text-[9px] font-semibold text-bone" style={{ background: w.tone }}>{w.initials}</span>
                  <span>
                    <span className="block font-medium">{w.name}</span>
                    <span className="block text-[11px] text-muted">{w.meta}</span>
                  </span>
                </Link>
              ))}
            </div>
          </>
        ) : null}
      </div>

      {/* §A the monogram is the account menu. Workspace members get Team · Profile ·
          Manage plan · Settings; a non-workspace user (a couple on a wedding surface)
          sees only Settings + Sign out. Every item lands on a real page. */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-[34px] w-[34px] items-center justify-center rounded-[var(--radius)] border border-hairline-dark font-display text-[13px] text-bone"
        >
          {monogram}
        </button>
        {menuOpen ? (
          <>
            <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-[46px] z-20 min-w-[200px] overflow-hidden rounded-[var(--radius)] border border-hairline bg-bone text-ink">
              {workspaceName ? (
                <>
                  <MenuLink href="/team" label={ts("team")} onNavigate={() => setMenuOpen(false)} />
                  <MenuLink href="/profile" label={ts("profile")} onNavigate={() => setMenuOpen(false)} />
                  <MenuLink href="/settings#plan" label={t("managePlan")} onNavigate={() => setMenuOpen(false)} />
                </>
              ) : null}
              <MenuLink href="/settings" label={t("settings")} onNavigate={() => setMenuOpen(false)} />
              <div className="[box-shadow:inset_0_-1px_0_var(--color-hairline)]" />
              <form action={signOut}>
                <button type="submit" className="w-full px-4 py-3 text-left text-[12.5px] text-muted hover:bg-bone hover:text-ink">
                  {t("signOut")}
                </button>
              </form>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

// A hairline account-menu row. Kept local so every item shares the paper-panel voice.
function MenuLink({ href, label, onNavigate }: { href: string; label: string; onNavigate: () => void }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="block px-4 py-3 text-[12.5px] not-last:[box-shadow:inset_0_-1px_0_var(--color-hairline)] hover:bg-bone"
    >
      {label}
    </Link>
  );
}
