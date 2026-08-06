import { notFound } from "next/navigation";
import { setRequestLocale, getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { intlTag } from "@/lib/intl";
import { LeadSheet, type LeadFull, type ThreadEvent } from "./lead-sheet";

export default async function LeadSheetPage({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const lang = await getLocale();
  const supabase = await createClient();

  const [{ data: lead }, { data: eventRows }] = await Promise.all([
    supabase.from("leads").select("id, couple_display, email, phone, locale, date_feel, date_start, city, guest_feel, budget_feel, source, source_note, stage, lost_reason, next_step, next_step_at, consult_at, consult_confirmed, wedding_id").eq("id", id).maybeSingle(),
    supabase.from("lead_events").select("id, kind, body, created_at, profiles:author_id(display_name)").eq("lead_id", id).order("created_at", { ascending: true }),
  ]);
  if (!lead) notFound();

  const dfmt = new Intl.DateTimeFormat(intlTag(lang), { month: "short", day: "numeric" });
  const events: ThreadEvent[] = ((eventRows ?? []) as unknown as { id: string; kind: string; body: string | null; created_at: string; profiles: { display_name: string } | null }[]).map((e) => ({
    id: e.id, kind: e.kind, body: e.body, when: dfmt.format(new Date(e.created_at)), author: e.profiles?.display_name ?? null,
  }));

  return <LeadSheet lead={lead as LeadFull} events={events} />;
}
