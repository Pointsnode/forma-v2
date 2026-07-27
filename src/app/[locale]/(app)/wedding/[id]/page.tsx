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
import { Card, Fact, Heading, Pill, WeddingNav, cx } from "@/components/ui";
import { formatDateRange, formatMoney, phaseOrdinal } from "@/lib/wedding";
import { signedUrlMap } from "@/lib/storage";
import { loadVenuedEventIds } from "@/lib/vendors";

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

  const venued = await loadVenuedEventIds(supabase, id);

  // ── Planner floor ──────────────────────────────────────────────────────────
  const [tw, tp, tprop, tg, teng] = [await getTranslations("wedding"), await getTranslations("phase"), await getTranslations("proposals"), await getTranslations("guests"), await getTranslations("engagement")];
  const [members, invites] = await Promise.all([loadMembers(supabase, id), loadPendingInvites(supabase, id)]);
  const waiting = views.filter((v) => !isTerminal(v.status) && v.status !== "draft");
  const range = formatDateRange(wedding.date_start, wedding.date_end, lang);
  const money = formatMoney(wedding.budget_total, lang);
  const location = [wedding.location_city, wedding.location_country].filter(Boolean).join(", ");

  return (
    <div className="flex flex-col gap-6">
      <WeddingHeader wedding={wedding} events={events} />
      <PhaseLine wedding={wedding} events={events} venuedEventIds={venued} />
      <FloorNav weddingId={id} active="overview" proposalsLabel={tprop("tab")} overviewLabel={tw("overview")} guestsLabel={tg("tab")} vendorsLabel={teng("tab")} />

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
  weddingId, active, overviewLabel, proposalsLabel, guestsLabel, vendorsLabel,
}: { weddingId: string; active: "overview" | "proposals" | "guests" | "vendors"; overviewLabel: string; proposalsLabel: string; guestsLabel: string; vendorsLabel: string }) {
  return (
    <WeddingNav
      items={
        <>
          <Link href={`/wedding/${weddingId}`} className={cx(active === "overview" ? "text-ink" : "text-muted hover:text-ink")}>{overviewLabel}</Link>
          <Link href={`/wedding/${weddingId}/proposals`} className={cx(active === "proposals" ? "text-ink" : "text-muted hover:text-ink")}>{proposalsLabel}</Link>
          <Link href={`/wedding/${weddingId}/guests`} className={cx(active === "guests" ? "text-ink" : "text-muted hover:text-ink")}>{guestsLabel}</Link>
          <Link href={`/wedding/${weddingId}/vendors`} className={cx(active === "vendors" ? "text-ink" : "text-muted hover:text-ink")}>{vendorsLabel}</Link>
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
  const [tw, tg, tpart, teng] = [await getTranslations("wedding"), await getTranslations("guests"), await getTranslations("partner"), await getTranslations("engagement")];
  const lang = await getLocale();
  const inCourt = views.filter((v) => v.status === "sent" || v.status === "seen");
  const settled = views.filter((v) => v.status !== "sent" && v.status !== "seen");
  const range = formatDateRange(wedding.date_start, wedding.date_end, lang);
  const location = [wedding.location_city, wedding.location_country].filter(Boolean).join(", ");

  // Partners the couple can see (scoped projection over the private catalog).
  const cSupabase = await createClient();
  const { data: partnerRows } = await cSupabase.rpc("wedding_partners", { w: weddingId });
  const partners = (partnerRows ?? []) as { engagement_id: string; status: string; vendor_name: string; vendor_kind: string; description: string | null; photos: { path: string }[] }[];
  const photoUrls = await signedUrlMap(cSupabase, partners.flatMap((p) => (p.photos ?? []).map((ph) => ph.path)));
  const statusKey = (s: string) => `status${s.charAt(0).toUpperCase()}${s.slice(1)}`;

  return (
    <div className="flex flex-col gap-6">
      <WeddingHeader wedding={wedding} events={events} />
      <WeddingNav
        items={
          <>
            <Link href={`/wedding/${weddingId}`} className="text-ink">{tw("overview")}</Link>
            <Link href={`/wedding/${weddingId}/guests`} className="text-muted hover:text-ink">{tg("tab")}</Link>
          </>
        }
      />
      <DecisionInbox weddingId={weddingId} inCourt={inCourt} settled={settled} />

      {partners.length ? (
        <Card>
          <Heading className="text-[18px]">{tpart("title")}</Heading>
          <p className="mb-3 mt-0.5 font-accent text-[14.5px] text-muted">{tpart("hint")}</p>
          <ul className="flex flex-col gap-3">
            {partners.map((p) => {
              const hero = p.photos?.[0]?.path ? photoUrls.get(p.photos[0].path) : null;
              return (
                <li key={p.engagement_id} className="flex items-center gap-3">
                  <span className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-sand-soft">
                    {hero ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={hero} alt={p.vendor_name} className="h-12 w-12 object-cover" />
                    ) : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-[15px] text-ink">{p.vendor_name}</span>
                    {p.description ? <span className="block truncate font-accent text-[13.5px] text-muted">{p.description}</span> : null}
                  </span>
                  <Pill tone={p.status === "booked" ? "sage" : "sand"}>{teng(statusKey(p.status))}</Pill>
                </li>
              );
            })}
          </ul>
        </Card>
      ) : null}

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
