import { notFound } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { loadProposals, loadCoupleIds, toView, isTerminal } from "@/lib/loop";
import { WeddingShell } from "@/components/wedding/wedding-shell";
import { ProposalCard } from "@/components/loop/proposal-card";
import { NewProposal } from "@/components/loop/new-proposal";
import { SectionTitle, SectionLabel } from "@/components/ui";
import type { ViewProposal } from "@/lib/loop-view";

export default async function ProposalsTab({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, id);
  if (!ctx || ctx.role === "none") notFound();
  if (ctx.role === "member") redirect({ href: `/wedding/${id}`, locale }); // couple has no proposals tab
  const { wedding, events } = ctx;
  const lang = await getLocale();

  const [{ proposals, people }, coupleIds] = await Promise.all([loadProposals(supabase, id), loadCoupleIds(supabase, id)]);
  const views = toView(proposals, people, coupleIds, new Map(events.map((e) => [e.id, e.label])), lang);
  const tprop = await getTranslations("proposals");

  const groups: { title: string; list: ViewProposal[] }[] = [
    { title: tprop("groupPlanner"), list: views.filter((v) => v.court === "planner") },
    { title: tprop("groupCouple"), list: views.filter((v) => v.court === "couple") },
    { title: tprop("groupSettled"), list: views.filter((v) => isTerminal(v.status)) },
  ];

  return (
    <WeddingShell wedding={wedding} events={events} role="staff" active="proposals">
      <SectionTitle title={tprop("all")} accent={tprop("allHint")} className="mt-0" />
      <div className="mb-6"><NewProposal weddingId={id} events={events.map((e) => ({ id: e.id, label: e.label }))} /></div>

      {views.length === 0 ? (
        <p className="rounded-[var(--radius)] bg-surface-card p-8 text-center font-accent text-[16px] text-text-meta">{tprop("emptyAll")}</p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) =>
            g.list.length ? (
              <section key={g.title} className="flex flex-col gap-3">
                <SectionLabel>{g.title}</SectionLabel>
                {g.list.map((v) => <ProposalCard key={v.id} weddingId={id} p={v} />)}
              </section>
            ) : null,
          )}
        </div>
      )}
    </WeddingShell>
  );
}
