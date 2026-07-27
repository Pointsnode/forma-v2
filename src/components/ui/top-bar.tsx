"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cx } from "./cn";
import { signOut } from "@/app/[locale]/(auth)/actions";

export type SwitcherWedding = { id: string; initials: string; name: string; meta: string; tone: string };

// The global dark top bar — wordmark, workspace identity, the wedding switcher
// (drives navigation) and the planner monogram. Full-bleed, sticky. Wraps every
// studio and wedding surface via the app layout.
export function TopBar({
  workspaceName,
  weddings,
  monogram,
}: {
  workspaceName: string | null;
  weddings: SwitcherWedding[];
  monogram: string;
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
      <Link href="/" className="leading-none">
        <span className="font-display text-[26px] tracking-[0.04em] text-bone">{t("name")}</span>
        <span className="mt-[-3px] block text-[7.5px] uppercase tracking-[0.42em] text-[#B8AFA2]">{t("tagline")}</span>
      </Link>

      {workspaceName ? (
        <Link href="/" className="border-l border-hairline-dark pl-5 text-[12px] text-[#B8AFA2] hover:opacity-90">
          <b className="block text-[13px] font-medium text-bone">{workspaceName}</b>
          {ts("plannerStudio")}
        </Link>
      ) : null}

      <div className="flex-1" />

      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2.5 rounded-full bg-[#1E1E1E] px-4 py-2 text-[12.5px] text-bone"
        >
          <span>{label}</span>
          <span className="text-[9px] text-[#948C7F]">▼</span>
        </button>
        {open ? (
          <>
            <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setOpen(false)} />
            <div className="absolute right-0 top-[46px] z-20 min-w-[300px] overflow-hidden rounded-2xl bg-paper text-ink shadow-hero">
              {/* session-aware: the studio entry exists only for a workspace member */}
              {workspaceName ? (
                <Link
                  href="/"
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 text-[12.5px] not-last:[box-shadow:inset_0_-1px_0_var(--color-hairline)] hover:bg-bone"
                >
                  <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-ink text-[9px] font-semibold text-bone">{monogram}</span>
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
                  <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-[9px] font-semibold text-bone" style={{ background: w.tone }}>{w.initials}</span>
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

      {/* §1F: the monogram is a menu — Sign out lives here now; Billing when a
          workspace exists; Profile/Settings/Admin arrive with their milestones. */}
      <div className="relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-sand text-[12px] font-semibold text-ink"
        >
          {monogram}
        </button>
        {menuOpen ? (
          <>
            <button className="fixed inset-0 z-10 cursor-default" aria-hidden onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 top-[46px] z-20 min-w-[180px] overflow-hidden rounded-2xl bg-paper text-ink shadow-hero">
              {workspaceName ? (
                <Link href="/billing" onClick={() => setMenuOpen(false)} className="block px-4 py-3 text-[12.5px] [box-shadow:inset_0_-1px_0_var(--color-hairline)] hover:bg-bone">
                  {t("billing")}
                </Link>
              ) : null}
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
