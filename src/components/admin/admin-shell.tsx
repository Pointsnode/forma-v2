"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { DomainStar, cx } from "@/components/ui";
import { adminSignOut } from "@/app/(admin)/admin/actions";

// The eight ADM surfaces, sidebar order = spec order. Non-localized next/link (NOT the
// i18n Link — /admin has no locale prefix).
const NAV: { href: string; label: string }[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/commissions", label: "Commissions" },
  { href: "/admin/payouts", label: "Payouts" },
  { href: "/admin/reports", label: "Reports" },
  { href: "/admin/partners", label: "Partners" },
  { href: "/admin/audit", label: "Audit" },
];

export function AdminShell({ role, children }: { role: "owner" | "partner"; children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-[212px] shrink-0 flex-col border-r border-hairline-token px-4 py-6">
        <div className="flex items-center gap-2 px-2">
          <DomainStar size={16} />
          <span className="font-display text-[16px] text-ink">Forma</span>
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-text-meta">Admin</span>
        </div>
        <nav className="mt-7 flex flex-col gap-0.5">
          {NAV.map((i) => {
            const active = i.href === "/admin" ? pathname === "/admin" : pathname.startsWith(i.href);
            return (
              <Link key={i.href} href={i.href}
                className={cx(
                  "rounded-[var(--radius)] border-l-2 px-3 py-2 text-[13px] transition-colors",
                  active ? "border-teal bg-surface-card text-teal" : "border-transparent text-text-primary hover:bg-surface-card",
                )}>
                {i.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto px-2 pt-6">
          <p className="text-[11px] uppercase tracking-[0.14em] text-text-meta">{role}</p>
          <form action={adminSignOut}>
            <button type="submit" className="mt-1.5 text-[12.5px] text-text-primary hover:text-ink">Sign out</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-8 md:px-10">{children}</main>
    </div>
  );
}
