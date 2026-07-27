import { setRequestLocale } from "next-intl/server";
import { VendorProfile } from "@/components/vendors/vendor-profile";

export default async function VendorProfilePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <VendorProfile id={id} />;
}
