import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { listScheduledEvents, listEventInvitees } from "./api";
import { normalizeScheduledEvent } from "./normalize.mjs";

// Day-one backfill so the grid isn't empty before the first webhook fires: pull the
// org's scheduled events (recent + upcoming) and their invitees, and upsert them as
// `meetings`. Runs under the caller's client (the connect callback's session works —
// a member may upsert their own workspace's meetings under RLS).
export async function backfillMeetings(
  supabase: SupabaseClient,
  opts: { workspaceId: string; accessToken: string; orgUri: string },
): Promise<number> {
  const minStart = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const events = await listScheduledEvents(opts.accessToken, opts.orgUri, minStart);
  const rows: Record<string, unknown>[] = [];
  for (const ev of events) {
    const invitees = await listEventInvitees(opts.accessToken, ev.uri);
    for (const inv of invitees) {
      const r = normalizeScheduledEvent(ev, inv);
      if (r) rows.push({ ...r, workspace_id: opts.workspaceId });
    }
  }
  if (rows.length) {
    await supabase.from("meetings").upsert(rows, { onConflict: "workspace_id,calendly_event_uri,calendly_invitee_uri" });
  }
  return rows.length;
}
