import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Pill } from "@/components/ui";
import type { VendorCard } from "@/lib/vendors";

const TONES = ["#4E5C47", "#5C2B35", "#8A7355", "#3A1A20", "#4E5147", "#6B4A2F"];
function tone(id: string) { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0; return TONES[h % TONES.length]; }

const KIND_KEY: Record<string, string> = {
  venue: "kindVenue", catering: "kindCatering", florals: "kindFlorals", music: "kindMusic",
  photo_video: "kindPhoto_video", beauty: "kindBeauty", decor: "kindDecor", rentals: "kindRentals", other: "kindOther",
};

export async function VendorBento({ vendors }: { vendors: VendorCard[] }) {
  const t = await getTranslations("vendors");
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {vendors.map((v) => (
        <Link key={v.id} href={`/vendors/${v.id}`} className="group flex flex-col overflow-hidden rounded-2xl bg-paper shadow-card transition-shadow hover:shadow-lift">
          <div className="h-32 w-full overflow-hidden" style={{ background: tone(v.id) }}>
            {v.heroUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.heroUrl} alt={v.name} className="h-32 w-full object-cover" />
            ) : null}
          </div>
          <div className="flex flex-col gap-1.5 p-4">
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate font-display text-[18px] text-ink">{v.name}</p>
              <Pill tone="sand">{t(KIND_KEY[v.kind] ?? "kindOther")}</Pill>
            </div>
            {v.cities.length ? <p className="font-accent text-[14px] text-muted">{v.cities.join(" · ")}</p> : null}
            {v.tags.length ? <p className="text-[12px] text-taupe">{v.tags.slice(0, 4).join(" · ")}</p> : null}
          </div>
        </Link>
      ))}
    </div>
  );
}
