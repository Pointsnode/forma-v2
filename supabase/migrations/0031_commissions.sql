-- ═══ ADM-2 — partners, attribution, the commission ledger ════════════════════
-- Admin-owned tables: default-deny RLS, one is_platform_admin() SELECT each (owner AND
-- partner read), ZERO client write policies. Reads are RLS; every MUTATION goes through an
-- OWNER-gated DEFINER that also writes admin_audit_log (partners are read-only). Money in
-- cents; commission_entries is append-only (only status transitions; corrections are new
-- adjustment rows). The engine is deterministic (see commission.mjs + commission-rebuild).

-- Owner-only predicate (mirrors is_platform_admin; used inside the mutation DEFINERs only).
create or replace function private.is_platform_owner(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = p_user and role = 'owner');
$$;
revoke execute on function private.is_platform_owner(uuid) from public, anon;

-- ── Partners. rate_bps + activation_fee_cents are stored per partner (the engine reads them);
-- user_id links a partner to their sign-in (nullable until their account exists).
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  type text not null check (type in ('founding', 'referral', 'reseller')),
  commission_rate_bps int not null,
  activation_fee_cents int not null default 0,
  user_id uuid references auth.users (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Attribution. ONE partner per account (workspace_id is the PRIMARY KEY). House accounts
-- (site/SEO/inbound) get source='house' with a null partner_id; the check keeps the two in
-- lockstep so "unattributed" and "house, deliberately 0%" are distinguishable.
create table if not exists public.partner_attributions (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  partner_id uuid references public.partners (id) on delete set null,
  source text not null check (source in ('manual', 'link', 'house')),
  attributed_at timestamptz not null default now(),
  first_contact_at timestamptz,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  constraint attribution_house_null check ((source = 'house') = (partner_id is null))
);

-- ── The ledger. Append-only. Idempotency key: (partner_id, kind, source_ref) — source_ref is
-- the payment id (commission), the workspace id (activation, once), the refund id (clawback),
-- or a fresh uuid (adjustment). amount_cents is SIGNED (clawbacks negative). rate_bps is stored
-- so a clawback uses the ORIGINAL rate even if the partner's rate later changes.
create table if not exists public.commission_entries (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete set null,
  kind text not null check (kind in ('commission', 'activation_fee', 'clawback', 'adjustment')),
  source_ref text not null,
  base_amount_cents bigint,
  rate_bps int,
  amount_cents bigint not null,
  status text not null default 'accrued' check (status in ('accrued', 'paid', 'void')),
  memo text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (partner_id, kind, source_ref)
);

-- ── RLS: default-deny; one platform-admin SELECT each; NO client write policies.
alter table public.partners enable row level security;
drop policy if exists partners_select on public.partners;
create policy partners_select on public.partners for select to authenticated using (private.is_platform_admin());

alter table public.partner_attributions enable row level security;
drop policy if exists partner_attributions_select on public.partner_attributions;
create policy partner_attributions_select on public.partner_attributions for select to authenticated using (private.is_platform_admin());

alter table public.commission_entries enable row level security;
drop policy if exists commission_entries_select on public.commission_entries;
create policy commission_entries_select on public.commission_entries for select to authenticated using (private.is_platform_admin());

-- ── Every FK indexed (advisors) + ledger scan indexes.
create index if not exists partners_user_idx on public.partners (user_id);
create index if not exists partner_attributions_partner_idx on public.partner_attributions (partner_id);
create index if not exists partner_attributions_created_by_idx on public.partner_attributions (created_by);
create index if not exists commission_entries_partner_idx on public.commission_entries (partner_id);
create index if not exists commission_entries_workspace_idx on public.commission_entries (workspace_id);
create index if not exists commission_entries_created_by_idx on public.commission_entries (created_by);
create index if not exists commission_entries_created_idx on public.commission_entries (created_at desc);

drop trigger if exists touch_partners on public.partners;
create trigger touch_partners before update on public.partners for each row execute function private.touch_updated_at();

-- ══ Owner-gated mutations (DEFINER + audit). Partners get 'not permitted'. ══════
create or replace function private.admin_upsert_partner(p_id uuid, p_display_name text, p_type text, p_rate_bps int, p_activation_fee_cents int, p_active boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_before jsonb;
begin
  if not private.is_platform_owner() then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if p_id is null then
    insert into public.partners (display_name, type, commission_rate_bps, activation_fee_cents, active)
      values (p_display_name, p_type, p_rate_bps, coalesce(p_activation_fee_cents, 0), coalesce(p_active, true)) returning id into v_id;
    insert into public.admin_audit_log (actor_id, action, entity, entity_id, after)
      values (auth.uid(), 'partner.create', 'partners', v_id::text, to_jsonb((select p from public.partners p where p.id = v_id)));
  else
    select to_jsonb(p) into v_before from public.partners p where p.id = p_id;
    update public.partners set display_name = p_display_name, type = p_type, commission_rate_bps = p_rate_bps,
      activation_fee_cents = coalesce(p_activation_fee_cents, 0), active = coalesce(p_active, active) where id = p_id;
    v_id := p_id;
    insert into public.admin_audit_log (actor_id, action, entity, entity_id, before, after)
      values (auth.uid(), 'partner.update', 'partners', p_id::text, v_before, to_jsonb((select p from public.partners p where p.id = p_id)));
  end if;
  return v_id;
end $$;

create or replace function private.admin_set_attribution(p_workspace uuid, p_partner uuid, p_source text, p_first_contact timestamptz, p_notes text)
returns void language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if not private.is_platform_owner() then raise exception 'not permitted' using errcode = 'FV230'; end if;
  select to_jsonb(a) into v_before from public.partner_attributions a where a.workspace_id = p_workspace;
  insert into public.partner_attributions (workspace_id, partner_id, source, first_contact_at, notes, created_by)
    values (p_workspace, p_partner, p_source, p_first_contact, p_notes, auth.uid())
  on conflict (workspace_id) do update set partner_id = excluded.partner_id, source = excluded.source,
    first_contact_at = excluded.first_contact_at, notes = excluded.notes, attributed_at = now();
  insert into public.admin_audit_log (actor_id, action, entity, entity_id, before, after)
    values (auth.uid(), 'attribution.set', 'partner_attributions', p_workspace::text, v_before, to_jsonb((select a from public.partner_attributions a where a.workspace_id = p_workspace)));
end $$;

create or replace function private.admin_void_commission(p_entry uuid, p_memo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if not private.is_platform_owner() then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if coalesce(btrim(p_memo), '') = '' then raise exception 'a memo is required to void' using errcode = 'FV231'; end if;
  select to_jsonb(c) into v_before from public.commission_entries c where c.id = p_entry;
  if v_before is null then raise exception 'no such entry' using errcode = 'FV233'; end if;
  if v_before->>'status' = 'paid' then raise exception 'a paid entry cannot be voided' using errcode = 'FV232'; end if;
  update public.commission_entries set status = 'void', memo = p_memo where id = p_entry;
  insert into public.admin_audit_log (actor_id, action, entity, entity_id, before, after)
    values (auth.uid(), 'commission.void', 'commission_entries', p_entry::text, v_before, to_jsonb((select c from public.commission_entries c where c.id = p_entry)));
end $$;

create or replace function private.admin_add_adjustment(p_partner uuid, p_workspace uuid, p_amount_cents bigint, p_memo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not private.is_platform_owner() then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if coalesce(btrim(p_memo), '') = '' then raise exception 'a memo is required for an adjustment' using errcode = 'FV231'; end if;
  insert into public.commission_entries (partner_id, workspace_id, kind, source_ref, amount_cents, status, memo, created_by)
    values (p_partner, p_workspace, 'adjustment', gen_random_uuid()::text, p_amount_cents, 'accrued', p_memo, auth.uid()) returning id into v_id;
  insert into public.admin_audit_log (actor_id, action, entity, entity_id, after)
    values (auth.uid(), 'commission.adjustment', 'commission_entries', v_id::text, to_jsonb((select c from public.commission_entries c where c.id = v_id)));
  return v_id;
end $$;

-- Public (invoker) wrappers → run the DEFINER; granted to authenticated (the DEFINER gates owner).
create or replace function public.admin_upsert_partner(p_id uuid, p_display_name text, p_type text, p_rate_bps int, p_activation_fee_cents int, p_active boolean)
  returns uuid language sql security invoker set search_path = public as $$ select private.admin_upsert_partner(p_id, p_display_name, p_type, p_rate_bps, p_activation_fee_cents, p_active); $$;
create or replace function public.admin_set_attribution(p_workspace uuid, p_partner uuid, p_source text, p_first_contact timestamptz, p_notes text)
  returns void language sql security invoker set search_path = public as $$ select private.admin_set_attribution(p_workspace, p_partner, p_source, p_first_contact, p_notes); $$;
create or replace function public.admin_void_commission(p_entry uuid, p_memo text)
  returns void language sql security invoker set search_path = public as $$ select private.admin_void_commission(p_entry, p_memo); $$;
create or replace function public.admin_add_adjustment(p_partner uuid, p_workspace uuid, p_amount_cents bigint, p_memo text)
  returns uuid language sql security invoker set search_path = public as $$ select private.admin_add_adjustment(p_partner, p_workspace, p_amount_cents, p_memo); $$;

revoke execute on function
  private.admin_upsert_partner(uuid, text, text, int, int, boolean), private.admin_set_attribution(uuid, uuid, text, timestamptz, text),
  private.admin_void_commission(uuid, text), private.admin_add_adjustment(uuid, uuid, bigint, text),
  public.admin_upsert_partner(uuid, text, text, int, int, boolean), public.admin_set_attribution(uuid, uuid, text, timestamptz, text),
  public.admin_void_commission(uuid, text), public.admin_add_adjustment(uuid, uuid, bigint, text)
  from public, anon;
grant execute on function
  private.admin_upsert_partner(uuid, text, text, int, int, boolean), private.admin_set_attribution(uuid, uuid, text, timestamptz, text),
  private.admin_void_commission(uuid, text), private.admin_add_adjustment(uuid, uuid, bigint, text),
  public.admin_upsert_partner(uuid, text, text, int, int, boolean), public.admin_set_attribution(uuid, uuid, text, timestamptz, text),
  public.admin_void_commission(uuid, text), public.admin_add_adjustment(uuid, uuid, bigint, text)
  to authenticated;

-- ── Seeds. Founding partners, re-run-safe (guarded by display_name). Darya + Nikki emails are
-- not in the spec, so both seed with a null user_id; link each once Jorge provides the email:
--   update public.partners set user_id = (select id from auth.users where email = '<email>') where display_name = 'Darya';
insert into public.partners (display_name, type, commission_rate_bps, activation_fee_cents)
  select 'Darya', 'founding', 3000, 7500 where not exists (select 1 from public.partners where display_name = 'Darya');
insert into public.partners (display_name, type, commission_rate_bps, activation_fee_cents)
  select 'Nikki', 'founding', 3000, 0 where not exists (select 1 from public.partners where display_name = 'Nikki');
