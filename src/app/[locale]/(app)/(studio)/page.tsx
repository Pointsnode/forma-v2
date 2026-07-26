import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Heading, SectionLabel, Monogram, Pill, PhaseDots } from "@/components/ui";
import { CreateWorkspaceForm } from "../workspace-forms";
import { TouchLastSeen } from "./touch-last-seen";
import { countdownDays, initials, phaseOrdinal, type WeddingRow } from "@/lib/wedding";
import { loadCockpit } from "@/lib/cockpit";

export default async function StudioOverview({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tw, tp, tc] = [
    await getTranslations("studio"), await getTranslations("wedding"),
    await getTranslations("phase"), await getTranslations("cockpit"),
  ];

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

  const { data } = await supabase
    .from("weddings")
    .select("id, couple_display, phase, kind, location_city, location_country, date_start, date_end, guest_target, budget_total")
    .order("date_start", { ascending: true, nullsFirst: false });
  const weddings = (data ?? []) as WeddingRow[];
  const { feed, chase } = await loadCockpit(supabase, user!.id, weddings.map((w) => ({ id: w.id, couple_display: w.couple_display })));

  return (
    <div className="mx-auto max-w-2xl">
      <TouchLastSeen />
      <div className="mb-6">
        <Heading className="text-[30px]">{t("overview")}</Heading>
        <p className="font-accent text-[16px] text-muted">{t("greeting")}</p>
      </div>

      <div className="flex flex-col gap-4">
        {/* Since you were away */}
        <Card>
          <Heading className="text-[19px]">{tc("sinceAway")}</Heading>
          <SectionLabel className="mb-3 mt-0.5 normal-case tracking-normal text-[12px]">{tc("sinceAwayHint")}</SectionLabel>
          {feed.length === 0 ? (
            <p className="py-4 text-center font-accent text-[15px] text-muted">{tc("sinceEmpty")}</p>
          ) : (
            <ul className="flex flex-col">
              {feed.map((f) => (
                <li key={f.id} className="flex items-center gap-3 py-2.5 [box-shadow:inset_0_-1px_0_var(--color-hairline)] last:shadow-none">
                  <Monogram initials={f.tag || "·"} size={28} />
                  <p className="flex-1 text-[13.5px] text-ink">
                    <span className="font-medium">{f.actorName ?? "Forma"}</span> {tc(`verb.${f.verb}`)}
                    {f.summary ? <span className="text-muted"> — {f.summary}</span> : null}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* The chase list */}
        <Card>
          <Heading className="text-[19px]">{tc("chase")}</Heading>
          <SectionLabel className="mb-3 mt-0.5 normal-case tracking-normal text-[12px]">{tc("chaseHint")}</SectionLabel>
          {chase.length === 0 ? (
            <p className="py-4 text-center font-accent text-[15px] text-muted">{tc("chaseEmpty")}</p>
          ) : (
            <ul className="flex flex-col">
              {chase.map((c) => (
                <li key={c.proposalId}>
                  <Link href={`/wedding/${c.weddingId}/proposals`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 hover:bg-bone">
                    <Monogram initials={c.tag || "·"} size={28} />
                    <span className="flex-1 text-[13.5px] text-ink">{c.title}</span>
                    <Pill tone={c.ageDays >= 7 ? "wine" : "sand"}>{`${c.ageDays}d`}</Pill>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Under management */}
        <Card>
          <Heading className="text-[19px]">{t("underManagement")}</Heading>
          <SectionLabel className="mb-4 mt-0.5 normal-case tracking-normal text-[12px]">{t("underManagementHint")}</SectionLabel>
          {weddings.length === 0 ? (
            <p className="py-6 text-center font-accent text-[16px] text-muted">{t("empty")}</p>
          ) : (
            <ul className="flex flex-col">
              {weddings.map((w) => {
                const days = countdownDays(w.date_start);
                return (
                  <li key={w.id}>
                    <Link href={`/wedding/${w.id}`} className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-bone">
                      <Monogram initials={initials(w.couple_display)} size={34} />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 font-display text-[16px] text-ink">
                          {w.couple_display} <PhaseDots phase={w.phase} />
                        </p>
                        <p className="font-accent text-[15px] text-muted">
                          {tp("ordinal", { n: phaseOrdinal(w.phase) })} · {tp(w.phase)}
                          {days != null ? ` · ${days} ${tw("days")}` : ` · ${tw("noDate")}`}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
