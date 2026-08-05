"use client";
import { useTranslations } from "next-intl";
export function PrintButton() {
  const t = useTranslations("floor");
  return <button onClick={() => window.print()} className="rounded-[var(--radius)] bg-ink px-4 py-2 text-[13px] text-bone print:hidden">{t("printSave")}</button>;
}
