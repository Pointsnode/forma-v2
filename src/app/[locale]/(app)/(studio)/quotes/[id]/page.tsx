import { notFound } from "next/navigation";
import { setRequestLocale, getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { APP_URL } from "@/lib/env";
import { QuoteBuilder, type QuoteRow, type LineRow } from "./quote-builder";
import { QuoteSent } from "./quote-sent";

export default async function QuoteDetailPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await getLocale();
  const supabase = await createClient();

  const { data: quote } = await supabase.from("client_quotes")
    .select("id, workspace_id, lead_id, wedding_id, number, title, intro, currency, status, valid_until, deposit_note, locale, access_token, accepted_at, accepted_name")
    .eq("id", id).maybeSingle();
  if (!quote) notFound();

  const [{ data: lineRows }, { data: tplRows }, prepared] = await Promise.all([
    supabase.from("client_quote_lines").select("id, section, section_sort, title, description, amount, sort").eq("quote_id", id).order("section_sort").order("sort"),
    supabase.from("client_quote_templates").select("id, title").eq("workspace_id", quote.workspace_id).order("created_at", { ascending: false }),
    (async () => {
      if (quote.lead_id) { const { data } = await supabase.from("leads").select("couple_display, email").eq("id", quote.lead_id).maybeSingle(); return { name: data?.couple_display ?? null, hasEmail: !!data?.email }; }
      if (quote.wedding_id) { const { data } = await supabase.from("weddings").select("couple_display").eq("id", quote.wedding_id).maybeSingle(); return { name: data?.couple_display ?? null, hasEmail: false }; }
      return { name: null, hasEmail: false };
    })(),
  ]);

  const q = quote as QuoteRow;
  const lines = (lineRows ?? []) as LineRow[];
  const templates = (tplRows ?? []) as { id: string; title: string }[];

  if (q.status === "draft") {
    return <QuoteBuilder quote={q} lines={lines} templates={templates} preparedFor={prepared.name} />;
  }
  return <QuoteSent quote={q} lines={lines} preparedFor={prepared.name} leadHasEmail={prepared.hasEmail} publicUrl={q.access_token ? `${APP_URL}/quote/${q.access_token}` : null} />;
}
