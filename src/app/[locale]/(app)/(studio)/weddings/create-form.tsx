"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { createWedding, type WeddingState } from "../actions";

const inputCls =
  "w-full rounded-[var(--radius)] bg-bone px-3.5 py-2.5 text-[14px] text-ink outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] text-muted">{label}</span>
      {children}
    </label>
  );
}

export function CreateWeddingForm() {
  const t = useTranslations("wedding.create");
  const [state, action, pending] = useActionState<WeddingState, FormData>(createWedding, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <Field label={t("coupleDisplay")}>
        <input name="coupleDisplay" required maxLength={120} placeholder={t("coupleDisplayPlaceholder")} className={inputCls} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("partnerA")}><input name="partnerA" maxLength={120} className={inputCls} /></Field>
        <Field label={t("partnerB")}><input name="partnerB" maxLength={120} className={inputCls} /></Field>
      </div>

      <fieldset className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">{t("kind")}</span>
        <div className="flex gap-2">
          {(["city", "destination"] as const).map((k, i) => (
            <label key={k} className="flex-1 cursor-pointer">
              <input type="radio" name="kind" value={k} defaultChecked={i === 0} className="peer sr-only" />
              <span className="block rounded-[var(--radius)] bg-bone px-4 py-3 text-center text-[14px] text-muted peer-checked:bg-ink peer-checked:text-bone">
                {t(k === "city" ? "kindCity" : "kindDestination")}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Field label={t("locationCity")}><input name="locationCity" maxLength={120} className={inputCls} /></Field>
        <Field label={t("locationCountry")}><input name="locationCountry" maxLength={120} className={inputCls} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("guestTarget")}><input name="guestTarget" inputMode="numeric" className={inputCls} /></Field>
        <Field label={t("budgetTotal")}><input name="budgetTotal" inputMode="numeric" className={inputCls} /></Field>
      </div>

      {state?.error ? <p className="text-[13px] text-wine">{t("error")}</p> : null}
      <Button type="submit" disabled={pending} className="w-full">{t("submit")}</Button>
    </form>
  );
}
