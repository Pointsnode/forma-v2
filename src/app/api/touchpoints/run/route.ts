import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBatch } from "@/lib/email/resend";
import { rsvpEmail } from "@/lib/email/rsvp-email";
import { planTouchpointOutcome } from "@/lib/touchpoint-run.mjs";

// Daily cron. Claims due touchpoints, resolves audience, sends the tokenized RSVP
// emails via Resend, stamps the send ledger. Idempotent end to end: claiming with
// status='sending' plus on-conflict-do-nothing send rows means a resumed run
// re-sends nothing. Guarded by CRON_SECRET (Vercel sets Authorization: Bearer …).
export const dynamic = "force-dynamic";

const SENDABLE = new Set(["rsvp_invite", "rsvp_reminder", "rsvp_close"]);

async function run(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const header = req.headers.get("x-cron-secret");
  if (!secret || (auth !== `Bearer ${secret}` && header !== secret)) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const base = new URL(req.url).origin;
  const today = new Date().toISOString().slice(0, 10);

  // Claim due, sendable touchpoints (scheduled or a crashed 'sending' run).
  const { data: due } = await admin
    .from("touchpoints")
    .update({ status: "sending" })
    .in("status", ["scheduled", "sending"])
    .lte("scheduled_for", today)
    .select("id, wedding_id, kind");

  const claimed = (due ?? []).filter((t) => SENDABLE.has(t.kind));
  let totalSent = 0;
  let totalSkipped = 0;

  for (const tp of claimed) {
    const { data: sends } = await admin.rpc("build_touchpoint_sends", { p_touchpoint: tp.id });
    const rows = (sends ?? []) as { guest_id: string; email: string; full_name: string; rsvp_code: string; token: string }[];

    // wedding + locale for the email copy
    const { data: wd } = await admin.from("weddings").select("couple_display, workspace_id").eq("id", tp.wedding_id).maybeSingle();
    let locale: "en" | "es" = "en";
    if (wd?.workspace_id) {
      const { data: ws } = await admin.from("workspaces").select("created_by").eq("id", wd.workspace_id).maybeSingle();
      if (ws?.created_by) {
        const { data: prof } = await admin.from("profiles").select("locale").eq("id", ws.created_by).maybeSingle();
        if (prof?.locale === "es") locale = "es";
      }
    }
    const couple = wd?.couple_display ?? "your wedding";

    const emails = rows.map((s) =>
      rsvpEmail({
        to: s.email,
        guestName: s.full_name,
        couple,
        rsvpUrl: `${base}${locale === "es" ? "/es" : ""}/rsvp/${s.rsvp_code}?s=${s.token}`,
        kind: tp.kind as "rsvp_invite" | "rsvp_reminder" | "rsvp_close",
        locale,
      }),
    );

    // Honor the send result: only stamp the ledger if Resend actually accepted the
    // batch. Skipped (no key) or failed → leave sent_at null, return the touchpoint
    // to 'scheduled', and the next run retries. The ledger must never lie.
    let result: { sent?: number; skipped?: boolean; failed?: boolean };
    try {
      result = await sendBatch(emails);
    } catch {
      result = { failed: true };
    }
    const outcome = planTouchpointOutcome(result, rows.length);

    if (outcome.stampSent) {
      if (rows.length) {
        await admin.from("touchpoint_sends").update({ sent_at: new Date().toISOString() }).eq("touchpoint_id", tp.id).is("sent_at", null);
      }
      await admin.from("touchpoints").update({ status: "sent" }).eq("id", tp.id);
      totalSent += outcome.sent;
    } else {
      console.error(`touchpoints: ${outcome.skipped} send(s) NOT delivered for touchpoint ${tp.id} — returned to scheduled (RESEND unset or send failed)`);
      await admin.from("touchpoints").update({ status: "scheduled" }).eq("id", tp.id);
      totalSkipped += outcome.skipped;
    }
  }

  return NextResponse.json({ ok: true, touchpoints: claimed.length, sent: totalSent, skipped: totalSkipped });
}

export const GET = run;
export const POST = run;
