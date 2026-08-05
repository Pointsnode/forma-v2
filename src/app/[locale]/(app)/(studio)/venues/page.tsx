import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadVendorCards } from "@/lib/vendors";
import { CatalogBrowser } from "@/components/vendors/catalog-browser";
import { Button, SectionTitle } from "@/components/ui";

export default async function VenuesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("vendors");
  const supabase = await createClient();
  const venues = await loadVendorCards(supabase, { venue: true });

  return (
    <div>
      <SectionTitle title={t("venues")} accent={t("venuesHint")} action={<Link href="/vendors/new?kind=venue"><Button>{t("addVenue")}</Button></Link>} className="mt-1" />
      {venues.length === 0
        ? <div className="rounded-[var(--radius)] bg-bone p-10 text-center"><p className="font-accent text-[17px] text-muted">{t("empty")}</p></div>
        : <CatalogBrowser vendors={venues} mode="venues" />}
    </div>
  );
}
