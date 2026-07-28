// Turn a Calendly invitee webhook payload into a `meetings` upsert row — pure, so
// the mapping is unit-tested without a network. The workspace is NOT taken from the
// payload; it rides in the webhook callback URL (?w=<workspace_id>), which the route
// resolves to a connection (and its signing key) before this runs. invitee.created →
// scheduled; invitee.canceled → canceled (the row is KEPT, status flipped).

export function normalizeInviteeEvent(body) {
  const kind = body?.event;
  const p = body?.payload;
  if (!p) return null;
  if (kind !== "invitee.created" && kind !== "invitee.canceled") return null;
  const ev = p.scheduled_event || {};
  const eventUri = ev.uri;
  const inviteeUri = p.uri;
  if (!eventUri || !inviteeUri || !ev.start_time) return null; // not enough to store honestly

  return {
    kind,
    row: {
      calendly_event_uri: eventUri,
      calendly_invitee_uri: inviteeUri,
      title: ev.name || null,
      event_type_name: ev.name || null,
      invitee_name: p.name || null,
      invitee_email: p.email || null,
      start_at: ev.start_time,
      end_at: ev.end_time || null,
      status: kind === "invitee.canceled" ? "canceled" : "scheduled",
      join_url: ev.location?.join_url || null,
      cancel_url: p.cancel_url || null,
      reschedule_url: p.reschedule_url || null,
    },
  };
}

// Backfill: a Calendly scheduled_event (from the list API) + its invitee → the same
// row shape, so day-one connect isn't an empty grid.
export function normalizeScheduledEvent(ev, invitee) {
  if (!ev?.uri || !invitee?.uri || !ev.start_time) return null;
  return {
    calendly_event_uri: ev.uri,
    calendly_invitee_uri: invitee.uri,
    title: ev.name || null,
    event_type_name: ev.name || null,
    invitee_name: invitee.name || null,
    invitee_email: invitee.email || null,
    start_at: ev.start_time,
    end_at: ev.end_time || null,
    status: ev.status === "canceled" || invitee.status === "canceled" ? "canceled" : "scheduled",
    join_url: ev.location?.join_url || null,
    cancel_url: invitee.cancel_url || null,
    reschedule_url: invitee.reschedule_url || null,
  };
}
