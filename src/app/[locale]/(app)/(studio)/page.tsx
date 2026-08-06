import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { intlTag } from "@/lib/intl";
import { Link, redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card, Heading, Chip, DomainStar, DomainHeadCard, Panel, PanelHead, PanelRow, PhaseDots, cx,
} from "@/components/ui";
import { CreateWorkspaceForm } from "../workspace-forms";
import { TouchLastSeen } from "./touch-last-seen";
import { OpenDeskButton } from "./open-desk-button";
import { countdownLabel, formatMoney, phaseLabel, type WeddingRow } from "@/lib/wedding";
import { formatDate } from "@/lib/format-date";
import { loadCockpit, loadInquiries } from "@/lib/cockpit";
import { InquiriesCard } from "./inquiries-card";
import { loadMoneyRadar, daysOverdue } from "@/lib/money";
import { loadCalendar, nextMeeting } from "@/lib/calendar";
import { zonedDateKey } from "@/lib/calendar-grid.mjs";
import { loadDatePrefs } from "@/lib/prefs";

// Time-of-day period from the hour in the account's zone → the greeting key.
function greetKey(hour: number): "greetMorning" | "greetAfternoon" | "greetEvening" {
  return hour < 12 ? "greetMorning" : hour < 18 ? "greetAfternoon" : "greetEvening";
}

export default async function StudioOverview({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [tw, tp, tc, tmoney] = [
    await getTranslations("wedding"), await getTranslations("phase"),
    await getTranslations("cockpit"), await getTranslations("money"),
  ];
  const lang = await getLocale();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: memberships } = await supabase
    .from("workspace_members").select("workspaces(id, name, kind)").order("created_at", { ascending: true });
  const hasWorkspace = (memberships ?? []).length > 0;

  if (!hasWorkspace) {
    // A couple (a wedding member with no workspace) never sees studio onboarding — send
    // them to their wedding portal. The create card shows ONLY for a genuinely new user.
    const { data: myWeddings } = await supabase.from("weddings").select("id").order("date_start", { ascending: true, nullsFirst: false });
    if (myWeddings && myWeddings.length > 0) {
      redirect({ href: `/wedding/${(myWeddings[0] as { id: string }).id}`, locale: lang });
    }
    const tws = await getTranslations("workspace");
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <Heading>{tws("createTitle")}</Heading>
          <p className="mb-5 mt-1 font-accent text-[16px] text-muted">{tws("createHint")}</p>
          <CreateWorkspaceForm />
        </Card>
      </div>
    );
  }

  const { data: prof } = await supabase.from("profiles").select("display_name").eq("id", user!.id).maybeSingle();
  const firstName = ((prof?.display_name as string | null) ?? user!.email ?? "").split(/\s+/)[0] || "";

  const { data } = await supabase
    .from("weddings")
    .select("id, couple_display, phase, kind, location_city, location_country, date_start, date_end, guest_target, budget_total")
    .order("date_start", { ascending: true, nullsFirst: false });
  const weddings = (data ?? []) as WeddingRow[];
  const inFlight = weddings.filter((w) => w.phase !== "closed");

  const prefs = await loadDatePrefs(supabase, lang);
  const now = new Date();
  const kickerDate = new Intl.DateTimeFormat(intlTag(lang), { weekday: "long", month: "long", day: "numeric", timeZone: prefs.tz }).format(now);
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: prefs.tz }).format(now));

  // The two real hero stats. RSVPs-this-month is OMITTED — there is no cheap month-scoped
  // response count today (guest_rsvp_rollup is all-time, per wedding); the row keeps two.
  const { radar } = await loadMoneyRadar(supabase);
  const due60 = radar.reduce((s, r) => s + Number(r.amount), 0);
  const fmt = (n: number) => formatMoney(n, lang) ?? "·";

  // Money — paid to date across the studio (sum of the per-wedding rollup, RLS-scoped).
  const { data: rollups } = await supabase.from("wedding_money_rollup").select("paid");
  const paidToDate = (rollups ?? []).reduce((s, r) => s + Number((r as { paid: number | string }).paid ?? 0), 0);

  // The chase (things waiting on OTHERS) — the existing loader, recomposed below.
  const { chase } = await loadCockpit(supabase, user!.id, weddings.map((w) => ({ id: w.id, couple_display: w.couple_display })));
  // The directory inbox (real leads → weddings) is not one of the reference's six cards,
  // but it is live behaviour, so it is kept as a real card at the top of the left column.
  const inquiries = await loadInquiries(supabase);

  // Today — the real calendar (meetings + wedding days + task due dates), filtered to
  // today in the account's zone. One load; the soonest-meeting whisper reuses it.
  const cal = await loadCalendar(supabase, prefs.tz);
  const todayKey = zonedDateKey(now, cal.timezone);
  const todays = cal.entries
    .filter((e) => e.date === todayKey)
    .sort((a, b) => (a.startAt ?? "z").localeCompare(b.startAt ?? "z"));
  const soon = nextMeeting(cal.entries, now.getTime());

  // The concierge card's real state: how many threads sit in the ledger + the latest.
  const { data: threadRows, count: threadCount } = await supabase
    .from("concierge_threads").select("title", { count: "exact" }).order("updated_at", { ascending: false }).limit(1);
  const latestThread = ((threadRows?.[0] as { title?: string } | undefined)?.title ?? "").trim() || null;

  const timeOf = (iso?: string) => (iso ? new Intl.DateTimeFormat(intlTag(lang), { hour: "numeric", minute: "2-digit", timeZone: cal.timezone }).format(new Date(iso)) : "·");

  return (
    <div>
      <TouchLastSeen />

      {/* Hero band — charcoal, full-bleed, continuous with the top bar + section nav. */}
      <section className="relative left-1/2 w-screen -translate-x-1/2 bg-ink text-bone">
        <div className="mx-auto max-w-[1240px] px-8 py-9 md:px-10">
          <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-champagne">{tc("heroKicker")} · {kickerDate}</p>
              <h1 className="mt-2 font-display text-[34px] leading-none text-bone">{tc(greetKey(hour), { name: firstName })}</h1>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-x-11 gap-y-3 border-t border-hairline-dark pt-5">
            <HeroStat value={String(inFlight.length)} label={tc("statInFlight")} />
            {radar.length ? <HeroStat value={fmt(due60)} label={tc("statLands")} /> : null}
          </div>
        </div>
      </section>

      {soon ? (
        <Link href="/calendar" className="mt-4 inline-flex items-center gap-2 rounded-[var(--radius)] border border-hairline bg-bone px-3.5 py-1.5 text-[13px]">
          <DomainStar domain="time" size={11} />
          <span className="text-muted">{tc("nextMeeting")}</span>
          <span className="font-medium text-ink">{soon.title}</span>
          <span className="text-taupe">· {timeOf(soon.startAt) === "·" ? formatDate(soon.date, prefs) : timeOf(soon.startAt)}</span>
        </Link>
      ) : null}

      <div className="mt-7 grid gap-4 lg:grid-cols-[2fr_1fr]">
        {/* Left column — the directory inbox (real leads), the weddings, then Today */}
        <div className="flex flex-col gap-4">
          {inquiries.length ? <InquiriesCard inquiries={inquiries} /> : null}
          <Panel>
            <PanelHead
              star={<DomainStar domain="people" size={12} />}
              title={tc("weddingsTitle")}
              meta={tc("weddingsMeta", { count: inFlight.length })}
            />
            {weddings.length === 0 ? (
              <p className="px-[18px] py-8 text-center font-accent text-[16px] text-muted">{tc("weddingsEmpty")}</p>
            ) : weddings.map((w) => (
              <PanelRow key={w.id} href={`/wedding/${w.id}`} cols="minmax(150px,1.4fr) 1fr auto auto">
                <span className="truncate font-display text-[16px] text-ink">{w.couple_display}</span>
                <span className="truncate text-[12px] text-muted">{[w.location_city, w.location_country].filter(Boolean).join(", ") || "·"}</span>
                <span className="whitespace-nowrap text-[12px] text-muted">{formatDate(w.date_start, prefs)}</span>
                <span className="flex items-center gap-2.5">
                  <PhaseDots phase={w.phase} />
                  {w.phase === "closed"
                    ? <Chip tone="settled">{tp("closed")}</Chip>
                    : <span className="whitespace-nowrap text-[11.5px] text-taupe">{countdownLabel(w.date_start, w.phase, tw) || phaseLabel(w.phase, tp)}</span>}
                </span>
              </PanelRow>
            ))}
          </Panel>

          <Panel>
            <PanelHead
              star={<DomainStar domain="time" size={12} />}
              title={tc("todayTitle")}
              meta={todays.length ? tc("todayMeta", { count: todays.length }) : undefined}
            />
            {todays.length === 0 ? (
              <p className="px-[18px] py-7 text-center font-accent text-[15px] text-muted">{tc("todayEmpty")}</p>
            ) : todays.slice(0, 8).map((e) => (
              <PanelRow key={e.id} href={e.href} cols="64px 1fr auto">
                <span className="text-[12px] tabular-nums text-taupe">{timeOf(e.startAt)}</span>
                <span className="truncate text-[13px] text-ink">{e.title}</span>
                {e.species === "wedding" ? <Chip tone="settled">{tp("wedding_days")}</Chip>
                  : e.invitee ? <span className="truncate text-[12px] text-muted">{e.invitee}</span> : <span />}
              </PanelRow>
            ))}
          </Panel>
        </div>

        {/* Right column — money radar, the chase, the concierge (the one oxblood voice) */}
        <div className="flex flex-col gap-4">
          <DomainHeadCard domain="money" title={tmoney("radar")} meta={tc("moneyRadarMeta")}>
            <div className="grid grid-cols-2 gap-3.5">
              <div>
                <div className="font-display text-[26px] leading-none text-ink">{fmt(due60)}</div>
                <div className="mt-1 text-[11px] text-wine">{tc("moneyDueLabel")}</div>
              </div>
              <div>
                <div className="font-display text-[26px] leading-none text-ink">{fmt(paidToDate)}</div>
                <div className="mt-1 text-[11px] text-muted">{tc("moneyPaidLabel")}</div>
              </div>
            </div>
            {radar.length ? (
              <div className="mt-3.5 border-t border-hairline">
                {radar.slice(0, 5).map((r) => {
                  const od = daysOverdue(r.due_date, r.status);
                  return (
                    <Link key={r.id} href={`/wedding/${r.wedding_id}/budget`} className="grid items-center gap-3 border-b border-hairline py-2.5 text-[13px] last:border-b-0 [grid-template-columns:1fr_auto_auto] hover:opacity-90">
                      <span className="truncate text-ink">{r.title} <span className="text-muted">· {r.couple_display}</span></span>
                      <span className="tabular-nums font-medium text-ink">{fmt(Number(r.amount))}</span>
                      {od > 0 ? <Chip tone="urgent">{tmoney("overdue", { n: od })}</Chip> : <Chip tone="attention">{tmoney("dueChip")}</Chip>}
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </DomainHeadCard>

          <Panel>
            <PanelHead
              star={<DomainStar domain="money" size={12} />}
              title={tc("chase")}
              meta={chase.length ? tc("chaseMeta", { count: chase.length }) : undefined}
            />
            {chase.length === 0 ? (
              <p className="px-[18px] py-7 text-center font-accent text-[15px] text-muted">{tc("chaseEmpty")}</p>
            ) : chase.map((c) => (
              // No "Nudge" action wired today — the row shows the age and links to the item.
              <PanelRow key={c.id} href={c.href} cols="1fr auto">
                <span className="truncate text-[13px] text-ink">{c.title}{c.kind === "task" ? <span className="text-muted"> · {tc("chaseTask")}</span> : null}</span>
                <span className={cx("shrink-0 text-[11.5px]", c.ageDays >= 7 ? "text-wine" : "text-taupe")}>{tc("ageDays", { days: c.ageDays })}</span>
              </PanelRow>
            ))}
          </Panel>

          {/* The concierge card — the screen's single oxblood voice, real state only. */}
          <div className="rounded-[var(--radius)] border border-oxblood bg-oxblood p-[18px] text-bone">
            <div className="mb-2.5 flex items-center gap-2">
              <DomainStar fill="#D7C3A5" size={14} />
              <span className="text-[10px] font-medium uppercase tracking-[0.24em] text-champagne">{tc("conciergeKicker")}</span>
            </div>
            <p className="text-[13px] leading-[1.6] text-bone">
              {threadCount && threadCount > 0
                ? (latestThread ? `${latestThread} · ${tc("conciergeLedger", { count: threadCount })}` : tc("conciergeLedger", { count: threadCount }))
                : tc("conciergeInvite")}
            </p>
            <div className="mt-3.5">
              <OpenDeskButton label={tc("openDesk")} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function HeroStat({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex items-baseline gap-2.5">
      <span className="font-display text-[20px] leading-none text-bone tabular-nums">{value}</span>
      <span className="text-[11px] uppercase tracking-[0.14em] text-champagne">{label}</span>
    </span>
  );
}
