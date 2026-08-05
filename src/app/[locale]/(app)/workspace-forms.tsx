"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui";
import { createWorkspace, type WorkspaceState } from "./actions";

export function CreateWorkspaceForm() {
  const t = useTranslations("workspace");
  const [state, action, pending] = useActionState<WorkspaceState, FormData>(createWorkspace, null);
  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] text-muted">{t("name")}</span>
        <input name="name" required maxLength={120} className="w-full rounded-[var(--radius)] bg-bone px-3.5 py-2.5 text-[14px] text-ink outline-none" />
      </label>
      <fieldset className="flex gap-2">
        {(["studio", "couple"] as const).map((k, i) => (
          <label key={k} className="flex-1 cursor-pointer">
            <input type="radio" name="kind" value={k} defaultChecked={i === 0} className="peer sr-only" />
            <span className="block rounded-[var(--radius)] bg-bone px-4 py-3 text-center text-[14px] text-muted peer-checked:bg-ink peer-checked:text-bone">
              {t(k === "studio" ? "kindStudio" : "kindCouple")}
            </span>
          </label>
        ))}
      </fieldset>
      {state?.error ? <p className="text-[13px] text-wine">{t("error")}</p> : null}
      <Button type="submit" disabled={pending} className="w-full">{t("create")}</Button>
    </form>
  );
}
