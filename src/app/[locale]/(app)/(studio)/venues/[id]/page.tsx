import { setRequestLocale } from "next-intl/server";
import { VendorProfile } from "@/components/vendors/vendor-profile";

// Venue profiles live under /venues/[id] so the studio nav highlights Venues
// (not Vendors) for a venue — same shared profile component, scoped by route.
export default async function VenueProfilePage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  return <VendorProfile id={id} />;
}
