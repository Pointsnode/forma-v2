import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { zonedDateKey } from "./calendar-grid.mjs";
import { taskHref } from "./task-href.mjs";
import { initials } from "./wedding";

// The calendar's data layer, RLS-scoped to the viewer's workspace. Three species on
// one surface. Meetings are STORED rows (never Calendly's API); their day-cell is
// computed HERE in the connection's timezone (default America/Mexico_City until a
// studio connects — a named pre-connection default, see [[m11-calendar]]). Wedding
// days and task due dates are DATE-typed → zone-free, used verbatim.

export type CalEntry = {
  id: string;
  species: "meeting" | "wedding" | "task";
  date: string; // 'YYYY-MM-DD' — zoned for meetings, raw date for wedding/task
  title: string;
  weddingId?: string;
  // meeting
  invitee?: string | null;
  email?: string | null;
  startAt?: string;
  endAt?: string | null;
  status?: "scheduled" | "canceled";
  joinUrl?: string | null;
  cancelUrl?: string | null;
  rescheduleUrl?: string | null;
  eventType?: string | null;
  // wedding
  eventId?: string;
  tag?: string;
  // task
  href?: string;
};

export type CalendarData = {
  timezone: string;
  connected: boolean;
  userUri: string | null;
  entries: CalEntry[];
};

export async function loadCalendar(supabase: SupabaseClient): Promise<CalendarData> {
  const { data: conn } = await supabase
    .from("calendly_connections")
    .select("timezone, calendly_user_uri, status")
    .limit(1)
    .maybeSingle();
  const timezone = (conn?.timezone as string) ?? "America/Mexico_City";
  const connected = !!conn && conn.status === "active";

  const [{ data: weds }, { data: meetings }, { data: events }, { data: tasks }] = await Promise.all([
    supabase.from("weddings").select("id, couple_display"),
    supabase.from("meetings").select("id, title, event_type_name, invitee_name, invitee_email, start_at, end_at, status, join_url, cancel_url, reschedule_url"),
    supabase.from("wedding_events").select("id, wedding_id, label, event_date").not("event_date", "is", null),
    supabase
      .from("tasks")
      .select("id, wedding_id, title, due_date, event_id, link_section, proposal_id, contract_id, engagement_id, document_id")
      .not("due_date", "is", null),
  ]);

  const nameMap = new Map(((weds ?? []) as { id: string; couple_display: string }[]).map((w) => [w.id, w.couple_display]));
  const entries: CalEntry[] = [];

  for (const m of (meetings ?? []) as Record<string, string>[]) {
    entries.push({
      id: `m-${m.id}`,
      species: "meeting",
      date: zonedDateKey(m.start_at, timezone),
      title: m.event_type_name || m.title || m.invitee_name || "Meeting",
      invitee: m.invitee_name,
      email: m.invitee_email,
      startAt: m.start_at,
      endAt: m.end_at,
      status: (m.status as "scheduled" | "canceled") ?? "scheduled",
      joinUrl: m.join_url,
      cancelUrl: m.cancel_url,
      rescheduleUrl: m.reschedule_url,
      eventType: m.event_type_name,
    });
  }

  for (const e of (events ?? []) as { id: string; wedding_id: string; label: string; event_date: string }[]) {
    const couple = nameMap.get(e.wedding_id) ?? "";
    entries.push({
      id: `w-${e.id}`,
      species: "wedding",
      date: e.event_date,
      title: couple ? `${couple} — ${e.label}` : e.label,
      weddingId: e.wedding_id,
      eventId: e.id,
      tag: initials(couple),
    });
  }

  for (const t of (tasks ?? []) as Record<string, string | null>[]) {
    entries.push({
      id: `t-${t.id}`,
      species: "task",
      date: t.due_date as string,
      title: t.title as string,
      weddingId: (t.wedding_id as string) ?? undefined,
      href: taskHref({
        wedding_id: t.wedding_id,
        eventId: t.event_id,
        linkSection: t.link_section,
        proposalId: t.proposal_id,
        contractId: t.contract_id,
        engagementId: t.engagement_id,
        documentId: t.document_id,
      }),
    });
  }

  return { timezone, connected, userUri: (conn?.calendly_user_uri as string) ?? null, entries };
}

/** The cockpit whisper: the soonest scheduled meeting within the next `days` days. */
export function nextMeeting(entries: CalEntry[], nowMs: number, days = 7): CalEntry | null {
  const horizon = nowMs + days * 86_400_000;
  const upcoming = entries
    .filter((e) => e.species === "meeting" && e.status === "scheduled" && e.startAt)
    .map((e) => ({ e, t: new Date(e.startAt!).getTime() }))
    .filter((x) => x.t >= nowMs && x.t <= horizon)
    .sort((a, b) => a.t - b.t);
  return upcoming[0]?.e ?? null;
}

// Light cockpit query — the soonest scheduled meeting in the next 7 days, plus the
// studio timezone to render its time. Skips the full calendar load.
export async function loadNextMeeting(
  supabase: SupabaseClient,
): Promise<{ invitee: string; startAt: string; timezone: string } | null> {
  const { data: conn } = await supabase.from("calendly_connections").select("timezone").limit(1).maybeSingle();
  const timezone = (conn?.timezone as string) ?? "America/Mexico_City";
  const nowIso = new Date().toISOString();
  const horizon = new Date(Date.now() + 7 * 86_400_000).toISOString();
  const { data } = await supabase
    .from("meetings")
    .select("invitee_name, event_type_name, start_at")
    .eq("status", "scheduled")
    .gte("start_at", nowIso)
    .lte("start_at", horizon)
    .order("start_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return { invitee: (data.invitee_name as string) || (data.event_type_name as string) || "Meeting", startAt: data.start_at as string, timezone };
}
