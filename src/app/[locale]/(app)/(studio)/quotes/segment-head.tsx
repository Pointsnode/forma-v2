"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { cx } from "@/components/ui";

// The quiet two-segment head shared by /contracts and /quotes — the same charcoal band sits
// above; this toggles the surface beneath it. No new top-nav item.
export function SegmentHead() {
  const t = useTranslations("quotes");
  const tc = useTranslations("contract");
  const path = usePathname();
  const segs = [
    { href: "/contracts" as const, label: tc("tab"), active: path === "/contracts" || path.startsWith("/contracts/") },
    { href: "/quotes" as const, label: t("tab"), active: path.startsWith("/quotes") },
  ];
  return (
    <div className="mb-5 flex gap-6 border-b border-hairline-token">
      {segs.map((s) => (
        <Link key={s.href} href={s.href} className={cx("-mb-px border-b-2 pb-2.5 text-[13px] tracking-[0.02em]", s.active ? "border-champagne text-text-primary" : "border-transparent text-text-meta hover:text-text-primary")}>
          {s.label}
        </Link>
      ))}
    </div>
  );
}
