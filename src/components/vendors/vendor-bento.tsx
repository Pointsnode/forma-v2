"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Bento, BentoBig, BentoFoot, Badge, Tag, WhoBadge, heroToneAt, cx } from "@/components/ui";
import type { VendorCard, CardEngagement } from "@/lib/vendors";

const statusKey = (s: string) => `status${s.charAt(0).toUpperCase()}${s.slice(1)}`;
const profileHref = (v: VendorCard) => (v.kind === "venue" ? `/venues/${v.id}` : `/vendors/${v.id}`) as `/venues/${string}` | `/vendors/${string}`;
function nameInitials(name: string): string {
  const p = name.split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase() || name.slice(0, 2).toUpperCase();
}

// The catalog — a featured wide flagship card (rich: small-caps restrictions/
// perks/contact rows) then the grid. Every card carries engagement-status pills
// (where the vendor stands across weddings), a description with its city bolded,
// and Edit / Present affordances. Solid heroes rotate for variety (no gradients).
// M16-catalog: a client component (was an async server component) so CatalogBrowser can pass it the
// client-filtered subset and re-render instantly — markup/output byte-identical; only the i18n hook
// moved from getTranslations (server) to useTranslations (client).
export function VendorBento({ vendors }: { vendors: VendorCard[] }) {
  const [t, te] = [useTranslations("vendors"), useTranslations("engagement")];

  const pills = (engagements: CardEngagement[]) =>
    engagements.length ? (
      engagements.slice(0, 2).map((e, i) => (
        <Badge key={i} tone={e.status === "booked" ? "ink" : "sand"}>{te(statusKey(e.status))} · {e.couple}</Badge>
      ))
    ) : (
      <Badge tone="sand">{t("inCatalog")}</Badge>
    );

  const desc = (v: VendorCard) => {
    const city = v.cities[0];
    if (!v.description && !city) return null;
    return (
      <p className="text-[12px] leading-snug text-text-meta">
        {v.description}
        {v.description && city ? " · " : ""}
        {city ? <b className="font-medium text-taupe">{city}</b> : null}
      </p>
    );
  };

  const hero = (v: VendorCard, tone: string, size: number) => (
    <div className="relative flex h-[118px] items-end justify-between p-3.5 text-[rgba(255,253,249,0.95)]" style={{ background: tone }}>
      {v.heroUrl ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={v.heroUrl} alt={v.name} className="absolute inset-0 h-full w-full object-cover" />
          <span className="absolute inset-0 bg-[rgba(18,18,18,0.32)]" />
        </>
      ) : null}
      {v.tags.length ? <span className="relative font-accent text-[13.5px] italic leading-tight">{v.tags.slice(0, 4).join(" · ")}</span> : <span />}
      <BentoBig size={size}><span className="relative">{v.name}</span></BentoBig>
    </div>
  );

  const [featured, ...rest] = vendors;

  return (
    <Bento>
      {featured ? (
        <div className="flex flex-col overflow-hidden rounded-[var(--radius)] bg-surface-card md:col-span-2">
          <Link href={profileHref(featured)} className="block">{hero(featured, heroToneAt(0), 22)}</Link>
          <div className="flex flex-1 flex-col p-5">
            {desc(featured)}
            {featured.tags.length ? <div className="mt-1.5">{featured.tags.slice(0, 5).map((tag) => <Tag key={tag}>{tag}</Tag>)}</div> : null}
            <dl className="mt-3 grid grid-cols-[110px_1fr] gap-x-3.5 gap-y-2 text-[12.5px]">
              {featured.restrictions ? <><dt className="pt-0.5 text-[10px] uppercase tracking-[0.1em] text-text-meta">{t("restrictions")}</dt><dd className="text-text-primary-soft">{featured.restrictions}</dd></> : null}
              {featured.perks ? <><dt className="pt-0.5 text-[10px] uppercase tracking-[0.1em] text-text-meta">{t("perks")}</dt><dd className="text-text-primary-soft">{featured.perks}</dd></> : null}
              {featured.contactName || featured.contactEmail || featured.contactPhone ? (
                <>
                  <dt className="pt-1 text-[10px] uppercase tracking-[0.1em] text-text-meta">{t("contactName")}</dt>
                  <dd className="flex items-center gap-2 text-text-primary-soft">
                    {featured.contactName ? <WhoBadge who="vendor">{nameInitials(featured.contactName)}</WhoBadge> : null}
                    <span>{[featured.contactName, featured.contactEmail, featured.contactPhone].filter(Boolean).join(" · ")}</span>
                  </dd>
                </>
              ) : null}
            </dl>
            <BentoFoot>
              {pills(featured.engagements)}
              <Link href={profileHref(featured)} className="ml-auto text-[11.5px] text-text-meta hover:text-text-primary">{t("editVendor")}</Link>
              <Link href={profileHref(featured)} className="text-[11.5px] tracking-[0.03em] text-[color:var(--color-text-danger)] hover:underline hover:underline-offset-2">{t("present")} →</Link>
            </BentoFoot>
          </div>
        </div>
      ) : null}

      {rest.map((v, i) => (
        <div key={v.id} className="group flex flex-col overflow-hidden rounded-[var(--radius)] bg-surface-card transition-shadow">
          <Link href={profileHref(v)} className="block">{hero(v, heroToneAt(i + 1), 18)}</Link>
          <div className="flex flex-1 flex-col p-4">
            {desc(v)}
            {v.tags.length ? <div className="mt-1">{v.tags.slice(0, 4).map((tag) => <Tag key={tag}>{tag}</Tag>)}</div> : null}
            <BentoFoot>
              {pills(v.engagements)}
              <Link href={profileHref(v)} className={cx("ml-auto text-[11.5px] tracking-[0.03em] text-[color:var(--color-text-danger)]", "group-hover:underline group-hover:underline-offset-2")}>{t("present")} →</Link>
            </BentoFoot>
          </div>
        </div>
      ))}
    </Bento>
  );
}
