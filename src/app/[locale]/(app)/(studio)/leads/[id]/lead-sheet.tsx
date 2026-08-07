"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { Chip, Button, DomainStar, cx } from "@/components/ui";
import { LANES, LOST_REASONS, SOURCES } from "@/lib/leads.mjs";
import { updateLead, addNote, setNextStep, setConsult, moveStage, markLost, convertLead, muteLead } from "../leads-actions";
import { createQuoteForLead } from "../../quotes/quote-actions";
import { draftLeadEmail, sendLeadEmail, logMailtoEmail } from "../email-actions";

export type LeadFull = {
  id: string; couple_display: string; email: string | null; phone: string | null; locale: string | null;
  date_feel: string | null; date_start: string | null; city: string | null; guest_feel: string | null;
  budget_feel: string | null; source: string; source_note: string | null; stage: string; lost_reason: string | null;
  next_step: string | null; next_step_at: string | null; consult_at: string | null; consult_confirmed: boolean; wedding_id: string | null;
  automation_muted: boolean;
};
export type ThreadEvent = { id: string; kind: string; body: string | null; when: string; author: string | null; mode: string | null; by: string | null };

const LANG: Record<string, string> = { en: "English", es: "Español", fr: "Français", it: "Italiano" };
// automated → the time/champagne star (per the mock); email → people/taupe like a human touch.
const STAR: Record<string, string> = { arrived: "#8A7557", note: "#8A7557", consult: "#8A7557", stage: "#D7C3A5", converted: "#2F5552", lost: "#8A7557", email: "#8A7557", automated: "#D7C3A5" };
const input = "w-full rounded-[var(--radius)] border border-hairline-token bg-surface-card px-3 py-2 text-[13.5px] text-text-primary outline-none";

function Frow({ k, v }: { k: string; v: ReactNode }) {
  if (v == null || v === "") return null;
  return (
    <div className="flex justify-between gap-3 border-b border-hairline-token py-2.5 text-[12.5px] last:border-b-0">
      <span className="text-text-meta">{k}</span>
      <span className="text-right text-text-primary">{v}</span>
    </div>
  );
}

export function LeadSheet({ lead, events }: { lead: LeadFull; events: ThreadEvent[] }) {
  const t = useTranslations("leads");
  const router = useRouter();
  const [panel, setPanel] = useState<"facts" | "note" | "next" | "consult" | "lost" | "write" | null>(null);
  const [pending, start] = useTransition();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [writeErr, setWriteErr] = useState<string | null>(null);
  const open = lead.stage !== "won" && lead.stage !== "lost";

  function run(fn: () => Promise<unknown>) { start(async () => { await fn(); setPanel(null); }); }

  // Resolve a coded body ('new' → the lane label) but fall back to the plain body when the key
  // is missing, so a stray value never surfaces a raw catalog key path.
  const labelOr = (prefix: string, body: string | null): string =>
    body && t.has(`${prefix}_${body}`) ? t(`${prefix}_${body}`) : (body ?? "");

  function eventMain(e: ThreadEvent): string {
    switch (e.kind) {
      case "arrived": return t("evtArrived");
      case "note": return e.body ?? "";
      case "stage": return t("evtStage", { stage: labelOr("lane", e.body) });
      case "consult": return t("evtConsult");
      case "converted": return t("evtConverted");
      case "lost": return t("evtLost", { reason: labelOr("lost", e.body) });
      case "email": return t(e.mode === "mailto" ? "evtEmailMailto" : "evtEmail", { subject: e.body ?? "" });
      case "automated": return t("evtAutomated", { rule: labelOr("rule", e.body) });
      case "quote": return e.body === "carried" ? t("evtQuoteCarried") : t("evtQuoteAccepted");
      default: return e.body ?? e.kind;
    }
  }

  function compose() {
    setWriteErr(null);
    start(async () => { const r = await sendLeadEmail(lead.id, subject, body); if (r.ok) { setPanel(null); setSubject(""); setBody(""); router.refresh(); } else setWriteErr(r.error === "no_email" ? t("writeNoEmail") : t("writeErr")); });
  }
  function draft() { setWriteErr(null); start(async () => { const r = await draftLeadEmail(lead.id); if (r.ok) { setSubject(r.subject ?? ""); setBody(r.body ?? ""); } else setWriteErr(r.error === "no_key" ? t("writeNoKey") : t("writeErr")); }); }
  function mailto() {
    const href = `mailto:${lead.email ?? ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`.slice(0, 1900);
    window.location.href = href;
    start(async () => { await logMailtoEmail(lead.id, subject); router.refresh(); });
  }

  return (
    <div>
      <Link href="/leads" className="mb-4 inline-block text-[12.5px] text-text-meta hover:text-text-primary">← {t("backToDesk")}</Link>

      <div className="grid overflow-hidden rounded-[var(--radius)] border border-hairline-token bg-surface-card md:grid-cols-[340px_1fr]">
        {/* Facts */}
        <div className="border-b border-hairline-token p-[22px] md:border-b-0 md:border-r">
          <p className="mb-1 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.24em] text-text-meta"><DomainStar fill="#8A7557" size={10} />{t("theLead")}</p>
          <h2 className="font-display text-[22px] text-text-primary">{lead.couple_display}</h2>
          {lead.locale ? <p className="mt-0.5 text-[12px] text-text-meta">{t("speaks", { lang: LANG[lead.locale] ?? lead.locale })}</p> : null}

          {panel === "facts" ? (
            <form action={(f) => run(() => updateLead(lead.id, {
              couple_display: String(f.get("couple_display") ?? ""), email: String(f.get("email") ?? ""), phone: String(f.get("phone") ?? ""),
              locale: String(f.get("locale") ?? ""), date_feel: String(f.get("date_feel") ?? ""), date_start: String(f.get("date_start") ?? ""),
              city: String(f.get("city") ?? ""), guest_feel: String(f.get("guest_feel") ?? ""), budget_feel: String(f.get("budget_feel") ?? ""),
              source: String(f.get("source") ?? "other"), source_note: String(f.get("source_note") ?? ""),
            }))} className="mt-4 flex flex-col gap-2">
              {([["couple_display", "formNames"], ["email", "labelEmail"], ["phone", "labelPhone"], ["date_feel", "labelFeel"], ["date_start", "labelDate"], ["city", "labelWhere"], ["guest_feel", "labelGuests"], ["budget_feel", "labelBudget"], ["source_note", "labelSourceNote"]] as const).map(([name, label]) => (
                <label key={name} className="block">
                  <span className="mb-0.5 block text-[11px] text-text-meta">{t(label)}</span>
                  <input name={name} type={name === "date_start" ? "date" : "text"} defaultValue={(lead[name as keyof LeadFull] as string | null) ?? ""} className={input} />
                </label>
              ))}
              <label className="block"><span className="mb-0.5 block text-[11px] text-text-meta">{t("labelLanguage")}</span>
                <select name="locale" defaultValue={lead.locale ?? ""} className={input}><option value="">·</option>{Object.entries(LANG).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="block"><span className="mb-0.5 block text-[11px] text-text-meta">{t("labelSource")}</span>
                <select name="source" defaultValue={lead.source} className={input}>{SOURCES.map((s) => <option key={s} value={s}>{t(`source_${s}`)}</option>)}</select></label>
              <div className="mt-1 flex gap-2"><Button type="submit" variant="primary" disabled={pending}>{t("save")}</Button><Button variant="ghost" onClick={() => setPanel(null)}>{t("cancel")}</Button></div>
            </form>
          ) : (
            <div className="mt-4">
              <Frow k={t("labelFeel")} v={lead.date_feel || (lead.date_start ?? null)} />
              <Frow k={t("labelWhere")} v={lead.city} />
              <Frow k={t("labelGuests")} v={lead.guest_feel} />
              <Frow k={t("labelBudget")} v={lead.budget_feel} />
              <Frow k={t("labelEmail")} v={lead.email} />
              <Frow k={t("labelPhone")} v={lead.phone} />
              <Frow k={t("labelSource")} v={<Chip tone="pending">{t(`source_${lead.source}`)}{lead.source_note ? ` · ${lead.source_note}` : ""}</Chip>} />
              <Frow k={t("labelStage")} v={lead.stage === "won" ? <Chip tone="settled">{t("wonChip")}</Chip> : lead.stage === "lost" ? <Chip tone="pending">{t("lostChip")}</Chip> : <Chip tone="pending">{t(`lane_${lead.stage}`)}</Chip>} />
              <Frow k={t("labelNextStep")} v={lead.next_step ? <span className="text-taupe">{lead.next_step}{lead.next_step_at ? ` · ${lead.next_step_at}` : ""}</span> : null} />
              <Frow k={t("labelConsult")} v={lead.consult_at ? `${new Date(lead.consult_at).toLocaleString()} · ${lead.consult_confirmed ? t("confirmed") : t("unconfirmed")}` : null} />
            </div>
          )}

          {/* Actions. Write is now REAL (L3); Book the consult stays omitted (Calendly, later). */}
          {panel === null ? (
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => setPanel("facts")}>{t("editFacts")}</Button>
              <Button variant="ghost" onClick={() => setPanel("write")}>{t("write")}</Button>
              <Button variant="ghost" disabled={pending} onClick={() => start(async () => { const r = await createQuoteForLead(lead.id); if (r.ok && r.id) router.push(`/quotes/${r.id}`); })}>{t("quote")}</Button>
              <Button variant="ghost" onClick={() => setPanel("note")}>{t("addNote")}</Button>
              <Button variant="ghost" onClick={() => setPanel("next")}>{t("setNextStep")}</Button>
              <Button variant="ghost" onClick={() => setPanel("consult")}>{t("setConsult")}</Button>
              {open ? <select value={lead.stage} onChange={(e) => run(() => moveStage(lead.id, e.target.value))} disabled={pending} className={cx(input, "!w-auto")}>{LANES.filter((s) => s !== "won").map((s) => <option key={s} value={s}>{t(`lane_${s}`)}</option>)}</select> : null}
              {lead.wedding_id ? (
                <Link href={`/wedding/${lead.wedding_id}`}><Button variant="ghost">{t("viewWedding")} →</Button></Link>
              ) : (
                <Button variant="primary" disabled={pending} onClick={() => start(async () => { await convertLead(lead.id); })}>{t("openWedding")}</Button>
              )}
              {open ? <Button variant="ghost" onClick={() => setPanel("lost")}>{t("markLost")}</Button> : null}
            </div>
          ) : null}

          {/* Per-lead automation mute — a quiet line, not an action button. */}
          {panel === null && open ? (
            <button onClick={() => start(async () => { await muteLead(lead.id, !lead.automation_muted); router.refresh(); })} disabled={pending} className="mt-3 block text-[11.5px] text-text-meta hover:text-text-primary">
              {lead.automation_muted ? `✓ ${t("automationMuted")}` : t("muteAutomation")}
            </button>
          ) : null}

          {panel === "write" ? (
            <div className="mt-4 flex flex-col gap-2">
              {lead.email ? null : <p className="text-[12.5px] text-[color:var(--color-text-danger)]">{t("writeNoEmail")}</p>}
              <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t("writeSubject")} className={input} />
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} placeholder={t("writeBody")} className={input} />
              {writeErr ? <p className="text-[12.5px] text-[color:var(--color-text-danger)]">{writeErr}</p> : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="primary" disabled={pending || !lead.email} onClick={compose}>{pending ? t("writeSending") : t("writeSend")}</Button>
                <Button variant="ghost" disabled={pending} onClick={draft}>{pending ? t("writeDrafting") : t("writeDraft")}</Button>
                <Button variant="ghost" disabled={!lead.email} onClick={mailto}>{t("writeMailto")}</Button>
                <Button variant="ghost" onClick={() => { setPanel(null); setWriteErr(null); }}>{t("cancel")}</Button>
              </div>
            </div>
          ) : null}

          {panel === "note" ? (
            <form action={(f) => run(() => addNote(lead.id, String(f.get("body") ?? "")))} className="mt-4">
              <textarea name="body" rows={3} required placeholder={t("notePlaceholder")} className={input} />
              <div className="mt-2 flex gap-2"><Button type="submit" variant="primary" disabled={pending}>{t("save")}</Button><Button variant="ghost" onClick={() => setPanel(null)}>{t("cancel")}</Button></div>
            </form>
          ) : null}
          {panel === "next" ? (
            <form action={(f) => run(() => setNextStep(lead.id, String(f.get("text") ?? ""), String(f.get("date") ?? "")))} className="mt-4 flex flex-col gap-2">
              <input name="text" defaultValue={lead.next_step ?? ""} placeholder={t("nextStepPlaceholder")} className={input} />
              <input name="date" type="date" defaultValue={lead.next_step_at ?? ""} className={input} />
              <div className="flex gap-2"><Button type="submit" variant="primary" disabled={pending}>{t("save")}</Button><Button variant="ghost" onClick={() => setPanel(null)}>{t("cancel")}</Button></div>
            </form>
          ) : null}
          {panel === "consult" ? (
            <form action={(f) => run(() => setConsult(lead.id, String(f.get("at") ?? ""), f.get("confirmed") === "on"))} className="mt-4 flex flex-col gap-2">
              <input name="at" type="datetime-local" defaultValue={lead.consult_at ? lead.consult_at.slice(0, 16) : ""} className={input} />
              <label className="flex items-center gap-2 text-[12.5px] text-text-primary"><input name="confirmed" type="checkbox" defaultChecked={lead.consult_confirmed} /> {t("confirmed")}</label>
              <div className="flex gap-2"><Button type="submit" variant="primary" disabled={pending}>{t("save")}</Button><Button variant="ghost" onClick={() => setPanel(null)}>{t("cancel")}</Button></div>
            </form>
          ) : null}
          {panel === "lost" ? (
            <form action={(f) => run(() => markLost(lead.id, String(f.get("reason") ?? "")))} className="mt-4 flex flex-col gap-2">
              <p className="text-[12.5px] text-text-meta">{t("lostPrompt")}</p>
              <select name="reason" defaultValue="budget" className={input}>{LOST_REASONS.map((r) => <option key={r} value={r}>{t(`lost_${r}`)}</option>)}</select>
              <div className="flex gap-2"><Button type="submit" variant="primary" disabled={pending}>{t("confirmLost")}</Button><Button variant="ghost" onClick={() => setPanel(null)}>{t("cancel")}</Button></div>
            </form>
          ) : null}
        </div>

        {/* Thread (newest last, per the ruling) */}
        <div className="p-[22px]">
          <p className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.24em] text-text-meta"><DomainStar fill="#D7C3A5" size={10} />{t("theThread")}</p>
          {events.length === 0 ? (
            <p className="font-accent text-[14px] italic text-text-meta">{t("threadEmpty")}</p>
          ) : events.map((e) => (
            <div key={e.id} className="grid items-baseline gap-3 border-b border-hairline-token py-2.5 text-[12.5px] last:border-b-0 [grid-template-columns:64px_14px_1fr]">
              <span className="text-[11px] tabular-nums text-text-meta">{e.when}</span>
              <DomainStar fill={STAR[e.kind] ?? "#8A7557"} size={9} />
              <span>
                <span className="text-text-primary">{eventMain(e)}</span>
                {e.kind === "arrived" && e.body ? <span className="mt-0.5 block text-[11.5px] text-text-meta">{e.body}</span> : null}
                {e.kind === "email" ? <span className="mt-0.5 block text-[11.5px] text-text-meta">{e.by ? t("sentBy", { name: e.by }) : ""}{e.mode === "mailto" ? ` · ${t("mailtoUnconfirmed")}` : ""}</span> : null}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
