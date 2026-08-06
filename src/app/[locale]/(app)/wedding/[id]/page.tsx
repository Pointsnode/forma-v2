import { notFound } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { loadProposals, loadCoupleIds, loadMembers, loadPendingInvites, toView, isTerminal } from "@/lib/loop";
import { loadVenuedEventIds, loadWeddingEngagements } from "@/lib/vendors";
import { WeddingShell } from "@/components/wedding/wedding-shell";
import { FactsEditor } from "@/components/wedding/facts-editor";
import { EventsPanel } from "@/components/wedding/event-forms";
import { ProposalCard } from "@/components/loop/proposal-card";
import { NewProposal } from "@/components/loop/new-proposal";
import { MembersInvites } from "@/components/loop/members-invites";
import { DecisionInbox } from "@/components/loop/decision-inbox";
import { CoupleTasks } from "@/components/tasks/couple-tasks";
import {
  Card, Pill, StatRow, Stat, SectionTitle, GateCard, GateRow, Panel, PanelHead, DomainStar,
} from "@/components/ui";
import { formatMoney, formatTime, countdownDays, gateItems, nextPhase } from "@/lib/wedding";
import { intlTag } from "@/lib/intl";
import { signedUrlMap } from "@/lib/storage";

export default async function WeddingFloor({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, id);
  if (!ctx || ctx.role === "none") notFound();
  const { wedding, events, role } = ctx;
  // §3 — the couple portal follows the WEDDING's language, not the couple's own locale.
  // A couple (member lens) on a mismatched locale prefix is redirected to the wedding's.
  // Staff (planner) keep following their own profiles.locale, so this is member-only.
  if (role === "member" && wedding.locale && wedding.locale !== locale && (routing.locales as readonly string[]).includes(wedding.locale)) {
    redirect({ href: `/wedding/${id}`, locale: wedding.locale });
  }
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
      <div className="mb-2 flex justify-end">
        <FactsEditor
          weddingId={id}
          initial={{
            budget: wedding.budget_total != null && Number(wedding.budget_total) ? String(Number(wedding.budget_total)) : "",
            guests: wedding.guest_target != null ? String(wedding.guest_target) : "",
            city: wedding.location_city ?? "",
            country: wedding.location_country ?? "",
            kind: (wedding.kind ?? "") as "city" | "destination" | "",
            locale: wedding.locale ?? "",
          }}
        />
      </div>
      <StatRow>
        <Stat value={wedding.guest_target ?? guestRollup.invited} label={tw("statGuests")} sub={guestRollup.answered ? tw("statGuestsSub", { count: guestRollup.answered }) : undefined} />
        <Stat value={money ?? "·"} label={tw("statBudget")} />
        {engagements.length ? (
          <Stat value={<>{booked}<span className="text-[16px] text-text-meta">/{engagements.length}</span></>} label={tw("statBookings")} />
        ) : null}
        <Stat
          value={wedding.phase === "closed" ? tw("settled") : days == null ? "·" : days >= 0 ? days : tw("daysAgo", { count: -days })}
          label={tw("statDays")}
          sub={<span className="font-accent text-[14px] italic">{tp(wedding.phase)}</span>}
        />
      </StatRow>

      <div className="mt-[18px] grid gap-[18px] lg:grid-cols-[1.6fr_1fr]">
        <div>
          <SectionTitle title={tprop("waiting")} accent={tprop("waitingLoop")} className="mt-0" />
          <div className="flex flex-col gap-3">
            {waiting.length === 0 ? (
              <p className="rounded-[var(--radius)] bg-surface-card p-6 text-center font-accent text-[16px] text-text-meta">{tprop("empty")}</p>
            ) : (
              waiting.map((v) => <ProposalCard key={v.id} weddingId={id} p={v} />)
            )}
            <NewProposal weddingId={id} events={events.map((e) => ({ id: e.id, label: e.label }))} />
          </div>
        </div>

        <div>
          {wedding.phase === "closed" ? (
            <>
              <SectionTitle title={tprop("nextGate")} accent={tp("closed")} className="mt-0" />
              <GateCard title={tplan("settled")} sub={tplan("settledSub")}>
                <p className="py-2 font-accent text-[15px] text-[rgba(247,244,238,0.75)]">{tplan("settledNote")}</p>
              </GateCard>
            </>
          ) : wedding.phase === "wedding_days" ? (
            <>
              <SectionTitle title={tprop("nextGate")} accent={tp("wedding_days")} className="mt-0" />
              <GateCard title={tplan("dayHere")} sub={tplan("dayHereSub")}>
                <p className="py-2 font-accent text-[15px] text-[rgba(247,244,238,0.75)]">{tplan("dayHereNote")}</p>
              </GateCard>
            </>
          ) : (
            <>
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
            </>
          )}
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
  const [tpart, teng, tcp] = [await getTranslations("partner"), await getTranslations("engagement"), await getTranslations("couple")];
  const lang = await getLocale();
  const inCourt = views.filter((v) => v.status === "sent" || v.status === "seen");
  const settled = views.filter((v) => v.status !== "sent" && v.status !== "seen");

  const [{ data: coupleTaskRows }, { data: partnerRows }, { data: rollupRow }, { data: dueRows }, { data: schedRows }] = await Promise.all([
    supabase.from("tasks").select("id, title, note, due_date, status, flagged").eq("wedding_id", weddingId).order("due_date", { ascending: true, nullsFirst: false }),
    supabase.rpc("wedding_partners", { w: weddingId }),
    supabase.from("wedding_money_rollup").select("budget_total, committed, paid").eq("wedding_id", weddingId).maybeSingle(),
    supabase.from("ledger_lines").select("amount").eq("wedding_id", weddingId).eq("kind", "planner_fee").eq("status", "due"),
    supabase.from("schedule_items").select("id, time, title, event_id").eq("wedding_id", weddingId).order("time", { ascending: true, nullsFirst: false }).order("sort"),
  ]);
  const coupleTasks = (coupleTaskRows ?? []) as { id: string; title: string; note: string | null; due_date: string | null; status: string; flagged: boolean }[];
  const partners = (partnerRows ?? []) as { engagement_id: string; status: string; vendor_name: string; vendor_kind: string; description: string | null; photos: { path: string }[] }[];
  const photoUrls = await signedUrlMap(supabase, partners.flatMap((p) => (p.photos ?? []).map((ph) => ph.path)));
  const statusKey = (s: string) => `status${s.charAt(0).toUpperCase()}${s.slice(1)}`;

  // The budget, couple view (read-only): committed of total, teal bar, and the due line
  // only when a planner fee is actually due from them.
  const rollup = (rollupRow as { budget_total: number | string | null; committed: number; paid: number } | null) ?? { budget_total: null, committed: 0, paid: 0 };
  const committed = Number(rollup.committed ?? 0);
  const budgetTotal = Number(rollup.budget_total ?? 0);
  const pctBudget = budgetTotal > 0 ? Math.min(100, Math.round((committed / budgetTotal) * 100)) : 0;
  const dueAmount = ((dueRows ?? []) as { amount: number | string }[]).reduce((s, r) => s + Number(r.amount ?? 0), 0);

  // The weekend, from the real run of show — schedule items ordered by their event's date
  // then time. Couple-visible only (RLS); the band doesn't render if there's no schedule.
  const evById = new Map(events.map((e) => [e.id, e]));
  const weekday = (d: string | null) => (d ? new Intl.DateTimeFormat(intlTag(lang), { weekday: "long" }).format(new Date(`${d}T12:00:00Z`)) : "");
  const weekend = ((schedRows ?? []) as { id: string; time: string | null; title: string; event_id: string }[])
    .map((it) => ({ ...it, ev: evById.get(it.event_id) }))
    .filter((x) => x.ev)
    .sort((a, b) => (a.ev!.event_date ?? "z").localeCompare(b.ev!.event_date ?? "z") || (a.time ?? "z").localeCompare(b.time ?? "z"));

  return (
    <WeddingShell wedding={wedding} events={events} role="member" active="overview">
      <div className="mx-auto max-w-[860px]">
        {/* Decisions waiting (people domain → taupe star). One wine primary is DecisionInbox's own. */}
        <Panel className="mb-4">
          <PanelHead star={<DomainStar domain="people" size={11} />} title={tcp("decisionsWaiting")} meta={inCourt.length ? String(inCourt.length) : undefined} />
          <div className="p-[18px]">
            {inCourt.length === 0 && settled.length === 0
              ? <p className="font-accent text-[15px] italic text-text-meta">{tcp("decisionsEmpty")}</p>
              : <DecisionInbox weddingId={weddingId} inCourt={inCourt} settled={settled} />}
          </div>
        </Panel>

        {/* The budget (money domain → teal star), read-only couple view. */}
        <Panel className="mb-4">
          <PanelHead star={<DomainStar domain="money" size={11} />} title={tcp("theBudget")} meta={tcp("alwaysCurrent")} />
          <div className="p-[18px]">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-[24px] tabular-nums text-text-primary">{formatMoney(committed, lang) ?? "·"}</span>
              <span className="text-[12px] text-text-meta">{tcp("ofCommitted", { total: formatMoney(budgetTotal, lang) ?? "·" })}</span>
            </div>
            <div className="mt-3 h-[3px] rounded-[2px] bg-[color:var(--color-hairline-token)]"><div className="h-[3px] rounded-[2px] bg-teal" style={{ width: `${pctBudget}%` }} /></div>
            <p className="mt-3 text-[12px] text-text-meta">{dueAmount > 0 ? tcp("dueLine", { amount: formatMoney(dueAmount, lang) ?? "·" }) : tcp("nothingDue")}</p>
          </div>
        </Panel>

        <CoupleTasks tasks={coupleTasks} />

        {partners.length ? (
          <>
            <SectionTitle title={tpart("title")} accent={tpart("hint")} />
            <Card>
              <ul className="flex flex-col">
                {partners.map((p) => {
                  const hero = p.photos?.[0]?.path ? photoUrls.get(p.photos[0].path) : null;
                  return (
                    <li key={p.engagement_id} className="flex items-center gap-3 py-3 not-last:[box-shadow:inset_0_-1px_0_var(--color-hairline)]">
                      <span className="h-12 w-12 shrink-0 overflow-hidden rounded-[var(--radius)] bg-surface-card">
                        {hero ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={hero} alt={p.vendor_name} className="h-12 w-12 object-cover" />
                        ) : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-display text-[15px] text-text-primary">{p.vendor_name}</p>
                        {p.description ? <p className="truncate font-accent text-[13.5px] text-text-meta">{p.description}</p> : null}
                      </div>
                      <Pill tone={p.status === "booked" ? "sage" : "sand"}>{teng(statusKey(p.status))}</Pill>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </>
        ) : null}
      </div>

      {/* The weekend band (charcoal, full-bleed) — champagne star + day rows with champagne times. */}
      {weekend.length ? (
        <section className="relative left-1/2 mt-8 w-screen -translate-x-1/2 bg-surface-chrome text-bone">
          <div className="mx-auto max-w-[860px] px-8 py-11">
            <div className="flex items-baseline justify-between">
              <span className="flex items-center gap-2 font-display text-[24px] text-bone"><DomainStar fill="#D7C3A5" size={13} />{tcp("theWeekend")}</span>
              <span className="text-[10px] font-medium uppercase tracking-[0.24em] text-champagne">{tcp("weekendKicker")}</span>
            </div>
            <div className="mt-4">
              {weekend.map((x) => (
                <div key={x.id} className="grid grid-cols-[110px_1fr_auto] items-center gap-3.5 border-b border-hairline-dark py-3 text-[13px] text-[rgba(245,242,235,0.75)] last:border-b-0">
                  <span className="capitalize">{weekday(x.ev!.event_date)}</span>
                  <span>{x.title}</span>
                  <span className="tabular-nums text-champagne">{formatTime(x.time, lang) ?? ""}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </WeddingShell>
  );
}
