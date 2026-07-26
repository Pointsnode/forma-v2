import { notFound } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { loadProposals, loadCoupleIds, loadMembers, loadPendingInvites, toView, isTerminal } from "@/lib/loop";
import { WeddingHeader } from "@/components/wedding/wedding-header";
import { PhaseLine } from "@/components/wedding/phase-line";
import { EventsPanel } from "@/components/wedding/event-forms";
import { ProposalCard } from "@/components/loop/proposal-card";
import { NewProposal } from "@/components/loop/new-proposal";
import { MembersInvites } from "@/components/loop/members-invites";
import { DecisionInbox } from "@/components/loop/decision-inbox";
import { Card, Fact, Heading, WeddingNav, cx } from "@/components/ui";
import { formatDateRange, formatMoney, phaseOrdinal } from "@/lib/wedding";

export default async function WeddingFloor({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, id);
  if (!ctx || ctx.role === "none") notFound();
  const { wedding, events, role } = ctx;
  const lang = await getLocale();

  const [{ proposals, people }, coupleIds] = await Promise.all([loadProposals(supabase, id), loadCoupleIds(supabase, id)]);
  const eventLabels = new Map(events.map((e) => [e.id, e.label]));
  const views = toView(proposals, people, coupleIds, eventLabels, lang);

  if (role === "member") return <CoupleLens weddingId={id} views={views} events={events} wedding={wedding} />;

  // ── Planner floor ──────────────────────────────────────────────────────────
  const [tw, tp, tprop] = [await getTranslations("wedding"), await getTranslations("phase"), await getTranslations("proposals")];
  const [members, invites] = await Promise.all([loadMembers(supabase, id), loadPendingInvites(supabase, id)]);
  const waiting = views.filter((v) => !isTerminal(v.status) && v.status !== "draft");
  const range = formatDateRange(wedding.date_start, wedding.date_end, lang);
  const money = formatMoney(wedding.budget_total, lang);
  const location = [wedding.location_city, wedding.location_country].filter(Boolean).join(", ");

  return (
    <div className="flex flex-col gap-6">
      <WeddingHeader wedding={wedding} events={events} />
      <PhaseLine wedding={wedding} events={events} />
      <FloorNav weddingId={id} active="overview" proposalsLabel={tprop("tab")} overviewLabel={tw("overview")} />

      <Card>
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3">
          <Fact value={range ?? tw("noDate")} label={tw("facts.date")} />
          <Fact value={events.length} label={tw("facts.events")} />
          <Fact value={wedding.guest_target ?? "—"} label={tw("facts.guests")} />
          <Fact value={money ?? "—"} label={tw("facts.budget")} />
          <Fact value={`${tp("ordinal", { n: phaseOrdinal(wedding.phase) })} · ${tp(wedding.phase)}`} label={tw("facts.phase")} />
          <Fact value={location || "—"} label={tw("facts.location")} />
        </div>
      </Card>

      <Card>
        <Heading className="text-[19px]">{tprop("waiting")}</Heading>
        <p className="mb-4 mt-0.5 font-accent text-[15px] text-muted">{tprop("waitingHint")}</p>
        <div className="flex flex-col gap-3">
          {waiting.length === 0 ? (
            <p className="py-4 text-center font-accent text-[16px] text-muted">{tprop("empty")}</p>
          ) : (
            waiting.map((v) => <ProposalCard key={v.id} weddingId={id} p={v} />)
          )}
          <NewProposal weddingId={id} events={events.map((e) => ({ id: e.id, label: e.label }))} />
        </div>
      </Card>

      <Card><MembersInvites weddingId={id} members={members} invites={invites} /></Card>

      <Card>
        <Heading className="mb-3 text-[19px]">{tw("facts.events")}</Heading>
        <EventsPanel weddingId={id} events={events} multi={events.length >= 2} />
      </Card>
    </div>
  );
}

function FloorNav({
  weddingId, active, overviewLabel, proposalsLabel,
}: { weddingId: string; active: "overview" | "proposals"; overviewLabel: string; proposalsLabel: string }) {
  return (
    <WeddingNav
      items={
        <>
          <Link href={`/wedding/${weddingId}`} className={cx(active === "overview" ? "text-ink" : "text-muted hover:text-ink")}>{overviewLabel}</Link>
          <Link href={`/wedding/${weddingId}/proposals`} className={cx(active === "proposals" ? "text-ink" : "text-muted hover:text-ink")}>{proposalsLabel}</Link>
        </>
      }
    />
  );
}

async function CoupleLens({
  weddingId, views, events, wedding,
}: {
  weddingId: string;
  views: import("@/lib/loop-view").ViewProposal[];
  events: import("@/lib/wedding").EventRow[];
  wedding: import("@/lib/wedding").WeddingRow;
}) {
  const tw = await getTranslations("wedding");
  const lang = await getLocale();
  const inCourt = views.filter((v) => v.status === "sent" || v.status === "seen");
  const settled = views.filter((v) => v.status !== "sent" && v.status !== "seen");
  const range = formatDateRange(wedding.date_start, wedding.date_end, lang);
  const location = [wedding.location_city, wedding.location_country].filter(Boolean).join(", ");

  return (
    <div className="flex flex-col gap-6">
      <WeddingHeader wedding={wedding} events={events} />
      <DecisionInbox weddingId={weddingId} inCourt={inCourt} settled={settled} />
      <Card>
        <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3">
          <Fact value={range ?? tw("noDate")} label={tw("facts.date")} />
          <Fact value={events.length} label={tw("facts.events")} />
          <Fact value={wedding.guest_target ?? "—"} label={tw("facts.guests")} />
          <Fact value={location || "—"} label={tw("facts.location")} />
        </div>
      </Card>
    </div>
  );
}
