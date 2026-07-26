import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { WeddingHeader } from "@/components/wedding/wedding-header";
import { Heading } from "@/components/ui";
import { gateItems, nextPhase } from "@/lib/wedding";

export default async function PlanningRoom({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, id);
  if (!ctx || ctx.role === "none") notFound();
  if (ctx.role === "member") redirect({ href: `/wedding/${id}`, locale }); // planning is a planner room
  const { wedding, events } = ctx;

  const [t, tp] = [await getTranslations("planning"), await getTranslations("phase")];
  const items = gateItems(wedding, events);
  const target = nextPhase(wedding.phase);

  return (
    <div className="flex flex-col gap-6">
      <WeddingHeader wedding={wedding} events={events} />

      <div>
        <Heading className="text-[26px]">{t("title")}</Heading>
        <p className="max-w-2xl font-accent text-[16px] text-muted">{t("subtitle")}</p>
      </div>

      <section className="rounded-2xl bg-ink px-7 py-7 text-bone shadow-hero">
        <h3 className="font-display text-[20px]">
          {target ? t("gateTo", { phase: tp(target) }) : t("nextGate")}
        </h3>
        {items.length === 0 ? (
          <p className="mt-3 font-accent text-[16px] text-[rgba(247,244,238,0.75)]">{t("allClear")}</p>
        ) : (
          <ul className="mt-5 flex flex-col">
            {items.map((it) => (
              <li key={it.key} className="flex items-baseline justify-between gap-4 py-3 [box-shadow:inset_0_-1px_0_var(--color-hairline-dark)] last:shadow-none">
                <div className="min-w-0">
                  <p className="text-[15px] text-bone">{t(`items.${it.key}`)}</p>
                  {it.pending ? (
                    <p className="mt-0.5 font-accent text-[13.5px] text-[rgba(247,244,238,0.55)]">{t("venuePending")}</p>
                  ) : null}
                </div>
                <span
                  className={
                    it.done
                      ? "shrink-0 rounded-full bg-sage-soft px-3 py-1 text-[12px] text-sage-ink"
                      : "shrink-0 rounded-full bg-sand-soft px-3 py-1 text-[12px] text-taupe"
                  }
                >
                  {it.done ? t("done") : t("pending")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Link href={`/wedding/${wedding.id}`} className="text-[13px] text-muted hover:text-ink">
        ← {t("backToWedding")}
      </Link>
    </div>
  );
}
