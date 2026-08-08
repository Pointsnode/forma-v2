-- ═══ REF-1 — the planner referral program (shared store) ═════════════════════
-- A planner refers a studio; the referred studio gets its first paid month free; when it
-- completes its third PAID (non-fully-refunded) invoice the referrer earns $100 in credits,
-- redeemable to their bill any time or as cash at a $500 balance. One credit per account
-- across all programs (referral XOR partner attribution). Self-referral is impossible.
-- Money in cents. The $100 / 3 / $500 / 30-day numbers live in src/lib/referral.ts (§4); the
-- credit insert + maturity run in the TS engine, so the SQL never hardcodes them.

-- ── referral_codes — one per workspace, tenant-facing (members read their own).
create table if not exists public.referral_codes (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);
alter table public.referral_codes enable row level security;
drop policy if exists referral_codes_select on public.referral_codes;
create policy referral_codes_select on public.referral_codes for select to authenticated
  using (private.is_workspace_member(workspace_id));
-- No client write policy — codes are minted by the ensure_referral_code DEFINER.

-- ── referrals — ONE per referred account, ever (referred_workspace_id is the PK).
create table if not exists public.referrals (
  referred_workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  referrer_workspace_id uuid not null references public.workspaces (id) on delete restrict,
  code text not null,
  status text not null default 'pending' check (status in ('pending', 'matured', 'void')),
  paid_invoice_count int not null default 0,
  matured_at timestamptz,
  created_at timestamptz not null default now(),
  constraint referral_not_self check (referred_workspace_id <> referrer_workspace_id)
);
alter table public.referrals enable row level security;
drop policy if exists referrals_select on public.referrals;
-- Platform admins see all; a workspace sees referrals where IT is the referrer (its funnel).
create policy referrals_select on public.referrals for select to authenticated
  using (private.is_platform_admin() or private.is_workspace_member(referrer_workspace_id));

-- ── referral_credits — the append-only credits ledger (commission_entries discipline).
create table if not exists public.referral_credits (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind text not null check (kind in ('credit', 'redeem_bill', 'redeem_cash', 'adjustment')),
  source_ref text not null,
  amount_cents bigint not null,
  status text not null default 'accrued' check (status in ('accrued', 'settled', 'void')),
  memo text,
  created_at timestamptz not null default now(),
  unique (workspace_id, kind, source_ref)
);
alter table public.referral_credits enable row level security;
drop policy if exists referral_credits_select on public.referral_credits;
create policy referral_credits_select on public.referral_credits for select to authenticated
  using (private.is_platform_admin() or private.is_workspace_member(workspace_id));

-- ── referral_redemptions — a member's request; owner settles/rejects in REF-2.
create table if not exists public.referral_redemptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind text not null check (kind in ('bill', 'cash')),
  amount_cents bigint not null check (amount_cents > 0),
  status text not null default 'requested' check (status in ('requested', 'settled', 'rejected')),
  requested_by uuid references auth.users (id) on delete set null,
  settled_by uuid references auth.users (id) on delete set null,
  reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.referral_redemptions enable row level security;
drop policy if exists referral_redemptions_select on public.referral_redemptions;
create policy referral_redemptions_select on public.referral_redemptions for select to authenticated
  using (private.is_platform_admin() or private.is_workspace_member(workspace_id));

-- FK / scan indexes (advisors).
create index if not exists referrals_referrer_idx on public.referrals (referrer_workspace_id);
create index if not exists referral_credits_workspace_idx on public.referral_credits (workspace_id);
create index if not exists referral_redemptions_workspace_idx on public.referral_redemptions (workspace_id);
create index if not exists referral_redemptions_requested_by_idx on public.referral_redemptions (requested_by);
create index if not exists referral_redemptions_settled_by_idx on public.referral_redemptions (settled_by);

drop trigger if exists touch_referral_redemptions on public.referral_redemptions;
create trigger touch_referral_redemptions before update on public.referral_redemptions for each row execute function private.touch_updated_at();

-- ══ Member/owner DEFINERs (RLS-bound app can't write these tables directly). ════
-- Short, url-safe, vowel-free code (no accidental words).
create or replace function private.gen_referral_code() returns text language plpgsql as $$
declare v_alpha text := 'BCDFGHJKLMNPQRSTVWXYZ23456789'; v_code text; i int;
begin
  loop
    v_code := '';
    for i in 1..7 loop v_code := v_code || substr(v_alpha, 1 + floor(random() * length(v_alpha))::int, 1); end loop;
    exit when not exists (select 1 from public.referral_codes where code = v_code);
  end loop;
  return v_code;
end $$;
revoke execute on function private.gen_referral_code() from public, anon;  -- internal only (matrix stays 12)

-- Mint (or return) the caller's workspace referral code — first settings-page visit.
create or replace function private.ensure_referral_code(p_workspace uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_code text;
begin
  if not private.is_workspace_member(p_workspace) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  select code into v_code from public.referral_codes where workspace_id = p_workspace;
  if v_code is not null then return v_code; end if;
  v_code := private.gen_referral_code();
  insert into public.referral_codes (workspace_id, code) values (p_workspace, v_code)
    on conflict (workspace_id) do update set code = public.referral_codes.code returning code into v_code;
  return v_code;
end $$;

-- Record a referral at workspace creation. Validates the code, self-referral, and BOTH
-- interlocks; any failure is a silent no-op (no cookie / bad code → no row → nothing changes).
create or replace function private.record_referral(p_referred uuid, p_code text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_referrer uuid;
begin
  if not private.is_workspace_member(p_referred) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if coalesce(btrim(p_code), '') = '' then return null; end if;
  select workspace_id into v_referrer from public.referral_codes where code = upper(btrim(p_code));
  if v_referrer is null or v_referrer = p_referred then return null; end if;                               -- invalid or self
  if exists (select 1 from public.partner_attributions where workspace_id = p_referred) then return null; end if; -- interlock: already partner-attributed
  if exists (select 1 from public.referrals where referred_workspace_id = p_referred) then return null; end if;   -- already referred
  insert into public.referrals (referred_workspace_id, referrer_workspace_id, code)
    values (p_referred, v_referrer, upper(btrim(p_code))) on conflict (referred_workspace_id) do nothing;
  return p_referred;
end $$;

-- The referrer's funnel: the referred studio's NAME + status + progress, nothing else.
create or replace function private.referral_funnel(p_workspace uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not private.is_workspace_member(p_workspace) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'referred_name', w.name, 'status', r.status, 'paid_invoice_count', r.paid_invoice_count, 'matured_at', r.matured_at
    ) order by r.created_at desc)
    from public.referrals r join public.workspaces w on w.id = r.referred_workspace_id
    where r.referrer_workspace_id = p_workspace
  ), '[]'::jsonb);
end $$;

create or replace function private.referral_balance(p_workspace uuid) returns bigint
language plpgsql security definer set search_path = public as $$
begin
  if not private.is_workspace_member(p_workspace) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  return coalesce((select sum(amount_cents) from public.referral_credits where workspace_id = p_workspace and status <> 'void'), 0);
end $$;

-- A member requests a redemption. Enforces amount <= balance (the security invariant) and
-- debits the ledger immediately (a redeem_* row) so it can't be double-spent; the owner
-- settles or rejects in REF-2 (reject voids the debit, restoring the balance). The cash >= $500
-- policy is enforced at the server action; the owner settlement is the backstop.
create or replace function private.request_redemption(p_workspace uuid, p_kind text, p_amount_cents bigint) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_balance bigint; v_id uuid;
begin
  if not private.is_workspace_member(p_workspace) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if p_kind not in ('bill', 'cash') then raise exception 'invalid redemption kind' using errcode = 'FV251'; end if;
  if coalesce(p_amount_cents, 0) <= 0 then raise exception 'the amount must be positive' using errcode = 'FV252'; end if;
  select coalesce(sum(amount_cents), 0) into v_balance from public.referral_credits where workspace_id = p_workspace and status <> 'void';
  if p_amount_cents > v_balance then raise exception 'that is more than your balance' using errcode = 'FV253'; end if;
  insert into public.referral_redemptions (workspace_id, kind, amount_cents, requested_by)
    values (p_workspace, p_kind, p_amount_cents, auth.uid()) returning id into v_id;
  insert into public.referral_credits (workspace_id, kind, source_ref, amount_cents, status, memo)
    values (p_workspace, case when p_kind = 'bill' then 'redeem_bill' else 'redeem_cash' end, v_id::text, -p_amount_cents, 'accrued', 'redemption requested');
  return v_id;
end $$;

-- ── Interlock, the other direction: partner attribution refuses a referred workspace. This is
-- the 0031 DEFINER re-created with one added guard (first credit wins, both directions).
create or replace function private.admin_set_attribution(p_workspace uuid, p_partner uuid, p_source text, p_first_contact timestamptz, p_notes text)
returns void language plpgsql security definer set search_path = public as $$
declare v_before jsonb;
begin
  if not private.is_platform_owner() then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if exists (select 1 from public.referrals where referred_workspace_id = p_workspace) then
    raise exception 'that account arrived through a referral and cannot also be partner-attributed' using errcode = 'FV250'; end if;
  select to_jsonb(a) into v_before from public.partner_attributions a where a.workspace_id = p_workspace;
  insert into public.partner_attributions (workspace_id, partner_id, source, first_contact_at, notes, created_by)
    values (p_workspace, p_partner, p_source, p_first_contact, p_notes, auth.uid())
  on conflict (workspace_id) do update set partner_id = excluded.partner_id, source = excluded.source,
    first_contact_at = excluded.first_contact_at, notes = excluded.notes, attributed_at = now();
  insert into public.admin_audit_log (actor_id, action, entity, entity_id, before, after)
    values (auth.uid(), 'attribution.set', 'partner_attributions', p_workspace::text, v_before, to_jsonb((select a from public.partner_attributions a where a.workspace_id = p_workspace)));
end $$;

-- ── Public (invoker) wrappers + grants. All authenticated-only (no anon → matrix stays 12).
create or replace function public.ensure_referral_code(p_workspace uuid) returns text language sql security invoker set search_path = public as $$ select private.ensure_referral_code(p_workspace); $$;
create or replace function public.record_referral(p_referred uuid, p_code text) returns uuid language sql security invoker set search_path = public as $$ select private.record_referral(p_referred, p_code); $$;
create or replace function public.referral_funnel(p_workspace uuid) returns jsonb language sql security invoker set search_path = public as $$ select private.referral_funnel(p_workspace); $$;
create or replace function public.referral_balance(p_workspace uuid) returns bigint language sql security invoker set search_path = public as $$ select private.referral_balance(p_workspace); $$;
create or replace function public.request_redemption(p_workspace uuid, p_kind text, p_amount_cents bigint) returns uuid language sql security invoker set search_path = public as $$ select private.request_redemption(p_workspace, p_kind, p_amount_cents); $$;

revoke execute on function
  private.ensure_referral_code(uuid), private.record_referral(uuid, text), private.referral_funnel(uuid), private.referral_balance(uuid), private.request_redemption(uuid, text, bigint),
  public.ensure_referral_code(uuid), public.record_referral(uuid, text), public.referral_funnel(uuid), public.referral_balance(uuid), public.request_redemption(uuid, text, bigint)
  from public, anon;
grant execute on function
  private.ensure_referral_code(uuid), private.record_referral(uuid, text), private.referral_funnel(uuid), private.referral_balance(uuid), private.request_redemption(uuid, text, bigint),
  public.ensure_referral_code(uuid), public.record_referral(uuid, text), public.referral_funnel(uuid), public.referral_balance(uuid), public.request_redemption(uuid, text, bigint)
  to authenticated;
