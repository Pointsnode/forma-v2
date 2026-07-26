"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button, cx } from "@/components/ui";
import { statusClass, courtClass, type ViewProposal } from "@/lib/loop-view";
import { sendProposal, withdrawProposal, postMessage } from "@/app/[locale]/(app)/wedding/[id]/loop-actions";

function initials(title: string) {
  return title.trim()[0]?.toUpperCase() ?? "•";
}

export function ProposalCard({ weddingId, p }: { weddingId: string; p: ViewProposal }) {
  const t = useTranslations("proposals");
  const tc = useTranslations("court");
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const terminal = ["approved", "declined", "withdrawn"].includes(p.status);
  const meta = [p.eventLabel, p.estimate ? `${t("estimatePrefix")} ${p.estimate}` : null].filter(Boolean).join(" · ");
  const ageLabel = p.court === "none" ? tc("none") : p.ageDays === 0 ? tc("today") : tc("days", { count: p.ageDays });

  function act(fn: () => Promise<{ error?: string }>) {
    setErr(null);
    start(async () => {
      const r = await fn();
      if (r?.error) setErr(t("error"));
    });
  }

  return (
    <div className="rounded-2xl bg-paper p-4 shadow-card transition-shadow hover:shadow-lift">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-3 text-left">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sand-soft font-accent text-[15px] text-taupe">
          {initials(p.title)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-[14.5px] text-ink">{p.title}</span>
          {meta ? <span className="block font-accent text-[13px] text-muted">{meta}</span> : null}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span className={cx("rounded-full px-2.5 py-1 text-[11.5px]", statusClass(p.status))}>{t(`status.${p.status}`)}</span>
          {p.court !== "none" ? (
            <span className={cx("flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-semibold", courtClass(p.court))} title={p.court === "planner" ? tc("planner") : tc("couple")}>
              {p.court === "planner" ? "GM" : "P·C"}
            </span>
          ) : null}
        </span>
      </button>

      {open ? (
        <div className="mt-3 border-t border-hairline pt-3">
          {p.note ? <p className="mb-3 font-accent text-[14.5px] text-ink-soft">{p.note}</p> : null}
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

          {!terminal ? (
            <div className="mt-3 flex flex-col gap-2">
              <textarea
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                rows={2}
                placeholder={t("composer")}
                className="w-full rounded-xl bg-bone px-3 py-2 text-[13.5px] text-ink shadow-card outline-none focus:shadow-lift"
              />
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  onClick={() => { if (msg.trim()) act(() => postMessage(weddingId, p.id, msg.trim()).then((r) => { if (!r?.error) setMsg(""); return r; })); }}
                  disabled={pending || !msg.trim()}
                >
                  {t("post")}
                </Button>
                {p.status === "draft" ? (
                  <Button variant="ghost" onClick={() => act(() => sendProposal(weddingId, p.id))} disabled={pending}>{t("send")}</Button>
                ) : (
                  <Button variant="ghost" onClick={() => act(() => withdrawProposal(weddingId, p.id))} disabled={pending}>{t("withdraw")}</Button>
                )}
                <span className="ml-auto font-accent text-[13px] text-muted">{ageLabel}</span>
              </div>
              {err ? <p className="text-[13px] text-wine">{err}</p> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
