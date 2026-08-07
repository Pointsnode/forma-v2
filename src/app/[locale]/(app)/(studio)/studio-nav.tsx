"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cx } from "@/components/ui";

// Studio-scope nav — Edition One: CHARCOAL, continuous with the top bar and the cockpit
// hero band (one dark chrome). The current section wears the champagne underline; inactive
// items are quiet bone-alpha. Full-bleed, sticky under the top bar. Items + order are the
// law (the reference's nav is illustrative); routes unchanged.
export function StudioNav() {
  const t = useTranslations("studio");
  const tv = useTranslations("vendors");
  const tops = useTranslations("ops");
  const tc = useTranslations("contract");
  const tl = useTranslations("leads");
  const tq = useTranslations("quotes");
  const path = usePathname();
  // §A2 Team & Profile moved OUT of the section nav into the account menu (top bar); /team and
  // /profile are unchanged routes reached from the monogram menu. The section nav is the nine
  // studio surfaces, ordered as the funnel: leads become quotes become contracts.
  const items: { href: "/" | "/weddings" | "/venues" | "/vendors" | "/leads" | "/quotes" | "/contracts" | "/tasks" | "/calendar"; label: string }[] = [
    { href: "/", label: t("overview") },
    { href: "/weddings", label: t("weddings") },
    { href: "/venues", label: tv("venues") },
    { href: "/vendors", label: tv("vendors") },
    { href: "/leads", label: tl("tab") },
    { href: "/quotes", label: tq("tab") },
    { href: "/contracts", label: tc("tab") },
    { href: "/tasks", label: tops("tasksTab") },
    { href: "/calendar", label: t("calendar") },
  ];
  return (
    <nav className="sticky top-[62px] z-40 flex gap-7 overflow-x-auto bg-surface-chrome px-8 md:px-10">
      {items.map((i) => {
        const active = i.href === "/" ? path === "/" : path.startsWith(i.href);
        return (
          <Link
            key={i.href}
            href={i.href}
            className={cx(
              "whitespace-nowrap border-b-2 pb-[13px] pt-[15px] text-[13px] tracking-[0.04em] transition-colors",
              active ? "border-champagne text-bone" : "border-transparent text-[rgba(245,242,235,0.55)] hover:text-bone",
            )}
          >
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
