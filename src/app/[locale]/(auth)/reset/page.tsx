import { getTranslations, setRequestLocale } from "next-intl/server";
import { Card } from "@/components/ui";
import { ResetForm } from "../auth-forms";

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("auth");
  return (
    <Card>
      <h1 className="mb-5 font-display text-[22px] text-ink">{t("resetTitle")}</h1>
      <ResetForm />
    </Card>
  );
}
