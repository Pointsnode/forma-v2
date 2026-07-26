import { notFound } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { loadProposals, loadCoupleIds, toView, isTerminal } from "@/lib/loop";
import { WeddingHeader } from "@/components/wedding/wedding-header";
import { ProposalCard } from "@/components/loop/proposal-card";
import { NewProposal } from "@/components/loop/new-proposal";
import { WeddingNav, cx } from "@/components/ui";
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
  const [tw, tprop] = [await getTranslations("wedding"), await getTranslations("proposals")];

  const groups: { title: string; list: ViewProposal[] }[] = [
    { title: tprop("groupPlanner"), list: views.filter((v) => v.court === "planner") },
    { title: tprop("groupCouple"), list: views.filter((v) => v.court === "couple") },
    { title: tprop("groupSettled"), list: views.filter((v) => isTerminal(v.status)) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <WeddingHeader wedding={wedding} events={events} />
      <WeddingNav
        items={
          <>
            <Link href={`/wedding/${id}`} className="text-muted hover:text-ink">{tw("overview")}</Link>
            <Link href={`/wedding/${id}/proposals`} className={cx("text-ink")}>{tprop("tab")}</Link>
          </>
        }
      />
      <div>
        <h1 className="font-display text-[26px] text-ink">{tprop("all")}</h1>
        <p className="font-accent text-[16px] text-muted">{tprop("allHint")}</p>
      </div>

      <NewProposal weddingId={id} events={events.map((e) => ({ id: e.id, label: e.label }))} />

      {views.length === 0 ? (
        <p className="rounded-2xl bg-bone p-8 text-center font-accent text-[16px] text-muted shadow-card">{tprop("emptyAll")}</p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((g) =>
            g.list.length ? (
              <section key={g.title} className="flex flex-col gap-3">
                <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">{g.title}</p>
                {g.list.map((v) => <ProposalCard key={v.id} weddingId={id} p={v} />)}
              </section>
            ) : null,
          )}
        </div>
      )}
    </div>
  );
}
