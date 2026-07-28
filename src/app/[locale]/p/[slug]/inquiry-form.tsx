"use client";

import { useState, useTransition } from "react";
import { submitInquiry, type InquiryInput } from "./actions";

const FIELD =
  "w-full rounded-xl bg-bone px-4 py-3 text-[15px] text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-sand";

// Maps the DB function's human errcodes to a translated line. Anything unmapped
// falls back to the generic message.
const ERR: Record<string, string> = {
  FD031: "errName",
  FD032: "errEmail",
  FD033: "errMessage",
  FD034: "errRate",
  FD030: "errGone",
};

export function InquiryForm({
  slug,
  labels,
}: {
  slug: string;
  labels: Record<string, string>;
}) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<InquiryInput>({ name: "", partner: "", email: "", phone: "", date: "", message: "", honeypot: "" });

  const set = (k: keyof InquiryInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    start(async () => {
      const r = await submitInquiry(slug, form);
      if (r.ok) setDone(true);
      else setErr(labels[ERR[r.error ?? ""] ?? "errGeneric"] ?? labels.errGeneric);
    });
  }

  if (done) {
    return (
      <div className="rounded-2xl bg-paper p-8 text-center shadow-card">
        <p className="font-display text-[22px] text-ink">{labels.sentTitle}</p>
        <p className="mt-1.5 font-accent text-[16px] italic text-taupe">{labels.sentBody}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="rounded-2xl bg-paper p-6 shadow-card sm:p-7">
      <h3 className="font-display text-[22px] text-ink">{labels.formTitle}</h3>
      <p className="mb-4 mt-0.5 font-accent text-[15px] italic text-taupe">{labels.formHint}</p>
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <input className={FIELD} placeholder={labels.name} value={form.name} onChange={set("name")} required aria-label={labels.name} />
          <input className={FIELD} placeholder={labels.partner} value={form.partner} onChange={set("partner")} aria-label={labels.partner} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <input className={FIELD} type="email" placeholder={labels.email} value={form.email} onChange={set("email")} required aria-label={labels.email} />
          <input className={FIELD} placeholder={labels.phone} value={form.phone} onChange={set("phone")} aria-label={labels.phone} />
        </div>
        <input className={FIELD} type="date" value={form.date} onChange={set("date")} aria-label={labels.date} />
        <textarea className={`${FIELD} min-h-[110px] resize-y`} placeholder={labels.message} value={form.message} onChange={set("message")} required aria-label={labels.message} />
        {/* Honeypot — hidden from humans; a bot that fills it is dropped server-side. */}
        <input
          className="absolute left-[-9999px] h-0 w-0 opacity-0"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          value={form.honeypot}
          onChange={set("honeypot")}
          name="company"
        />
      </div>
      {err ? <p className="mt-3 text-[13px] text-wine">{err}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-ink px-5 py-3 text-[14px] font-medium text-bone transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? labels.sending : labels.send}
      </button>
    </form>
  );
}
