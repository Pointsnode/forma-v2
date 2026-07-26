-- 0004_private_grants.sql — Forma v2 M2 fast-follow (sev-fix).
--
-- Production bug: schema `private` had no ACL, so `authenticated` lacked USAGE and
-- every public SECURITY INVOKER wrapper failed the hop into `private.*` with
-- SQLSTATE 42501 "permission denied for schema private" — the whole loop (accept,
-- send, respond, mark_seen, post_message, withdraw) was dead for real users. RLS
-- kept working because policy-invoked functions don't require the caller's schema
-- USAGE, and PUBLIC had default EXECUTE. The hermetic tests missed it because the
-- harness over-granted private USAGE — role identity is part of the call shape.
--
-- Fix: grant USAGE, then close the hole that opens (PUBLIC EXECUTE on every private
-- function, incl. internal helpers like log_activity) by revoking and re-granting
-- EXECUTE to `authenticated` ONLY on the intended entry points + the helpers that
-- RLS policies reference. Internal helpers stay owner/trigger-only.

grant usage on schema private to authenticated, service_role;

-- Postgres grants EXECUTE to PUBLIC by default — revoke it across the schema so no
-- signed-in user can call an internal helper directly.
revoke execute on all functions in schema private from public, anon, authenticated;

-- Re-grant EXECUTE to authenticated on exactly two sets:
--   (a) RLS-referenced helpers — policies evaluate these as the querying role;
--   (b) the loop entry points behind the public invoker wrappers.
grant execute on function
  private.is_workspace_member(uuid),
  private.is_workspace_owner(uuid),
  private.workspace_creator(uuid),
  private.workspace_has_member(uuid),
  private.is_wedding_staff(uuid),
  private.is_wedding_member(uuid),
  private.shares_wedding_loop(uuid),
  private.send_proposal(uuid),
  private.mark_proposal_seen(uuid),
  private.respond_to_proposal(uuid, text, text),
  private.withdraw_proposal(uuid),
  private.post_proposal_message(uuid, text),
  private.accept_wedding_invite(text)
  to authenticated;

-- Internal-only helpers (log_activity, seed_default_event, recompute_wedding_dates,
-- guard_last_event, guard_proposal_status, advance_wedding_phase, touch_updated_at,
-- handle_new_user) get NO authenticated grant — they run only via their owner/
-- definer/trigger paths.

-- Close it for the future too: every private function created hereafter is EXECUTE-
-- closed to PUBLIC by default, so a later migration can't silently re-open the hole.
alter default privileges in schema private revoke execute on functions from public;
