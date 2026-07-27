import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadVendorCards } from "@/lib/vendors";
import { VendorBento } from "@/components/vendors/vendor-bento";
import { Heading, Button } from "@/components/ui";

export default async function VenuesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("vendors");
  const supabase = await createClient();
  const venues = await loadVendorCards(supabase, { venue: true });

  return (
    <div>
      <div className="mb-6 flex items-end justify-between">
        <div><Heading className="text-[28px]">{t("venues")}</Heading><p className="font-accent text-[16px] text-muted">{t("venuesHint")}</p></div>
        <Link href="/vendors/new?kind=venue"><Button>{t("addVenue")}</Button></Link>
      </div>
      {venues.length === 0
        ? <div className="rounded-2xl bg-bone p-10 text-center shadow-card"><p className="font-accent text-[17px] text-muted">{t("empty")}</p></div>
        : <VendorBento vendors={venues} />}
    </div>
  );
}
