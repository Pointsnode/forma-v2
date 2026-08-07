-- ═══ ADM-3 — payouts (ledger + manual payment record) ════════════════════════
-- Jorge pays by bank transfer OUTSIDE the system, then records the payout INSIDE it.
-- No Stripe Connect. Admin-owned: default-deny RLS, one is_platform_admin() SELECT each,
-- ZERO client write policies. The single mutation is the ADM-2 owner-gated DEFINER pattern.
-- payout_items keys each ledger entry to exactly one payout (unique commission_entry_id).

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete restrict,
  period_label text,
  total_cents bigint not null check (total_cents > 0),
  method text,
  reference text,
  paid_on date,
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.payout_items (
  payout_id uuid not null references public.payouts (id) on delete cascade,
  commission_entry_id uuid not null references public.commission_entries (id) on delete restrict,
  primary key (payout_id, commission_entry_id),
  unique (commission_entry_id)
);

alter table public.payouts enable row level security;
drop policy if exists payouts_select on public.payouts;
create policy payouts_select on public.payouts for select to authenticated using (private.is_platform_admin());

alter table public.payout_items enable row level security;
drop policy if exists payout_items_select on public.payout_items;
create policy payout_items_select on public.payout_items for select to authenticated using (private.is_platform_admin());

-- FK indexes (advisors). The PK covers payout_id; unique(commission_entry_id) covers that FK.
create index if not exists payouts_partner_idx on public.payouts (partner_id);
create index if not exists payouts_recorded_by_idx on public.payouts (recorded_by);
create index if not exists payouts_paid_on_idx on public.payouts (paid_on desc);

-- ══ The one mutation — owner-gated, ATOMIC (plpgsql function = one transaction). ══
-- Lock the candidate entries, validate EVERY requested id is accrued AND this partner's
-- (abort the whole call otherwise — nothing flips), require a positive sum, then insert the
-- payout + items and flip the entries to 'paid', with one audit row. No unrecord function.
create or replace function private.admin_record_payout(p_partner uuid, p_entry_ids uuid[], p_method text, p_reference text, p_paid_on date, p_period_label text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_payout uuid; v_total bigint; v_valid int; v_requested int;
begin
  if not private.is_platform_owner() then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if p_entry_ids is null or array_length(p_entry_ids, 1) is null then raise exception 'no entries selected' using errcode = 'FV240'; end if;
  -- Lock the valid candidate rows (FOR UPDATE cannot be combined with aggregates, so lock first).
  perform 1 from public.commission_entries
    where id = any(p_entry_ids) and partner_id = p_partner and status = 'accrued' for update;
  select count(*), coalesce(sum(amount_cents), 0) into v_valid, v_total from public.commission_entries
    where id = any(p_entry_ids) and partner_id = p_partner and status = 'accrued';
  select count(distinct x) into v_requested from unnest(p_entry_ids) x;
  -- Any requested entry that is paid, void, foreign, or missing → the whole call aborts here,
  -- BEFORE any write, so the still-accrued entries are untouched.
  if v_valid <> v_requested then raise exception 'some entries are not accrued or not this partner''s' using errcode = 'FV241'; end if;
  if v_total <= 0 then raise exception 'the payout total must be positive' using errcode = 'FV242'; end if;

  insert into public.payouts (partner_id, period_label, total_cents, method, reference, paid_on, recorded_by)
    values (p_partner, p_period_label, v_total, p_method, p_reference, p_paid_on, auth.uid()) returning id into v_payout;
  insert into public.payout_items (payout_id, commission_entry_id)
    select v_payout, e.id from public.commission_entries e where e.id = any(p_entry_ids);
  update public.commission_entries set status = 'paid' where id = any(p_entry_ids);
  insert into public.admin_audit_log (actor_id, action, entity, entity_id, after)
    values (auth.uid(), 'payout.record', 'payouts', v_payout::text,
      jsonb_build_object('partner_id', p_partner, 'total_cents', v_total, 'entry_count', v_valid, 'entries', to_jsonb(p_entry_ids)));
  return v_payout;
end $$;

create or replace function public.admin_record_payout(p_partner uuid, p_entry_ids uuid[], p_method text, p_reference text, p_paid_on date, p_period_label text)
  returns uuid language sql security invoker set search_path = public as $$ select private.admin_record_payout(p_partner, p_entry_ids, p_method, p_reference, p_paid_on, p_period_label); $$;

revoke execute on function
  private.admin_record_payout(uuid, uuid[], text, text, date, text), public.admin_record_payout(uuid, uuid[], text, text, date, text)
  from public, anon;
grant execute on function
  private.admin_record_payout(uuid, uuid[], text, text, date, text), public.admin_record_payout(uuid, uuid[], text, text, date, text)
  to authenticated;
