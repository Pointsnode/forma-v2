import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { WeddingNav, Button } from "@/components/ui";
import { signOut } from "../(auth)/actions";

export default async function AppLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto max-w-6xl px-6 py-6">
      <header className="flex items-center justify-between">
        <span className="font-display text-[22px] tracking-tight text-ink">{t("app.name")}</span>
        {user ? (
          <form action={signOut}>
            <Button type="submit" variant="ghost">{t("app.signOut")}</Button>
          </form>
        ) : null}
      </header>
      <WeddingNav
        className="mt-5"
        items={
          <>
            <span className="text-ink">{t("nav.cockpit")}</span>
            <span>{t("nav.weddings")}</span>
            <span>{t("nav.calendar")}</span>
            <span>{t("nav.catalog")}</span>
          </>
        }
      />
      <div className="mt-8">{children}</div>
    </div>
  );
}
