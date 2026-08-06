"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Card, SectionTitle, Row, RowMain } from "@/components/ui";
import { completeTask } from "@/app/[locale]/(app)/wedding/[id]/task-actions";

export type CoupleTask = { id: string; title: string; note: string | null; due_date: string | null; status: string; flagged: boolean };

// The couple's assigned tasks (RLS already scoped them to couple-assigned). Marking
// one done calls complete_task (the couple's only write path) — it lands Completed
// on the planner's board and logs activity with the couple as actor.
export function CoupleTasks({ tasks: tasks0 }: { tasks: CoupleTask[] }) {
  const t = useTranslations("tasks");
  const [tasks, setTasks] = useState(tasks0);
  const [pending, start] = useTransition();
  const open = tasks.filter((x) => x.status !== "completed");
  if (tasks0.length === 0) return null;

  function done(id: string) {
    start(async () => {
      const r = await completeTask(id);
      if (!r?.error) setTasks((ts) => ts.map((x) => (x.id === id ? { ...x, status: "completed" } : x)));
    });
  }

  return (
    <>
      <SectionTitle title={t("yourTasks")} accent={t("yourTasksHint")} />
      <Card>
        {open.length === 0 ? (
          <p className="py-3 text-center font-accent text-[15px] text-text-meta">{t("yourTasksEmpty")}</p>
        ) : open.map((task) => (
          <Row key={task.id}>
            <button onClick={() => done(task.id)} disabled={pending}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--radius)] border border-hairline-token text-[11px] text-text-meta hover:border-teal hover:text-teal"
              title={t("markDone")}>{""}</button>
            <RowMain title={<span className="flex items-center gap-1.5">{task.flagged ? <span aria-hidden className="h-2.5 w-2.5 rounded-[var(--radius)] bg-wine" title={t("flagged")} /> : null}{task.title}</span>} detail={task.note || (task.due_date ? t("dueOn", { date: task.due_date }) : undefined)} />
            {task.due_date ? <span className="shrink-0 text-[11.5px] text-text-meta">{task.due_date.slice(5)}</span> : null}
          </Row>
        ))}
      </Card>
    </>
  );
}
