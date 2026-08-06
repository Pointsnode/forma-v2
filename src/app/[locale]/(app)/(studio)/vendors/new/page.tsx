import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Card, Heading } from "@/components/ui";
import { AddVendorForm } from "@/components/vendors/vendor-forms";

export default async function NewVendorPage({
  params, searchParams,
}: { params: Promise<{ locale: string }>; searchParams: Promise<{ kind?: string }> }) {
  const { locale } = await params;
  const { kind } = await searchParams;
  setRequestLocale(locale);
  const t = await getTranslations("vendors");
  const isVenue = kind === "venue";
  return (
    <div className="mx-auto max-w-xl">
      <Link href={isVenue ? "/venues" : "/vendors"} className="mb-4 inline-block text-[13px] text-text-meta hover:text-text-primary">← {isVenue ? t("venues") : t("vendors")}</Link>
      <Card>
        <Heading className="mb-4">{isVenue ? t("addVenue") : t("add")}</Heading>
        <AddVendorForm defaultKind={isVenue ? "venue" : "other"} />
      </Card>
    </div>
  );
}
