"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Button, cx } from "@/components/ui";
import { updateWeddingFacts } from "@/app/[locale]/(app)/wedding/[id]/facts-actions";

const input = "w-full rounded-xl bg-bone px-3.5 py-2.5 text-[14px] text-ink shadow-card outline-none focus:shadow-lift";
const mlbl = "mt-4 block text-[10.5px] uppercase tracking-[0.14em] text-muted";

export type FactsInitial = {
  budget: string;
  guests: string;
  city: string;
  country: string;
  kind: "city" | "destination" | "";
};

// Staff-only edit of the wedding's foundational facts (budget · guests · location
// · kind) — an overlay sheet opened from the stat strip. Feeds the 2→3 predicates.
export function FactsEditor({ weddingId, initial }: { weddingId: string; initial: FactsInitial }) {
  const t = useTranslations("wedding");
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(form: FormData) {
    setErr(null);
    start(async () => {
      const r = await updateWeddingFacts(weddingId, form);
      if (r.error) setErr(t("factsError"));
      else setOpen(false);
    });
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="text-[12.5px] text-muted hover:text-ink hover:underline hover:underline-offset-2">
        {t("editFacts")}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
          <button aria-hidden className="absolute inset-0 cursor-default bg-[rgba(21,18,16,0.55)]" onClick={() => setOpen(false)} />
          <form action={onSubmit} className="relative w-full max-w-[480px] rounded-[18px] bg-paper p-7 shadow-hero">
            <h3 className="font-display text-[22px] text-ink">{t("factsTitle")}</h3>
            <p className="mb-1 mt-0.5 font-accent text-[15px] italic text-taupe">{t("factsHint")}</p>

            <div className="grid grid-cols-2 gap-x-3">
              <div>
                <label className={mlbl}>{t("statBudget")}</label>
                <input name="budget_total" defaultValue={initial.budget} inputMode="numeric" className={cx(input, "mt-1.5")} placeholder="$ ·" />
              </div>
              <div>
                <label className={mlbl}>{t("statGuests")}</label>
                <input name="guest_target" defaultValue={initial.guests} inputMode="numeric" className={cx(input, "mt-1.5")} />
              </div>
              <div>
                <label className={mlbl}>{t("factsCity")}</label>
                <input name="location_city" defaultValue={initial.city} className={cx(input, "mt-1.5")} />
              </div>
              <div>
                <label className={mlbl}>{t("factsCountry")}</label>
                <input name="location_country" defaultValue={initial.country} className={cx(input, "mt-1.5")} />
              </div>
            </div>

            <label className={mlbl}>{t("factsKind")}</label>
            <select name="kind" defaultValue={initial.kind} className={cx(input, "mt-1.5")}>
              <option value="">·</option>
              <option value="city">{t("create.kindCity")}</option>
              <option value="destination">{t("create.kindDestination")}</option>
            </select>

            {err ? <p className="mt-2 text-[13px] text-wine">{err}</p> : null}
            <div className="mt-5 flex justify-end gap-2.5">
              <Button variant="ghost" onClick={() => setOpen(false)}>{t("cancel")}</Button>
              <Button type="submit" disabled={pending}>{t("save")}</Button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
