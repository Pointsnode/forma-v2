import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { loadGoalMesh, computeGoals } from "@/lib/goals";
import { WeddingShell } from "@/components/wedding/wedding-shell";
import { GoalOverride } from "@/components/wedding/goal-override";
import { Card, SectionTitle, Check, cx } from "@/components/ui";

export default async function WhatsNextTab({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, id);
  if (!ctx || ctx.role === "none") notFound();
  const { wedding, events, role } = ctx;
  const t = await getTranslations("ops");

  const tg = await getTranslations("goals");
  const mesh = await loadGoalMesh(supabase, wedding, events);
  const groups = computeGoals(mesh, id, tg);

  return (
    <WeddingShell wedding={wedding} events={events} role={role} active="whatsnext">
      <SectionTitle title={t("whatsNext")} accent={t("whatsNextHint")} className="mt-0" />
      <div className="flex flex-col gap-4">
        {groups.map((grp) => (
          <Card key={grp.phase} className={cx(grp.locked && "opacity-50")}>
            <h3 className="flex items-baseline gap-3 font-display text-[19px] text-text-primary">
              <Check ok={grp.total > 0 && grp.done === grp.total} />
              {grp.title}
              <span className="text-[11.5px] font-normal text-text-meta">{grp.locked ? t("locked") : t("goalProgress", { done: grp.done, total: grp.total })}</span>
            </h3>
            {grp.locked ? (
              <p className="mt-2 text-[13px] text-text-meta">{t("lockedHint")}</p>
            ) : (
              <div className="mt-2">
                {grp.goals.map((goal) => (
                  <div key={goal.key} className="flex items-start gap-3 py-3 not-last:[box-shadow:inset_0_-1px_0_var(--color-hairline)]">
                    <Check ok={goal.done} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-medium text-text-primary">{goal.title}{goal.override === "manual_done" ? <span className="ml-1.5 text-[11px] text-taupe">· {t("markedDone")}</span> : null}</p>
                      {goal.detail ? <p className="mt-0.5 text-[12px] text-text-meta">{goal.detail}</p> : null}
                      {goal.subs.length ? (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {goal.subs.map((s, i) => (
                            <span key={i} className={cx("rounded-[var(--radius)] px-2.5 py-[2px] text-[10.8px]", s.done ? "bg-surface-card text-teal" : "bg-surface-card text-[color:var(--color-text-danger)]")}>{s.label}{s.done ? " ✓" : ""}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    {goal.link ? <Link href={goal.link.href} className="shrink-0 text-[12px] text-[color:var(--color-text-danger)] hover:underline">{goal.link.label}</Link> : null}
                    {role === "staff" && goal.overridable && !goal.done ? <GoalOverride weddingId={id} goalKey={goal.key} current={goal.override} /> : null}
                    {role === "staff" && goal.override ? <GoalOverride weddingId={id} goalKey={goal.key} current={goal.override} /> : null}
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>
    </WeddingShell>
  );
}
