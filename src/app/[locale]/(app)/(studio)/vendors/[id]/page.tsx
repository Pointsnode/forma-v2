import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadVendorProfile } from "@/lib/vendors";
import { MediaUpload, PresentModal } from "@/components/vendors/vendor-forms";
import { Card, Heading, Pill, SectionLabel } from "@/components/ui";

const kindKey = (k: string) => `kind${k.charAt(0).toUpperCase()}${k.slice(1)}`;
const labelKey = (l: string) => `label${l.charAt(0).toUpperCase()}${l.slice(1)}`;
const statusKey = (s: string) => `status${s.charAt(0).toUpperCase()}${s.slice(1)}`;

export default async function VendorProfile({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const data = await loadVendorProfile(supabase, id);
  if (!data) notFound();
  const { vendor, photos, files, engagements } = data;
  const [t, te] = [await getTranslations("vendors"), await getTranslations("engagement")];

  // weddings + events for the Present modal (RLS-scoped to the planner's studio)
  const { data: wRows } = await supabase.from("weddings").select("id, couple_display, wedding_events(id, label, event_date, order_index)").order("date_start", { ascending: true, nullsFirst: false });
  const weddings = (wRows ?? []).map((w) => {
    const r = w as unknown as { id: string; couple_display: string; wedding_events: { id: string; label: string; event_date: string | null; order_index: number }[] };
    const events = [...(r.wedding_events ?? [])].sort((a, b) => (a.event_date ?? "").localeCompare(b.event_date ?? "") || a.order_index - b.order_index).map((e) => ({ id: e.id, label: e.label }));
    return { id: r.id, couple_display: r.couple_display, events };
  });

  const isVenue = vendor.kind === "venue";
  const facts = [
    vendor.cities.length ? vendor.cities.join(", ") : null,
    isVenue && vendor.capacity ? `${vendor.capacity} cap` : null,
    isVenue ? vendor.address : null,
  ].filter(Boolean);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Link href={isVenue ? "/venues" : "/vendors"} className="text-[13px] text-muted hover:text-ink">← {isVenue ? t("venues") : t("vendors")}</Link>

      <div className="flex items-center gap-3">
        <Heading className="text-[28px]">{vendor.name}</Heading>
        <Pill tone="sand">{t(kindKey(vendor.kind))}</Pill>
      </div>

      {photos.length ? (
        <div className="flex gap-2 overflow-x-auto">
          {photos.map((p) => p.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={p.id} src={p.url} alt={p.caption ?? vendor.name} className="h-40 w-56 shrink-0 rounded-xl object-cover shadow-card" />
          ) : null)}
        </div>
      ) : null}

      <Card>
        {vendor.description ? <p className="mb-3 font-accent text-[16px] text-ink-soft">{vendor.description}</p> : null}
        {facts.length ? <p className="text-[13.5px] text-taupe">{facts.join(" · ")}</p> : null}
        {vendor.tags.length ? <div className="mt-2 flex flex-wrap gap-1.5">{vendor.tags.map((tag) => <Pill key={tag} tone="bone">{tag}</Pill>)}</div> : null}
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {vendor.services ? <div><SectionLabel>{t("services")}</SectionLabel><p className="text-[14px] text-ink">{vendor.services}</p></div> : null}
          {vendor.restrictions ? <div><SectionLabel>{t("restrictions")}</SectionLabel><p className="text-[14px] text-ink">{vendor.restrictions}</p></div> : null}
          {vendor.perks ? <div><SectionLabel>{t("perks")}</SectionLabel><p className="text-[14px] text-ink">{vendor.perks}</p></div> : null}
          {vendor.contact_name || vendor.contact_email ? <div><SectionLabel>{t("contactName")}</SectionLabel><p className="text-[14px] text-ink">{[vendor.contact_name, vendor.contact_email, vendor.contact_phone].filter(Boolean).join(" · ")}</p></div> : null}
        </dl>
      </Card>

      <Card>
        <Heading className="mb-2 text-[18px]">{t("present")}</Heading>
        <PresentModal vendorId={id} weddings={weddings} />
      </Card>

      <Card>
        <Heading className="mb-3 text-[18px]">{t("photos")}</Heading>
        <MediaUpload vendorId={id} kind="photo" />
        <div className="mt-4"><Heading className="mb-2 text-[16px]">{t("files")}</Heading>
          <MediaUpload vendorId={id} kind="file" />
          {files.length ? <ul className="mt-2 flex flex-col gap-1">{files.map((f) => (
            <li key={f.id} className="text-[13.5px]">{f.url ? <a href={f.url} className="text-taupe underline">{t(labelKey(f.label))}</a> : t(labelKey(f.label))}</li>
          ))}</ul> : null}
        </div>
      </Card>

      {engagements.length ? (
        <Card>
          <Heading className="mb-3 text-[18px]">{t("engagementsTitle")}</Heading>
          <ul className="flex flex-col gap-2">
            {engagements.map((e) => (
              <li key={e.id} className="flex items-center justify-between text-[14px]">
                <span className="text-ink">{t("presentedTo", { couple: e.couple })}</span>
                <Pill tone="sand">{te(statusKey(e.status))}</Pill>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}
