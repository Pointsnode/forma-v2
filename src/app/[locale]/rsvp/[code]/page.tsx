import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { RsvpForm } from "./rsvp-form";
import { formatDateRange } from "@/lib/wedding";
import { Wordmark } from "@/components/ui";

type LookupPayload = {
  guest: { full_name: string; plus_one_allowed: boolean; plus_one_name: string | null; dietary: string | null };
  wedding: { couple_display: string; date_start: string | null; date_end: string | null; location_city: string | null };
  locale: string;
  open: boolean;
  closed_reason: string | null;
  events: { event_id: string; label: string; event_date: string | null; status: string }[];
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bone px-5 py-12">
      <div className="mx-auto max-w-md">{children}</div>
    </div>
  );
}

export default async function RsvpPage({
  params, searchParams,
}: {
  params: Promise<{ locale: string; code: string }>;
  searchParams: Promise<{ s?: string }>;
}) {
  const { locale, code } = await params;
  const { s: sendToken } = await searchParams;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rsvp_lookup", { code });
  // The RSVP page speaks the WEDDING's language, not the visitor's: if the URL locale
  // differs from the wedding's, redirect to the wedding-locale path, then render in it.
  if (data) {
    const wl = (data as LookupPayload).locale;
    if (wl && wl !== locale && (routing.locales as readonly string[]).includes(wl)) {
      redirect({ href: sendToken ? `/rsvp/${code}?s=${sendToken}` : `/rsvp/${code}`, locale: wl });
    }
  }
  setRequestLocale(locale);
  const t = await getTranslations("rsvp");

  if (error || !data) {
    return (
      <Shell>
        <p className="mb-1 font-display text-[24px] text-ink">{t("invalidTitle")}</p>
        <p className="font-accent text-[16px] text-muted">{t("invalidBody")}</p>
      </Shell>
    );
  }
  const payload = data as LookupPayload;
  const range = formatDateRange(payload.wedding.date_start, payload.wedding.date_end, locale);

  return (
    <Shell>
      <div className="mb-6">
        <Wordmark size={15} className="mb-1 block" />
        <h1 className="font-display text-[30px] leading-tight text-ink">{payload.wedding.couple_display}</h1>
        <p className="mt-1 font-accent text-[16px] text-taupe">
          {[range, payload.wedding.location_city].filter(Boolean).join(" · ")}
        </p>
      </div>

      {!payload.open ? (
        <div className="rounded-[var(--radius)] bg-bone p-6">
          <p className="mb-1 font-display text-[20px] text-ink">{payload.closed_reason === "expired" ? t("expiredTitle") : t("closedTitle")}</p>
          <p className="font-accent text-[15.5px] text-muted">{payload.closed_reason === "expired" ? t("expiredBody") : t("closedBody")}</p>
        </div>
      ) : (
        <RsvpForm code={code} sendToken={sendToken ?? null} couple={payload.wedding.couple_display} guest={payload.guest} events={payload.events} />
      )}
    </Shell>
  );
}
