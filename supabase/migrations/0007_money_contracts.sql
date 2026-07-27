-- 0007_money_contracts — M5. Money becomes one traceable ledger; contracts become
-- the D3 room; together they close the founding loop: a signed planner agreement
-- + a paid deposit opens the couple's portal. SCHEMA §6 + §7 normative.
-- Grant law (§11): every new private helper is revoked from public/anon/authenticated
-- and re-granted only where intended; the signer surface grows the anon allowlist
-- deliberately (its sweep in people.sql updates in this same change).

-- ── enums ────────────────────────────────────────────────────────────────────
do $$ begin create type public.ledger_status as enum ('expected','scheduled','due','paid','settled','void'); exception when duplicate_object then null; end $$;
do $$ begin create type public.ledger_kind as enum ('deposit','balance','progress','planner_fee','day_of_extra','manual'); exception when duplicate_object then null; end $$;
do $$ begin create type public.fee_status as enum ('pending','processing','succeeded','failed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.contract_template_kind as enum ('full','partial','day_of','rider'); exception when duplicate_object then null; end $$;
do $$ begin create type public.contract_kind as enum ('planner_agreement','vendor','venue'); exception when duplicate_object then null; end $$;
do $$ begin create type public.contract_status as enum ('draft','sent','partially_signed','completed','declined','voided'); exception when duplicate_object then null; end $$;
do $$ begin create type public.signer_role as enum ('couple','planner','vendor'); exception when duplicate_object then null; end $$;
do $$ begin create type public.merge_source as enum ('couple_names','event_ref','venue_restrictions','quote_amount','ledger_schedule','workspace_profile','vendor_contact','manual'); exception when duplicate_object then null; end $$;

-- ── composite-FK parents that M5 references need unique(id, wedding_id) ────────
do $$ begin
  alter table public.quotes add constraint quotes_id_wedding_key unique (id, wedding_id);
exception when duplicate_table then null; when duplicate_object then null; end $$;

-- Phase-1 invite: the gate records who to invite (email) + dedup (emailed_at);
-- the app sends the join link via the M3 rails.
alter table public.wedding_invites add column if not exists email text;
alter table public.wedding_invites add column if not exists emailed_at timestamptz;

-- ── contract_templates (workspace-scoped) ────────────────────────────────────
create table if not exists public.contract_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  kind public.contract_template_kind not null,
  name text not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contract_templates_ws_idx on public.contract_templates (workspace_id);

-- ── contracts (mesh-fed; lifecycle function-only) ────────────────────────────
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  template_id uuid references public.contract_templates (id) on delete set null,
  engagement_id uuid,
  kind public.contract_kind not null,
  status public.contract_status not null default 'draft',
  title text not null,
  blocking_proposal_id uuid,        -- draft-hold: cannot send while its proposal is unapproved
  artifact_path text,               -- stamped PDF in the contract-artifacts bucket (M6 → documents)
  created_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, wedding_id),
  constraint contracts_engagement_fk foreign key (engagement_id, wedding_id)
    references public.wedding_vendors (id, wedding_id) on delete set null (engagement_id),
  constraint contracts_blocking_fk foreign key (blocking_proposal_id, wedding_id)
    references public.proposals (id, wedding_id) on delete set null (blocking_proposal_id)
);
create index if not exists contracts_wedding_idx on public.contracts (wedding_id);
create index if not exists contracts_engagement_idx on public.contracts (engagement_id);
create index if not exists contracts_blocking_idx on public.contracts (blocking_proposal_id);
create index if not exists contracts_template_idx on public.contracts (template_id);

create table if not exists public.contract_draft_content (
  contract_id uuid primary key references public.contracts (id) on delete cascade,
  body text not null default '',
  updated_at timestamptz not null default now()
);

-- Merge fields resolve from the mesh at draft render; resolved_value is the FROZEN
-- snapshot written at send (immutability trigger below). Manual fields are filled
-- by their signer during the ceremony; page-fraction coords for PDF placement.
create table if not exists public.contract_fields (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  merge_source public.merge_source not null default 'manual',
  field_key text not null,
  label text not null,
  signer_order int,                 -- which signer fills a manual field (null = auto/merge)
  page int not null default 0,
  x numeric(5,4) not null default 0 check (x >= 0 and x <= 1),
  y numeric(5,4) not null default 0 check (y >= 0 and y <= 1),
  w numeric(5,4) not null default 0 check (w >= 0 and w <= 1),
  h numeric(5,4) not null default 0 check (h >= 0 and h <= 1),
  required boolean not null default false,
  resolved_value text,              -- merge snapshot (frozen at send)
  manual_value text,                -- filled by a signer
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists contract_fields_contract_idx on public.contract_fields (contract_id);

create table if not exists public.contract_signers (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts (id) on delete cascade,
  sign_order int not null,
  role public.signer_role not null,
  name text not null,
  email text,
  token char(24) not null unique
    default substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 24)
    check (token ~ '^[A-Za-z0-9_-]{24}$'),
  typed_name text,
  signed_at timestamptz,
  declined_at timestamptz,
  decline_reason text,
  created_at timestamptz not null default now(),
  unique (contract_id, sign_order)
);
create index if not exists contract_signers_contract_idx on public.contract_signers (contract_id);

-- ── ledger_lines (the one ledger; every number is a query over this) ─────────
create table if not exists public.ledger_lines (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  title text not null,
  amount numeric(12,2) not null check (amount <> 0),
  currency char(3) not null default 'USD',
  status public.ledger_status not null default 'expected',
  kind public.ledger_kind not null default 'manual',
  category text,
  due_date date,
  paid_at timestamptz,
  engagement_id uuid,
  quote_id uuid,
  contract_id uuid,
  event_id uuid,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, wedding_id),
  constraint ledger_engagement_fk foreign key (engagement_id, wedding_id)
    references public.wedding_vendors (id, wedding_id) on delete set null (engagement_id),
  constraint ledger_quote_fk foreign key (quote_id, wedding_id)
    references public.quotes (id, wedding_id) on delete set null (quote_id),
  constraint ledger_contract_fk foreign key (contract_id, wedding_id)
    references public.contracts (id, wedding_id) on delete set null (contract_id),
  constraint ledger_event_fk foreign key (event_id, wedding_id)
    references public.wedding_events (id, wedding_id) on delete set null (event_id)
);
create index if not exists ledger_wedding_idx on public.ledger_lines (wedding_id);
create index if not exists ledger_engagement_idx on public.ledger_lines (engagement_id);
create index if not exists ledger_quote_idx on public.ledger_lines (quote_id);
create index if not exists ledger_contract_idx on public.ledger_lines (contract_id);
create index if not exists ledger_event_idx on public.ledger_lines (event_id);
create index if not exists ledger_due_idx on public.ledger_lines (due_date);

-- Only planner_fee lines ever touch Stripe (Decision 3).
create table if not exists public.fee_payments (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  ledger_line_id uuid not null,
  stripe_payment_intent text unique,
  status public.fee_status not null default 'pending',
  amount numeric(12,2),
  created_at timestamptz not null default now(),
  constraint fee_line_fk foreign key (ledger_line_id, wedding_id)
    references public.ledger_lines (id, wedding_id) on delete cascade
);
create index if not exists fee_payments_line_idx on public.fee_payments (ledger_line_id);

-- Webhook idempotency: an event is processed once.
create table if not exists public.stripe_events (
  id text primary key,
  type text,
  received_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;
-- service_role (the webhook) bypasses RLS; everyone else is denied explicitly so
-- the linter sees a policy (no anon/authenticated path exists either way).
drop policy if exists stripe_events_none on public.stripe_events;
create policy stripe_events_none on public.stripe_events for all to authenticated using (false) with check (false);

-- ── touch triggers ───────────────────────────────────────────────────────────
drop trigger if exists touch_contract_templates on public.contract_templates;
create trigger touch_contract_templates before update on public.contract_templates for each row execute function private.touch_updated_at();
drop trigger if exists touch_contracts on public.contracts;
create trigger touch_contracts before update on public.contracts for each row execute function private.touch_updated_at();
drop trigger if exists touch_ledger_lines on public.ledger_lines;
create trigger touch_ledger_lines before update on public.ledger_lines for each row execute function private.touch_updated_at();

-- ── fee_payments may only reference a planner_fee line ───────────────────────
create or replace function private.guard_fee_payment_line()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (select kind from public.ledger_lines where id = new.ledger_line_id) <> 'planner_fee' then
    raise exception 'fee_payments may only reference a planner_fee line' using errcode = 'FL011';
  end if;
  return new;
end $$;
drop trigger if exists guard_fee_payment_line on public.fee_payments;
create trigger guard_fee_payment_line before insert on public.fee_payments for each row execute function private.guard_fee_payment_line();

-- ── value-freeze: merge snapshots lock at send; everything locks at completion ─
create or replace function private.guard_contract_field_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
declare st public.contract_status;
begin
  select status into st from public.contracts where id = old.contract_id;
  if st = 'completed' then
    raise exception 'contract is completed — its values are frozen' using errcode = 'FM026';
  end if;
  -- merge (auto) values are snapshotted at send and never change afterward
  if old.merge_source <> 'manual' and st in ('sent','partially_signed')
     and new.resolved_value is distinct from old.resolved_value then
    raise exception 'merge value is frozen once the contract is sent' using errcode = 'FM026';
  end if;
  return new;
end $$;
drop trigger if exists guard_contract_field_immutable on public.contract_fields;
create trigger guard_contract_field_immutable before update on public.contract_fields for each row execute function private.guard_contract_field_immutable();

-- signer signature is immutable once set
create or replace function private.guard_signer_immutable()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.signed_at is not null and (new.signed_at is distinct from old.signed_at or new.typed_name is distinct from old.typed_name) then
    raise exception 'signature is immutable' using errcode = 'FM026';
  end if;
  return new;
end $$;
drop trigger if exists guard_signer_immutable on public.contract_signers;
create trigger guard_signer_immutable before update on public.contract_signers for each row execute function private.guard_signer_immutable();

-- ═══ Money functions ═════════════════════════════════════════════════════════

-- Accepting a quote (M4) now also lays down its expected ledger line, fully traced.
create or replace function private.accept_quote(p_quote uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid; eng uuid; amt numeric; nm text;
begin
  select q.wedding_id, q.engagement_id, q.amount into w, eng, amt from public.quotes q where q.id = p_quote;
  if w is null then raise exception 'no such quote' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(w) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  update public.quotes set status = 'accepted' where id = p_quote;
  select v.name into nm from public.wedding_vendors wv join public.vendors v on v.id = wv.vendor_id where wv.id = eng;
  if not exists (select 1 from public.ledger_lines where quote_id = p_quote) then
    insert into public.ledger_lines (wedding_id, title, amount, status, kind, category, engagement_id, quote_id)
      values (w, coalesce(nm, 'Vendor') || ' — balance', coalesce(amt, 0), 'expected', 'balance', 'vendor', eng, p_quote);
  end if;
end $$;

-- Wedding close is computable: phase wedding_days + all events past + no open line.
create or replace function private.close_wedding(w uuid)
returns void language plpgsql security definer set search_path = public as $$
declare wd public.weddings; open_lines int; future_events int;
begin
  select * into wd from public.weddings where id = w;
  if not found then raise exception 'wedding % not found', w using errcode = 'FV000'; end if;
  if (select auth.uid()) is not null and not private.is_wedding_staff(w) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if wd.phase <> 'wedding_days' then raise exception 'only a wedding in its days can close' using errcode = 'FV401'; end if;
  select count(*) into future_events from public.wedding_events where wedding_id = w and (event_date is null or event_date >= current_date);
  if future_events > 0 then raise exception 'every event must be past to close' using errcode = 'FV402'; end if;
  select count(*) into open_lines from public.ledger_lines where wedding_id = w and status in ('expected','scheduled','due');
  if open_lines > 0 then raise exception '% ledger line(s) still open', open_lines using errcode = 'FV403'; end if;
  update public.weddings set phase = 'closed' where id = w;
  perform private.log_activity(w, (select auth.uid()), 'wedding_closed', wd.couple_display, '{}'::jsonb);
end $$;

-- ═══ Phase-1 gate ════════════════════════════════════════════════════════════
-- Idempotent (guarded by phase='hiring'): a completed planner_agreement whose
-- deposit planner_fee line is paid → couple memberships (matched emails) or invites
-- (unmatched, emailed app-side) → advance 1→2 through the phase writer.
create or replace function private.run_phase1_gate(w uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.contracts; s public.contract_signers; uid uuid; paid boolean;
begin
  if (select phase from public.weddings where id = w) <> 'hiring' then return; end if;
  select * into c from public.contracts where wedding_id = w and kind = 'planner_agreement' and status = 'completed' order by completed_at nulls last limit 1;
  if not found then return; end if;
  select exists (
    select 1 from public.ledger_lines l
    where l.wedding_id = w and l.contract_id = c.id and l.kind = 'planner_fee' and l.status = 'paid'
  ) into paid;
  if not paid then return; end if;

  for s in select * from public.contract_signers where contract_id = c.id and role = 'couple' loop
    uid := null;
    if s.email is not null then select id into uid from auth.users where lower(email) = lower(s.email) limit 1; end if;
    if uid is not null then
      insert into public.wedding_members (wedding_id, user_id, role) values (w, uid, 'partner') on conflict do nothing;
    else
      insert into public.wedding_invites (wedding_id, role, email) values (w, 'partner', s.email);
    end if;
  end loop;

  perform private.advance_wedding_phase(w);  -- hiring → foundations, sole phase writer
end $$;

-- hiring→foundations becomes real (was FV101 stub); other branches unchanged (§9).
create or replace function private.advance_wedding_phase(w uuid)
returns public.wedding_phase language plpgsql security definer set search_path = public as $$
declare wd public.weddings; wk public.workspace_kind; undated int; unvenued int; ok boolean;
begin
  select * into wd from public.weddings where id = w;
  if not found then raise exception 'wedding % not found', w using errcode = 'FV000'; end if;
  if (select auth.uid()) is not null and not private.is_wedding_staff(w) then
    raise exception 'not permitted' using errcode = 'FV230';
  end if;
  select kind into wk from public.workspaces where id = wd.workspace_id;

  if wd.phase = 'hiring' then
    if wk = 'couple' then
      update public.weddings set phase = 'foundations' where id = w;
      return 'foundations';
    end if;
    select exists (
      select 1 from public.contracts c
      join public.ledger_lines l on l.contract_id = c.id and l.wedding_id = c.wedding_id
      where c.wedding_id = w and c.kind = 'planner_agreement' and c.status = 'completed'
        and l.kind = 'planner_fee' and l.status = 'paid'
    ) into ok;
    if not ok then
      raise exception 'planner agreement must complete and its deposit be paid' using errcode = 'FV101';
    end if;
    update public.weddings set phase = 'foundations' where id = w;
    perform private.log_activity(w, (select auth.uid()), 'phase_advanced', 'foundations', jsonb_build_object('phase', 'foundations'));
    return 'foundations';
  elsif wd.phase = 'foundations' then
    if coalesce(wd.budget_total, 0) <= 0 then raise exception 'budget must be set above zero' using errcode = 'FV201'; end if;
    if coalesce(wd.guest_target, 0) <= 0 then raise exception 'a guest target is required' using errcode = 'FV202'; end if;
    if wd.location_city is null or wd.location_country is null then raise exception 'the location must be set' using errcode = 'FV203'; end if;
    select count(*) into undated from public.wedding_events where wedding_id = w and event_date is null;
    if undated > 0 then raise exception '% event(s) still need a date', undated using errcode = 'FV204'; end if;
    select count(*) into unvenued from public.wedding_events e
      where e.wedding_id = w
        and not exists (select 1 from public.event_vendors ev where ev.event_id = e.id and ev.venue_booked);
    if unvenued > 0 then raise exception '% event(s) still need a booked venue', unvenued using errcode = 'FV205'; end if;
    update public.weddings set phase = 'details' where id = w;
    perform private.log_activity(w, (select auth.uid()), 'phase_advanced', 'details', jsonb_build_object('phase', 'details'));
    return 'details';
  elsif wd.phase = 'details' then
    raise exception 'phase 3 to 4 is date-driven, not advanced by this function' using errcode = 'FV301';
  elsif wd.phase = 'wedding_days' then
    raise exception 'closing runs through close_wedding, not advance' using errcode = 'FV401';
  else
    raise exception 'the wedding is already closed' using errcode = 'FV299';
  end if;
end $$;

-- gate fires on both orders: last signature completes, or the deposit gets paid
create or replace function private.on_contract_completed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    -- a venue contract completing books its engagement (respects FV240 via the
    -- one-venue partial unique index). Inlined with the function-only flag because
    -- the completing signer is anonymous — set_engagement_status' staff check would
    -- reject them; the index still guarantees one booked venue per event.
    if new.kind = 'venue' and new.engagement_id is not null then
      perform set_config('forma.eng_via_fn', 'on', true);
      update public.wedding_vendors set status = 'booked'
        where id = new.engagement_id and status in ('quoted','shortlisted','presented','quote_requested');
      perform set_config('forma.eng_via_fn', 'off', true);
      perform private.log_activity(new.wedding_id, null, 'engagement_booked',
        (select v.name from public.wedding_vendors wv join public.vendors v on v.id = wv.vendor_id where wv.id = new.engagement_id),
        jsonb_build_object('engagement_id', new.engagement_id));
    end if;
    perform private.run_phase1_gate(new.wedding_id);
  end if;
  return new;
end $$;
drop trigger if exists on_contract_completed on public.contracts;
create trigger on_contract_completed after update of status on public.contracts for each row execute function private.on_contract_completed();

create or replace function private.on_fee_line_paid()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' and new.kind = 'planner_fee' then
    perform private.run_phase1_gate(new.wedding_id);
  end if;
  return new;
end $$;
drop trigger if exists on_fee_line_paid on public.ledger_lines;
create trigger on_fee_line_paid after update of status on public.ledger_lines for each row execute function private.on_fee_line_paid();

-- ═══ Contract lifecycle (staff) ══════════════════════════════════════════════
-- The send body — draft-hold gate + ≥1 signer + merge snapshot. No staff check:
-- callable by the staff wrapper OR the approval trigger (a system act by the
-- couple, who is not staff).
create or replace function private.do_send_contract(p_contract uuid, p_resolved jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare c public.contracts; k text; val text; blk public.proposal_status;
begin
  select * into c from public.contracts where id = p_contract for update;
  if not found then raise exception 'no such contract' using errcode = 'FV000'; end if;
  if c.status <> 'draft' then raise exception 'only a draft can be sent' using errcode = 'FM027'; end if;
  if c.blocking_proposal_id is not null then
    select status into blk from public.proposals where id = c.blocking_proposal_id;
    if blk is distinct from 'approved' then
      raise exception 'contract is held until its proposal is approved' using errcode = 'FM022';
    end if;
  end if;
  if not exists (select 1 from public.contract_signers where contract_id = p_contract) then
    raise exception 'a contract needs at least one signer' using errcode = 'FM025';
  end if;
  for k, val in select * from jsonb_each_text(coalesce(p_resolved, '{}'::jsonb)) loop
    update public.contract_fields set resolved_value = val where contract_id = p_contract and field_key = k;
  end loop;
  update public.contracts set status = 'sent' where id = p_contract;
  perform private.log_activity(c.wedding_id, (select auth.uid()), 'contract_sent', c.title, jsonb_build_object('contract_id', p_contract));
end $$;

create or replace function private.send_contract(p_contract uuid, p_resolved jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid;
begin
  select wedding_id into w from public.contracts where id = p_contract;
  if w is null then raise exception 'no such contract' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(w) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  perform private.do_send_contract(p_contract, coalesce(p_resolved, '{}'::jsonb));
end $$;

create or replace function private.void_contract(p_contract uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.contracts;
begin
  select * into c from public.contracts where id = p_contract for update;
  if not found then raise exception 'no such contract' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(c.wedding_id) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if c.status = 'completed' then raise exception 'a completed contract cannot be voided' using errcode = 'FM027'; end if;
  update public.contracts set status = 'voided' where id = p_contract;
  perform private.log_activity(c.wedding_id, (select auth.uid()), 'contract_voided', c.title, jsonb_build_object('contract_id', p_contract));
end $$;

-- draft-hold, the other direction: approving the blocking proposal auto-sends.
create or replace function private.on_proposal_unblocks_contract()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.contracts;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    for c in select * from public.contracts where blocking_proposal_id = new.id and status = 'draft' loop
      perform private.do_send_contract(c.id, '{}'::jsonb);
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists on_proposal_unblocks_contract on public.proposals;
create trigger on_proposal_unblocks_contract after update of status on public.proposals for each row execute function private.on_proposal_unblocks_contract();

-- ═══ The signer surface (public, tokenized, no account) ══════════════════════
-- FM020 bad/expired token · FM021 not your turn · FM023 value too long · FM024
-- already acted · FM025 required fields missing · FM027 wrong status.
create or replace function private.signer_from_token(p_token text)
returns public.contract_signers language plpgsql security definer set search_path = public as $$
declare s public.contract_signers;
begin
  if p_token !~ '^[A-Za-z0-9_-]{24}$' then raise exception 'malformed token' using errcode = 'FM020'; end if;
  select * into s from public.contract_signers where token = p_token;
  if not found then raise exception 'no such signer' using errcode = 'FM020'; end if;
  return s;
end $$;

create or replace function private.load_contract_as(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.contract_signers; c public.contracts; cur int;
begin
  s := private.signer_from_token(p_token);
  select * into c from public.contracts where id = s.contract_id;
  select min(sign_order) into cur from public.contract_signers where contract_id = c.id and signed_at is null and declined_at is null;
  return jsonb_build_object(
    'contract', jsonb_build_object('id', c.id, 'title', c.title, 'kind', c.kind, 'status', c.status),
    'body', coalesce((select body from public.contract_draft_content where contract_id = c.id), ''),
    'me', jsonb_build_object('id', s.id, 'name', s.name, 'role', s.role, 'sign_order', s.sign_order, 'signed_at', s.signed_at, 'declined_at', s.declined_at),
    'my_turn', (cur is not null and cur = s.sign_order and c.status in ('sent','partially_signed')),
    'fields', coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'key', f.field_key, 'label', f.label, 'merge_source', f.merge_source, 'signer_order', f.signer_order, 'required', f.required, 'value', coalesce(f.manual_value, f.resolved_value)) order by f.sort, f.created_at) from public.contract_fields f where f.contract_id = c.id), '[]'::jsonb),
    'signers', coalesce((select jsonb_agg(jsonb_build_object('name', z.name, 'role', z.role, 'sign_order', z.sign_order, 'signed', z.signed_at is not null, 'declined', z.declined_at is not null) order by z.sign_order) from public.contract_signers z where z.contract_id = c.id), '[]'::jsonb)
  );
end $$;

create or replace function private.fill_contract_fields_as(p_token text, p_values jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare s public.contract_signers; c public.contracts; cur int; k text; val text;
begin
  s := private.signer_from_token(p_token);
  select * into c from public.contracts where id = s.contract_id for update;
  if c.status not in ('sent','partially_signed') then raise exception 'contract is not open for signing' using errcode = 'FM027'; end if;
  if s.signed_at is not null or s.declined_at is not null then raise exception 'you have already acted' using errcode = 'FM024'; end if;
  select min(sign_order) into cur from public.contract_signers where contract_id = c.id and signed_at is null and declined_at is null;
  if cur is distinct from s.sign_order then raise exception 'it is not your turn' using errcode = 'FM021'; end if;
  for k, val in select * from jsonb_each_text(coalesce(p_values, '{}'::jsonb)) loop
    if length(val) > 2000 then raise exception 'value too long' using errcode = 'FM023'; end if;
    update public.contract_fields set manual_value = val
      where contract_id = c.id and field_key = k and merge_source = 'manual' and coalesce(signer_order, s.sign_order) = s.sign_order;
  end loop;
end $$;

create or replace function private.sign_contract_as(p_token text, p_typed_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.contract_signers; c public.contracts; cur int; missing int; remaining int;
begin
  s := private.signer_from_token(p_token);
  select * into c from public.contracts where id = s.contract_id for update;
  if c.status not in ('sent','partially_signed') then raise exception 'contract is not open for signing' using errcode = 'FM027'; end if;
  if s.signed_at is not null or s.declined_at is not null then raise exception 'you have already acted' using errcode = 'FM024'; end if;
  select min(sign_order) into cur from public.contract_signers where contract_id = c.id and signed_at is null and declined_at is null;
  if cur is distinct from s.sign_order then raise exception 'it is not your turn' using errcode = 'FM021'; end if;
  if p_typed_name is null or length(btrim(p_typed_name)) = 0 then raise exception 'a signature is required' using errcode = 'FM025'; end if;
  -- required-field gate (FM025): every required field this signer owns must be filled
  select count(*) into missing from public.contract_fields f
    where f.contract_id = c.id and f.required
      and coalesce(f.signer_order, s.sign_order) = s.sign_order
      and coalesce(nullif(btrim(coalesce(f.manual_value, f.resolved_value, '')), ''), null) is null;
  if missing > 0 then raise exception '% required field(s) unfilled', missing using errcode = 'FM025'; end if;

  update public.contract_signers set signed_at = now(), typed_name = p_typed_name where id = s.id;
  select count(*) into remaining from public.contract_signers where contract_id = c.id and signed_at is null and declined_at is null;
  if remaining = 0 then
    update public.contracts set status = 'completed', completed_at = now() where id = c.id;
  else
    update public.contracts set status = 'partially_signed' where id = c.id;
  end if;
  perform private.log_activity(c.wedding_id, null, 'contract_signed', s.name, jsonb_build_object('contract_id', c.id));
  return jsonb_build_object('completed', remaining = 0, 'remaining', remaining);
end $$;

create or replace function private.decline_contract_as(p_token text, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.contract_signers; c public.contracts;
begin
  s := private.signer_from_token(p_token);
  select * into c from public.contracts where id = s.contract_id for update;
  if c.status not in ('sent','partially_signed') then raise exception 'contract is not open' using errcode = 'FM027'; end if;
  if s.signed_at is not null or s.declined_at is not null then raise exception 'you have already acted' using errcode = 'FM024'; end if;
  update public.contract_signers set declined_at = now(), decline_reason = p_reason where id = s.id;
  update public.contracts set status = 'declined' where id = c.id;
  perform private.log_activity(c.wedding_id, null, 'contract_declined', s.name, jsonb_build_object('contract_id', c.id));
end $$;

-- webhook helper: record the fee payment + flip the line to paid (service-role).
create or replace function private.record_fee_payment(p_line uuid, p_intent text, p_status text, p_amount numeric)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid;
begin
  select wedding_id into w from public.ledger_lines where id = p_line;
  if w is null then raise exception 'no such line' using errcode = 'FV000'; end if;
  insert into public.fee_payments (wedding_id, ledger_line_id, stripe_payment_intent, status, amount)
    values (w, p_line, p_intent, coalesce(p_status,'succeeded')::public.fee_status, p_amount)
    on conflict (stripe_payment_intent) do update set status = excluded.status;
  if coalesce(p_status,'succeeded') = 'succeeded' then
    update public.ledger_lines set status = 'paid', paid_at = coalesce(paid_at, now()) where id = p_line and status <> 'paid';
    perform private.log_activity(w, null, 'deposit_paid', (select title from public.ledger_lines where id = p_line), jsonb_build_object('ledger_line_id', p_line));
  end if;
end $$;

-- ═══ public invoker wrappers ═════════════════════════════════════════════════
create or replace function public.close_wedding(w uuid) returns void language sql security invoker set search_path = public as $$ select private.close_wedding(w); $$;
create or replace function public.send_contract(p_contract uuid, p_resolved jsonb default '{}'::jsonb) returns void language sql security invoker set search_path = public as $$ select private.send_contract(p_contract, p_resolved); $$;
create or replace function public.void_contract(p_contract uuid) returns void language sql security invoker set search_path = public as $$ select private.void_contract(p_contract); $$;
create or replace function public.load_contract_as(p_token text) returns jsonb language sql security invoker set search_path = public as $$ select private.load_contract_as(p_token); $$;
create or replace function public.fill_contract_fields_as(p_token text, p_values jsonb) returns void language sql security invoker set search_path = public as $$ select private.fill_contract_fields_as(p_token, p_values); $$;
create or replace function public.sign_contract_as(p_token text, p_typed_name text) returns jsonb language sql security invoker set search_path = public as $$ select private.sign_contract_as(p_token, p_typed_name); $$;
create or replace function public.decline_contract_as(p_token text, p_reason text) returns void language sql security invoker set search_path = public as $$ select private.decline_contract_as(p_token, p_reason); $$;
create or replace function public.record_fee_payment(p_line uuid, p_intent text, p_status text, p_amount numeric) returns void language sql security invoker set search_path = public as $$ select private.record_fee_payment(p_line, p_intent, p_status, p_amount); $$;

-- ═══ Views (security_invoker → RLS scopes to the viewer) ═════════════════════
create or replace view public.wedding_money_rollup with (security_invoker = true) as
  select w.id as wedding_id, w.budget_total,
    coalesce(sum(l.amount) filter (where l.status in ('paid','settled')), 0) as paid,
    coalesce(sum(l.amount) filter (where l.contract_id is not null and l.status in ('expected','scheduled','due')), 0) as committed,
    coalesce(w.budget_total, 0)
      - coalesce(sum(l.amount) filter (where l.status in ('paid','settled')), 0)
      - coalesce(sum(l.amount) filter (where l.contract_id is not null and l.status in ('expected','scheduled','due')), 0) as open
  from public.weddings w left join public.ledger_lines l on l.wedding_id = w.id
  group by w.id, w.budget_total;

create or replace view public.event_money_slice with (security_invoker = true) as
  select wedding_id, event_id, coalesce(sum(amount), 0) as total
  from public.ledger_lines where event_id is not null group by wedding_id, event_id;

create or replace view public.money_radar with (security_invoker = true) as
  select l.id, l.wedding_id, w.workspace_id, w.couple_display, l.title, l.amount, l.due_date, l.status, l.kind,
    (l.kind = 'planner_fee') as is_fee
  from public.ledger_lines l join public.weddings w on w.id = l.wedding_id
  where l.due_date is not null and l.due_date <= current_date + 60 and l.status in ('expected','scheduled','due');

-- ═══ RLS ═════════════════════════════════════════════════════════════════════
alter table public.contract_templates enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_draft_content enable row level security;
alter table public.contract_fields enable row level security;
alter table public.contract_signers enable row level security;
alter table public.ledger_lines enable row level security;
alter table public.fee_payments enable row level security;

-- templates: workspace-scoped staff only
drop policy if exists contract_templates_all on public.contract_templates;
create policy contract_templates_all on public.contract_templates for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));

-- contracts + ledger: staff CRUD; wedding members SELECT
drop policy if exists contracts_staff on public.contracts;
create policy contracts_staff on public.contracts for all to authenticated
  using (private.is_wedding_staff(wedding_id)) with check (private.is_wedding_staff(wedding_id));
drop policy if exists contracts_member_read on public.contracts;
create policy contracts_member_read on public.contracts for select to authenticated
  using (private.is_wedding_member(wedding_id));

drop policy if exists ledger_staff on public.ledger_lines;
create policy ledger_staff on public.ledger_lines for all to authenticated
  using (private.is_wedding_staff(wedding_id)) with check (private.is_wedding_staff(wedding_id));
drop policy if exists ledger_member_read on public.ledger_lines;
create policy ledger_member_read on public.ledger_lines for select to authenticated
  using (private.is_wedding_member(wedding_id));

drop policy if exists fee_payments_read on public.fee_payments;
create policy fee_payments_read on public.fee_payments for select to authenticated
  using (private.is_wedding_staff(wedding_id) or private.is_wedding_member(wedding_id));

-- contract children: readable/writable through the parent contract's visibility
drop policy if exists contract_draft_staff on public.contract_draft_content;
create policy contract_draft_staff on public.contract_draft_content for all to authenticated
  using (exists (select 1 from public.contracts c where c.id = contract_id and private.is_wedding_staff(c.wedding_id)))
  with check (exists (select 1 from public.contracts c where c.id = contract_id and private.is_wedding_staff(c.wedding_id)));
drop policy if exists contract_draft_member on public.contract_draft_content;
create policy contract_draft_member on public.contract_draft_content for select to authenticated
  using (exists (select 1 from public.contracts c where c.id = contract_id and private.is_wedding_member(c.wedding_id)));

drop policy if exists contract_fields_staff on public.contract_fields;
create policy contract_fields_staff on public.contract_fields for all to authenticated
  using (exists (select 1 from public.contracts c where c.id = contract_id and private.is_wedding_staff(c.wedding_id)))
  with check (exists (select 1 from public.contracts c where c.id = contract_id and private.is_wedding_staff(c.wedding_id)));
drop policy if exists contract_fields_member on public.contract_fields;
create policy contract_fields_member on public.contract_fields for select to authenticated
  using (exists (select 1 from public.contracts c where c.id = contract_id and private.is_wedding_member(c.wedding_id)));

drop policy if exists contract_signers_staff on public.contract_signers;
create policy contract_signers_staff on public.contract_signers for all to authenticated
  using (exists (select 1 from public.contracts c where c.id = contract_id and private.is_wedding_staff(c.wedding_id)))
  with check (exists (select 1 from public.contracts c where c.id = contract_id and private.is_wedding_staff(c.wedding_id)));
drop policy if exists contract_signers_member on public.contract_signers;
create policy contract_signers_member on public.contract_signers for select to authenticated
  using (exists (select 1 from public.contracts c where c.id = contract_id and private.is_wedding_member(c.wedding_id)));

-- ═══ Grants (§11: revoke internal helpers; grant only intended entry points) ══
grant usage on schema private to anon;  -- signer surface is anonymous (idempotent)

revoke execute on function
  private.guard_fee_payment_line(), private.guard_contract_field_immutable(), private.guard_signer_immutable(),
  private.run_phase1_gate(uuid), private.on_contract_completed(), private.on_fee_line_paid(),
  private.on_proposal_unblocks_contract(), private.signer_from_token(text), private.do_send_contract(uuid, jsonb)
  from public, anon, authenticated;

-- staff/authenticated entry points
revoke execute on function
  private.close_wedding(uuid), private.send_contract(uuid, jsonb), private.void_contract(uuid),
  public.close_wedding(uuid), public.send_contract(uuid, jsonb), public.void_contract(uuid)
  from public, anon;
grant execute on function
  private.close_wedding(uuid), private.send_contract(uuid, jsonb), private.void_contract(uuid),
  public.close_wedding(uuid), public.send_contract(uuid, jsonb), public.void_contract(uuid)
  to authenticated;
grant execute on function private.accept_quote(uuid) to authenticated;  -- (already granted via 0006 wrapper; belt)

-- the signer surface: anon + authenticated (the deliberate allowlist growth)
revoke execute on function
  private.load_contract_as(text), private.fill_contract_fields_as(text, jsonb), private.sign_contract_as(text, text), private.decline_contract_as(text, text),
  public.load_contract_as(text), public.fill_contract_fields_as(text, jsonb), public.sign_contract_as(text, text), public.decline_contract_as(text, text)
  from public;
grant execute on function
  public.load_contract_as(text), public.fill_contract_fields_as(text, jsonb), public.sign_contract_as(text, text), public.decline_contract_as(text, text)
  to anon, authenticated;
grant execute on function
  private.load_contract_as(text), private.fill_contract_fields_as(text, jsonb), private.sign_contract_as(text, text), private.decline_contract_as(text, text)
  to anon, authenticated;

-- webhook path is service-role only (never anon/authenticated)
revoke execute on function
  private.record_fee_payment(uuid, text, text, numeric), public.record_fee_payment(uuid, text, text, numeric)
  from public, anon, authenticated;
grant execute on function
  private.record_fee_payment(uuid, text, text, numeric), public.record_fee_payment(uuid, text, text, numeric)
  to service_role;
grant execute on function private.run_phase1_gate(uuid) to service_role;

grant select on public.wedding_money_rollup, public.event_money_slice, public.money_radar to authenticated;
