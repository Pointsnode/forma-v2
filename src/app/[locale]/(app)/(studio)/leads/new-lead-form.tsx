"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button, cx } from "@/components/ui";
import { SOURCES } from "@/lib/leads.mjs";
import { createLead } from "./leads-actions";

// The band's one primary act: a minimal create (couple names + email + source), then straight
// into the new lead's sheet where the rest is filled in.
export function NewLeadForm() {
  const t = useTranslations("leads");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState(false);
  const input = "w-full rounded-[var(--radius)] border border-hairline-token bg-surface-card px-3 py-2 text-[14px] text-text-primary outline-none";

  function submit(form: FormData) {
    setErr(false);
    start(async () => {
      const r = await createLead(form);
      if (r.ok && r.id) { setOpen(false); router.push(`/leads/${r.id}`); }
      else setErr(true);
    });
  }

  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>{t("newLead")}</Button>
      {open ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-4">
          <button aria-hidden className="absolute inset-0 bg-[rgba(17,17,17,0.6)]" onClick={() => setOpen(false)} />
          <form action={submit} className="relative w-full max-w-md rounded-[var(--radius)] border border-hairline-token bg-surface-card p-6 text-left">
            <p className="mb-4 font-display text-[20px] text-text-primary">{t("newLead")}</p>
            <label className="mb-1 block text-[12px] text-text-meta">{t("formNames")}</label>
            <input name="coupleDisplay" required className={cx(input, "mb-3")} autoFocus />
            <label className="mb-1 block text-[12px] text-text-meta">{t("formEmail")}</label>
            <input name="email" type="email" className={cx(input, "mb-3")} />
            <label className="mb-1 block text-[12px] text-text-meta">{t("formSource")}</label>
            <select name="source" defaultValue="directory" className={cx(input, "mb-5")}>
              {SOURCES.map((s) => <option key={s} value={s}>{t(`source_${s}`)}</option>)}
            </select>
            {err ? <p className="mb-3 text-[12.5px] text-[color:var(--color-text-danger)]">{t("createErr")}</p> : null}
            <div className="flex items-center gap-2">
              <Button type="submit" variant="primary" disabled={pending}>{t("create")}</Button>
              <Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
