import { setRequestLocale, getTranslations, getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { StudioTitleBand } from "@/components/ui";
import { intlTag } from "@/lib/intl";
import { LANES } from "@/lib/leads.mjs";
import { NewLeadForm } from "./new-lead-form";
import { ArrivalsStrip } from "./arrivals-strip";
import { LeadsView, type LeadRow } from "./leads-view";

export default async function LeadsPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("leads");
  const lang = await getLocale();
  const supabase = await createClient();
  // Leads are RLS-scoped to the viewer's workspace; no explicit workspace filter needed here.
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: leadRows }, { data: arrivalRows }] = await Promise.all([
    supabase.from("leads")
      .select("id, couple_display, date_feel, date_start, city, guest_feel, source, source_note, stage, lost_reason, next_step, next_step_at, consult_at, consult_confirmed, wedding_id")
      .order("created_at", { ascending: false }),
    // Arrivals: directory inquiries not yet taken to the desk (and not already converted).
    supabase.from("inquiries")
      .select("id, name, partner_name, message, created_at")
      .is("lead_id", null).is("wedding_id", null).neq("status", "archived")
      .order("created_at", { ascending: false }).limit(12),
  ]);

  const leads = (leadRows ?? []) as LeadRow[];
  const board = leads.filter((l) => l.stage !== "lost");
  const lost = leads.filter((l) => l.stage === "lost");
  const openCount = leads.filter((l) => l.stage !== "won" && l.stage !== "lost").length;
  const needTouch = leads.filter((l) => l.stage !== "won" && l.stage !== "lost" && l.next_step_at && l.next_step_at <= today).length;

  // The lost-this-season breakdown: total + per-reason counts (taupe tail on the quiet line).
  const lostByReason = new Map<string, number>();
  for (const l of lost) lostByReason.set(l.lost_reason ?? "other", (lostByReason.get(l.lost_reason ?? "other") ?? 0) + 1);

  const dfmt = new Intl.DateTimeFormat(intlTag(lang), { month: "short", day: "numeric" });
  const arrivals = ((arrivalRows ?? []) as { id: string; name: string; partner_name: string | null; message: string; created_at: string }[]).map((a) => ({
    id: a.id,
    name: a.partner_name ? `${a.name} & ${a.partner_name}` : a.name,
    snippet: a.message.length > 90 ? `${a.message.slice(0, 90)}…` : a.message,
    when: dfmt.format(new Date(a.created_at)),
  }));

  const metaLine = `${t("openCount", { count: openCount })} · ${t("needTouch", { count: needTouch })}`;

  return (
    <>
      <StudioTitleBand kicker={t("kicker")} title={t("title")} accent={t("accent")} action={<NewLeadForm />} />

      <div className="mb-4 text-[11px] uppercase tracking-[0.14em] text-text-meta">{metaLine}</div>

      {arrivals.length ? <ArrivalsStrip arrivals={arrivals} /> : null}

      <LeadsView
        board={board}
        lost={lost}
        today={today}
        lanes={LANES}
        lostSummary={{ total: lost.length, byReason: [...lostByReason.entries()].map(([reason, count]) => ({ reason, count })) }}
      />
    </>
  );
}
