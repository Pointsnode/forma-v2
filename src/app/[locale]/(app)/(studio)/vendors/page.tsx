import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadVendorCards } from "@/lib/vendors";
import { CatalogBrowser } from "@/components/vendors/catalog-browser";
import { Button, SectionTitle } from "@/components/ui";

export default async function VendorsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("vendors");
  const supabase = await createClient();
  const vendors = await loadVendorCards(supabase, { venue: false });

  return (
    <div>
      <SectionTitle title={t("vendors")} accent={t("vendorsHint")} action={<Link href="/vendors/new"><Button>{t("add")}</Button></Link>} className="mt-1" />
      {vendors.length === 0
        ? <div className="rounded-[var(--radius)] bg-bone p-10 text-center"><p className="font-accent text-[17px] text-muted">{t("empty")}</p></div>
        : <CatalogBrowser vendors={vendors} mode="vendors" />}
    </div>
  );
}
