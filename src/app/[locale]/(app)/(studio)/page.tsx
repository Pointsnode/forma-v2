import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card, Heading, Monogram, PhaseDots, StatRow, Stat, SectionTitle, Row, RowMain, Chip, DomainHeadCard, cx,
} from "@/components/ui";
import { CreateWorkspaceForm } from "../workspace-forms";
import { TouchLastSeen } from "./touch-last-seen";
import { countdownLabel, formatMoney, initials, phaseLabel, PHASE_ORDER, type Phase, type WeddingRow } from "@/lib/wedding";
import { loadCockpit, loadInquiries } from "@/lib/cockpit";
import { loadMoneyRadar, daysOverdue } from "@/lib/money";
import { loadNextMeeting } from "@/lib/calendar";
import { loadDatePrefs } from "@/lib/prefs";
import { InquiriesCard } from "./inquiries-card";

export default async function StudioOverview({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tw, tp, tc] = [
    await getTranslations("studio"), await getTranslations("wedding"),
    await getTranslations("phase"), await getTranslations("cockpit"),
  ];
  const lang = await getLocale();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: memberships } = await supabase
    .from("workspace_members")
    .select("workspaces(id, name, kind)")
    .order("created_at", { ascending: true });
  const hasWorkspace = (memberships ?? []).length > 0;

  if (!hasWorkspace) {
    // A couple (a wedding member with no workspace) must never see studio onboarding — send them
    // to their wedding portal. RLS returns only the weddings they're a member of. The
    // create-workspace card shows ONLY for a genuinely new user (no wedding AND no workspace).
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
  const { feed, chase } = await loadCockpit(supabase, user!.id, weddings.map((w) => ({ id: w.id, couple_display: w.couple_display })));
  const inquiries = await loadInquiries(supabase);
  const newInquiries = inquiries.filter((i) => i.isNew).length;

  // Stat tile subs — the tiles whose data exists this milestone. Money (M5) and
  // appointments (M6) are absent, not stubbed.
  const byPhase = new Map<Phase, number>();
  for (const w of weddings) byPhase.set(w.phase, (byPhase.get(w.phase) ?? 0) + 1);
  const phaseBreakdown = PHASE_ORDER.filter((p) => byPhase.has(p))
    .map((p) => tc("nInPhase", { count: byPhase.get(p)!, phase: tp(p) }))
    .join(" · ");
  const oldest = chase[0];
  // §B4 — the greeting date reads "today" in the account's timezone preference.
  const prefs = await loadDatePrefs(supabase, lang);
  const today = new Intl.DateTimeFormat(lang === "es" ? "es-ES" : "en-US", { weekday: "long", month: "long", day: "numeric", timeZone: prefs.tz }).format(new Date());

  // Money radar / urgent (§12) — from the view, RLS-scoped to the viewer's weddings.
  const tmoney = await getTranslations("money");
  const { radar, urgent } = await loadMoneyRadar(supabase);
  const due60 = radar.reduce((s, r) => s + Number(r.amount), 0);
  const fmt = (n: number) => formatMoney(n, lang) ?? "·";

  // The calendar's whisper — the soonest meeting in the next 7 days (exceptions-first).
  const soon = await loadNextMeeting(supabase);
  const soonWhen = soon
    ? new Intl.DateTimeFormat(lang === "es" ? "es-ES" : "en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: soon.timezone }).format(new Date(soon.startAt))
    : null;

  return (
    <div>
      <TouchLastSeen />
      <SectionTitle
        title={<span className="text-[30px]">{tc("greetingTitle", { name: firstName })}</span>}
        accent={tc("greetingDate", { date: today })}
        className="mt-1"
      />

      <StatRow>
        <Stat value={weddings.length} label={t("statWeddings")} sub={phaseBreakdown || undefined} />
        <Stat
          value={chase.length}
          valueClassName={chase.length ? "text-wine" : undefined}
          label={t("statChase")}
          sub={oldest ? tc("oldestChase", { days: oldest.ageDays }) : undefined}
        />
        {radar.length ? <Stat value={fmt(due60)} label={tmoney("due60")} sub={tmoney("due60Sub", { count: radar.length })} /> : null}
        {inquiries.length ? (
          <Stat
            value={inquiries.length}
            valueClassName={newInquiries ? "text-wine" : undefined}
            label={tc("statInquiries")}
            sub={newInquiries ? tc("statInquiriesNew", { count: newInquiries }) : undefined}
          />
        ) : null}
      </StatRow>

      {soon && soonWhen ? (
        <Link href="/calendar" className="mt-3 inline-flex items-center gap-2 rounded-[var(--radius)] bg-bone px-3.5 py-1.5 text-[13px] transition-shadow">
          <span className="h-2 w-2 rounded-[var(--radius)] bg-ink" />
          <span className="text-muted">{tc("nextMeeting")}</span>
          <span className="font-medium text-ink">{soon.invitee}</span>
          <span className="text-taupe">· {soonWhen}</span>
        </Link>
      ) : null}

      <div className="mt-[18px] grid gap-[18px] lg:grid-cols-[1.6fr_1fr]">
        {/* left — since you were away + the chase list + the directory inbox */}
        <div className="flex flex-col gap-[18px]">
          {inquiries.length ? <InquiriesCard inquiries={inquiries} /> : null}
          <Card>
            <Heading className="text-[19px]">{tc("sinceAway")}</Heading>
            <p className="mb-3 mt-0.5 text-[12.5px] text-muted">{tc("sinceAwayHint")}</p>
            {feed.length === 0 ? (
              <p className="py-4 text-center font-accent text-[15px] text-muted">{tc("sinceEmpty")}</p>
            ) : (
              feed.map((f) => (
                <Row key={f.id}>
                  <Monogram initials={f.tag || "·"} size={28} />
                  <RowMain
                    title={
                      <>
                        {f.actorKind === "concierge" ? (
                          <span className="font-medium"><span aria-hidden className="mr-1 inline-flex h-4 w-4 -translate-y-px items-center justify-center rounded-[var(--radius)] bg-ink align-middle text-[10px] leading-none text-bone">c</span>{tc("byConcierge", { planner: f.actorName ?? "" })}</span>
                        ) : (
                          <span className="font-medium">{f.actorName ?? "Forma"}</span>
                        )} {tc(`verb.${f.verb}`)}
                        {f.summary ? <span className="font-normal text-muted"> · {f.summary}</span> : null}
                      </>
                    }
                  />
                </Row>
              ))
            )}
          </Card>

          <Card>
            <Heading className="text-[19px]">{tc("chase")}</Heading>
            <p className="mb-3 mt-0.5 text-[12.5px] text-muted">{tc("chaseHint")}</p>
            {chase.length === 0 ? (
              <p className="py-4 text-center font-accent text-[15px] text-muted">{tc("chaseEmpty")}</p>
            ) : (
              chase.map((c) => (
                <Link key={c.id} href={c.href} className="block">
                  <Row className="-mx-2 rounded-[var(--radius)] px-2 hover:bg-bone">
                    <Monogram initials={c.tag || "·"} size={28} />
                    <RowMain title={c.title} detail={c.kind === "task" ? tc("chaseTask") : undefined} />
                    <span className={cx("shrink-0 rounded-[var(--radius)] px-2.5 py-[3px] text-[11px] font-medium", c.ageDays >= 7 ? "bg-bone text-wine" : "bg-bone text-taupe")}>
                      {tc("ageDays", { days: c.ageDays })}
                    </span>
                  </Row>
                </Link>
              ))
            )}
          </Card>
        </div>

        {/* right — money radar · urgent · under management */}
        <div className="flex flex-col gap-[18px]">
        {radar.length ? (
          <DomainHeadCard domain="money" title={tmoney("radar")}>
            <p className="mb-3 text-[12.5px] text-muted">{tmoney("radarHint")}</p>
            {radar.slice(0, 6).map((r) => (
              <Row key={r.id}>
                <span className="w-14 shrink-0 font-accent text-[14px] italic text-taupe">{r.due_date.slice(5)}</span>
                <RowMain title={<>{r.title} {r.is_fee ? <span className="ml-1 rounded-[var(--radius)] bg-bone px-2 py-[1px] text-[10.5px] text-taupe">{tmoney("yours")}</span> : null}</>} detail={r.couple_display} />
                <span className="shrink-0 font-medium text-[13.5px] text-ink">{fmt(Number(r.amount))}</span>
              </Row>
            ))}
            <p className="mt-3 text-[11.5px] text-muted">{tmoney("computedNote")}</p>
          </DomainHeadCard>
        ) : null}

        {urgent.length ? (
          <Card>
            <Heading className="text-[19px]">{tmoney("urgent")}</Heading>
            <p className="mb-3 mt-0.5 text-[12.5px] text-muted">{tmoney("urgentHint")}</p>
            {urgent.slice(0, 5).map((r) => {
              const od = daysOverdue(r.due_date, r.status);
              return (
                <Link key={r.id} href={`/wedding/${r.wedding_id}/budget`} className="block">
                  <Row className="-mx-2 rounded-[var(--radius)] px-2 hover:bg-bone">
                    <RowMain title={r.title} detail={r.couple_display} />
                    <span className="shrink-0 text-[13px] font-medium text-ink">{fmt(Number(r.amount))}</span>
                    {od > 0 ? <Chip tone="urgent">{tmoney("overdue", { n: od })}</Chip> : <Chip tone="attention">{tmoney("dueChip")}</Chip>}
                  </Row>
                </Link>
              );
            })}
          </Card>
        ) : null}

        <Card>
          <Heading className="text-[19px]">{t("underManagement")}</Heading>
          <p className="mb-3 mt-0.5 text-[12.5px] text-muted">{t("underManagementHint")}</p>
          {weddings.length === 0 ? (
            <p className="py-6 text-center font-accent text-[16px] text-muted">{t("empty")}</p>
          ) : (
            weddings.map((w) => {
              const cd = countdownLabel(w.date_start, w.phase, tw);
              return (
                <Link key={w.id} href={`/wedding/${w.id}`} className="block">
                  <Row className="-mx-2 rounded-[var(--radius)] px-2 hover:bg-bone">
                    <Monogram initials={initials(w.couple_display)} size={34} />
                    <RowMain
                      title={<span className="inline-flex items-center gap-2 font-display text-[16px] font-normal">{w.couple_display} <PhaseDots phase={w.phase} /></span>}
                      detail={`${phaseLabel(w.phase, tp)}${cd ? ` · ${cd}` : ""}`}
                    />
                  </Row>
                </Link>
              );
            })
          )}
        </Card>
        </div>
      </div>
    </div>
  );
}
