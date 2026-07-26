import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("app");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <p className="mb-8 text-center font-display text-[28px] tracking-tight text-ink">{t("name")}</p>
      {children}
    </main>
  );
}
