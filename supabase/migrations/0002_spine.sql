-- 0002_spine.sql — Forma v2 M1: weddings, their events, and the phase machine.
-- Normative source: docs/FORMA-V2-SCHEMA.md §2 (spine), §9 (gates), §11 (harness).
-- Additive, idempotent, RLS on from birth. v2 house rules (§0): every FK indexed
-- the day it's born; created_at/updated_at + touch_updated_at on every table; all
-- enums are Postgres enums; on delete chosen per edge; composite unique keys
-- (id, wedding_id) laid now so M2+ children can carry composite FKs.

-- ── Enums ──────────────────────────────────────────────────────────────────
do $$ begin create type public.wedding_phase as enum ('hiring','foundations','details','wedding_days','closed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.wedding_kind as enum ('city','destination'); exception when duplicate_object then null; end $$;
do $$ begin create type public.event_kind as enum ('ceremony','reception','dinner','party','ritual','other'); exception when duplicate_object then null; end $$;
do $$ begin create type public.wedding_member_role as enum ('partner','family','day_of'); exception when duplicate_object then null; end $$;

-- ── weddings ─────────────────────────────────────────────────────────────────
-- The spine. workspace_id is RESTRICT: a workspace with weddings cannot be
-- deleted out from under them. date_start/date_end are DERIVED from events by
-- trigger — never typed by the app. phase is data, but only
-- private.advance_wedding_phase writes it (the seed/demo path uses service role).
create table if not exists public.weddings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete restrict,
  slug text not null unique,
  couple_display text not null,
  partner_a text,
  partner_b text,
  phase public.wedding_phase not null default 'foundations',
  kind public.wedding_kind,
  location_city text,
  location_country text,
  date_start date,
  date_end date,
  guest_target int,
  budget_total numeric(12,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create index if not exists weddings_workspace_idx on public.weddings (workspace_id);
create index if not exists weddings_date_start_idx on public.weddings (date_start);

-- ── wedding_members ──────────────────────────────────────────────────────────
-- The couple side. Rows land now with RLS; no invite UI in M1 (invites need the
-- email layer — M3). Self-planning couples get a membership with the wedding at
-- later milestones; in M1 staff manage this roster.
create table if not exists public.wedding_members (
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.wedding_member_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (wedding_id, user_id)
);
-- PK (wedding_id, user_id) covers the wedding_id FK (leading); user_id needs its own.
create index if not exists wedding_members_user_idx on public.wedding_members (user_id);

-- ── wedding_events ───────────────────────────────────────────────────────────
create table if not exists public.wedding_events (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  label text not null,
  kind public.event_kind not null default 'other',
  event_date date,
  start_time time,
  end_time time,
  order_index int not null default 0,
  guest_target int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, wedding_id)
);
create index if not exists wedding_events_wedding_idx on public.wedding_events (wedding_id);

-- ── updated_at triggers (reuse 0001's private.touch_updated_at) ───────────────
drop trigger if exists touch_weddings on public.weddings;
create trigger touch_weddings before update on public.weddings for each row execute function private.touch_updated_at();
drop trigger if exists touch_wedding_members on public.wedding_members;
create trigger touch_wedding_members before update on public.wedding_members for each row execute function private.touch_updated_at();
drop trigger if exists touch_wedding_events on public.wedding_events;
create trigger touch_wedding_events before update on public.wedding_events for each row execute function private.touch_updated_at();

-- ── Membership helpers (used by all spine policies) ──────────────────────────
-- Staff = a member of the wedding's owning workspace. Wedding member = a row in
-- wedding_members. Both SECURITY DEFINER so policies don't recurse through RLS.
create or replace function private.is_wedding_staff(w uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.weddings wd
    join public.workspace_members m on m.workspace_id = wd.workspace_id
    where wd.id = w and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_wedding_member(w uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.wedding_members m
    where m.wedding_id = w and m.user_id = (select auth.uid())
  );
$$;

-- ── Seed trigger: a wedding is born with one localized default event ─────────
-- v1's hard-won law: a wedding always has ≥ 1 event. Label follows the creator's
-- locale; a service-role insert (auth.uid() null — the demo seed) defaults to en.
create or replace function private.seed_default_event()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_locale public.locale_code;
begin
  select locale into v_locale from public.profiles where id = (select auth.uid());
  insert into public.wedding_events (wedding_id, label, kind, order_index)
  values (
    new.id,
    case when v_locale = 'es' then 'Día de la boda' else 'Wedding day' end,
    'ceremony',
    0
  );
  return new;
end $$;
drop trigger if exists on_wedding_created on public.weddings;
create trigger on_wedding_created after insert on public.weddings for each row execute function private.seed_default_event();

-- ── Derived dates: weddings.date_start/date_end = min/max of event_date ───────
-- Maintained on every event insert/update/delete; the app never writes these.
-- During a wedding cascade-delete the parent row is already gone, so the update
-- simply matches zero rows.
create or replace function private.recompute_wedding_dates()
returns trigger language plpgsql security definer set search_path = public as $$
declare w uuid := coalesce(new.wedding_id, old.wedding_id);
begin
  update public.weddings set
    date_start = (select min(event_date) from public.wedding_events where wedding_id = w),
    date_end   = (select max(event_date) from public.wedding_events where wedding_id = w)
  where id = w;
  return null;
end $$;
drop trigger if exists recompute_wedding_dates on public.wedding_events;
create trigger recompute_wedding_dates
  after insert or update or delete on public.wedding_events
  for each row execute function private.recompute_wedding_dates();

-- ── Last-event guard: a wedding always keeps ≥ 1 event ───────────────────────
-- Blocks deleting the final event. Exempts the wedding cascade-delete: by the
-- time a cascade reaches the child, the parent weddings row is already deleted,
-- so `exists(weddings)` is false and the guard stands down.
create or replace function private.guard_last_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.weddings where id = old.wedding_id)
     and (select count(*) from public.wedding_events where wedding_id = old.wedding_id) <= 1 then
    raise exception 'a wedding must keep at least one event' using errcode = 'FV210';
  end if;
  return old;
end $$;
drop trigger if exists guard_last_event on public.wedding_events;
create trigger guard_last_event before delete on public.wedding_events for each row execute function private.guard_last_event();

-- ── The phase machine (§9) ───────────────────────────────────────────────────
-- The only writer of weddings.phase. Verifies the gate predicates that exist in
-- M1 and raises a DISTINCT sqlstate for the first unmet one, so a caller (and the
-- Planning room) can name exactly what's blocking. The venue-booked predicate
-- (2→3) needs the M4 catalog and FAILS CLOSED with its own code 'FV205' — no
-- wedding advances to `details` through this function until venues exist. Activity
-- logging (§9) arrives with the activity table in M2.
--   FV101 planner agreement required (1→2, M5)   FV201 budget_total > 0
--   FV202 guest_target > 0    FV203 location set   FV204 every event dated
--   FV205 every event venue-booked (M4, fail-closed)
--   FV301 3→4 is date-driven (M6)   FV401 close needs the ledger (M5)
--   FV299 already closed   FV000 no such wedding
create or replace function private.advance_wedding_phase(w uuid)
returns public.wedding_phase language plpgsql security definer set search_path = public as $$
declare
  wd public.weddings;
  wk public.workspace_kind;
  undated int;
begin
  select * into wd from public.weddings where id = w;
  if not found then raise exception 'wedding % not found', w using errcode = 'FV000'; end if;
  select kind into wk from public.workspaces where id = wd.workspace_id;

  if wd.phase = 'hiring' then
    -- 1→2: planner agreement completed + deposit paid (M5). Self-planning couples bypass.
    if wk = 'couple' then
      update public.weddings set phase = 'foundations' where id = w;
      return 'foundations';
    end if;
    raise exception 'planner agreement must complete and its deposit be paid (arrives M5)' using errcode = 'FV101';

  elsif wd.phase = 'foundations' then
    -- 2→3: the M1 predicates, then the M4 venue check that fails closed.
    if coalesce(wd.budget_total, 0) <= 0 then raise exception 'budget must be set above zero' using errcode = 'FV201'; end if;
    if coalesce(wd.guest_target, 0) <= 0 then raise exception 'a guest target is required' using errcode = 'FV202'; end if;
    if wd.location_city is null or wd.location_country is null then raise exception 'the location must be set' using errcode = 'FV203'; end if;
    select count(*) into undated from public.wedding_events where wedding_id = w and event_date is null;
    if undated > 0 then raise exception '% event(s) still need a date', undated using errcode = 'FV204'; end if;
    raise exception 'every event needs a booked venue (arrives with the catalog, M4)' using errcode = 'FV205';

  elsif wd.phase = 'details' then
    raise exception 'phase 3 to 4 is date-driven, not advanced by this function in M1' using errcode = 'FV301';
  elsif wd.phase = 'wedding_days' then
    raise exception 'closing requires a settled ledger (arrives M5)' using errcode = 'FV401';
  else
    raise exception 'the wedding is already closed' using errcode = 'FV299';
  end if;
end $$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.weddings enable row level security;
alter table public.wedding_members enable row level security;
alter table public.wedding_events enable row level security;

-- weddings: staff (workspace member) full CRUD; wedding members read.
-- These policies read workspace_id DIRECTLY off the row via is_workspace_member,
-- rather than re-deriving it through is_wedding_staff(id) (which self-joins the
-- weddings row). That matters for INSERT ... RETURNING: the SELECT policy is
-- evaluated against the new row, but a STABLE function joining `weddings` uses
-- the statement's pre-insert snapshot and can't see the row it just made — the
-- M0 RETURNING trap. Reading the row's own workspace_id column sidesteps it, so
-- the create action can read its new id back. (is_wedding_staff stays for the
-- child tables below, whose parent wedding already exists.)
drop policy if exists weddings_select on public.weddings;
create policy weddings_select on public.weddings for select to authenticated
  using (private.is_workspace_member(workspace_id) or private.is_wedding_member(id));
drop policy if exists weddings_insert on public.weddings;
create policy weddings_insert on public.weddings for insert to authenticated
  with check (private.is_workspace_member(workspace_id));
drop policy if exists weddings_update on public.weddings;
create policy weddings_update on public.weddings for update to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));
drop policy if exists weddings_delete on public.weddings;
create policy weddings_delete on public.weddings for delete to authenticated
  using (private.is_workspace_member(workspace_id));

-- wedding_members: staff manage the roster; members + the user themselves read.
drop policy if exists wedding_members_select on public.wedding_members;
create policy wedding_members_select on public.wedding_members for select to authenticated
  using (private.is_wedding_staff(wedding_id) or private.is_wedding_member(wedding_id) or user_id = (select auth.uid()));
drop policy if exists wedding_members_insert on public.wedding_members;
create policy wedding_members_insert on public.wedding_members for insert to authenticated
  with check (private.is_wedding_staff(wedding_id));
drop policy if exists wedding_members_update on public.wedding_members;
create policy wedding_members_update on public.wedding_members for update to authenticated
  using (private.is_wedding_staff(wedding_id)) with check (private.is_wedding_staff(wedding_id));
drop policy if exists wedding_members_delete on public.wedding_members;
create policy wedding_members_delete on public.wedding_members for delete to authenticated
  using (private.is_wedding_staff(wedding_id));

-- wedding_events: staff full CRUD; staff + wedding members read.
drop policy if exists wedding_events_select on public.wedding_events;
create policy wedding_events_select on public.wedding_events for select to authenticated
  using (private.is_wedding_staff(wedding_id) or private.is_wedding_member(wedding_id));
drop policy if exists wedding_events_insert on public.wedding_events;
create policy wedding_events_insert on public.wedding_events for insert to authenticated
  with check (private.is_wedding_staff(wedding_id));
drop policy if exists wedding_events_update on public.wedding_events;
create policy wedding_events_update on public.wedding_events for update to authenticated
  using (private.is_wedding_staff(wedding_id)) with check (private.is_wedding_staff(wedding_id));
drop policy if exists wedding_events_delete on public.wedding_events;
create policy wedding_events_delete on public.wedding_events for delete to authenticated
  using (private.is_wedding_staff(wedding_id));
