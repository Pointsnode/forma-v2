import type { ReactNode } from "react";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui";
import { signOut } from "../(auth)/actions";

// Shared app chrome: the wordmark + sign out. Studio nav lives in (studio); the
// wedding floor and event pages bring their own header (the scope law).
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
        <Link href="/" className="font-display text-[22px] tracking-tight text-ink">
          {t("app.name")}
        </Link>
        {user ? (
          <form action={signOut}>
            <Button type="submit" variant="ghost">{t("app.signOut")}</Button>
          </form>
        ) : null}
      </header>
      <div className="mt-8">{children}</div>
    </div>
  );
}
