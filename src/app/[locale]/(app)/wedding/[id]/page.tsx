import { notFound } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { loadProposals, loadCoupleIds, loadMembers, loadPendingInvites, toView, isTerminal } from "@/lib/loop";
import { loadVenuedEventIds, loadWeddingEngagements } from "@/lib/vendors";
import { WeddingShell } from "@/components/wedding/wedding-shell";
import { EventsPanel } from "@/components/wedding/event-forms";
import { ProposalCard } from "@/components/loop/proposal-card";
import { NewProposal } from "@/components/loop/new-proposal";
import { MembersInvites } from "@/components/loop/members-invites";
import { DecisionInbox } from "@/components/loop/decision-inbox";
import {
  Card, Pill, StatRow, Stat, SectionTitle, GateCard, GateRow,
} from "@/components/ui";
import { formatMoney, countdownDays, gateItems, nextPhase } from "@/lib/wedding";
import { signedUrlMap } from "@/lib/storage";

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

  if (role === "member") return <CoupleLens weddingId={id} views={views} wedding={wedding} events={events} />;

  // ── Planner floor ──────────────────────────────────────────────────────────
  const [tw, tp, tprop, tplan] = [await getTranslations("wedding"), await getTranslations("phase"), await getTranslations("proposals"), await getTranslations("planning")];
  const [venued, engagements, members, invites, { data: rollup }] = await Promise.all([
    loadVenuedEventIds(supabase, id),
    loadWeddingEngagements(supabase, id),
    loadMembers(supabase, id),
    loadPendingInvites(supabase, id),
    supabase.from("guest_rsvp_rollup").select("invited, answered").eq("wedding_id", id).maybeSingle(),
  ]);
  const guestRollup = (rollup as { invited: number; answered: number } | null) ?? { invited: 0, answered: 0 };
  const booked = engagements.filter((e) => e.status === "booked").length;
  const money = formatMoney(wedding.budget_total, lang);
  const days = countdownDays(wedding.date_start);
  const waiting = views.filter((v) => !isTerminal(v.status) && v.status !== "draft");

  const gate = gateItems(wedding, events, venued);
  const target = nextPhase(wedding.phase);

  return (
    <WeddingShell wedding={wedding} events={events} role="staff" active="overview" venuedEventIds={venued}>
      <StatRow>
        <Stat value={wedding.guest_target ?? guestRollup.invited} label={tw("statGuests")} sub={guestRollup.answered ? tw("statGuestsSub", { count: guestRollup.answered }) : undefined} />
        <Stat value={money ?? "—"} label={tw("statBudget")} />
        {engagements.length ? (
          <Stat value={<>{booked}<span className="text-[16px] text-muted">/{engagements.length}</span></>} label={tw("statBookings")} />
        ) : null}
        <Stat value={days ?? "—"} label={tw("statDays")} sub={<span className="font-accent text-[14px] italic">{tp(wedding.phase)}</span>} />
      </StatRow>

      <div className="mt-[18px] grid gap-[18px] lg:grid-cols-[1.6fr_1fr]">
        <div>
          <SectionTitle title={tprop("waiting")} accent={tprop("waitingLoop")} className="mt-0" />
          <div className="flex flex-col gap-3">
            {waiting.length === 0 ? (
              <p className="rounded-2xl bg-paper p-6 text-center font-accent text-[16px] text-muted shadow-card">{tprop("empty")}</p>
            ) : (
              waiting.map((v) => <ProposalCard key={v.id} weddingId={id} p={v} />)
            )}
            <NewProposal weddingId={id} events={events.map((e) => ({ id: e.id, label: e.label }))} />
          </div>
        </div>

        <div>
          <SectionTitle title={tprop("nextGate")} accent={target ? tp(target) : undefined} className="mt-0" />
          <GateCard title={target ? tplan("gateTo", { phase: tp(target) }) : tplan("nextGate")} sub={tplan("subtitle")}>
            {gate.length === 0 ? (
              <p className="py-2 font-accent text-[15px] text-[rgba(247,244,238,0.75)]">{tplan("allClear")}</p>
            ) : (
              gate.map((it) => (
                <GateRow key={it.key} done={it.done} title={tplan(`items.${it.key}`)} detail={it.pending ? tplan("venuePending") : undefined} />
              ))
            )}
          </GateCard>
        </div>
      </div>

      <SectionTitle title={tw("membersTitle")} accent={tw("membersHint")} />
      <Card><MembersInvites weddingId={id} members={members} invites={invites} /></Card>

      <SectionTitle title={tw("facts.events")} accent={tw("eventsHint")} />
      <Card><EventsPanel weddingId={id} events={events} multi={events.length >= 2} /></Card>
    </WeddingShell>
  );
}

async function CoupleLens({
  weddingId, views, wedding, events,
}: {
  weddingId: string;
  views: import("@/lib/loop-view").ViewProposal[];
  wedding: import("@/lib/wedding").WeddingRow;
  events: import("@/lib/wedding").EventRow[];
}) {
  const supabase = await createClient();
  const [tw, tpart, teng] = [await getTranslations("wedding"), await getTranslations("partner"), await getTranslations("engagement")];
  const lang = await getLocale();
  const inCourt = views.filter((v) => v.status === "sent" || v.status === "seen");
  const settled = views.filter((v) => v.status !== "sent" && v.status !== "seen");
  const money = formatMoney(wedding.budget_total, lang);
  const days = countdownDays(wedding.date_start);
  const location = [wedding.location_city, wedding.location_country].filter(Boolean).join(", ");

  const { data: partnerRows } = await supabase.rpc("wedding_partners", { w: weddingId });
  const partners = (partnerRows ?? []) as { engagement_id: string; status: string; vendor_name: string; vendor_kind: string; description: string | null; photos: { path: string }[] }[];
  const photoUrls = await signedUrlMap(supabase, partners.flatMap((p) => (p.photos ?? []).map((ph) => ph.path)));
  const statusKey = (s: string) => `status${s.charAt(0).toUpperCase()}${s.slice(1)}`;

  return (
    <WeddingShell wedding={wedding} events={events} role="member" active="overview">
      <StatRow>
        <Stat value={wedding.guest_target ?? "—"} label={tw("statGuests")} />
        <Stat value={events.length} label={tw("facts.events")} />
        <Stat value={money ?? "—"} label={tw("statBudget")} />
        <Stat value={days ?? "—"} label={tw("statDays")} sub={location || undefined} />
      </StatRow>

      <div className="mt-[18px]">
        <DecisionInbox weddingId={weddingId} inCourt={inCourt} settled={settled} />
      </div>

      {partners.length ? (
        <>
          <SectionTitle title={tpart("title")} accent={tpart("hint")} />
          <Card>
            <ul className="flex flex-col">
              {partners.map((p) => {
                const hero = p.photos?.[0]?.path ? photoUrls.get(p.photos[0].path) : null;
                return (
                  <li key={p.engagement_id} className="flex items-center gap-3 py-3 not-last:[box-shadow:inset_0_-1px_0_var(--color-hairline)]">
                    <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-sand-soft">
                      {hero ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={hero} alt={p.vendor_name} className="h-12 w-12 object-cover" />
                      ) : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-[15px] text-ink">{p.vendor_name}</p>
                      {p.description ? <p className="truncate font-accent text-[13.5px] text-muted">{p.description}</p> : null}
                    </div>
                    <Pill tone={p.status === "booked" ? "sage" : "sand"}>{teng(statusKey(p.status))}</Pill>
                  </li>
                );
              })}
            </ul>
          </Card>
        </>
      ) : null}
    </WeddingShell>
  );
}
