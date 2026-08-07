import { setRequestLocale, getTranslations } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { StudioTitleBand, Panel, PanelHead, PanelRow, Chip, DomainStar } from "@/components/ui";
import { NewQuoteButton } from "./new-quote-button";

type Q = { id: string; number: number; title: string | null; status: string; lead_id: string | null; wedding_id: string | null };

export default async function QuotesListPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("quotes");
  const supabase = await createClient();

  const { data: rows } = await supabase.from("client_quotes").select("id, number, title, status, lead_id, wedding_id").order("number", { ascending: false });
  const quotes = (rows ?? []) as Q[];

  // Prepared-for names for the listed quotes (lead first, then wedding).
  const leadIds = [...new Set(quotes.map((q) => q.lead_id).filter(Boolean))] as string[];
  const wedIds = [...new Set(quotes.map((q) => q.wedding_id).filter(Boolean))] as string[];
  const names = new Map<string, string>();
  if (leadIds.length) { const { data } = await supabase.from("leads").select("id, couple_display").in("id", leadIds); for (const r of (data ?? []) as { id: string; couple_display: string }[]) names.set(`l${r.id}`, r.couple_display); }
  if (wedIds.length) { const { data } = await supabase.from("weddings").select("id, couple_display").in("id", wedIds); for (const r of (data ?? []) as { id: string; couple_display: string }[]) names.set(`w${r.id}`, r.couple_display); }
  const preparedFor = (q: Q) => (q.lead_id && names.get(`l${q.lead_id}`)) || (q.wedding_id && names.get(`w${q.wedding_id}`)) || t("standalone");

  const statusChip = (s: string) =>
    s === "accepted" ? <Chip tone="settled">{t("statusAccepted")}</Chip>
      : s === "sent" ? <Chip tone="attention">{t("statusSent")}</Chip>
        : s === "withdrawn" ? <Chip tone="pending">{t("statusWithdrawn")}</Chip>
          : <Chip tone="pending">{t("statusDraft")}</Chip>;

  return (
    <>
      <StudioTitleBand kicker={t("kicker")} title={t("tab")} action={<NewQuoteButton />} />

      {quotes.length === 0 ? (
        <Panel><p className="px-[18px] py-8 text-center font-accent text-[15px] text-text-meta">{t("listEmpty")}</p></Panel>
      ) : (
        <Panel>
          <PanelHead star={<DomainStar domain="money" size={12} />} title={t("tab")} meta={t("listMeta", { count: quotes.length })} />
          {quotes.map((q) => (
            <PanelRow key={q.id} href={`/quotes/${q.id}`} cols="auto minmax(160px,1.4fr) 1fr auto">
              <span className="tabular-nums text-[12px] text-text-meta">№ {q.number}</span>
              <span className="truncate font-display text-[15px] text-text-primary">{q.title || t("untitled")}</span>
              <span className="truncate text-[12px] text-text-meta">{preparedFor(q)}</span>
              {statusChip(q.status)}
            </PanelRow>
          ))}
        </Panel>
      )}
    </>
  );
}
