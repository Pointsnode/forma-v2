import { notFound } from "next/navigation";
import { getLocale, getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/server";
import { loadWeddingContext } from "@/lib/load-wedding";
import { loadEngagementLedger } from "@/lib/vendors";
import { WeddingShell } from "@/components/wedding/wedding-shell";
import { formatMoney } from "@/lib/wedding";
import { EngagementLedgerView, type LedgerVM } from "@/components/vendors/engagement-ledger-view";

export default async function EngagementRoom({ params }: { params: Promise<{ locale: string; id: string; engagementId: string }> }) {
  const { locale, id, engagementId } = await params;
  setRequestLocale(locale);
  const supabase = await createClient();
  const ctx = await loadWeddingContext(supabase, id);
  if (!ctx || ctx.role === "none") notFound();
  const { wedding, events, role } = ctx;
  const lang = await getLocale();

  const led = await loadEngagementLedger(supabase, engagementId, id);
  if (!led) notFound(); // gone, or not this wedding, or the caller can't see it (RLS)

  const fmt = (n: number | null | undefined) => formatMoney(n ?? null, lang) ?? "·";
  const dateFmt = (iso: string) => (iso ? new Intl.DateTimeFormat(lang === "es" ? "es-ES" : "en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso)) : "");

  const latest = led.quotes[led.quotes.length - 1] ?? null;
  const acceptedQuote = led.quotes.find((q) => q.status === "accepted") ?? null;
  const proposalItems = led.timeline.filter((t): t is Extract<typeof t, { kind: "proposal" }> => t.kind === "proposal");
  const openQuoteProposal = proposalItems.find((t) => t.quoteId && (t.status === "sent" || t.status === "seen"));
  const presentationProposal = proposalItems.find((t) => !t.quoteId && (t.status === "sent" || t.status === "seen"));
  const latestSent = latest ? proposalItems.some((t) => t.quoteId === latest.id) : false;

  const vm: LedgerVM = {
    id: led.id,
    weddingId: id,
    vendorName: led.vendorName,
    vendorKind: led.vendorKind,
    status: led.status,
    priceStrip: led.priceStrip.map((s) => ({ label: s.label, amountFmt: fmt(s.amount), deltaFmt: s.delta == null ? null : `${s.delta > 0 ? "+" : ""}${fmt(s.delta)}`, deltaUp: (s.delta ?? 0) > 0, dateFmt: s.date ? dateFmt(s.date) : "" })),
    timeline: led.timeline.map((t) => {
      if (t.kind === "opened") return { kind: "opened" as const, dateFmt: dateFmt(t.at), presenter: t.presenter, estimateFmt: t.estimate == null ? null : fmt(t.estimate), note: t.note, events: t.events };
      if (t.kind === "quote") return { kind: "quote" as const, dateFmt: dateFmt(t.at), ordinal: t.quote.ordinal, status: t.quote.status, amountFmt: t.quote.amount == null ? null : fmt(t.quote.amount), validUntil: t.quote.validUntil ? dateFmt(t.quote.validUntil) : null, note: t.quote.note, url: t.quote.url };
      if (t.kind === "proposal") return { kind: "proposal" as const, dateFmt: dateFmt(t.at), status: t.status, title: t.title, respondedFmt: t.respondedAt ? dateFmt(t.respondedAt) : null };
      return { kind: "message" as const, dateFmt: dateFmt(t.at), authorName: t.authorName, isCouple: t.isCouple, body: t.body };
    }),
    rail: {
      vendorId: led.vendorId,
      latestQuoteId: latest?.id ?? null,
      latestQuoteStatus: latest?.status ?? null,
      latestSent,
      acceptedQuoteId: acceptedQuote?.id ?? null,
      acceptedAmountFmt: acceptedQuote?.amount != null ? fmt(acceptedQuote.amount) : null,
      openQuoteProposalId: openQuoteProposal?.id ?? null,
      presentationProposalId: presentationProposal?.id ?? null,
      hasBudgetLine: led.hasBudgetLine,
    },
  };

  const tb = await getTranslations("engagement");

  return (
    <WeddingShell wedding={wedding} events={events} role={role === "staff" ? "staff" : "member"} active="vendors" showNav={false}>
      <div className="mb-4">
        <Link href={`/wedding/${id}/vendors`} className="text-[12.5px] text-muted hover:text-ink">← {tb("backToVendors")}</Link>
      </div>
      <EngagementLedgerView vm={vm} isStaff={role === "staff"} />
    </WeddingShell>
  );
}
