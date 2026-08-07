import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getTranslations } from "next-intl/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailShell } from "@/lib/email/shell";
import { sendBatch } from "@/lib/email/resend";

// The automation sweep (L3). Runs hourly on the SERVICE-ROLE client (this file is the single
// allowlisted home for admin access — the design-notify precedent). Evaluates the two rules a
// planner authored, sends the canonical email in the lead's language, and logs an 'automated'
// event. The lead_events log IS the dedup source: no rule fires twice for the same reason.

type Lead = { id: string; couple_display: string; email: string; locale: string | null; consult_at: string | null; created_at: string };

// A day string in UTC, offset days from now.
function utcDay(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

async function sendAutomated(
  kind: "consult" | "followUp",
  lead: Lead,
  studio: string,
  plannerName: string,
  plannerEmail: string | undefined,
): Promise<boolean> {
  const t = await getTranslations({ locale: lead.locale ?? "en", namespace: "email" });
  const subject = t(kind === "consult" ? "lead.consultSubject" : "lead.followUpSubject", { couple: lead.couple_display });
  const line = t(kind === "consult" ? "lead.consultLine" : "lead.followUpLine", { couple: lead.couple_display });
  const footer = t("lead.automatedFooter", { planner: plannerName || studio });
  const html = emailShell(
    `<p style="font-family:Inter,Arial,sans-serif;font-size:15px;margin:0">${line}</p>` +
    `<p style="font-family:Inter,Arial,sans-serif;font-size:12px;color:#8A867E;margin-top:20px">${footer}</p>`,
    t("shell.held"),
  );
  const r = await sendBatch([{ from: `${studio} <leads@forma.events>`, to: [lead.email], subject, html, text: `${line}\n\n${footer}`, reply_to: plannerEmail }]);
  return r.sent > 0; // only a real send counts — the log must never claim a skipped/failed send
}

async function plannerFor(admin: SupabaseClient, workspaceId: string): Promise<{ studio: string; name: string; email: string | undefined }> {
  const { data: ws } = await admin.from("workspaces").select("name, created_by").eq("id", workspaceId).maybeSingle();
  const studio = (ws?.name as string | null) ?? "Forma";
  let name = "", email: string | undefined;
  if (ws?.created_by) {
    const { data: u } = await admin.auth.admin.getUserById(ws.created_by as string);
    email = u?.user?.email ?? undefined;
    const { data: prof } = await admin.from("profiles").select("display_name").eq("id", ws.created_by as string).maybeSingle();
    name = (prof?.display_name as string | null) ?? "";
  }
  return { studio, name, email };
}

const HUMAN_KINDS = ["arrived", "note", "stage", "consult", "converted", "quote", "email"];

export async function runLeadSweep(): Promise<{ consult: number; followUp: number }> {
  const admin = createAdminClient();
  const tomorrow = utcDay(1);
  let consult = 0, followUp = 0;

  const { data: rules } = await admin.from("lead_rules").select("workspace_id, rule, days").eq("enabled", true);
  for (const r of (rules ?? []) as { workspace_id: string; rule: string; days: number }[]) {
    const planner = await plannerFor(admin, r.workspace_id);

    if (r.rule === "consult_confirm") {
      // The evening before consult_at (UTC day = tomorrow). Once per consult datetime.
      const { data: leads } = await admin.from("leads")
        .select("id, couple_display, email, locale, consult_at, created_at")
        .eq("workspace_id", r.workspace_id).eq("automation_muted", false).eq("consult_confirmed", false)
        .not("email", "is", null).not("consult_at", "is", null).not("stage", "in", "(won,lost)");
      for (const l of (leads ?? []) as Lead[]) {
        if ((l.consult_at ?? "").slice(0, 10) !== tomorrow) continue;
        const { data: prior } = await admin.from("lead_events").select("id").eq("lead_id", l.id).eq("kind", "automated").eq("body", "consult_confirm").contains("meta", { consult: l.consult_at }).limit(1);
        if (prior && prior.length) continue;
        if (await sendAutomated("consult", l, planner.studio, planner.name, planner.email)) {
          await admin.from("lead_events").insert({ lead_id: l.id, kind: "automated", body: "consult_confirm", meta: { consult: l.consult_at } });
          consult++;
        }
      }
    } else if (r.rule === "quiet_follow_up") {
      // A lead in conversation/quote_out gone quiet for `days`. ONCE per quiet spell: fire only
      // if the last human touch is older than `days` AND no automated follow-up has happened
      // since that touch (so a second never fires without human activity in between).
      const cutoff = new Date(Date.now() - r.days * 86_400_000).toISOString();
      const { data: leads } = await admin.from("leads")
        .select("id, couple_display, email, locale, consult_at, created_at")
        .eq("workspace_id", r.workspace_id).eq("automation_muted", false).in("stage", ["conversation", "quote_out"]).not("email", "is", null);
      for (const l of (leads ?? []) as Lead[]) {
        const { data: lastHuman } = await admin.from("lead_events").select("created_at").eq("lead_id", l.id).in("kind", HUMAN_KINDS).order("created_at", { ascending: false }).limit(1);
        const humanAt = (lastHuman?.[0]?.created_at as string | undefined) ?? l.created_at;
        if (humanAt > cutoff) continue; // active within the window
        const { data: lastAuto } = await admin.from("lead_events").select("created_at").eq("lead_id", l.id).eq("kind", "automated").eq("body", "quiet_follow_up").order("created_at", { ascending: false }).limit(1);
        if (lastAuto?.[0] && (lastAuto[0].created_at as string) > humanAt) continue; // already followed up this spell
        if (await sendAutomated("followUp", l, planner.studio, planner.name, planner.email)) {
          await admin.from("lead_events").insert({ lead_id: l.id, kind: "automated", body: "quiet_follow_up", meta: {} });
          followUp++;
        }
      }
    }
  }
  return { consult, followUp };
}
