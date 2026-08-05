"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Pill, cx } from "@/components/ui";

export type EngagementVM = {
  id: string; vendorName: string; vendorKind: string; status: string;
  estimate: string | null; eventLabels: string[];
  quote: { id: string; status: string; amount: string | null; validUntil: string | null; expired: boolean } | null;
};

const statusKey = (s: string) => `status${s.charAt(0).toUpperCase()}${s.slice(1)}`;
const kindKey = (k: string) => `kind${k.charAt(0).toUpperCase()}${k.slice(1)}`;

// Every card is a Link into the engagement ledger — no inert div, no inline actions.
// The actions (and their status guards) all live on the engagement route now.
function EngagementCard({ e, weddingId }: { e: EngagementVM; weddingId: string }) {
  const t = useTranslations("engagement");
  const tv = useTranslations("vendors");
  return (
    <Link href={`/wedding/${weddingId}/vendors/${e.id}`} className="block">
      <div className="rounded-2xl bg-paper p-4 shadow-card transition-shadow hover:shadow-lift">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-display text-[16px] text-ink">{e.vendorName}</p>
            <p className="font-accent text-[13px] text-muted">{tv(kindKey(e.vendorKind))}{e.eventLabels.length ? ` · ${e.eventLabels.join(", ")}` : ""}{e.estimate ? ` · ${e.estimate}` : ""}</p>
            {e.quote ? <p className="mt-0.5 text-[12.5px] text-taupe">{t("latestQuote")}: {e.quote.amount ?? "·"}{e.quote.validUntil ? ` · ${e.quote.validUntil}` : ""}{e.quote.expired ? ` · ${t("validPast")}` : ""}</p> : null}
          </div>
          <Pill tone={e.status === "booked" ? "sage" : e.status === "declined" ? "wine" : "sand"}>{t(statusKey(e.status))}</Pill>
        </div>
      </div>
    </Link>
  );
}

const LANES: { key: string; statuses: string[] }[] = [
  { key: "lanePresented", statuses: ["presented"] },
  { key: "laneShortlisted", statuses: ["shortlisted"] },
  { key: "laneQuotes", statuses: ["quote_requested", "quoted"] },
  { key: "laneBooked", statuses: ["booked"] },
];

export function EngagementLanes({ engagements, weddingId }: { engagements: EngagementVM[]; weddingId: string }) {
  const t = useTranslations("engagement");
  const [showClosed, setShowClosed] = useState(false);
  const closed = engagements.filter((e) => ["declined", "archived"].includes(e.status));
  if (engagements.length === 0) return <p className="py-4 text-center font-accent text-[16px] text-muted">{t("noEngagements")}</p>;
  return (
    <div className="flex flex-col gap-5">
      {LANES.map((lane) => {
        const items = engagements.filter((e) => lane.statuses.includes(e.status));
        return items.length ? (
          <section key={lane.key} className="flex flex-col gap-2">
            <p className={cx("text-[11px] font-medium uppercase tracking-[0.16em] text-muted")}>{t(lane.key)}</p>
            {items.map((e) => <EngagementCard key={e.id} e={e} weddingId={weddingId} />)}
          </section>
        ) : null;
      })}
      {closed.length ? (
        <div>
          <button onClick={() => setShowClosed((v) => !v)} className="text-[12.5px] text-muted hover:text-ink">{t("laneClosed")} ({closed.length})</button>
          {showClosed ? <div className="mt-2 flex flex-col gap-2">{closed.map((e) => <EngagementCard key={e.id} e={e} weddingId={weddingId} />)}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
