-- ═══ REF-2 — referral admin: redemption settlement + the admin name lookup ═════
-- Owner-gated DEFINERs in the established pattern (audit rows, no delete). Settling a bill
-- redemption pushes a Stripe customer-balance credit in the owner action FIRST, then records
-- the credit id here as the reference; cash settles like a payout (paid outside, referenced).

-- Recorded post-#56 advisor fix: gen_referral_code shipped without a pinned search_path; this
-- was applied live and is included here so the repo and the database agree.
alter function private.gen_referral_code() set search_path = public;

-- A settle timestamp, so the Reports referral block can scope "redemptions settled in period".
alter table public.referral_redemptions add column if not exists settled_at timestamptz;

-- Settle a requested redemption. Cash re-checks the >= $500 backstop against the balance AT
-- REQUEST TIME (the earned credits, excluding this redemption's own debit). Flips the request's
-- ledger debit row to settled; a non-'requested' redemption is refused (double-settle guard).
create or replace function private.admin_settle_redemption(p_id uuid, p_reference text) returns void
language plpgsql security definer set search_path = public as $$
declare v_red public.referral_redemptions; v_at_request bigint;
begin
  if not private.is_platform_owner() then raise exception 'not permitted' using errcode = 'FV230'; end if;
  select * into v_red from public.referral_redemptions where id = p_id for update;
  if v_red.id is null then raise exception 'no such redemption' using errcode = 'FV260'; end if;
  if v_red.status <> 'requested' then raise exception 'this redemption is not open' using errcode = 'FV261'; end if;
  if v_red.kind = 'cash' then
    select coalesce(sum(amount_cents), 0) into v_at_request
      from public.referral_credits where workspace_id = v_red.workspace_id and status <> 'void' and source_ref <> p_id::text;
    if v_at_request < 50000 then raise exception 'cash redemption requires a $500 balance' using errcode = 'FV262'; end if; -- = REFERRAL_CASH_THRESHOLD_CENTS (src/lib/referral.mjs)
  end if;
  update public.referral_redemptions set status = 'settled', reference = p_reference, settled_by = auth.uid(), settled_at = now() where id = p_id;
  update public.referral_credits set status = 'settled'
    where workspace_id = v_red.workspace_id and source_ref = p_id::text and kind in ('redeem_bill', 'redeem_cash');
  insert into public.admin_audit_log (actor_id, action, entity, entity_id, before, after)
    values (auth.uid(), 'redemption.settle', 'referral_redemptions', p_id::text, to_jsonb(v_red),
      jsonb_build_object('status', 'settled', 'reference', p_reference, 'kind', v_red.kind, 'amount_cents', v_red.amount_cents));
end $$;

-- Reject a requested redemption. Memo required. VOIDS the request's ledger debit, restoring the
-- balance — the debit-at-request design depends on this.
create or replace function private.admin_reject_redemption(p_id uuid, p_memo text) returns void
language plpgsql security definer set search_path = public as $$
declare v_red public.referral_redemptions;
begin
  if not private.is_platform_owner() then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if coalesce(btrim(p_memo), '') = '' then raise exception 'a memo is required to reject' using errcode = 'FV263'; end if;
  select * into v_red from public.referral_redemptions where id = p_id for update;
  if v_red.id is null then raise exception 'no such redemption' using errcode = 'FV260'; end if;
  if v_red.status <> 'requested' then raise exception 'this redemption is not open' using errcode = 'FV261'; end if;
  update public.referral_redemptions set status = 'rejected', reference = p_memo where id = p_id;
  update public.referral_credits set status = 'void', memo = p_memo
    where workspace_id = v_red.workspace_id and source_ref = p_id::text and kind in ('redeem_bill', 'redeem_cash');
  insert into public.admin_audit_log (actor_id, action, entity, entity_id, before, after)
    values (auth.uid(), 'redemption.reject', 'referral_redemptions', p_id::text, to_jsonb(v_red),
      jsonb_build_object('status', 'rejected', 'memo', p_memo));
end $$;

-- Admin name lookup — the referral Tracker needs referred/referrer studio names, and workspaces
-- is not admin-readable via RLS (the admin_accounts / admin_actor_emails DEFINER pattern).
create or replace function private.admin_workspace_names(p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not private.is_platform_admin() then raise exception 'not permitted' using errcode = 'FV230'; end if;
  return coalesce((select jsonb_object_agg(w.id::text, w.name) from public.workspaces w where w.id = any(p_ids)), '{}'::jsonb);
end $$;

-- Public (invoker) wrappers + grants. settle/reject are owner-gated inside; names is admin-gated.
create or replace function public.admin_settle_redemption(p_id uuid, p_reference text) returns void language sql security invoker set search_path = public as $$ select private.admin_settle_redemption(p_id, p_reference); $$;
create or replace function public.admin_reject_redemption(p_id uuid, p_memo text) returns void language sql security invoker set search_path = public as $$ select private.admin_reject_redemption(p_id, p_memo); $$;
create or replace function public.admin_workspace_names(p_ids uuid[]) returns jsonb language sql security invoker set search_path = public as $$ select private.admin_workspace_names(p_ids); $$;

revoke execute on function
  private.admin_settle_redemption(uuid, text), private.admin_reject_redemption(uuid, text), private.admin_workspace_names(uuid[]),
  public.admin_settle_redemption(uuid, text), public.admin_reject_redemption(uuid, text), public.admin_workspace_names(uuid[])
  from public, anon;
grant execute on function
  private.admin_settle_redemption(uuid, text), private.admin_reject_redemption(uuid, text), private.admin_workspace_names(uuid[]),
  public.admin_settle_redemption(uuid, text), public.admin_reject_redemption(uuid, text), public.admin_workspace_names(uuid[])
  to authenticated;
