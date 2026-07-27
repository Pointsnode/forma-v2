import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { PhaseDots } from "@/components/ui";
import { itemsToGate, phaseOrdinal, type EventRow, type WeddingRow } from "@/lib/wedding";

// The slim planning line under the hero — computed from the §9 predicates, the
// same ones the Planning room reads. Clicking it opens the Planning room.
export async function PhaseLine({ wedding, events, venuedEventIds }: { wedding: WeddingRow; events: EventRow[]; venuedEventIds?: Set<string> }) {
  const tp = await getTranslations("phase");
  const n = itemsToGate(wedding, events, venuedEventIds);
  const status =
    wedding.phase === "closed"
      ? tp("closedState")
      : n === 0
        ? tp("atGate")
        : n === 1
          ? tp("itemsToGateOne")
          : tp("itemsToGateOther", { count: n });

  return (
    <Link
      href={`/wedding/${wedding.id}/planning`}
      className="group flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-2xl bg-ink px-6 py-3 text-[12.5px] text-[#948C7F] shadow-hero"
    >
      <PhaseDots phase={wedding.phase} dark />
      <span className="font-medium tracking-wide text-[rgba(247,244,238,0.85)]">{tp("planning")}</span>
      <span className="text-[rgba(247,244,238,0.7)]">
        {tp("ordinal", { n: phaseOrdinal(wedding.phase) })} · {tp(wedding.phase)}
      </span>
      <span>— {status}</span>
      <span className="ml-auto text-sand transition-colors group-hover:text-bone">{tp("openPlanning")} →</span>
    </Link>
  );
}
