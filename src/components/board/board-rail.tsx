"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { cx } from "@/components/ui";
import { BOARD_EMOJI, parseMentions } from "@/lib/board.mjs";
import { askConcierge, postClientMessage } from "@/app/[locale]/(app)/board-actions";

type Lane = "team" | "client";

type Wedding = { id: string; name: string };
type Member = { user_id: string; name: string | null };
type Summary = { notifications: number; threads: { wedding_id: string | null; unread: number }[] };
type Msg = {
  id: string; author_kind: string; author_id: string | null; author_name: string | null; body: string | null;
  task_id: string | null; task_status: string | null; task_title: string | null; system_event: string | null;
  deleted_at: string | null; edited_at: string | null; created_at: string; mine: boolean; reactions: Record<string, number>; my_reactions: string[];
};

export function BoardRail({ workspaceId, selfId, weddings, roster, initialSummary, linkBase }: {
  workspaceId: string; selfId: string; weddings: Wedding[]; roster: Member[]; initialSummary: Summary; linkBase: string;
}) {
  const t = useTranslations("board");
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState<Summary>(initialSummary);
  const [active, setActive] = useState<{ weddingId: string | null; name: string } | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [mentions, setMentions] = useState<Member[]>([]);
  const [picker, setPicker] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [lane, setLane] = useState<Lane>("team");
  const bottom = useRef<HTMLDivElement>(null);

  const unread = (wid: string | null) => summary.threads.find((x) => x.wedding_id === wid)?.unread ?? 0;
  const totalUnread = summary.threads.reduce((n, x) => n + x.unread, 0) + summary.notifications;

  const refreshSummary = useCallback(async () => {
    const { data } = await supabase.rpc("board_summary", { p_workspace: workspaceId });
    if (data) setSummary(data as Summary);
  }, [supabase, workspaceId]);

  const loadThread = useCallback(async (weddingId: string | null, ln: Lane) => {
    if (ln === "client" && weddingId) {
      const { data } = await supabase.rpc("board_client_thread", { p_wedding: weddingId });
      setMessages((data as Msg[]) ?? []);
    } else {
      const { data } = await supabase.rpc("board_thread", { p_workspace: workspaceId, p_wedding: weddingId });
      setMessages((data as Msg[]) ?? []);
      await supabase.rpc("board_mark_read", { p_workspace: workspaceId, p_wedding: weddingId });
    }
    refreshSummary();
    setTimeout(() => bottom.current?.scrollIntoView({ behavior: "smooth" }), 50);
  }, [supabase, workspaceId, refreshSummary]);

  // Realtime is a change-SIGNAL: on any board/notification event, re-fetch through RLS.
  useEffect(() => {
    const ch = supabase.channel(`board:${workspaceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "board_messages", filter: `workspace_id=eq.${workspaceId}` }, () => {
        refreshSummary();
        if (active) loadThread(active.weddingId, lane);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${selfId}` }, () => refreshSummary())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [supabase, workspaceId, selfId, active, lane, refreshSummary, loadThread]);

  function openThread(weddingId: string | null, name: string) {
    setActive({ weddingId, name });
    setMessages([]);
    setText("");
    setMentions([]);
    setLane("team");
    loadThread(weddingId, "team");
  }
  function switchLane(ln: Lane) {
    if (ln === lane || !active) return;
    setLane(ln);
    setText("");
    setMentions([]);
    setPicker(false);
    loadThread(active.weddingId, ln);
  }
  function addMention(m: Member) {
    if (!mentions.find((x) => x.user_id === m.user_id)) setMentions([...mentions, m]);
    setText((s) => `${s}${s && !s.endsWith(" ") ? " " : ""}@${(m.name ?? "").split(/\s+/)[0]} `);
    setPicker(false);
  }
  async function send() {
    if (!active || !text.trim()) return;
    const body = text.trim();
    // The client lane is the shared couple thread: no @mentions, no @concierge; the post goes
    // through the server action so the couple gets the debounced email nudge.
    if (lane === "client" && active.weddingId) {
      setText("");
      await postClientMessage(active.weddingId, body);
      await loadThread(active.weddingId, "client");
      return;
    }
    const wantsConcierge = parseMentions(body).concierge;
    setText("");
    const ids = mentions.map((m) => m.user_id);
    setMentions([]);
    await supabase.rpc("board_post", { p_workspace: workspaceId, p_wedding: active.weddingId, p_body: body, p_mentions: ids });
    await loadThread(active.weddingId, "team");
    if (wantsConcierge) {
      setThinking(true);
      await askConcierge(workspaceId, active.weddingId, body.replace(/@concierge/gi, "").trim());
      setThinking(false);
      await loadThread(active.weddingId, "team");
    }
  }
  async function react(id: string, emoji: string) {
    await supabase.rpc("board_toggle_reaction", { p_message: id, p_emoji: emoji });
    if (active) loadThread(active.weddingId, lane);
  }
  async function makeTask(m: Msg) {
    const title = window.prompt(t("makeTaskPrompt"), m.body ?? "");
    if (!title || !title.trim()) return;
    await supabase.rpc("board_make_task", { p_message: m.id, p_title: title.trim(), p_due: null });
    if (active) loadThread(active.weddingId, lane);
  }
  async function del(m: Msg) {
    if (!window.confirm(t("deleteConfirm"))) return;
    await supabase.rpc("board_delete", { p_id: m.id });
    if (active) loadThread(active.weddingId, lane);
  }
  async function edit(id: string, body: string) {
    if (!body.trim()) return;
    await supabase.rpc("board_edit", { p_id: id, p_body: body.trim() });
    if (active) loadThread(active.weddingId, lane);
  }
  async function markAllRead() {
    await supabase.rpc("board_mark_notifications_read");
    refreshSummary();
  }

  const statusLabel = (s: string | null) => t(s === "completed" ? "taskCompleted" : s === "working" ? "taskWorking" : s === "waiting" ? "taskWaiting" : "taskPending");

  return (
    <>
      {/* Sibling of the ConciergeBubble floater: same 54px oxblood tile, radius, border, and hover.
          Stacked directly above it (the concierge keeps the bottom-corner anchor) with a small gap.
          The glyph is a bone speech-bubble outline, stroke-weight matched to the star medallion so
          the two read as a pair. No label — the localized board.title carries title/aria-label. */}
      <button onClick={() => { setOpen(true); refreshSummary(); }} aria-label={t("title")} title={t("title")}
        className="fixed bottom-[92px] right-[26px] z-40 flex h-[54px] w-[54px] items-center justify-center rounded-[var(--radius)] border border-[rgba(245,242,235,0.22)] bg-oxblood text-bone transition-transform hover:scale-[1.03] print:hidden">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 4.5h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-8.5L6 19v-3.5H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z" />
        </svg>
        {totalUnread > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-[var(--radius)] border border-[rgba(245,242,235,0.35)] bg-oxblood px-1 text-[10px] font-medium text-bone">{totalUnread}</span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[70] flex justify-end bg-black/20" onClick={() => setOpen(false)}>
          <div className="flex h-full w-full max-w-[420px] flex-col bg-surface-page shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-hairline-token px-4 py-3">
              <span className="font-display text-[18px] text-text-primary">{active ? active.name : t("title")}</span>
              <div className="flex items-center gap-3">
                {active ? <button onClick={() => setActive(null)} className="text-[12.5px] text-text-meta hover:text-text-primary">← {t("allThreads")}</button> : null}
                <button onClick={() => setOpen(false)} className="text-text-meta hover:text-text-primary">✕</button>
              </div>
            </div>

            {!active ? (
              <div className="flex-1 overflow-y-auto p-3">
                <Section label={t("inbox")}>
                  <div className="flex items-center justify-between px-2 py-1.5 text-[13px]">
                    <span className="text-text-meta">{summary.notifications > 0 ? t("mentionsN", { n: summary.notifications }) : t("noNotifications")}</span>
                    {summary.notifications > 0 ? <button onClick={markAllRead} className="text-[12px] text-teal hover:underline">{t("markAllRead")}</button> : null}
                  </div>
                </Section>
                <Section label={t("studio")}>
                  <ThreadRow name={t("studioThread")} unread={unread(null)} onClick={() => openThread(null, t("studioThread"))} />
                </Section>
                <Section label={t("weddings")}>
                  {weddings.length === 0 ? <p className="px-2 py-2 text-[12.5px] text-text-meta">{t("noWeddings")}</p> : weddings.map((w) => (
                    <ThreadRow key={w.id} name={w.name} unread={unread(w.id)} onClick={() => openThread(w.id, w.name)} />
                  ))}
                </Section>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-3 py-2">
                  {active.weddingId ? (
                    <div className="mb-2 flex items-center justify-between">
                      <a href={`${linkBase}/wedding/${active.weddingId}`} className="inline-block text-[12px] text-teal hover:underline">{t("openWedding")} ↗</a>
                      <div className="flex rounded-full bg-surface-card p-0.5 text-[11.5px]">
                        <button onClick={() => switchLane("team")} className={cx("rounded-full px-2.5 py-1", lane === "team" ? "bg-surface-page text-text-primary shadow-sm" : "text-text-meta")}>{t("laneTeam")}</button>
                        <button onClick={() => switchLane("client")} className={cx("rounded-full px-2.5 py-1", lane === "client" ? "bg-wine text-bone" : "text-text-meta")}>{t("laneClient")}</button>
                      </div>
                    </div>
                  ) : null}
                  {lane === "client" ? <p className="mb-2 rounded-[var(--radius)] bg-wine/10 px-2.5 py-1.5 text-[11.5px] text-wine">{t("clientHint")}</p> : null}
                  {messages.length === 0 ? <p className="py-8 text-center text-[13px] text-text-meta">{lane === "client" ? t("clientEmpty") : t("threadEmpty")}</p> : messages.map((m) => (
                    <MessageRow key={m.id} m={m} t={t} statusLabel={statusLabel} clientLane={lane === "client"} onReact={react} onTask={makeTask} onDelete={del} onEdit={edit} />
                  ))}
                  {thinking ? <p className="py-2 text-[12.5px] italic text-text-meta">{t("conciergeThinking")}</p> : null}
                  <div ref={bottom} />
                </div>
                <div className={cx("border-t p-2", lane === "client" ? "border-wine/30" : "border-hairline-token")}>
                  {lane === "team" && mentions.length ? <div className="mb-1 flex flex-wrap gap-1">{mentions.map((m) => <span key={m.user_id} className="rounded-full bg-surface-card px-2 py-0.5 text-[11px] text-text-meta">@{(m.name ?? "").split(/\s+/)[0]}</span>)}</div> : null}
                  {lane === "team" && picker ? (
                    <div className="mb-1 max-h-32 overflow-y-auto rounded-[var(--radius)] border border-hairline-token bg-surface-card">
                      {roster.filter((r) => r.user_id !== selfId).map((r) => <button key={r.user_id} onClick={() => addMention(r)} className="block w-full px-3 py-1.5 text-left text-[12.5px] text-text-primary hover:bg-surface-page">{r.name}</button>)}
                    </div>
                  ) : null}
                  <div className="flex items-end gap-2">
                    {lane === "team" ? <button onClick={() => setPicker((p) => !p)} className="rounded-[var(--radius)] px-2 py-1.5 text-[14px] text-text-meta hover:bg-surface-card" title={t("mention")}>@</button> : null}
                    <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }} rows={2} placeholder={lane === "client" ? t("clientComposer") : t("composerPlaceholder")} className={cx("flex-1 resize-none rounded-[var(--radius)] border bg-surface-card px-3 py-2 text-[13px] text-text-primary outline-none", lane === "client" ? "border-wine/40" : "border-hairline-token")} />
                    <button onClick={send} disabled={!text.trim()} className={cx("rounded-[var(--radius)] px-3 py-2 text-[12px] font-medium text-bone disabled:opacity-40", lane === "client" ? "bg-wine" : "bg-ink")}>{t("send")}</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <p className="px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.16em] text-text-meta">{label}</p>
      {children}
    </div>
  );
}
function ThreadRow({ name, unread, onClick }: { name: string; unread: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center justify-between rounded-[var(--radius)] px-2 py-2 text-left text-[13.5px] text-text-primary hover:bg-surface-card">
      <span className="truncate">{name}</span>
      {unread > 0 ? <span className="grid h-5 min-w-5 place-items-center rounded-full bg-wine px-1 text-[11px] text-bone">{unread}</span> : null}
    </button>
  );
}
function MessageRow({ m, t, statusLabel, clientLane, onReact, onTask, onDelete, onEdit }: {
  m: Msg; t: ReturnType<typeof useTranslations>; statusLabel: (s: string | null) => string; clientLane?: boolean;
  onReact: (id: string, e: string) => void; onTask: (m: Msg) => void; onDelete: (m: Msg) => void; onEdit: (id: string, body: string) => void;
}) {
  const [bar, setBar] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(m.body ?? "");
  if (m.system_event === "task_completed") {
    return <p className="py-1.5 text-center text-[11.5px] italic text-text-meta">{t("taskCompletedLine", { title: m.task_title ?? "" })}</p>;
  }
  const who = m.author_kind === "concierge" ? t("conciergeName") : m.author_name ?? "·";
  const canEdit = m.mine && !m.deleted_at && m.author_kind === "user";
  return (
    <div className="group border-b border-hairline-token py-2 last:border-b-0" onMouseEnter={() => setBar(true)} onMouseLeave={() => setBar(false)}>
      <div className="flex items-baseline justify-between">
        <span className={cx("text-[12px] font-medium", m.author_kind === "concierge" ? "text-champagne" : "text-text-primary")}>{who}</span>
        <span className="text-[10px] text-text-meta">{m.created_at.slice(11, 16)}</span>
      </div>
      {m.deleted_at ? (
        <p className="text-[13px] italic text-text-meta">{t("deleted")}</p>
      ) : editing ? (
        <div className="mt-1">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} className="w-full resize-none rounded-[var(--radius)] border border-hairline-token bg-surface-card px-2.5 py-1.5 text-[13.5px] text-text-primary outline-none" />
          <div className="mt-1 flex gap-2">
            <button onClick={() => { onEdit(m.id, draft); setEditing(false); }} className="rounded-[var(--radius)] bg-ink px-3 py-1 text-[11px] font-medium text-bone">{t("editSave")}</button>
            <button onClick={() => { setDraft(m.body ?? ""); setEditing(false); }} className="text-[11px] text-text-meta hover:text-text-primary">{t("editCancel")}</button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-[13.5px] text-text-primary">{m.body}{m.edited_at ? <span className="ml-1.5 text-[10px] text-text-meta">({t("edited")})</span> : null}</p>
      )}
      {m.task_id ? (
        <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-surface-card px-2 py-0.5 text-[11px] text-text-meta">
          <span className={m.task_status === "completed" ? "text-teal" : "text-text-primary"}>{m.task_title}</span> · {statusLabel(m.task_status)}
        </span>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-1">
        {Object.entries(m.reactions).map(([e, n]) => (
          <button key={e} onClick={() => onReact(m.id, e)} className={cx("rounded-full px-1.5 py-0.5 text-[11px]", m.my_reactions.includes(e) ? "bg-teal/20 text-teal" : "bg-surface-card text-text-meta")}>{e} {n}</button>
        ))}
        {bar && !m.deleted_at ? (
          <span className="flex items-center gap-0.5 opacity-70">
            {BOARD_EMOJI.map((e) => <button key={e} onClick={() => onReact(m.id, e)} className="px-0.5 text-[13px] hover:scale-110">{e}</button>)}
            {!clientLane && !m.task_id ? <button onClick={() => onTask(m)} className="ml-1 text-[11px] text-teal hover:underline">{t("makeTask")}</button> : null}
            {canEdit ? <button onClick={() => { setDraft(m.body ?? ""); setEditing(true); }} className="ml-1 text-[11px] text-text-meta hover:underline">{t("edit")}</button> : null}
            {m.mine ? <button onClick={() => onDelete(m)} className="ml-1 text-[11px] text-[color:var(--color-text-danger)] hover:underline">{t("delete")}</button> : null}
          </span>
        ) : null}
      </div>
    </div>
  );
}
