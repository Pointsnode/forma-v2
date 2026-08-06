"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { DomainStar } from "@/components/ui";
import { takeToDesk } from "./leads-actions";

type Arrival = { id: string; name: string; snippet: string; when: string };

// The porch on the desk: directory inquiries that are not yet leads. One action per row takes
// the inquiry to the desk (creates the lead, carries the message), and it leaves the strip.
export function ArrivalsStrip({ arrivals }: { arrivals: Arrival[] }) {
  const t = useTranslations("leads");
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <div className="mb-6 overflow-hidden rounded-[var(--radius)] border border-hairline-token bg-surface-card">
      <div className="flex items-center gap-2 border-b border-hairline-token px-[18px] py-3">
        <DomainStar fill="#8A7557" size={11} />
        <span className="font-display text-[15px] text-text-primary">{t("arrivals")}</span>
        <span className="text-[11px] text-text-meta">{arrivals.length}</span>
      </div>
      {arrivals.map((a) => (
        <div key={a.id} className="grid items-center gap-3 border-b border-hairline-token px-[18px] py-3 last:border-b-0 [grid-template-columns:minmax(130px,1fr)_2fr_auto_auto]">
          <span className="truncate font-display text-[14.5px] text-text-primary">{a.name}</span>
          <span className="truncate text-[12px] text-text-meta">{a.snippet}</span>
          <span className="whitespace-nowrap text-[11px] tabular-nums text-text-meta">{a.when}</span>
          <button
            onClick={() => start(async () => { const r = await takeToDesk(a.id); if (r.ok) router.refresh(); })}
            disabled={pending}
            className="whitespace-nowrap rounded-[var(--radius)] border border-[color:var(--color-text-primary)] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-text-primary hover:bg-surface-page disabled:opacity-50"
          >
            {t("takeToDesk")}
          </button>
        </div>
      ))}
    </div>
  );
}
