import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card } from "@/components/ui";
import { safeNextPath } from "@/lib/auth-redirect.mjs";
import { SignInForm } from "../auth-forms";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  const next = safeNextPath((await searchParams).next) ?? undefined;
  return (
    <Card>
      <h1 className="mb-5 font-display text-[22px] text-ink">{t("signInTitle")}</h1>
      <SignInForm next={next} />
    </Card>
  );
}
