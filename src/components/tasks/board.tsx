"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { cx } from "@/components/ui";
import { createTask, updateTask, moveTask, deleteTask, type TaskInput } from "@/app/[locale]/(app)/wedding/[id]/task-actions";

export type TaskCardVM = {
  id: string; title: string; note: string | null; status: string; due_date: string | null;
  wedding_id: string | null; weddingInitials: string | null;
  eventId: string | null; eventLabel: string | null;
  assigneeKind: "team" | "couple" | "vendor" | null; assigneeLabel: string | null; weddingName: string | null;
  proposalId: string | null; contractId: string | null; engagementId: string | null; documentId: string | null;
  href: string;
};
export type BoardVM = Record<string, TaskCardVM[]>;
export type BoardOptions = { members: { id: string; name: string }[]; vendors: { id: string; name: string }[]; events: { id: string; label: string }[] };

const COLUMNS = ["pending", "working", "waiting", "completed"] as const;
type Col = (typeof COLUMNS)[number];

// column identity (§1D): rail + header underline in the status color
const RAIL: Record<Col, string> = { pending: "bg-muted", working: "bg-ink", waiting: "bg-wine", completed: "bg-sage" };
const UNDER: Record<Col, string> = { pending: "bg-muted", working: "bg-ink", waiting: "bg-wine", completed: "bg-sage" };

const inputCls = "w-full rounded-xl bg-bone px-3.5 py-2.5 text-[14px] text-ink shadow-card outline-none focus:shadow-lift";
const todayISO = () => new Date().toISOString().slice(0, 10);
const initialsOf = (s: string | null) => (s ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "·";

export function TaskBoard({ board: board0, master = false, weddingId, workspaceId, options }: {
  board: BoardVM; master?: boolean; weddingId?: string; workspaceId?: string; options: BoardOptions;
}) {
  const t = useTranslations("tasks");
  const router = useRouter();
  const [board, setBoard] = useState<BoardVM>(board0);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<Col | null>(null);
  const [sheet, setSheet] = useState<{ mode: "new" | "edit"; task?: TaskCardVM } | null>(null);

  function findCard(id: string): { card: TaskCardVM; col: Col } | null {
    for (const c of COLUMNS) { const card = board[c]?.find((x) => x.id === id); if (card) return { card, col: c }; }
    return null;
  }

  async function move(id: string, to: Col) {
    const found = findCard(id);
    if (!found || found.col === to) return;
    // optimistic
    setBoard((b) => {
      const next: BoardVM = { pending: [...(b.pending ?? [])], working: [...(b.working ?? [])], waiting: [...(b.waiting ?? [])], completed: [...(b.completed ?? [])] };
      next[found.col] = next[found.col].filter((x) => x.id !== id);
      next[to] = [{ ...found.card, status: to }, ...next[to]];
      return next;
    });
    await moveTask(id, to);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button onClick={() => setSheet({ mode: "new" })} className="rounded-full bg-ink px-3.5 py-2 text-[13px] text-bone">+ {t("newTask")}</button>
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const cards = board[col] ?? [];
          return (
            <section key={col}
              onDragOver={(e) => { e.preventDefault(); setOverCol(col); }}
              onDragLeave={() => setOverCol((c) => (c === col ? null : c))}
              onDrop={() => { if (dragId) move(dragId, col); setDragId(null); setOverCol(null); }}
              className={cx("rounded-2xl bg-paper p-3 shadow-card transition-colors", overCol === col && "ring-2 ring-hairline")}
            >
              <header className="mb-2 px-1">
                <div className="flex items-baseline gap-2">
                  <h3 className="font-display text-[15px] text-ink">{t(`col_${col}`)}</h3>
                  <span className="rounded-full bg-bone px-2 py-0.5 text-[11px] text-muted">{cards.length}</span>
                </div>
                <div className={cx("mt-1 h-[3px] w-10 rounded-full", UNDER[col])} />
              </header>
              <div className="flex flex-col gap-2">
                {cards.map((card) => (
                  <TaskChip key={card.id} card={card} col={col} master={master} t={t}
                    onOpen={() => router.push(card.href)}
                    onEdit={() => setSheet({ mode: "edit", task: card })}
                    onComplete={() => move(card.id, "completed")}
                    onMove={(to) => move(card.id, to)}
                    onDragStart={() => setDragId(card.id)} />
                ))}
                {cards.length === 0 ? <p className="px-1 py-2 text-[12px] text-muted">{t("colEmpty")}</p> : null}
              </div>
            </section>
          );
        })}
      </div>

      {sheet ? (
        <TaskSheet mode={sheet.mode} task={sheet.task} weddingId={weddingId} workspaceId={workspaceId} options={options}
          onClose={() => setSheet(null)} onDone={() => { setSheet(null); router.refresh(); }} t={t} />
      ) : null}
    </div>
  );
}

function TaskChip({ card, col, master, t, onOpen, onEdit, onComplete, onMove, onDragStart }: {
  card: TaskCardVM; col: Col; master: boolean; t: ReturnType<typeof useTranslations>;
  onOpen: () => void; onEdit: () => void; onComplete: () => void; onMove: (to: Col) => void; onDragStart: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const done = card.status === "completed";
  return (
    <div draggable onDragStart={onDragStart}
      className="group relative flex items-stretch gap-2 overflow-hidden rounded-xl bg-bone pr-2 shadow-card hover:shadow-lift">
      <div className={cx("w-[3px] shrink-0", RAIL[col])} />
      <div className="min-w-0 flex-1 py-2">
        <button onClick={onOpen} className="block w-full truncate text-left text-[13.5px] text-ink" title={card.title}>{card.title}</button>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {master && card.weddingInitials ? <span className="rounded bg-paper px-1.5 py-0.5 text-[10px] uppercase tracking-[0.06em] text-muted">{card.weddingInitials}</span> : null}
          {card.eventLabel ? <span className="rounded bg-paper px-1.5 py-0.5 text-[10.5px] text-taupe">{card.eventLabel}</span> : null}
          <AssigneeChip card={card} />
          <DuePill card={card} t={t} />
        </div>
      </div>
      <div className="flex flex-col items-center justify-between py-1.5">
        <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <button onClick={onEdit} title={t("edit")} className="text-[12px] text-muted hover:text-ink">✎</button>
          <button onClick={() => setMenu((m) => !m)} title={t("moveTo")} className="text-[12px] text-muted hover:text-ink">⋯</button>
        </div>
        <button onClick={onComplete} title={t("markDone")} className={cx("flex h-5 w-5 items-center justify-center rounded-full border text-[11px]", done ? "border-sage bg-sage-soft text-sage-ink" : "border-hairline text-muted hover:border-sage hover:text-sage-ink")}>{done ? "✓" : ""}</button>
      </div>
      {menu ? (
        <>
          <button className="fixed inset-0 z-40 cursor-default" onClick={() => setMenu(false)} aria-hidden />
          <div className="absolute right-2 top-8 z-50 flex flex-col overflow-hidden rounded-xl bg-paper py-1 shadow-lift">
            {COLUMNS.filter((c) => c !== col).map((c) => (
              <button key={c} onClick={() => { setMenu(false); onMove(c); }} className="px-3 py-1.5 text-left text-[12.5px] text-ink hover:bg-bone">{t(`moveToCol`, { col: t(`col_${c}`) })}</button>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

function AssigneeChip({ card }: { card: TaskCardVM }) {
  if (!card.assigneeKind) return null;
  const label = card.assigneeLabel ?? "";
  if (card.assigneeKind === "team") return <span className="flex h-[18px] items-center rounded-full bg-ink px-1.5 text-[10px] font-medium text-bone" title={label}>{initialsOf(label)}</span>;
  if (card.assigneeKind === "couple") return <span className="flex h-[18px] items-center rounded-full border border-wine px-1.5 text-[10px] font-medium text-wine" title={label}>{initialsOf(card.weddingName ?? label)}</span>;
  return <span className="flex h-[18px] items-center rounded bg-sand-soft px-1.5 text-[10px] font-medium text-taupe" title={label}>{initialsOf(label)}</span>; // vendor = square
}

function DuePill({ card, t }: { card: TaskCardVM; t: ReturnType<typeof useTranslations> }) {
  if (card.status === "completed") return null;
  if (!card.due_date) return null;
  const today = todayISO();
  if (card.due_date < today) {
    const days = Math.max(1, Math.round((Date.parse(today) - Date.parse(card.due_date)) / 86_400_000));
    return <span className="rounded-full bg-wine px-1.5 py-0.5 text-[10px] font-medium text-bone">{t("overdueDays", { days })}</span>;
  }
  if (card.due_date === today) return <span className="rounded-full border border-wine px-1.5 py-0.5 text-[10px] text-wine">{t("dueToday")}</span>;
  return <span className="text-[10.5px] text-muted">{card.due_date.slice(5)}</span>;
}

function TaskSheet({ mode, task, weddingId, workspaceId, options, onClose, onDone, t }: {
  mode: "new" | "edit"; task?: TaskCardVM; weddingId?: string; workspaceId?: string; options: BoardOptions;
  onClose: () => void; onDone: () => void; t: ReturnType<typeof useTranslations>;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [note, setNote] = useState(task?.note ?? "");
  const [due, setDue] = useState(task?.due_date ?? "");
  const [kind, setKind] = useState<"" | "team" | "couple" | "vendor">(task?.assigneeKind ?? "");
  const [member, setMember] = useState(options.members[0]?.id ?? "");
  const [vendor, setVendor] = useState(options.vendors[0]?.id ?? "");
  const [eventId, setEventId] = useState(task?.eventId ?? "");
  const [status, setStatus] = useState(task?.status ?? "pending");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!title.trim() || busy) return;
    setBusy(true);
    const base: TaskInput = {
      title, note, due_date: due, assignee_kind: kind,
      assignee_member: member, assignee_vendor: vendor,
      event_id: weddingId ? eventId : undefined,
    };
    const r = mode === "new"
      ? await createTask({ ...base, wedding_id: weddingId ?? null, workspace_id: weddingId ? null : (workspaceId ?? null) })
      : await updateTask(task!.id, { ...base, status });
    setBusy(false);
    if (!r?.error) onDone();
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button className="absolute inset-0 bg-[rgba(21,18,16,0.55)]" onClick={onClose} aria-label={t("close")} />
      <div className="relative flex w-full max-w-[460px] flex-col gap-3 rounded-[18px] bg-paper p-6 shadow-hero">
        <p className="font-display text-[18px] text-ink">{mode === "new" ? t("newTask") : t("editTask")}</p>
        <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("subject")}</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputCls} autoFocus /></label>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("assignee")}</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={inputCls}>
              <option value="">{t("unassigned")}</option>
              <option value="team">{t("assignTeam")}</option>
              <option value="couple">{t("assignCouple")}</option>
              <option value="vendor">{t("assignVendor")}</option>
            </select></label>
          <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("due")}</span>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} /></label>
        </div>
        {kind === "team" ? (
          <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("teamMember")}</span>
            <select value={member} onChange={(e) => setMember(e.target.value)} className={inputCls}>{options.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
        ) : null}
        {kind === "vendor" ? (
          <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("vendor")}</span>
            <select value={vendor} onChange={(e) => setVendor(e.target.value)} className={inputCls}>{options.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
        ) : null}
        {weddingId && options.events.length ? (
          <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("event")}</span>
            <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={inputCls}>
              <option value="">{t("noEvent")}</option>
              {options.events.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select></label>
        ) : null}
        {mode === "edit" ? (
          <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("status")}</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>{COLUMNS.map((c) => <option key={c} value={c}>{t(`col_${c}`)}</option>)}</select></label>
        ) : null}
        <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("note")}</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputCls} /></label>
        <div className="flex items-center gap-2">
          <button onClick={save} disabled={busy || !title.trim()} className="rounded-full bg-ink px-4 py-2 text-[13px] text-bone disabled:opacity-40">{t("save")}</button>
          <button onClick={onClose} className="rounded-full px-3 py-2 text-[13px] text-muted hover:text-ink">{t("cancel")}</button>
          {mode === "edit" ? <button onClick={async () => { await deleteTask(task!.id); onDone(); }} className="ml-auto text-[12.5px] text-muted hover:text-wine">{t("delete")}</button> : null}
        </div>
      </div>
    </div>
  );
}
