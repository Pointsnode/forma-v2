"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createTask, type TaskInput } from "@/app/[locale]/(app)/wedding/[id]/task-actions";

type Opt = { id: string; name: string };
type EventOpt = { id: string; label: string };
const inputCls = "w-full rounded-xl bg-bone px-3.5 py-2.5 text-[14px] text-ink shadow-card outline-none focus:shadow-lift";

// The global "+ Task" (top bar, every staff surface). Prefilled from context via
// props; loads assignee/event options for the chosen wedding on demand.
export function QuickAddTask({ weddings, workspaceId, defaultWeddingId, defaultEventId }: {
  weddings: { id: string; name: string }[]; workspaceId: string; defaultWeddingId?: string; defaultEventId?: string;
}) {
  const t = useTranslations("tasks");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [weddingId, setWeddingId] = useState(defaultWeddingId ?? "");
  const [eventId, setEventId] = useState(defaultEventId ?? "");
  const [due, setDue] = useState("");
  const [kind, setKind] = useState<"" | "team" | "couple" | "vendor">("");
  const [member, setMember] = useState("");
  const [vendor, setVendor] = useState("");
  const [note, setNote] = useState("");
  const [opts, setOpts] = useState<{ members: Opt[]; vendors: Opt[]; events: EventOpt[] }>({ members: [], vendors: [], events: [] });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/task-options${weddingId ? `?weddingId=${weddingId}` : ""}`);
        const data = await res.json();
        if (!cancelled) {
          setOpts(data);
          setMember((m) => m || data.members[0]?.id || "");
          setVendor((v) => v || data.vendors[0]?.id || "");
        }
      } catch { /* keep empty */ }
    })();
    return () => { cancelled = true; };
  }, [open, weddingId]);

  async function save() {
    if (!title.trim() || busy) return;
    setBusy(true);
    const input: TaskInput = {
      title, note, due_date: due, assignee_kind: kind, assignee_member: member, assignee_vendor: vendor,
      wedding_id: weddingId || null, workspace_id: weddingId ? null : workspaceId,
      event_id: weddingId ? eventId : undefined,
    };
    const r = await createTask(input);
    setBusy(false);
    if (!r?.error) { setOpen(false); setTitle(""); setNote(""); setDue(""); setKind(""); router.refresh(); }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-full border border-[rgba(247,244,238,0.25)] px-3 py-1.5 text-[12.5px] text-bone hover:bg-[rgba(247,244,238,0.1)]">+ {t("tab")}</button>
      {open ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-[rgba(21,18,16,0.55)]" onClick={() => setOpen(false)} aria-label={t("close")} />
          <div className="relative flex w-full max-w-[460px] flex-col gap-3 rounded-[18px] bg-paper p-6 shadow-hero">
            <p className="font-display text-[18px] text-ink">{t("newTask")}</p>
            <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("subject")}</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputCls} autoFocus /></label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("wedding")}</span>
                <select value={weddingId} onChange={(e) => { setWeddingId(e.target.value); setEventId(""); }} className={inputCls}>
                  <option value="">{t("studioLevel")}</option>
                  {weddings.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select></label>
              <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("due")}</span>
                <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} /></label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("assignee")}</span>
                <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={inputCls}>
                  <option value="">{t("unassigned")}</option>
                  <option value="team">{t("assignTeam")}</option>
                  {weddingId ? <option value="couple">{t("assignCouple")}</option> : null}
                  <option value="vendor">{t("assignVendor")}</option>
                </select></label>
              {weddingId && opts.events.length ? (
                <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("event")}</span>
                  <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={inputCls}>
                    <option value="">{t("noEvent")}</option>
                    {opts.events.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
                  </select></label>
              ) : <div />}
            </div>
            {kind === "team" ? (
              <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("teamMember")}</span>
                <select value={member} onChange={(e) => setMember(e.target.value)} className={inputCls}>{opts.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
            ) : null}
            {kind === "vendor" ? (
              <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("vendor")}</span>
                <select value={vendor} onChange={(e) => setVendor(e.target.value)} className={inputCls}>{opts.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
            ) : null}
            <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("note")}</span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className={inputCls} /></label>
            <div className="flex gap-2">
              <button onClick={save} disabled={busy || !title.trim()} className="rounded-full bg-ink px-4 py-2 text-[13px] text-bone disabled:opacity-40">{t("save")}</button>
              <button onClick={() => setOpen(false)} className="rounded-full px-3 py-2 text-[13px] text-muted hover:text-ink">{t("cancel")}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
