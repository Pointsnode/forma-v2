-- 0005_people.sql — Forma v2 M3: guests, RSVP, the touchpoint engine.
-- Normative: docs/FORMA-V2-SCHEMA.md §4/§10/§11/§12, with amendments (doc updated):
--   §1A migration renumber (0004 = private-grants sev-fix; M3 = 0005).
--   §1B menu_choice_id/seat_ref on event_guests deferred to M6 (arrive with menus/
--       seats, additive), like the proposal subjects; touchpoint_kind enum ships
--       complete but M3 schedules/sends only rsvp_invite/reminder/close.
--   §1C RSVP controls on weddings: rsvp_deadline, rsvp_open.
-- Guests never log in — the public surface is v1's locked pattern: anon-callable
-- SECURITY INVOKER wrappers over private SECURITY DEFINER functions, regex-gated,
-- for-update locked. Grants are explicit (the 0004 default-revoke regime is law).

-- ── Enums ────────────────────────────────────────────────────────────────────
do $$ begin create type public.guest_side as enum ('a','b','both','none'); exception when duplicate_object then null; end $$;
do $$ begin create type public.rsvp_status as enum ('pending','yes','no','maybe'); exception when duplicate_object then null; end $$;
do $$ begin create type public.touchpoint_kind as enum ('save_the_date','rsvp_invite','rsvp_reminder','rsvp_close','menu_collect','travel_info','day_of_schedule'); exception when duplicate_object then null; end $$;
do $$ begin create type public.touchpoint_status as enum ('scheduled','sending','sent','skipped'); exception when duplicate_object then null; end $$;

-- ── RSVP controls on the wedding (§1C) ───────────────────────────────────────
alter table public.weddings add column if not exists rsvp_deadline date;
alter table public.weddings add column if not exists rsvp_open boolean not null default false;

-- ── guests ───────────────────────────────────────────────────────────────────
create table if not exists public.guests (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 200),
  email text,
  phone text,
  side public.guest_side not null default 'none',
  group_label text,
  plus_one_allowed boolean not null default false,
  plus_one_name text,
  dietary text,
  notes text,
  rsvp_code char(16) not null unique
    default substr(md5(gen_random_uuid()::text), 1, 16)
    check (rsvp_code ~ '^[a-f0-9]{16}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, wedding_id)
);
create index if not exists guests_wedding_idx on public.guests (wedding_id);
create index if not exists guests_email_idx on public.guests (wedding_id, lower(email));

-- ── event_guests (composite FKs; menu_choice_id / seat_ref deferred to M6) ───
create table if not exists public.event_guests (
  event_id uuid not null,
  guest_id uuid not null,
  wedding_id uuid not null,
  invited boolean not null default true,
  rsvp_status public.rsvp_status not null default 'pending',
  rsvp_responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, guest_id),
  constraint event_guests_event_fk foreign key (event_id, wedding_id) references public.wedding_events (id, wedding_id) on delete cascade,
  constraint event_guests_guest_fk foreign key (guest_id, wedding_id) references public.guests (id, wedding_id) on delete cascade
);
create index if not exists event_guests_guest_idx on public.event_guests (guest_id);
create index if not exists event_guests_wedding_idx on public.event_guests (wedding_id);

-- ── touchpoints ──────────────────────────────────────────────────────────────
create table if not exists public.touchpoints (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  kind public.touchpoint_kind not null,
  scheduled_for date not null,
  status public.touchpoint_status not null default 'scheduled',
  audience_rule jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, wedding_id)
);
create index if not exists touchpoints_wedding_idx on public.touchpoints (wedding_id);
create index if not exists touchpoints_due_idx on public.touchpoints (status, scheduled_for);

-- ── touchpoint_sends (the send ledger; token per guest per touchpoint) ───────
create table if not exists public.touchpoint_sends (
  touchpoint_id uuid not null references public.touchpoints (id) on delete cascade,
  guest_id uuid not null,
  wedding_id uuid not null,
  token char(24) not null unique
    default substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 24)
    check (token ~ '^[A-Za-z0-9_-]{24}$'),
  sent_at timestamptz,
  opened_at timestamptz,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (touchpoint_id, guest_id),
  constraint touchpoint_sends_guest_fk foreign key (guest_id, wedding_id) references public.guests (id, wedding_id) on delete cascade
);
create index if not exists touchpoint_sends_guest_idx on public.touchpoint_sends (guest_id);
create index if not exists touchpoint_sends_wedding_idx on public.touchpoint_sends (wedding_id);

-- ── updated_at triggers ──────────────────────────────────────────────────────
drop trigger if exists touch_guests on public.guests;
create trigger touch_guests before update on public.guests for each row execute function private.touch_updated_at();
drop trigger if exists touch_event_guests on public.event_guests;
create trigger touch_event_guests before update on public.event_guests for each row execute function private.touch_updated_at();
drop trigger if exists touch_touchpoints on public.touchpoints;
create trigger touch_touchpoints before update on public.touchpoints for each row execute function private.touch_updated_at();
drop trigger if exists touch_touchpoint_sends on public.touchpoint_sends;
create trigger touch_touchpoint_sends before update on public.touchpoint_sends for each row execute function private.touch_updated_at();

-- ── Auto-population: a guest × event grid is maintained by trigger ───────────
create or replace function private.populate_eg_for_guest()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.event_guests (event_id, guest_id, wedding_id)
    select e.id, new.id, new.wedding_id from public.wedding_events e where e.wedding_id = new.wedding_id
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists populate_eg_for_guest on public.guests;
create trigger populate_eg_for_guest after insert on public.guests for each row execute function private.populate_eg_for_guest();

create or replace function private.populate_eg_for_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.event_guests (event_id, guest_id, wedding_id)
    select new.id, g.id, new.wedding_id from public.guests g where g.wedding_id = new.wedding_id
  on conflict do nothing;
  return new;
end $$;
drop trigger if exists populate_eg_for_event on public.wedding_events;
create trigger populate_eg_for_event after insert on public.wedding_events for each row execute function private.populate_eg_for_event();

-- ── Touchpoint timeline seed (idempotent) when a deadline is set ─────────────
create or replace function private.seed_touchpoints_for(w uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d date;
begin
  select rsvp_deadline into d from public.weddings where id = w;
  if d is null then return; end if;
  insert into public.touchpoints (wedding_id, kind, scheduled_for, audience_rule)
    select w, 'rsvp_invite', current_date, jsonb_build_object('scope','all_invited')
    where not exists (select 1 from public.touchpoints where wedding_id = w and kind = 'rsvp_invite');
  insert into public.touchpoints (wedding_id, kind, scheduled_for, audience_rule)
    select w, 'rsvp_reminder', greatest(d - 14, current_date), jsonb_build_object('scope','non_responders')
    where not exists (select 1 from public.touchpoints where wedding_id = w and kind = 'rsvp_reminder');
  insert into public.touchpoints (wedding_id, kind, scheduled_for, audience_rule)
    select w, 'rsvp_close', d, jsonb_build_object('scope','all_invited')
    where not exists (select 1 from public.touchpoints where wedding_id = w and kind = 'rsvp_close');
end $$;

create or replace function private.on_rsvp_deadline_set()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.rsvp_deadline is not null and new.rsvp_deadline is distinct from old.rsvp_deadline then
    perform private.seed_touchpoints_for(new.id);
  end if;
  return new;
end $$;
drop trigger if exists on_rsvp_deadline_set on public.weddings;
create trigger on_rsvp_deadline_set after update of rsvp_deadline on public.weddings for each row execute function private.on_rsvp_deadline_set();

-- ── The public RSVP surface (guests are anonymous) ───────────────────────────
-- Error codes: FM010 invalid code · FM011 rsvp closed · FM012 past deadline ·
-- FM013 malformed code · FM014 not invited to an event in the responses.
create or replace function private.rsvp_lookup(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.guests; wd public.weddings; loc text; is_open boolean;
begin
  if p_code !~ '^[a-f0-9]{16}$' then raise exception 'malformed code' using errcode = 'FM013'; end if;
  select * into g from public.guests where rsvp_code = p_code;
  if not found then raise exception 'invalid code' using errcode = 'FM010'; end if;
  select * into wd from public.weddings where id = g.wedding_id;
  select p.locale::text into loc from public.workspaces w join public.profiles p on p.id = w.created_by where w.id = wd.workspace_id;
  is_open := wd.rsvp_open and (wd.rsvp_deadline is null or wd.rsvp_deadline >= current_date);
  return jsonb_build_object(
    'guest', jsonb_build_object('full_name', g.full_name, 'plus_one_allowed', g.plus_one_allowed, 'plus_one_name', g.plus_one_name, 'dietary', g.dietary),
    'wedding', jsonb_build_object('couple_display', wd.couple_display, 'date_start', wd.date_start, 'date_end', wd.date_end, 'location_city', wd.location_city),
    'locale', coalesce(loc, 'en'),
    'open', is_open,
    'closed_reason', case when not wd.rsvp_open then 'closed' when wd.rsvp_deadline < current_date then 'expired' else null end,
    'events', (
      select coalesce(jsonb_agg(jsonb_build_object('event_id', e.id, 'label', e.label, 'event_date', e.event_date, 'status', eg.rsvp_status) order by e.event_date nulls last, e.order_index), '[]'::jsonb)
      from public.event_guests eg join public.wedding_events e on e.id = eg.event_id
      where eg.guest_id = g.id and eg.invited
    )
  );
end $$;

create or replace function private.rsvp_submit(p_code text, p_payload jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  g public.guests; wd public.weddings; r jsonb; eid uuid; st public.rsvp_status; tok text := p_payload ->> 'send_token';
begin
  if p_code !~ '^[a-f0-9]{16}$' then raise exception 'malformed code' using errcode = 'FM013'; end if;
  select * into g from public.guests where rsvp_code = p_code for update;
  if not found then raise exception 'invalid code' using errcode = 'FM010'; end if;
  select * into wd from public.weddings where id = g.wedding_id;
  if not wd.rsvp_open then raise exception 'rsvp closed' using errcode = 'FM011'; end if;
  if wd.rsvp_deadline is not null and wd.rsvp_deadline < current_date then raise exception 'past deadline' using errcode = 'FM012'; end if;

  for r in select * from jsonb_array_elements(coalesce(p_payload -> 'responses', '[]'::jsonb)) loop
    eid := (r ->> 'event_id')::uuid;
    st := (r ->> 'status')::public.rsvp_status;
    update public.event_guests
      set rsvp_status = st, rsvp_responded_at = now()
      where event_id = eid and guest_id = g.id and invited;
    if not found then raise exception 'not invited to event %', eid using errcode = 'FM014'; end if;
  end loop;

  update public.guests
    set plus_one_name = coalesce(nullif(p_payload ->> 'plus_one_name', ''), plus_one_name),
        dietary = coalesce(nullif(p_payload ->> 'dietary', ''), dietary)
    where id = g.id;

  if tok is not null and tok ~ '^[A-Za-z0-9_-]{24}$' then
    update public.touchpoint_sends set answered_at = now(), opened_at = coalesce(opened_at, now())
      where token = tok and guest_id = g.id;
  end if;

  perform private.log_activity(g.wedding_id, null, 'guest_rsvpd', g.full_name, jsonb_build_object('guest_id', g.id));
  return jsonb_build_object('ok', true);
end $$;

create or replace function private.touchpoint_open(p_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_token !~ '^[A-Za-z0-9_-]{24}$' then return; end if;
  update public.touchpoint_sends set opened_at = coalesce(opened_at, now()) where token = p_token;
end $$;

-- ── Public wrappers (SECURITY INVOKER) — anon is the production path ─────────
create or replace function public.rsvp_lookup(code text)
returns jsonb language sql security invoker set search_path = public as $$ select private.rsvp_lookup(code); $$;
create or replace function public.rsvp_submit(code text, payload jsonb)
returns jsonb language sql security invoker set search_path = public as $$ select private.rsvp_submit(code, payload); $$;
create or replace function public.touchpoint_open(token text)
returns void language sql security invoker set search_path = public as $$ select private.touchpoint_open(token); $$;

-- Guest import → one activity row per import (not per guest). Staff or couple may
-- import; the importer is the recorded actor; summary carries only the count (the
-- verb is localized at render, like every other M3 activity verb).
create or replace function private.log_guest_import(w uuid, n int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (private.is_wedding_staff(w) or private.is_wedding_member(w)) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  perform private.log_activity(w, (select auth.uid()), 'list_imported', n::text, jsonb_build_object('count', n));
end $$;
create or replace function public.log_guest_import(w uuid, n int)
returns void language sql security invoker set search_path = public as $$ select private.log_guest_import(w, n); $$;

-- ── Views (security_invoker; the board reads these, never counters) ──────────
create or replace view public.guest_rsvp_rollup with (security_invoker = true) as
select
  g.wedding_id,
  count(distinct g.id) as invited,
  count(distinct g.id) filter (where ans.answered) as answered,
  count(distinct eg.guest_id) filter (where eg.rsvp_status = 'yes') as yes,
  count(distinct eg.guest_id) filter (where eg.rsvp_status = 'no') as no,
  count(distinct eg.guest_id) filter (where eg.rsvp_status = 'maybe') as maybe,
  count(distinct g.id) filter (where not coalesce(ans.answered, false)) as pending
from public.guests g
left join public.event_guests eg on eg.guest_id = g.id and eg.invited
left join lateral (
  select bool_or(e2.rsvp_status <> 'pending') as answered
  from public.event_guests e2 where e2.guest_id = g.id and e2.invited
) ans on true
group by g.wedding_id;

create or replace view public.event_guest_counts with (security_invoker = true) as
select
  eg.event_id,
  eg.wedding_id,
  count(*) filter (where eg.invited) as invited,
  count(*) filter (where eg.invited and eg.rsvp_status = 'yes') as confirmed,
  count(*) filter (where eg.invited and eg.rsvp_status = 'no') as declined,
  count(*) filter (where eg.invited and eg.rsvp_status = 'maybe') as maybe,
  count(*) filter (where eg.invited and eg.rsvp_status = 'pending') as pending
from public.event_guests eg
group by eg.event_id, eg.wedding_id;

-- Exceptions: the only guests who need a human.
create or replace view public.guest_exceptions with (security_invoker = true) as
select g.wedding_id, g.id as guest_id, g.full_name, 'no_email'::text as reason
  from public.guests g where g.email is null or g.email = ''
union all
select g.wedding_id, g.id, g.full_name, 'missing_plus_one'::text
  from public.guests g
  where g.plus_one_allowed and (g.plus_one_name is null or g.plus_one_name = '')
    and exists (select 1 from public.event_guests eg where eg.guest_id = g.id and eg.rsvp_status = 'yes')
union all
select ts.wedding_id, ts.guest_id, g.full_name, 'unanswered'::text
  from public.touchpoint_sends ts
  join public.touchpoints t on t.id = ts.touchpoint_id and t.kind = 'rsvp_reminder'
  join public.guests g on g.id = ts.guest_id
  where ts.answered_at is null and ts.sent_at is not null;

-- ── build_touchpoint_sends: audience resolution + send-row creation ──────────
-- Returns the sends that still need an email (sent_at null) so the cron route can
-- deliver them via Resend and stamp. Idempotent: rows on conflict do nothing.
-- In public so the cron's service-role client can call it via rpc; locked to
-- service_role only (revoked from anon/authenticated → no advisor flag).
create or replace function public.build_touchpoint_sends(p_touchpoint uuid)
returns table (guest_id uuid, email text, full_name text, rsvp_code text, token text)
language plpgsql security definer set search_path = public as $$
declare t public.touchpoints; scope text;
begin
  select * into t from public.touchpoints where id = p_touchpoint;
  if not found then return; end if;
  scope := coalesce(t.audience_rule ->> 'scope', 'all_invited');

  insert into public.touchpoint_sends (touchpoint_id, guest_id, wedding_id)
  select p_touchpoint, g.id, g.wedding_id
  from public.guests g
  where g.wedding_id = t.wedding_id
    and g.email is not null and g.email <> ''
    and exists (select 1 from public.event_guests eg where eg.guest_id = g.id and eg.invited)
    and (scope <> 'non_responders' or not exists (
      select 1 from public.event_guests eg where eg.guest_id = g.id and eg.invited and eg.rsvp_status <> 'pending'
    ))
  on conflict do nothing;

  return query
  select ts.guest_id, g.email, g.full_name, g.rsvp_code::text, ts.token::text
  from public.touchpoint_sends ts
  join public.guests g on g.id = ts.guest_id
  where ts.touchpoint_id = p_touchpoint and ts.sent_at is null;
end $$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.guests enable row level security;
alter table public.event_guests enable row level security;
alter table public.touchpoints enable row level security;
alter table public.touchpoint_sends enable row level security;

-- guests: staff CRUD; couple SELECT + INSERT/UPDATE (they own the list), no delete.
drop policy if exists guests_select on public.guests;
create policy guests_select on public.guests for select to authenticated
  using (private.is_wedding_staff(wedding_id) or private.is_wedding_member(wedding_id));
drop policy if exists guests_insert on public.guests;
create policy guests_insert on public.guests for insert to authenticated
  with check (private.is_wedding_staff(wedding_id) or private.is_wedding_member(wedding_id));
drop policy if exists guests_update on public.guests;
create policy guests_update on public.guests for update to authenticated
  using (private.is_wedding_staff(wedding_id) or private.is_wedding_member(wedding_id))
  with check (private.is_wedding_staff(wedding_id) or private.is_wedding_member(wedding_id));
drop policy if exists guests_delete on public.guests;
create policy guests_delete on public.guests for delete to authenticated
  using (private.is_wedding_staff(wedding_id));

-- event_guests: staff CRUD; couple SELECT + UPDATE (prune/edit their invites).
drop policy if exists event_guests_select on public.event_guests;
create policy event_guests_select on public.event_guests for select to authenticated
  using (private.is_wedding_staff(wedding_id) or private.is_wedding_member(wedding_id));
drop policy if exists event_guests_write on public.event_guests;
create policy event_guests_write on public.event_guests for update to authenticated
  using (private.is_wedding_staff(wedding_id) or private.is_wedding_member(wedding_id))
  with check (private.is_wedding_staff(wedding_id) or private.is_wedding_member(wedding_id));
drop policy if exists event_guests_delete on public.event_guests;
create policy event_guests_delete on public.event_guests for delete to authenticated
  using (private.is_wedding_staff(wedding_id));

-- touchpoints + sends: staff write, couple read; anon touches nothing directly.
drop policy if exists touchpoints_select on public.touchpoints;
create policy touchpoints_select on public.touchpoints for select to authenticated
  using (private.is_wedding_staff(wedding_id) or private.is_wedding_member(wedding_id));
drop policy if exists touchpoints_write on public.touchpoints;
create policy touchpoints_write on public.touchpoints for all to authenticated
  using (private.is_wedding_staff(wedding_id)) with check (private.is_wedding_staff(wedding_id));
drop policy if exists touchpoint_sends_select on public.touchpoint_sends;
create policy touchpoint_sends_select on public.touchpoint_sends for select to authenticated
  using (private.is_wedding_staff(wedding_id) or private.is_wedding_member(wedding_id));

-- ── Grants (the 0004 regime: private is EXECUTE-closed by default) ───────────
-- Public rsvp wrappers + their private counterparts: anon AND authenticated (the
-- guest is anonymous — anon is the production path). Staff/couple entry point
-- (seed_touchpoints_for is trigger-driven; build_touchpoint_sends is service-role/
-- owner only). Nothing else opens.
-- The guest is anonymous, so the anon role must reach `private` (0004 granted
-- USAGE to authenticated/service_role only). Without this the public rsvp wrappers
-- 42501 for every guest — the M2 sev-fix, one role over.
grant usage on schema private to anon;
-- 0004's ALTER DEFAULT PRIVILEGES does not reliably close functions created in a
-- later migration (the default-privilege role context differs, and PGlite ignores
-- it entirely), so EXPLICITLY revoke this migration's new internal helpers — they
-- must run only via their trigger/definer paths, never be RPC/direct-callable.
revoke execute on function
  private.populate_eg_for_guest(), private.populate_eg_for_event(),
  private.seed_touchpoints_for(uuid), private.on_rsvp_deadline_set()
  from public, anon, authenticated;
grant execute on function
  private.rsvp_lookup(text), private.rsvp_submit(text, jsonb), private.touchpoint_open(text)
  to anon, authenticated;
grant execute on function private.log_guest_import(uuid, int) to authenticated;
grant execute on function
  public.rsvp_lookup(text), public.rsvp_submit(text, jsonb), public.touchpoint_open(text)
  to anon, authenticated;
-- The cron audience builder is service-role only.
revoke execute on function public.build_touchpoint_sends(uuid) from public, anon, authenticated;
grant execute on function public.build_touchpoint_sends(uuid) to service_role;
