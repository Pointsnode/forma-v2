import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Bento, BentoBig, BentoFoot, Badge, Tag, heroTone } from "@/components/ui";
import type { VendorCard } from "@/lib/vendors";

const KIND_KEY: Record<string, string> = {
  venue: "kindVenue", catering: "kindCatering", florals: "kindFlorals", music: "kindMusic",
  photo_video: "kindPhoto_video", beauty: "kindBeauty", decor: "kindDecor", rentals: "kindRentals", other: "kindOther",
};

// The catalog as bento cards — a solid brand hero carrying the name (or the
// vendor's own photo behind a flat scrim, never a gradient), tags, and a foot
// that leads to the profile where Present opens the loop.
export async function VendorBento({ vendors }: { vendors: VendorCard[] }) {
  const t = await getTranslations("vendors");
  return (
    <Bento>
      {vendors.map((v) => (
        <Link key={v.id} href={`/vendors/${v.id}`} className="group block">
          <div className="flex flex-col overflow-hidden rounded-2xl bg-paper shadow-card transition-shadow group-hover:shadow-lift">
            <div className="relative flex h-[118px] items-end p-3.5 text-[rgba(255,253,249,0.95)]" style={{ background: heroTone(v.id) }}>
              {v.heroUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={v.heroUrl} alt={v.name} className="absolute inset-0 h-full w-full object-cover" />
                  <span className="absolute inset-0 bg-[rgba(18,18,18,0.32)]" />
                </>
              ) : null}
              <BentoBig size={18}><span className="relative">{v.name}</span></BentoBig>
            </div>
            <div className="flex flex-1 flex-col p-4">
              {v.cities.length ? <p className="text-[12px] text-muted">{v.cities.join(" · ")}</p> : null}
              {v.tags.length ? <div className="mt-1">{v.tags.slice(0, 4).map((tag) => <Tag key={tag}>{tag}</Tag>)}</div> : null}
              <BentoFoot>
                <Badge tone="sand">{t(KIND_KEY[v.kind] ?? "kindOther")}</Badge>
                <span className="ml-auto text-[11.5px] tracking-[0.03em] text-wine group-hover:underline group-hover:underline-offset-2">{t("present")} →</span>
              </BentoFoot>
            </div>
          </div>
        </Link>
      ))}
    </Bento>
  );
}
