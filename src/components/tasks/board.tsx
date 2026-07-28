"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { cx } from "@/components/ui";
import { createTask, updateTask, moveTask, deleteTask, setFlag, type TaskInput } from "@/app/[locale]/(app)/wedding/[id]/task-actions";

export type TaskCardVM = {
  id: string; title: string; note: string | null; status: string; flagged: boolean; due_date: string | null;
  wedding_id: string | null; weddingInitials: string | null; weddingName: string | null;
  eventId: string | null; eventLabel: string | null;
  assigneeKind: "team" | "couple" | "vendor" | null; assigneeLabel: string | null;
  proposalId: string | null; contractId: string | null; engagementId: string | null; documentId: string | null;
  href: string;
};
export type BoardVM = Record<string, TaskCardVM[]>;
export type BoardOptions = { members: { id: string; name: string }[]; vendors: { id: string; name: string }[]; events: { id: string; label: string }[] };
export type WeddingFilter = { id: string; name: string; initials: string };

const COLUMNS = ["pending", "working", "waiting", "completed"] as const;
type Col = (typeof COLUMNS)[number];
const RAIL: Record<Col, string> = { pending: "bg-muted", working: "bg-ink", waiting: "bg-wine", completed: "bg-sage" };

const inputCls = "w-full rounded-xl bg-bone px-3.5 py-2.5 text-[14px] text-ink shadow-card outline-none focus:shadow-lift";
const todayISO = () => new Date().toISOString().slice(0, 10);
const initialsOf = (s: string | null) => (s ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "·";

export function TaskBoard({ board: board0, master = false, weddingId, workspaceId, options, weddingsForFilter = [] }: {
  board: BoardVM; master?: boolean; weddingId?: string; workspaceId?: string; options: BoardOptions; weddingsForFilter?: WeddingFilter[];
}) {
  const t = useTranslations("tasks");
  const router = useRouter();
  const [board, setBoard] = useState<BoardVM>(board0);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<Col | null>(null);
  const [sheet, setSheet] = useState<{ mode: "new" | "edit"; task?: TaskCardVM } | null>(null);
  const [wedFilter, setWedFilter] = useState<Set<string>>(new Set());
  const [urgFilter, setUrgFilter] = useState<Set<"flagged" | "overdue" | "today">>(new Set());
  const today = todayISO();

  function findCard(id: string): { card: TaskCardVM; col: Col } | null {
    for (const c of COLUMNS) { const card = board[c]?.find((x) => x.id === id); if (card) return { card, col: c }; }
    return null;
  }
  async function move(id: string, to: Col) {
    const found = findCard(id);
    if (!found || found.col === to) return;
    setBoard((b) => {
      const next: BoardVM = { pending: [...(b.pending ?? [])], working: [...(b.working ?? [])], waiting: [...(b.waiting ?? [])], completed: [...(b.completed ?? [])] };
      next[found.col] = next[found.col].filter((x) => x.id !== id);
      next[to] = [{ ...found.card, status: to }, ...next[to]];
      return next;
    });
    await moveTask(id, to);
    router.refresh();
  }
  async function flag(id: string, on: boolean) {
    setBoard((b) => {
      const next = { ...b };
      for (const c of COLUMNS) next[c] = (b[c] ?? []).map((x) => (x.id === id ? { ...x, flagged: on } : x));
      return next;
    });
    await setFlag(id, on);
    router.refresh();
  }

  const keep = (card: TaskCardVM): boolean => {
    if (master && wedFilter.size && !(card.wedding_id && wedFilter.has(card.wedding_id))) return false;
    if (urgFilter.size) {
      const overdue = !!card.due_date && card.due_date < today && card.status !== "completed";
      const dueToday = card.due_date === today;
      const ok = (urgFilter.has("flagged") && card.flagged) || (urgFilter.has("overdue") && overdue) || (urgFilter.has("today") && dueToday);
      if (!ok) return false;
    }
    return true;
  };
  const toggle = <T,>(set: Set<T>, v: T, setter: (s: Set<T>) => void) => { const n = new Set(set); if (n.has(v)) n.delete(v); else n.add(v); setter(n); };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {master && weddingsForFilter.length ? weddingsForFilter.map((w) => (
          <button key={w.id} onClick={() => toggle(wedFilter, w.id, setWedFilter)}
            className={cx("flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px]", wedFilter.has(w.id) ? "bg-ink text-bone" : "bg-bone text-muted hover:text-ink")}>
            <span className="font-medium">{w.initials}</span>{w.name}
          </button>
        )) : null}
        {(["flagged", "overdue", "today"] as const).map((u) => (
          <button key={u} onClick={() => toggle(urgFilter, u, setUrgFilter)}
            className={cx("rounded-full px-2.5 py-1 text-[11.5px]", urgFilter.has(u) ? "bg-wine text-bone" : "bg-wine-soft text-wine hover:opacity-80")}>
            {t(`filter_${u}`)}
          </button>
        ))}
        <button onClick={() => setSheet({ mode: "new" })} className="ml-auto rounded-full bg-ink px-3.5 py-2 text-[13px] text-bone">+ {t("newTask")}</button>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const cards = (board[col] ?? []).filter(keep);
          return (
            <section key={col}
              onDragOver={(e) => { e.preventDefault(); setOverCol(col); }}
              onDragLeave={() => setOverCol((c) => (c === col ? null : c))}
              onDrop={() => { if (dragId) move(dragId, col); setDragId(null); setOverCol(null); }}
              className={cx("rounded-2xl bg-paper p-3 shadow-card transition-colors", overCol === col && "ring-2 ring-hairline")}>
              <header className="mb-2 px-1">
                <div className="flex items-baseline gap-2">
                  <h3 className="font-display text-[15px] text-ink">{t(`col_${col}`)}</h3>
                  <span className="rounded-full bg-bone px-2 py-0.5 text-[11px] text-muted">{cards.length}</span>
                </div>
                <div className={cx("mt-1 h-[3px] w-10 rounded-full", RAIL[col])} />
              </header>
              <div className="flex flex-col gap-2">
                {cards.map((card) => (
                  <TaskChip key={card.id} card={card} col={col} master={master} t={t}
                    onOpen={() => router.push(card.href)} onEdit={() => setSheet({ mode: "edit", task: card })}
                    onComplete={() => move(card.id, "completed")} onReopen={() => move(card.id, "pending")}
                    onFlag={(on) => flag(card.id, on)} onDragStart={() => setDragId(card.id)} />
                ))}
                {cards.length === 0 ? <p className="px-1 py-2 text-[12px] text-muted">{urgFilter.size || wedFilter.size ? t("noneMatch") : t("colEmpty")}</p> : null}
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

function TaskChip({ card, col, master, t, onOpen, onEdit, onComplete, onReopen, onFlag, onDragStart }: {
  card: TaskCardVM; col: Col; master: boolean; t: ReturnType<typeof useTranslations>;
  onOpen: () => void; onEdit: () => void; onComplete: () => void; onReopen: () => void; onFlag: (on: boolean) => void; onDragStart: () => void;
}) {
  const done = card.status === "completed";
  return (
    <div draggable onDragStart={onDragStart}
      className="flex items-stretch gap-2 overflow-hidden rounded-xl bg-bone shadow-card hover:shadow-lift">
      <div className={cx("w-[3px] shrink-0", RAIL[col])} />
      <div className="min-w-0 flex-1">
        {/* body — clicking navigates to the linked place (§1E) */}
        <button onClick={onOpen} className="block w-full px-1.5 pt-2 text-left" title={card.title}>
          <span className="flex items-start gap-1.5">
            {card.flagged && !done ? <span aria-hidden className="mt-[3px] h-2.5 w-2.5 shrink-0 rounded-[2px] bg-wine" title={t("flagged")} /> : null}
            <span className="line-clamp-2 text-[13.5px] leading-snug text-ink">{card.title}</span>
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {master && card.weddingInitials ? <span className="rounded bg-paper px-1.5 py-[3px] text-[11px] font-medium uppercase tracking-[0.05em] text-muted">{card.weddingInitials}</span> : null}
            {card.eventLabel ? <span className="rounded bg-paper px-1.5 py-[3px] text-[11px] text-taupe">{card.eventLabel}</span> : null}
            <AssigneeChip card={card} />
            <DuePill card={card} t={t} />
          </span>
        </button>
        {/* footer — explicit, always-visible, labeled actions (separated so a thumb can't misfire onto the body) */}
        <div className="mt-2 flex items-stretch gap-1 border-t border-hairline px-1 py-1">
          <ActionBtn onClick={done ? onReopen : onComplete} icon={done ? "↩" : "✓"} label={done ? t("btnReopen") : t("btnDone")} tone={done ? "muted" : "sage"} />
          <ActionBtn onClick={() => onFlag(!card.flagged)} icon="⚑" label={t("btnFlag")} tone={card.flagged ? "wine" : "muted"} active={card.flagged} />
          <ActionBtn onClick={onEdit} icon="✎" label={t("btnEdit")} tone="muted" />
        </div>
      </div>
    </div>
  );
}

function ActionBtn({ onClick, icon, label, tone, active = false }: { onClick: () => void; icon: string; label: string; tone: "sage" | "wine" | "muted"; active?: boolean }) {
  const cls = tone === "sage" ? "text-sage-ink hover:bg-sage-soft" : tone === "wine" ? "text-wine hover:bg-wine-soft" : "text-taupe hover:bg-paper hover:text-ink";
  return (
    <button onClick={onClick} className={cx("flex min-h-[40px] flex-1 items-center justify-center gap-1 rounded-lg text-[12px] font-medium sm:min-h-[34px]", cls, active && "bg-wine-soft")}>
      <span aria-hidden className="text-[12.5px] leading-none">{icon}</span>{label}
    </button>
  );
}

function AssigneeChip({ card }: { card: TaskCardVM }) {
  if (!card.assigneeKind) return null;
  const label = card.assigneeLabel ?? "";
  if (card.assigneeKind === "team") return <span className="flex h-[19px] items-center rounded-full bg-ink px-1.5 text-[11px] font-medium text-bone" title={label}>{initialsOf(label)}</span>;
  if (card.assigneeKind === "couple") return <span className="flex h-[19px] items-center rounded-full border border-wine px-1.5 text-[11px] font-medium text-wine" title={label}>{initialsOf(card.weddingName ?? label)}</span>;
  return <span className="flex h-[19px] items-center rounded bg-sand-soft px-1.5 text-[11px] font-medium text-taupe" title={label}>{initialsOf(label)}</span>;
}

function DuePill({ card, t }: { card: TaskCardVM; t: ReturnType<typeof useTranslations> }) {
  if (card.status === "completed" || !card.due_date) return null;
  const today = todayISO();
  if (card.due_date < today) {
    const days = Math.max(1, Math.round((Date.parse(today) - Date.parse(card.due_date)) / 86_400_000));
    return <span className="rounded-full bg-wine px-1.5 py-[3px] text-[11px] font-medium text-bone">{t("overdueDays", { days })}</span>;
  }
  if (card.due_date === today) return <span className="rounded-full border border-wine px-1.5 py-[2px] text-[11px] text-wine">{t("dueToday")}</span>;
  return <span className="text-[11px] text-muted">{card.due_date.slice(5)}</span>;
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
  const [flagged, setFlagged] = useState(task?.flagged ?? false);
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!title.trim() || busy) return;
    setBusy(true);
    const base: TaskInput = { title, note, due_date: due, flagged, assignee_kind: kind, assignee_member: member, assignee_vendor: vendor, event_id: weddingId ? eventId : undefined };
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
              <option value="">{t("unassigned")}</option><option value="team">{t("assignTeam")}</option><option value="couple">{t("assignCouple")}</option><option value="vendor">{t("assignVendor")}</option>
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
              <option value="">{t("noEvent")}</option>{options.events.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select></label>
        ) : null}
        {mode === "edit" ? (
          <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("status")}</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>{COLUMNS.map((c) => <option key={c} value={c}>{t(`col_${c}`)}</option>)}</select></label>
        ) : null}
        <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("note")}</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputCls} /></label>
        <label className="flex items-center gap-2 text-[13px] text-ink"><input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} /> <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[2px] bg-wine" />{t("markUrgent")}</span></label>
        <div className="flex items-center gap-2">
          <button onClick={save} disabled={busy || !title.trim()} className="rounded-full bg-ink px-4 py-2 text-[13px] text-bone disabled:opacity-40">{t("save")}</button>
          <button onClick={onClose} className="rounded-full px-3 py-2 text-[13px] text-muted hover:text-ink">{t("cancel")}</button>
          {mode === "edit" ? <button onClick={async () => { await deleteTask(task!.id); onDone(); }} className="ml-auto text-[12.5px] text-muted hover:text-wine">{t("delete")}</button> : null}
        </div>
      </div>
    </div>
  );
}
