import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AddTask, TaskToggle } from "@/components/studio/task-controls";
import { Card, SectionTitle, Row, RowMain, BentoBig, Check, cx, heroToneAt } from "@/components/ui";
import { countdownDays, type WeddingRow, type EventRow } from "@/lib/wedding";
import { loadGoalMesh, computeGoals } from "@/lib/goals";

export default async function TasksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("ops");
  const tw = await getTranslations("wedding");
  const supabase = await createClient();

  const [{ data: ws }, { data: weds }, { data: taskRows }] = await Promise.all([
    supabase.from("workspace_members").select("workspace_id").order("created_at", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("weddings").select("id, couple_display, phase, kind, location_city, location_country, date_start, date_end, guest_target, budget_total").order("date_start", { ascending: true, nullsFirst: false }),
    supabase.from("tasks").select("id, title, due_date, done_at, wedding_id, workspace_id").order("done_at", { nullsFirst: true }).order("due_date", { ascending: true, nullsFirst: false }),
  ]);
  const workspaceId = ws?.workspace_id ?? "";
  const weddings = (weds ?? []) as WeddingRow[];
  const tasks = (taskRows ?? []) as { id: string; title: string; due_date: string | null; done_at: string | null; wedding_id: string | null; workspace_id: string | null }[];
  const tasksFor = (wid: string | null) => tasks.filter((task) => task.wedding_id === wid);

  // Per-wedding TOP computed next moves (§1E) — pulled, not maintained.
  const nextMoves = new Map<string, { key: string; title: string; detail: string | null }[]>();
  await Promise.all(weddings.filter((w) => w.phase !== "closed").map(async (w) => {
    const { data: evs } = await supabase.from("wedding_events").select("id, label, kind, event_date, start_time, end_time, order_index, guest_target").eq("wedding_id", w.id).order("event_date", { ascending: true, nullsFirst: false });
    const events = (evs ?? []) as EventRow[];
    const groups = computeGoals(await loadGoalMesh(supabase, w, events), w.id);
    const open = groups.filter((g) => !g.locked).flatMap((g) => g.goals).filter((g) => !g.done).slice(0, 3);
    nextMoves.set(w.id, open.map((g) => ({ key: g.key, title: g.title, detail: g.detail })));
  }));

  const studioTasks = tasksFor(null).filter((task) => task.workspace_id);

  return (
    <div>
      <SectionTitle title={t("tasks")} accent={t("tasksHint")} action={<AddTask workspaceId={workspaceId} weddings={weddings.map((w) => ({ id: w.id, name: w.couple_display }))} />} className="mt-1" />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {weddings.map((w, i) => {
          const days = countdownDays(w.date_start);
          const moves = nextMoves.get(w.id) ?? [];
          const manual = tasksFor(w.id);
          if (w.phase === "closed" && manual.length === 0) return null;
          return (
            <div key={w.id} className="flex flex-col overflow-hidden rounded-2xl bg-paper shadow-card">
              <div className="flex h-16 items-end justify-between p-3 text-[rgba(255,253,249,0.95)]" style={{ background: heroToneAt(i) }}>
                <BentoBig size={16}>{w.couple_display}</BentoBig>
                <span className="font-accent text-[13px] italic">{w.phase === "closed" ? tw("settled") : days != null ? (days >= 0 ? `${days} ${tw("days")}` : tw("daysAgo", { count: -days })) : ""}</span>
              </div>
              <div className="flex flex-1 flex-col p-4">
                {moves.map((m) => (
                  <div key={m.key} className="flex items-start gap-2 py-1.5 not-last:[box-shadow:inset_0_-1px_0_var(--color-hairline)]">
                    <Check ok={false} />
                    <div className="min-w-0"><p className="text-[13px] font-medium text-ink">{m.title}</p>{m.detail ? <p className="text-[11.5px] text-muted">{m.detail}</p> : null}</div>
                  </div>
                ))}
                {manual.map((task) => (
                  <Row key={task.id}>
                    <TaskToggle taskId={task.id} done={!!task.done_at} />
                    <RowMain title={<span className={cx("text-[13px]", task.done_at && "text-muted line-through")}>{task.title}</span>} detail={task.due_date ?? undefined} />
                  </Row>
                ))}
                {moves.length === 0 && manual.length === 0 ? <p className="py-2 text-center font-accent text-[13px] text-muted">{t("noTasks")}</p> : null}
              </div>
            </div>
          );
        })}
        {studioTasks.length ? (
          <Card>
            <h3 className="mb-2 font-display text-[16px] text-ink">{t("studioTask")}</h3>
            {studioTasks.map((task) => (
              <Row key={task.id}><TaskToggle taskId={task.id} done={!!task.done_at} /><RowMain title={<span className={cx("text-[13px]", task.done_at && "text-muted line-through")}>{task.title}</span>} detail={task.due_date ?? undefined} /></Row>
            ))}
          </Card>
        ) : null}
      </div>
    </div>
  );
}
