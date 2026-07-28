"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cx } from "@/components/ui";

// Studio-scope nav — the prototype's .snav: full-bleed, sticky under the top bar,
// paper ground with a hairline base and an ink underline on the active tab.
// Surfaces past M4 (Contracts, Tasks, Calendar…) arrive with their milestones —
// absent, not stubbed.
export function StudioNav() {
  const t = useTranslations("studio");
  const tv = useTranslations("vendors");
  const tops = useTranslations("ops");
  const tc = useTranslations("contract");
  const path = usePathname();
  const items: { href: "/" | "/weddings" | "/venues" | "/vendors" | "/contracts" | "/tasks" | "/profile"; label: string }[] = [
    { href: "/", label: t("overview") },
    { href: "/weddings", label: t("weddings") },
    { href: "/venues", label: tv("venues") },
    { href: "/vendors", label: tv("vendors") },
    { href: "/contracts", label: tc("tab") },
    { href: "/tasks", label: tops("tasksTab") },
    { href: "/profile", label: t("profile") },
  ];
  return (
    <nav className="sticky top-[62px] z-40 flex gap-7 overflow-x-auto bg-paper px-8 [box-shadow:inset_0_-1px_0_var(--color-hairline)] md:px-10">
      {items.map((i) => {
        const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={cx(
              "whitespace-nowrap border-b-2 pb-[13px] pt-[15px] text-[13px]",
              active ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
