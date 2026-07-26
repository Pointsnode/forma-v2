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
    <div className="rounded-2xl bg-paper p-4 shadow-card">
      <button onClick={toggle} className="flex w-full items-start gap-3 text-left">
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-[15px] text-ink">{p.title}</span>
          {meta ? <span className="block font-accent text-[13.5px] text-muted">{meta}</span> : null}
        </span>
        <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-[11.5px]", statusClass(p.status))}>{tp(`status.${p.status}`)}</span>
      </button>

      {open ? (
        <div className="mt-3 border-t border-hairline pt-3">
          {p.note ? <p className="mb-3 font-accent text-[15px] text-ink-soft">{p.note}</p> : null}
          <div className="flex flex-col gap-2.5">
            {p.messages.map((m) => (
              <div key={m.id} className="flex gap-2.5">
                <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold", m.isCouple ? "bg-wine text-bone" : "bg-sand text-ink")}>
                  {m.authorInitials}
                </span>
                <div className="rounded-xl bg-bone px-3 py-2 text-[13px] text-ink">
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
                    className="w-full rounded-xl bg-bone px-3 py-2 text-[13.5px] text-ink shadow-card outline-none focus:shadow-lift" />
                  <div className="flex gap-2">
                    <Button onClick={() => { if (msg.trim()) run(() => respondProposal(weddingId, p.id, "request_change", msg.trim())); }} disabled={pending || !msg.trim()}>
                      {t("requestChange")}
                    </Button>
                    <Button variant="ghost" onClick={() => setChanging(false)}>{tp("cancel")}</Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => run(() => respondProposal(weddingId, p.id, "approve", null))} disabled={pending}>{t("approve")}</Button>
                  <Button variant="ghost" onClick={() => setChanging(true)} disabled={pending}>{t("requestChange")}</Button>
                </div>
              )}
              {err ? <p className="text-[13px] text-wine">{err}</p> : null}
            </div>
          ) : (
            <div className="mt-3 flex gap-2">
              <input value={reply} onChange={(e) => setReply(e.target.value)} placeholder={tp("composer")}
                className="flex-1 rounded-xl bg-bone px-3 py-2 text-[13.5px] text-ink shadow-card outline-none focus:shadow-lift" />
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
        <h2 className="font-display text-[22px] text-ink">{t("inbox")}</h2>
        <p className="font-accent text-[16px] text-muted">{t("inboxHint")}</p>
      </div>
      {inCourt.length === 0 ? (
        <div className="rounded-2xl bg-bone p-8 text-center shadow-card">
          <p className="font-accent text-[17px] text-ink">{t("empty")}</p>
          <p className="mt-1 font-accent text-[14.5px] text-muted">{t("emptyHint")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {inCourt.map((p) => <CoupleProposalCard key={p.id} weddingId={weddingId} p={p} />)}
        </div>
      )}
      {settled.length > 0 ? (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted">{t("settled")}</p>
          {settled.map((p) => <CoupleProposalCard key={p.id} weddingId={weddingId} p={p} />)}
        </div>
      ) : null}
    </div>
  );
}
