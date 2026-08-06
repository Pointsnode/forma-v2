"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { cx } from "@/components/ui";
import { submitRsvp, markOpened } from "./actions";

type EventItem = { event_id: string; label: string; event_date: string | null; status: string };
type Guest = { full_name: string; plus_one_allowed: boolean; plus_one_name: string | null; dietary: string | null };

const STATUSES = ["yes", "no", "maybe"] as const;

export function RsvpForm({
  code, sendToken, couple, guest, events,
}: { code: string; sendToken: string | null; couple: string; guest: Guest; events: EventItem[] }) {
  const t = useTranslations("rsvp");
  const [answers, setAnswers] = useState<Record<string, string>>(
    Object.fromEntries(events.map((e) => [e.event_id, e.status !== "pending" ? e.status : ""])),
  );
  const [plusOne, setPlusOne] = useState(guest.plus_one_name ?? "");
  const [dietary, setDietary] = useState(guest.dietary ?? "");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const opened = useRef(false);

  useEffect(() => {
    if (sendToken && !opened.current) { opened.current = true; void markOpened(sendToken); }
  }, [sendToken]);

  function submit() {
    setErr(null);
    const responses = Object.entries(answers).filter(([, v]) => v).map(([event_id, status]) => ({ event_id, status }));
    start(async () => {
      const r = await submitRsvp(code, { responses, plus_one_name: plusOne || undefined, dietary: dietary || undefined, send_token: sendToken || undefined });
      if (r.ok) setDone(true);
      else if (r.error === "closed") setErr(t("closedTitle"));
      else if (r.error === "expired") setErr(t("expiredTitle"));
      else if (r.error === "invalid") setErr(t("invalidTitle"));
      else setErr(t("error"));
    });
  }

  if (done) {
    return (
      <div className="rounded-[var(--radius)] bg-bone p-6 text-center">
        <p className="font-display text-[20px] text-ink">{t("thanks")}</p>
        <p className="mt-1 font-accent text-[15px] text-muted">{t("thanksEdit")}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="font-accent text-[16px] text-muted">{t("respondHint", { couple })}</p>
      <div className="flex flex-col gap-3">
        {events.map((e) => (
          <div key={e.event_id} className="rounded-[var(--radius)] bg-bone p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <span className="font-display text-[17px] text-ink">{e.label}</span>
              {e.event_date ? <span className="font-accent text-[14px] text-muted">{e.event_date}</span> : null}
            </div>
            <div className="flex gap-2">
              {STATUSES.map((s) => (
                <button key={s} onClick={() => setAnswers({ ...answers, [e.event_id]: s })}
                  className={cx("flex-1 rounded-[var(--radius)] px-3 py-2 text-[14px] transition-colors",
                    answers[e.event_id] === s ? "bg-ink text-bone" : "bg-bone text-muted hover:text-ink")}>
                  {t(s)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {guest.plus_one_allowed ? (
        <label className="flex flex-col gap-1">
          <span className="text-[13px] text-muted">{t("plusOneName")}</span>
          <input value={plusOne} onChange={(e) => setPlusOne(e.target.value)} className="rounded-[var(--radius)] bg-bone px-3.5 py-2.5 text-[15px] text-ink outline-none" />
        </label>
      ) : null}
      <label className="flex flex-col gap-1">
        <span className="text-[13px] text-muted">{t("dietary")}</span>
        <input value={dietary} onChange={(e) => setDietary(e.target.value)} className="rounded-[var(--radius)] bg-bone px-3.5 py-2.5 text-[15px] text-ink outline-none" />
      </label>

      {err ? <p className="text-[14px] text-wine">{err}</p> : null}
      <button onClick={submit} disabled={pending} className="rounded-[var(--radius)] bg-wine px-6 py-3 text-[15px] font-medium text-bone transition-opacity hover:opacity-90 disabled:opacity-50">
        {pending ? t("submitting") : t("submit")}
      </button>
    </div>
  );
}
