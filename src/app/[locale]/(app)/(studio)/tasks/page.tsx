import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { AddTask, TaskToggle } from "@/components/studio/task-controls";
import { Card, SectionTitle, Row, RowMain, cx } from "@/components/ui";

export default async function TasksPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("ops");
  const supabase = await createClient();

  const [{ data: ws }, { data: weds }, { data: taskRows }] = await Promise.all([
    supabase.from("workspace_members").select("workspace_id").order("created_at", { ascending: true }).limit(1).maybeSingle(),
    supabase.from("weddings").select("id, couple_display").order("date_start", { ascending: true, nullsFirst: false }),
    supabase.from("tasks").select("id, title, due_date, done_at, wedding_id, workspace_id").order("done_at", { nullsFirst: true }).order("due_date", { ascending: true, nullsFirst: false }),
  ]);
  const workspaceId = ws?.workspace_id ?? "";
  const weddings = (weds ?? []) as { id: string; couple_display: string }[];
  const wname = new Map(weddings.map((w) => [w.id, w.couple_display]));
  const tasks = (taskRows ?? []) as { id: string; title: string; due_date: string | null; done_at: string | null; wedding_id: string | null; workspace_id: string | null }[];

  // group by wedding (or studio)
  const groups = new Map<string, { title: string; tasks: typeof tasks }>();
  groups.set("studio", { title: t("studioTask"), tasks: [] });
  for (const w of weddings) groups.set(w.id, { title: wname.get(w.id) ?? "—", tasks: [] });
  for (const task of tasks) groups.get(task.wedding_id ?? "studio")?.tasks.push(task);

  return (
    <div>
      <SectionTitle title={t("tasks")} accent={t("tasksHint")} action={<AddTask workspaceId={workspaceId} weddings={weddings.map((w) => ({ id: w.id, name: w.couple_display }))} />} className="mt-1" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[...groups.entries()].filter(([, g]) => g.tasks.length).map(([key, g]) => (
          <Card key={key}>
            <h3 className="mb-2 font-display text-[17px] text-ink">{g.title}</h3>
            {g.tasks.map((task) => (
              <Row key={task.id}>
                <TaskToggle taskId={task.id} done={!!task.done_at} />
                <RowMain title={<span className={cx(task.done_at && "text-muted line-through")}>{task.title}</span>} detail={task.due_date ?? undefined} />
              </Row>
            ))}
          </Card>
        ))}
      </div>
      {tasks.length === 0 ? <Card className="mt-4"><p className="py-6 text-center font-accent text-[15px] text-muted">{t("noTasks")}</p></Card> : null}
    </div>
  );
}
