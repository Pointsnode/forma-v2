import { NextResponse, type NextRequest } from "next/server";
import { localePrefix } from "@/lib/intl";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendBatch } from "@/lib/email/resend";
import { rsvpEmail } from "@/lib/email/rsvp-email";
import { menuEmail, dayOfScheduleEmail } from "@/lib/email/ops-email";
import { planTouchpointOutcome } from "@/lib/touchpoint-run.mjs";

// Daily cron. Claims due touchpoints, resolves audience, sends the tokenized RSVP
// emails via Resend, stamps the send ledger. Idempotent end to end: claiming with
// status='sending' plus on-conflict-do-nothing send rows means a resumed run
// re-sends nothing. Guarded by CRON_SECRET (Vercel sets Authorization: Bearer …).
export const dynamic = "force-dynamic";

const SENDABLE = new Set(["rsvp_invite", "rsvp_reminder", "rsvp_close", "menu_collect", "day_of_schedule"]);

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

    // §3/§5 — guest email copy follows the WEDDING's language, falling back to the
    // workspace creator's locale (then 'en') when wedding.locale is null: today's
    // behaviour unchanged for null. (FR/IT bodies gracefully fall back to EN until the
    // email catalog namespace lands — see the PR's known gap.)
    const { data: wd } = await admin.from("weddings").select("couple_display, workspace_id, locale").eq("id", tp.wedding_id).maybeSingle();
    let locale: string = wd?.locale ?? "en";
    if (!wd?.locale && wd?.workspace_id) {
      const { data: ws } = await admin.from("workspaces").select("created_by").eq("id", wd.workspace_id).maybeSingle();
      if (ws?.created_by) {
        const { data: prof } = await admin.from("profiles").select("locale").eq("id", ws.created_by).maybeSingle();
        if (prof?.locale) locale = prof.locale;
      }
    }
    const couple = wd?.couple_display ?? "your wedding";
    const prefix = `${base}${localePrefix(locale)}`;

    // Per-kind email. menu_collect → tokenized /menu link; day_of_schedule → a
    // read-only itinerary (events + times + venue + the guest's seat).
    let emails;
    if (tp.kind === "menu_collect") {
      emails = rows.map((s) => menuEmail({ to: s.email, guestName: s.full_name, couple, menuUrl: `${prefix}/menu/${s.rsvp_code}?s=${s.token}`, locale }));
    } else if (tp.kind === "day_of_schedule") {
      const [{ data: evs }, { data: booked }, { data: seatRows }] = await Promise.all([
        admin.from("wedding_events").select("id, label, event_date, start_time").eq("wedding_id", tp.wedding_id).order("event_date", { ascending: true, nullsFirst: false }),
        admin.from("event_vendors").select("event_id, venue_booked, wedding_vendors(vendors(name))").eq("wedding_id", tp.wedding_id).eq("venue_booked", true),
        admin.from("seats").select("guest_id, seating_tables(name)").eq("wedding_id", tp.wedding_id),
      ]);
      const venueOf = new Map((booked ?? []).map((b) => [(b as { event_id: string }).event_id, (b as unknown as { wedding_vendors: { vendors: { name: string } | null } | null }).wedding_vendors?.vendors?.name ?? null]));
      const events = ((evs ?? []) as { id: string; label: string; event_date: string | null; start_time: string | null }[]).map((e) => ({ label: e.label, date: e.event_date, time: e.start_time?.slice(0, 5) ?? null, venue: venueOf.get(e.id) ?? null }));
      const seatOf = new Map(((seatRows ?? []) as unknown as { guest_id: string; seating_tables: { name: string } | null }[]).map((s) => [s.guest_id, s.seating_tables?.name ?? null]));
      emails = rows.map((s) => dayOfScheduleEmail({ to: s.email, guestName: s.full_name, couple, events, seat: seatOf.get(s.guest_id) ?? null, locale }));
    } else {
      emails = rows.map((s) => rsvpEmail({ to: s.email, guestName: s.full_name, couple, rsvpUrl: `${prefix}/rsvp/${s.rsvp_code}?s=${s.token}`, kind: tp.kind as "rsvp_invite" | "rsvp_reminder" | "rsvp_close", locale }));
    }

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
