import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Card, Heading } from "@/components/ui";
import { CreateWeddingForm } from "../create-form";

export default async function NewWeddingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("wedding.create");
  const ts = await getTranslations("studio");

  return (
    <div className="mx-auto max-w-lg">
      <Link href="/weddings" className="mb-4 inline-block text-[13px] text-text-meta hover:text-text-primary">← {ts("weddings")}</Link>
      <Card>
        <Heading>{t("title")}</Heading>
        <p className="mb-5 mt-1 font-accent text-[16px] text-text-meta">{t("hint")}</p>
        <CreateWeddingForm />
      </Card>
    </div>
  );
}
