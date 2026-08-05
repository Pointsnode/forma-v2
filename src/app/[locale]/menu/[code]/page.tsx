import { getTranslations, setRequestLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { MenuForm } from "@/components/guests/menu-form";

// Public tokenized menu collection — the RSVP pattern. 16-hex rsvp_code; the
// send token (?s=) is opened for read-receipts, like RSVP.
export default async function MenuPage({ params, searchParams }: { params: Promise<{ locale: string; code: string }>; searchParams: Promise<{ s?: string }> }) {
  const { locale, code } = await params;
  const { s } = await searchParams;
  const supabase = await createClient();
  if (s) await supabase.rpc("touchpoint_open", { token: s });
  const { data, error } = await supabase.rpc("menu_lookup", { code });
  const payload = data as { guest: { full_name: string }; locale: string; events: { event_id: string; label: string; locked: boolean; choice_id: string | null; options: { id: string; label: string; diet_tags: string[] }[] }[] } | null;
  // Menus speak the WEDDING's language: redirect to it if the URL locale differs.
  if (payload) {
    const wl = payload.locale;
    if (wl && wl !== locale && (routing.locales as readonly string[]).includes(wl)) {
      redirect({ href: s ? `/menu/${code}?s=${s}` : `/menu/${code}`, locale: wl });
    }
  }
  setRequestLocale(locale);
  const t = await getTranslations("menu");

  return (
    <div className="min-h-screen bg-bone px-5 py-12">
      <div className="mx-auto max-w-md">
        <div className="mb-6">
          <div className="font-display text-[26px] tracking-[0.04em] text-ink">forma</div>
          <p className="text-[7.5px] uppercase tracking-[0.42em] text-taupe">{t("wordmark")}</p>
        </div>
        {error || !payload ? (
          <div className="rounded-[var(--radius)] bg-bone p-8 text-center">
            <p className="font-display text-[22px] text-ink">{t("badTitle")}</p>
            <p className="mt-1.5 font-accent text-[15px] text-muted">{t("badBody")}</p>
          </div>
        ) : (
          <>
            <h1 className="mb-1 font-display text-[24px] text-ink">{t("greeting", { name: payload.guest.full_name })}</h1>
            <p className="mb-5 font-accent text-[15px] text-muted">{t("hint")}</p>
            <MenuForm code={code} events={payload.events} />
          </>
        )}
      </div>
    </div>
  );
}
