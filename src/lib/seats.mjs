// The SINGLE definition of a workspace's billable concierge-seat count. Every display
// and billing site imports this so Team, Settings › Plan, Start (Checkout), the webhook
// reconcile/snapshot, and the concierge invite-preview can never disagree — the count
// was duplicated in five places and drift here misbills real money.
//
// A concierge seat is a member the studio pays PRICE_CONCIERGE/mo for: the workspace
// OWNER (role 'owner' ⟺ the admin box — the clearance model treats owner as admin
// everywhere, and createWorkspace seeds the owner with empty grants), an explicit 'admin'
// grant, or an explicit 'concierge' grant. (Gio, 2026-07-31: the founding owner IS a
// billable concierge seat.)
//
// When concierge is DISABLED for the workspace (concierge_settings.enabled = false) the
// count is 0 — no charge for a feature that's off (Gio, 2026-07-31). The seats resume at
// the next period-boundary reconciliation once concierge is re-enabled.

export function isConciergeSeat(member) {
  return member.role === "owner" || (member.grants ?? []).includes("admin") || (member.grants ?? []).includes("concierge");
}

export function conciergeSeatCount(rows, conciergeEnabled) {
  if (!conciergeEnabled) return 0;
  return (rows ?? []).filter(isConciergeSeat).length;
}
