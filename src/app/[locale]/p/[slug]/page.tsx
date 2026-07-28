import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getPlannerProfile, publicImageUrl, pick } from "@/lib/directory";
import { alternates, localeUrl, plannerJsonLd } from "@/lib/seo";
import { JsonLd, PhotoFrame, PublicHeader, PublicFooter, SectionKicker, toInitials } from "@/components/directory/ui";
import { InquiryForm } from "./inquiry-form";
import { DiscoveryButton } from "./discovery-button";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ locale: Locale; slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  const p = await getPlannerProfile(slug);
  if (!p) return { title: "Not found", robots: { index: false, follow: false } };
  const t = await getTranslations({ locale, namespace: "directory" });
  const tagline = pick(p.profile.tagline, locale);
  const hero = publicImageUrl(p.profile.hero);
  const title = t("profileTitle", { name: p.name });
  const description = tagline || t("profileFallbackDesc", { name: p.name });
  return {
    title,
    description,
    alternates: alternates(locale, `/p/${slug}`),
    openGraph: { title, description, url: localeUrl(locale, `/p/${slug}`), type: "profile", ...(hero ? { images: [{ url: hero }] } : {}) },
    twitter: { card: "summary_large_image", title, description, ...(hero ? { images: [hero] } : {}) },
    robots: { index: true, follow: true },
  };
}

export default async function ProfilePage({ params }: Props) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const p = await getPlannerProfile(slug);
  // Fix (1): an unpublished / non-existent profile is a 404 — the read already gated.
  if (!p) notFound();
  const t = await getTranslations({ locale, namespace: "directory" });
  const prof = p.profile ?? {};
  const initials = toInitials(p.name);
  const tagline = pick(prof.tagline, locale);
  const about = pick(prof.about, locale);
  const gallery = (prof.gallery ?? []).filter(Boolean);
  const services = prof.services ?? [];
  const discovery = prof.discovery_calls_enabled && prof.booking_url ? prof.booking_url : null;
  const nf = new Intl.NumberFormat(locale === "es" ? "es-MX" : "en-US");

  return (
    <div className="min-h-screen bg-bone">
      <JsonLd data={plannerJsonLd(p, locale, `/p/${slug}`)} />
      <PublicHeader />

      {/* Full-bleed hero */}
      <section className="mx-auto max-w-6xl px-6">
        <div className="relative">
          <PhotoFrame
            path={prof.hero}
            alt={p.name}
            initials={initials}
            priority
            className="aspect-[16/10] w-full rounded-[18px] shadow-hero sm:aspect-[21/9]"
            sizes="100vw"
          />
          <div className="pointer-events-none absolute inset-0 rounded-[18px] bg-[linear-gradient(to_top,rgba(18,18,18,0.55),rgba(18,18,18,0.05)_45%,transparent)]" />
          <div className="absolute inset-x-0 bottom-0 p-6 sm:p-9">
            <h1 className="font-display text-[clamp(30px,5.5vw,56px)] font-medium leading-[1.03] text-bone drop-shadow">{p.name}</h1>
            {tagline ? <p className="mt-2 max-w-2xl font-accent text-[clamp(17px,2.4vw,22px)] italic text-bone/90">{tagline}</p> : null}
          </div>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-12 px-6 py-14 lg:grid-cols-[1.5fr_1fr]">
        {/* Left: story, gallery, services */}
        <div>
          {about ? (
            <section className="mb-14">
              <SectionKicker>{t("about")}</SectionKicker>
              <div className="max-w-2xl space-y-4 font-accent text-[19px] leading-relaxed text-ink-soft">
                {about.split(/\n\n+/).map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>
            </section>
          ) : null}

          {gallery.length > 0 && (
            <section className="mb-14">
              <SectionKicker>{t("work")}</SectionKicker>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {gallery.map((g, i) => (
                  <PhotoFrame
                    key={i}
                    path={g}
                    alt={`${p.name} — ${i + 1}`}
                    initials={initials}
                    className="aspect-square w-full rounded-[10px]"
                    sizes="(max-width: 640px) 50vw, 33vw"
                  />
                ))}
              </div>
            </section>
          )}

          {services.length > 0 && (
            <section>
              <SectionKicker>{t("services")}</SectionKicker>
              <ul className="divide-y divide-hairline border-y border-hairline">
                {services.map((s, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-4 py-3.5">
                    <span className="font-display text-[19px] text-ink">{s.name}</span>
                    {typeof s.from_price === "number" ? (
                      <span className="shrink-0 font-accent text-[16px] italic text-taupe">{t("fromPrice", { price: nf.format(s.from_price) })}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        {/* Right: sticky inquiry + discovery + areas */}
        <aside className="lg:sticky lg:top-8 lg:self-start">
          {discovery ? (
            <div className="mb-4 flex justify-center lg:justify-start">
              <DiscoveryButton url={discovery} label={t("bookCall")} />
            </div>
          ) : null}
          <InquiryForm
            slug={slug}
            labels={{
              formTitle: t("formTitle"),
              formHint: t("formHint", { name: p.name }),
              name: t("name"),
              partner: t("partnerName"),
              email: t("email"),
              phone: t("phone"),
              date: t("weddingDate"),
              message: t("message"),
              send: t("send"),
              sending: t("sending"),
              sentTitle: t("sentTitle"),
              sentBody: t("sentBody"),
              errName: t("errName"),
              errEmail: t("errEmail"),
              errMessage: t("errMessage"),
              errRate: t("errRate"),
              errGone: t("errGone"),
              errGeneric: t("errGeneric"),
            }}
          />
          {p.areas.length > 0 && (
            <div className="mt-6">
              <SectionKicker>{t("serves")}</SectionKicker>
              <ul className="space-y-1.5">
                {p.areas.map((a, i) => (
                  <li key={i} className="text-[15px] text-ink-soft">
                    {[a.city, a.region, a.country].filter(Boolean).join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      <div className="mx-auto max-w-6xl px-6 pb-4 text-center">
        <Link href="/planners" className="font-accent text-[16px] italic text-taupe underline-offset-4 hover:underline">
          {t("backToAll")}
        </Link>
      </div>
      <PublicFooter note={t("footerNote")} />
    </div>
  );
}
