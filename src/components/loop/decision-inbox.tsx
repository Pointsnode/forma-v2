"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button, cx } from "@/components/ui";
import { statusClass, type ViewProposal } from "@/lib/loop-view";
import { respondProposal, postMessage, markSeen } from "@/app/[locale]/(app)/wedding/[id]/loop-actions";

function CoupleProposalCard({ weddingId, p }: { weddingId: string; p: ViewProposal }) {
  const t = useTranslations("couple");
  const tp = useTranslations("proposals");
  const [open, setOpen] = useState(false);
  const [changing, setChanging] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [msg, setMsg] = useState("");
  const [reply, setReply] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const inCourt = p.status === "sent" || p.status === "seen";
  const meta = [p.eventLabel, p.estimate ? `${tp("estimatePrefix")} ${p.estimate}` : null].filter(Boolean).join(" · ");

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && p.status === "sent") start(async () => { await markSeen(weddingId, p.id); }); // seen on open
  }
  function run(fn: () => Promise<{ error?: string }>, after?: () => void) {
    setErr(null);
    start(async () => {
      const r = await fn();
      if (r?.error) setErr(t("error")); else after?.();
    });
  }

  return (
    <div className="rounded-[var(--radius)] bg-surface-card p-4">
      <button onClick={toggle} className="flex w-full items-start gap-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-[15px] text-text-primary">{p.title}</span>
          {meta ? <span className="block font-accent text-[13.5px] text-text-meta">{meta}</span> : null}
        </span>
        <span className={cx("shrink-0 rounded-[var(--radius)] px-2.5 py-1 text-[11.5px]", statusClass(p.status))}>{tp(`status.${p.status}`)}</span>
      </button>

      {open ? (
        <div className="mt-3 border-t border-hairline-token pt-3">
          {p.note ? <p className="mb-3 font-accent text-[15px] text-text-primary-soft">{p.note}</p> : null}
          <div className="flex flex-col gap-2.5">
            {p.messages.map((m) => (
              <div key={m.id} className="flex gap-2.5">
                <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--radius)] text-[9px] font-semibold", m.isCouple ? "bg-wine text-bone" : "bg-champagne text-text-primary")}>
                  {m.authorInitials}
                </span>
                <div className="rounded-[var(--radius)] bg-surface-card px-3 py-2 text-[13px] text-text-primary">
                  <div className="mb-0.5 text-[11px] font-semibold text-taupe">{m.authorName}</div>
                  {m.body}
                </div>
              </div>
            ))}
          </div>

          {inCourt ? (
            <div className="mt-4 flex flex-col gap-2">
              {changing ? (
                <>
                  <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={2} placeholder={t("changePlaceholder")}
                    className="w-full rounded-[var(--radius)] bg-surface-card px-3 py-2 text-[13.5px] text-text-primary outline-none" />
                  <div className="flex gap-2">
                    <Button onClick={() => { if (msg.trim()) run(() => respondProposal(weddingId, p.id, "request_change", msg.trim())); }} disabled={pending || !msg.trim()}>
                      {t("requestChange")}
                    </Button>
                    <Button variant="ghost" onClick={() => setChanging(false)}>{tp("cancel")}</Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <Button onClick={() => { setDeclining(false); run(() => respondProposal(weddingId, p.id, "approve", null)); }} disabled={pending}>{t("approve")}</Button>
                  <Button variant="ghost" onClick={() => { setDeclining(false); setChanging(true); }} disabled={pending}>{t("requestChange")}</Button>
                  {/* Two-step confirm in the label itself — no native confirm() (which blocks automation and can't be walked at the gate). */}
                  <button
                    onClick={() => (declining ? run(() => respondProposal(weddingId, p.id, "decline", null), () => setDeclining(false)) : setDeclining(true))}
                    onBlur={() => setDeclining(false)}
                    disabled={pending}
                    className={cx("ml-auto text-[13px] disabled:opacity-50", declining ? "font-medium text-[color:var(--color-text-danger)]" : "text-text-meta hover:text-[color:var(--color-text-danger)]")}
                  >
                    {declining ? t("reallyDecline") : t("decline")}
                  </button>
                </div>
              )}
              {err ? <p className="text-[13px] text-[color:var(--color-text-danger)]">{err}</p> : null}
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder={tp("composer")}
                className="flex-1 rounded-[var(--radius)] bg-surface-card px-3 py-2 text-[13.5px] text-text-primary outline-none" />
              <Button onClick={() => { if (reply.trim()) run(() => postMessage(weddingId, p.id, reply.trim()), () => setReply("")); }} disabled={pending || !reply.trim()}>
                {t("reply")}
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function DecisionInbox({ weddingId, inCourt, settled }: { weddingId: string; inCourt: ViewProposal[]; settled: ViewProposal[] }) {
  const t = useTranslations("couple");
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display text-[22px] text-text-primary">{t("inbox")}</h2>
        <p className="font-accent text-[16px] text-text-meta">{t("inboxHint")}</p>
      </div>
      {inCourt.length === 0 ? (
        <div className="rounded-[var(--radius)] bg-surface-card p-8 text-center">
          <p className="font-accent text-[17px] text-text-primary">{t("empty")}</p>
          <p className="mt-1 font-accent text-[14.5px] text-text-meta">{t("emptyHint")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {inCourt.map((p) => <CoupleProposalCard key={p.id} weddingId={weddingId} p={p} />)}
        </div>
      )}
      {settled.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-text-meta">{t("settled")}</p>
          {settled.map((p) => <CoupleProposalCard key={p.id} weddingId={weddingId} p={p} />)}
        </div>
      ) : null}
    </div>
  );
}
