import { getTranslations, setRequestLocale, getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { Wordmark, DomainStar } from "@/components/ui";
import { QuoteHead } from "@/components/quote/quote-head";
import { signStudioLogo } from "@/lib/studio-logo";
import { formatMoney } from "@/lib/wedding";
import { intlTag } from "@/lib/intl";
import { QuoteAccept } from "./accept-form";

type Line = { section: string | null; section_sort: number; title: string; description: string | null; amount: number; sort: number };
type Payload = {
  quote: { id: string; number: number; title: string | null; intro: string | null; currency: string; status: string; valid_until: string | null; deposit_note: string | null; accepted_at: string | null; accepted_name: string | null };
  lines: Line[]; studio_name: string | null; studio_logo_path: string | null; prepared_for: string | null; locale: string;
};

export default async function QuotePage({ params }: { params: Promise<{ locale: string; token: string }> }) {
  const { locale, token } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("quote_lookup", { token });
  // The quote speaks the recipient's language: redirect to the resolved locale path (RSVP pattern).
  if (data) {
    const wl = (data as Payload).locale;
    if (wl && wl !== locale && (routing.locales as readonly string[]).includes(wl)) redirect({ href: `/quote/${token}`, locale: wl });
  }
  setRequestLocale(locale);
  const t = await getTranslations("quotes");
  const lang = await getLocale();

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#E4DFD3] px-5 py-16 text-center">
        <p className="font-display text-[24px] text-[#111111]">{t("badTitle")}</p>
        <p className="mt-1 font-accent text-[16px] italic text-[#6B655B]">{t("badBody")}</p>
      </div>
    );
  }
  const p = data as Payload;
  const q = p.quote;
  const logoUrl = await signStudioLogo(p.studio_logo_path);
  const money = (n: number) => formatMoney(n, lang, q.currency);
  const total = p.lines.reduce((s, l) => s + Number(l.amount), 0);
  const dfmt = new Intl.DateTimeFormat(intlTag(lang), { month: "long", day: "numeric", year: "numeric" });
  const expired = q.status === "sent" && q.valid_until != null && q.valid_until < new Date().toISOString().slice(0, 10);

  // Group lines by section, preserving section_sort order.
  const sections: { title: string | null; lines: Line[] }[] = [];
  for (const l of p.lines) {
    let sec = sections.find((s) => s.title === (l.section ?? null));
    if (!sec) { sec = { title: l.section ?? null, lines: [] }; sections.push(sec); }
    sec.lines.push(l);
  }

  return (
    <div className="min-h-screen bg-[#E4DFD3] px-4 py-11">
      <div className="mx-auto max-w-[720px] overflow-hidden rounded-[var(--radius)] border border-[#E4DFD3] bg-[#F5F2EB]">
        {/* Charcoal head — the studio's logo takes the name line when set */}
        <QuoteHead
          kicker={t("aQuoteFrom")}
          studioName={p.studio_name ?? t("theStudio")}
          logoUrl={logoUrl}
          metaLine={[t("headNumber", { n: q.number }), p.prepared_for ? t("headPreparedFor", { name: p.prepared_for }) : null].filter(Boolean).join(" · ")}
        />

        {q.intro ? <p className="px-9 pb-2 pt-7 font-accent text-[17px] italic text-[#6B655B]">{q.intro}</p> : null}

        <div className="px-9">
          {sections.map((sec, si) => (
            <div key={si}>
              {sec.title ? <p className="flex items-center gap-2 pb-1 pt-[18px] text-[10px] font-medium uppercase tracking-[0.24em] text-[#6B655B]"><DomainStar fill="#2F5552" size={9} />{sec.title}</p> : <div className="pt-2" />}
              {sec.lines.map((l, li) => (
                <div key={li} className="grid grid-cols-[1fr_auto] gap-4 border-b border-[#E4DFD3] py-3 text-[13.5px]">
                  <span><span className="text-[#111111]">{l.title}</span>{l.description ? <span className="mt-0.5 block text-[12px] text-[#6B655B]">{l.description}</span> : null}</span>
                  <span className="tabular-nums text-[#111111]">{money(l.amount)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>

        {/* Total band */}
        <div className="mt-4 grid grid-cols-[1fr_auto] gap-4 bg-[#111111] px-9 py-4 text-[14px]">
          <span className="font-medium text-[#F5F2EB]">{t("totalLabel")}</span>
          <span className="tabular-nums text-[#F5F2EB]">{new Intl.NumberFormat(intlTag(lang), { style: "currency", currency: q.currency, maximumFractionDigits: 0 }).format(total)} <span className="text-[11px] text-[#D7C3A5]">{t("allAmountsIn", { currency: q.currency })}</span></span>
        </div>

        {q.deposit_note || q.valid_until ? (
          <div className="flex justify-between gap-4 px-9 pb-1.5 pt-5 text-[12px] text-[#6B655B]">
            <span>{q.deposit_note}</span>
            {q.valid_until ? <span>{t("holdsUntil", { date: dfmt.format(new Date(q.valid_until + "T00:00:00")) })}</span> : null}
          </div>
        ) : null}

        {/* Accept card / states */}
        <div className="mx-9 mb-8 mt-5 rounded-[var(--radius)] border border-[#E4DFD3] p-6 text-center">
          {q.status === "accepted" ? (
            <span className="inline-flex items-center rounded-[var(--radius)] bg-[#2F5552] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-[#F5F2EB]">
              {t("acceptedChip", { name: q.accepted_name ?? "", date: q.accepted_at ? dfmt.format(new Date(q.accepted_at)) : "" })}
            </span>
          ) : q.status === "withdrawn" ? (
            <p className="font-accent text-[15px] italic text-[#6B655B]">{t("withdrawnPublicNote")}</p>
          ) : expired ? (
            <p className="font-accent text-[15px] italic text-[#6B655B]">{t("expiredNote")}</p>
          ) : (
            <>
              <p className="mb-4 font-accent text-[16px] italic text-[#6B655B]">{t("rulingCopy")}</p>
              <QuoteAccept token={token} />
            </>
          )}
        </div>

        {/* Signed footer */}
        <div className="bg-[#111111] px-6 py-6 text-center">
          <div className="flex justify-center"><DomainStar fill="#D7C3A5" size={12} /></div>
          <div className="mt-1.5"><Wordmark size={17} className="!text-[#F5F2EB]" /></div>
          {p.studio_name ? <p className="mt-2 text-[9px] uppercase tracking-[0.2em] text-[#D7C3A5]">{t("preparedBy", { name: p.studio_name })}</p> : null}
        </div>
      </div>
    </div>
  );
}
