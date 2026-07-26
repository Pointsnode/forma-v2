"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cx } from "@/components/ui";

// Studio-scope nav. M1 has two real surfaces — Overview and Weddings. Other
// studio tabs (Venues, Vendors, Contracts…) arrive with their milestones; we
// render nothing for them rather than a dead stub (absent, not fake).
export function StudioNav() {
  const t = useTranslations("studio");
  const path = usePathname();
  const items: { href: "/" | "/weddings"; label: string }[] = [
    { href: "/", label: t("overview") },
    { href: "/weddings", label: t("weddings") },
  ];
  return (
    <nav className="flex items-center gap-7 pb-3 text-[14px] [box-shadow:inset_0_-1px_0_var(--color-hairline)]">
      {items.map((i) => {
        const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
        return (
          <Link key={i.href} href={i.href} className={cx(active ? "text-ink" : "text-muted hover:text-ink")}>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
