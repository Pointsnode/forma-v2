"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createTask, type TaskInput } from "@/app/[locale]/(app)/wedding/[id]/task-actions";

type Opt = { id: string; name: string };
type EventOpt = { id: string; label: string };
export type PreLink = { kind: "proposal" | "contract" | "engagement" | "document"; id: string; label: string };
const inputCls = "w-full rounded-[var(--radius)] bg-bone px-3.5 py-2.5 text-[14px] text-ink outline-none";

// The "+ Task" quick-add. In the top bar it's the global creator; on an object card
// it opens PRE-LINKED (§1E) — the subject link rides in as a removable chip, and the
// wedding is fixed to the object's wedding.
export function QuickAddTask({ weddings, workspaceId, defaultWeddingId, defaultEventId, defaultSection, prelink, variant = "topbar" }: {
  weddings: { id: string; name: string }[]; workspaceId: string;
  defaultWeddingId?: string; defaultEventId?: string; defaultSection?: string; prelink?: PreLink; variant?: "topbar" | "inline";
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
  const [flagged, setFlagged] = useState(false);
  const [link, setLink] = useState<PreLink | null>(prelink ?? null);
  const [opts, setOpts] = useState<{ members: Opt[]; vendors: Opt[]; events: EventOpt[] }>({ members: [], vendors: [], events: [] });
  const [busy, setBusy] = useState(false);
  const lockedWedding = !!prelink; // a linked object fixes the wedding

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/task-options${weddingId ? `?weddingId=${weddingId}` : ""}`);
        const data = await res.json();
        if (!cancelled) { setOpts(data); setMember((m) => m || data.members[0]?.id || ""); setVendor((v) => v || data.vendors[0]?.id || ""); }
      } catch { /* keep empty */ }
    })();
    return () => { cancelled = true; };
  }, [open, weddingId]);

  async function save() {
    if (!title.trim() || busy) return;
    setBusy(true);
    const input: TaskInput = {
      title, note, due_date: due, flagged, assignee_kind: kind, assignee_member: member, assignee_vendor: vendor,
      wedding_id: weddingId || null, workspace_id: weddingId ? null : workspaceId,
      event_id: weddingId ? (eventId || undefined) : undefined,
      link_section: weddingId && eventId ? (defaultSection || undefined) : undefined,
      proposal_id: link?.kind === "proposal" ? link.id : undefined,
      contract_id: link?.kind === "contract" ? link.id : undefined,
      engagement_id: link?.kind === "engagement" ? link.id : undefined,
      document_id: link?.kind === "document" ? link.id : undefined,
    };
    const r = await createTask(input);
    setBusy(false);
    if (!r?.error) { setOpen(false); setTitle(""); setNote(""); setDue(""); setKind(""); setFlagged(false); router.refresh(); }
  }

  const trigger = variant === "inline"
    ? <button onClick={() => setOpen(true)} className="text-[12px] text-wine hover:underline hover:underline-offset-2">+ {t("tab")}</button>
    : <button onClick={() => setOpen(true)} className="rounded-[var(--radius)] border border-[rgba(247,244,238,0.25)] px-3 py-1.5 text-[12.5px] text-bone hover:bg-[rgba(247,244,238,0.1)]">+ {t("tab")}</button>;

  return (
    <>
      {trigger}
      {open ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <button className="absolute inset-0 bg-[rgba(21,18,16,0.55)]" onClick={() => setOpen(false)} aria-label={t("close")} />
          <div className="relative flex w-full max-w-[460px] flex-col gap-3 rounded-[var(--radius)] bg-bone p-6">
            <p className="font-display text-[18px] text-ink">{t("newTask")}</p>
            {link ? (
              <div className="flex items-center gap-2 rounded-[var(--radius)] bg-bone px-3 py-2">
                <span className="text-[11px] uppercase tracking-[0.06em] text-muted">{t("linked")}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink">{link.label}</span>
                <button onClick={() => setLink(null)} className="text-[12px] text-muted hover:text-wine" title={t("unlink")}>✕</button>
              </div>
            ) : null}
            <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("subject")}</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} className={inputCls} autoFocus /></label>
            <div className="grid grid-cols-2 gap-3">
              {lockedWedding ? null : (
                <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("wedding")}</span>
                  <select value={weddingId} onChange={(e) => { setWeddingId(e.target.value); setEventId(""); }} className={inputCls}>
                    <option value="">{t("studioLevel")}</option>{weddings.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select></label>
              )}
              <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("due")}</span>
                <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={inputCls} /></label>
              {lockedWedding ? (
                <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("assignee")}</span>
                  <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={inputCls}>
                    <option value="">{t("unassigned")}</option><option value="team">{t("assignTeam")}</option><option value="couple">{t("assignCouple")}</option><option value="vendor">{t("assignVendor")}</option>
                  </select></label>
              ) : null}
            </div>
            {!lockedWedding ? (
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("assignee")}</span>
                  <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={inputCls}>
                    <option value="">{t("unassigned")}</option><option value="team">{t("assignTeam")}</option>{weddingId ? <option value="couple">{t("assignCouple")}</option> : null}<option value="vendor">{t("assignVendor")}</option>
                  </select></label>
                {weddingId && opts.events.length ? (
                  <label className="flex flex-col gap-1"><span className="text-[12px] text-muted">{t("event")}</span>
                    <select value={eventId} onChange={(e) => setEventId(e.target.value)} className={inputCls}>
                      <option value="">{t("noEvent")}</option>{opts.events.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
                    </select></label>
                ) : <div />}
              </div>
            ) : null}
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
            <label className="flex items-center gap-2 text-[13px] text-ink"><input type="checkbox" checked={flagged} onChange={(e) => setFlagged(e.target.checked)} /> <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[var(--radius)] bg-wine" />{t("markUrgent")}</span></label>
            <div className="flex gap-2">
              <button onClick={save} disabled={busy || !title.trim()} className="rounded-[var(--radius)] bg-ink px-4 py-2 text-[13px] text-bone disabled:opacity-40">{t("save")}</button>
              <button onClick={() => setOpen(false)} className="rounded-[var(--radius)] px-3 py-2 text-[13px] text-muted hover:text-ink">{t("cancel")}</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
