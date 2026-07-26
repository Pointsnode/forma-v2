import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBatch } from "@/lib/email/resend";
import { rsvpEmail } from "@/lib/email/rsvp-email";

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

    if (rows.length) {
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
      await sendBatch(emails); // no-op if RESEND_API_KEY unset
      // stamp the ledger for this run (send rows are the record of what went out)
      await admin.from("touchpoint_sends").update({ sent_at: new Date().toISOString() }).eq("touchpoint_id", tp.id).is("sent_at", null);
      totalSent += rows.length;
    }
    await admin.from("touchpoints").update({ status: "sent" }).eq("id", tp.id);
  }

  return NextResponse.json({ ok: true, touchpoints: claimed.length, sent: totalSent });
}

export const GET = run;
export const POST = run;
