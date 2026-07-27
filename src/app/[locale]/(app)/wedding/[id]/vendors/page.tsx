import { notFound } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Link, redirect } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { loadWeddingEngagements } from "@/lib/vendors";
import { WeddingHeader } from "@/components/wedding/wedding-header";
import { EngagementLanes, type EngagementVM } from "@/components/vendors/engagement-lanes";
import { WeddingNav, Heading, cx } from "@/components/ui";
import { formatMoney } from "@/lib/wedding";

export default async function WeddingVendorsTab({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, id);
  if (!ctx || ctx.role === "none") notFound();
  if (ctx.role === "member") redirect({ href: `/wedding/${id}`, locale }); // couple uses the partner view on the floor
  const { wedding, events } = ctx;
  const lang = await getLocale();
  const [tw, tp, tg, teng] = [await getTranslations("wedding"), await getTranslations("proposals"), await getTranslations("guests"), await getTranslations("engagement")];

  const engs = await loadWeddingEngagements(supabase, id);
  const eventLabel = new Map(events.map((e) => [e.id, e.label]));
  const today = new Date().toISOString().slice(0, 10);
  const vms: EngagementVM[] = engs.map((e) => ({
    id: e.id, vendorName: e.vendor.name, vendorKind: e.vendor.kind, status: e.status,
    estimate: formatMoney(e.presented_estimate, lang),
    eventLabels: e.event_ids.map((eid) => eventLabel.get(eid)).filter(Boolean) as string[],
    quote: e.quote ? {
      id: e.quote.id, status: e.quote.status,
      amount: formatMoney(e.quote.amount, lang),
      validUntil: e.quote.valid_until,
      expired: !!e.quote.valid_until && e.quote.valid_until < today,
    } : null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <WeddingHeader wedding={wedding} events={events} />
      <WeddingNav
        items={
          <>
            <Link href={`/wedding/${id}`} className="text-muted hover:text-ink">{tw("overview")}</Link>
            <Link href={`/wedding/${id}/proposals`} className="text-muted hover:text-ink">{tp("tab")}</Link>
            <Link href={`/wedding/${id}/guests`} className="text-muted hover:text-ink">{tg("tab")}</Link>
            <Link href={`/wedding/${id}/vendors`} className={cx("text-ink")}>{teng("tab")}</Link>
          </>
        }
      />
      <div><Heading className="text-[26px]">{teng("tab")}</Heading><p className="font-accent text-[16px] text-muted">{teng("hint")}</p></div>
      <EngagementLanes engagements={vms} />
    </div>
  );
}
