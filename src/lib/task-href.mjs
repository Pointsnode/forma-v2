// Deep-link a task to its subject's room (§1E) — a task is a pointer. At most one
// subject link is set (DB CHECK). An event link honors its section anchor
// (#schedule|#menus|#seating|…), which the event sub-nav has exposed since M6.
// Pure — shared by the server loader and the logic test.
export function taskHref(t) {
  const w = t.wedding_id;
  if (!w) return "/tasks";
  if (t.contractId) return `/wedding/${w}/contracts/${t.contractId}`;
  if (t.proposalId) return `/wedding/${w}/proposals`;
  if (t.engagementId) return `/wedding/${w}/vendors`;
  if (t.documentId) return `/wedding/${w}/documents`;
  if (t.eventId) return `/wedding/${w}/event/${t.eventId}${t.linkSection ? `#${t.linkSection}` : ""}`;
  return `/wedding/${w}`;
}
