import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  Card, Heading, Monogram, PhaseDots, StatRow, Stat, SectionTitle, Row, RowMain, cx,
} from "@/components/ui";
import { CreateWorkspaceForm } from "../workspace-forms";
import { TouchLastSeen } from "./touch-last-seen";
import { countdownDays, initials, phaseOrdinal, PHASE_ORDER, type Phase, type WeddingRow } from "@/lib/wedding";
import { loadCockpit } from "@/lib/cockpit";

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

  // Stat tile subs — the tiles whose data exists this milestone. Money (M5) and
  // appointments (M6) are absent, not stubbed.
  const byPhase = new Map<Phase, number>();
  for (const w of weddings) byPhase.set(w.phase, (byPhase.get(w.phase) ?? 0) + 1);
  const phaseBreakdown = PHASE_ORDER.filter((p) => byPhase.has(p))
    .map((p) => tc("nInPhase", { count: byPhase.get(p)!, phase: tp(p) }))
    .join(" · ");
  const oldest = chase[0];
  const today = new Intl.DateTimeFormat(lang === "es" ? "es-ES" : "en-US", { weekday: "long", month: "long", day: "numeric" }).format(new Date());

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
      </StatRow>

      <div className="mt-[18px] grid gap-[18px] lg:grid-cols-[1.6fr_1fr]">
        {/* left — since you were away + the chase list */}
        <div className="flex flex-col gap-[18px]">
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
                        <span className="font-medium">{f.actorName ?? "Forma"}</span> {tc(`verb.${f.verb}`)}
                        {f.summary ? <span className="font-normal text-muted"> — {f.summary}</span> : null}
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
                <Link key={c.proposalId} href={`/wedding/${c.weddingId}/proposals`} className="block">
                  <Row className="-mx-2 rounded-xl px-2 hover:bg-bone">
                    <Monogram initials={c.tag || "·"} size={28} />
                    <RowMain title={c.title} />
                    <span className={cx("shrink-0 rounded-full px-2.5 py-[3px] text-[11px] font-medium", c.ageDays >= 7 ? "bg-wine-soft text-wine" : "bg-sand-soft text-taupe")}>
                      {tc("ageDays", { days: c.ageDays })}
                    </span>
                  </Row>
                </Link>
              ))
            )}
          </Card>
        </div>

        {/* right — under management */}
        <Card className="self-start">
          <Heading className="text-[19px]">{t("underManagement")}</Heading>
          <p className="mb-3 mt-0.5 text-[12.5px] text-muted">{t("underManagementHint")}</p>
          {weddings.length === 0 ? (
            <p className="py-6 text-center font-accent text-[16px] text-muted">{t("empty")}</p>
          ) : (
            weddings.map((w) => {
              const days = countdownDays(w.date_start);
              return (
                <Link key={w.id} href={`/wedding/${w.id}`} className="block">
                  <Row className="-mx-2 rounded-xl px-2 hover:bg-bone">
                    <Monogram initials={initials(w.couple_display)} size={34} />
                    <RowMain
                      title={<span className="inline-flex items-center gap-2 font-display text-[16px] font-normal">{w.couple_display} <PhaseDots phase={w.phase} /></span>}
                      detail={`${tp("ordinal", { n: phaseOrdinal(w.phase) })} · ${tp(w.phase)}${days != null ? ` · ${days} ${tw("days")}` : ""}`}
                    />
                  </Row>
                </Link>
              );
            })
          )}
        </Card>
      </div>
    </div>
  );
}
