import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { Card, Heading, SectionLabel, Monogram, PhaseDots } from "@/components/ui";
import { CreateWorkspaceForm } from "../workspace-forms";
import { countdownDays, initials, phaseOrdinal, type WeddingRow } from "@/lib/wedding";

export default async function StudioOverview({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [t, tw, tp] = [await getTranslations("studio"), await getTranslations("wedding"), await getTranslations("phase")];

  const supabase = await createClient();
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

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <Heading className="text-[30px]">{t("overview")}</Heading>
        <p className="font-accent text-[16px] text-muted">{t("greeting")}</p>
      </div>

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
                  <Link
                    href={`/wedding/${w.id}`}
                    className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 hover:bg-bone"
                  >
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
  );
}
