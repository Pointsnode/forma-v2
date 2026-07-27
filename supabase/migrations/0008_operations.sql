-- 0008_operations — M6. The wedding becomes a day: run of show, menus, seating,
-- tasks, documents, design boards; menu collection on the tokenized guest surface;
-- Phase-4 live check-off + day-of extras + close. SCHEMA §8 normative + §1 amends.
-- Grant law (§11): new private helpers revoked from public/anon/authenticated; the
-- anon surface grows to menu_lookup/menu_submit (people.sql sweep updated same change).

-- ── enums ────────────────────────────────────────────────────────────────────
do $$ begin create type public.document_source as enum ('upload','contract_artifact','vendor_file','touchpoint'); exception when duplicate_object then null; end $$;
do $$ begin create type public.goal_override_status as enum ('manual_done','dismissed'); exception when duplicate_object then null; end $$;

-- ── schedule_items (run of show — event-owned, NOT NULL event) ────────────────
create table if not exists public.schedule_items (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  event_id uuid not null,
  time time,
  title text not null,
  detail text,
  sort int not null default 0,
  done_at timestamptz,
  done_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint schedule_event_fk foreign key (event_id, wedding_id) references public.wedding_events (id, wedding_id) on delete cascade
);
create index if not exists schedule_wedding_idx on public.schedule_items (wedding_id);
create index if not exists schedule_event_idx on public.schedule_items (event_id);

-- ── menus + options (event-owned) ────────────────────────────────────────────
create table if not exists public.menus (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  event_id uuid not null,
  title text not null,
  notes text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, wedding_id),
  constraint menus_event_fk foreign key (event_id, wedding_id) references public.wedding_events (id, wedding_id) on delete cascade
);
create index if not exists menus_wedding_idx on public.menus (wedding_id);
create index if not exists menus_event_idx on public.menus (event_id);

create table if not exists public.menu_options (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null,
  wedding_id uuid not null,
  label text not null,
  diet_tags text[] not null default '{}',
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, wedding_id),
  constraint menu_options_menu_fk foreign key (menu_id, wedding_id) references public.menus (id, wedding_id) on delete cascade
);
create index if not exists menu_options_menu_idx on public.menu_options (menu_id);

-- ── seating (floor plans → tables → seats; event-owned) ──────────────────────
create table if not exists public.floor_plans (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  event_id uuid not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, wedding_id),
  constraint floor_plans_event_fk foreign key (event_id, wedding_id) references public.wedding_events (id, wedding_id) on delete cascade
);
create index if not exists floor_plans_wedding_idx on public.floor_plans (wedding_id);

create table if not exists public.seating_tables (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  floor_plan_id uuid not null,
  name text not null,
  capacity int not null default 8,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, wedding_id),
  constraint seating_tables_plan_fk foreign key (floor_plan_id, wedding_id) references public.floor_plans (id, wedding_id) on delete cascade
);
create index if not exists seating_tables_plan_idx on public.seating_tables (floor_plan_id);

-- a seat belongs to a table AND to an event-guest — the §8 law: a guest can only
-- be seated at their own event, enforced by the composite FK to event_guests.
create table if not exists public.seats (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  table_id uuid not null,
  seat_no int,
  event_id uuid not null,
  guest_id uuid not null,
  created_at timestamptz not null default now(),
  unique (id, wedding_id),
  constraint seats_table_fk foreign key (table_id, wedding_id) references public.seating_tables (id, wedding_id) on delete cascade,
  constraint seats_eventguest_fk foreign key (event_id, guest_id) references public.event_guests (event_id, guest_id) on delete cascade
);
create index if not exists seats_table_idx on public.seats (table_id);
-- one seat per (event, guest)
create unique index if not exists seats_one_per_event_guest on public.seats (event_id, guest_id);

-- ── event_guests widening (menu choice + seat, both additive/nullable) ───────
alter table public.event_guests add column if not exists menu_choice_id uuid;
alter table public.event_guests add column if not exists seat_ref uuid;
do $$ begin
  alter table public.event_guests add constraint event_guests_menu_fk
    foreign key (menu_choice_id, wedding_id) references public.menu_options (id, wedding_id) on delete set null (menu_choice_id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.event_guests add constraint event_guests_seat_fk
    foreign key (seat_ref, wedding_id) references public.seats (id, wedding_id) on delete set null (seat_ref);
exception when duplicate_object then null; end $$;

-- ── tasks (residue surface — wedding XOR workspace) ──────────────────────────
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  title text not null,
  due_date date,
  done_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  engagement_id uuid, contract_id uuid, event_id uuid, proposal_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (num_nonnulls(wedding_id, workspace_id) = 1),
  constraint tasks_wedding_fk foreign key (wedding_id) references public.weddings (id) on delete cascade,
  constraint tasks_engagement_fk foreign key (engagement_id, wedding_id) references public.wedding_vendors (id, wedding_id) on delete set null (engagement_id),
  constraint tasks_contract_fk foreign key (contract_id, wedding_id) references public.contracts (id, wedding_id) on delete set null (contract_id),
  constraint tasks_event_fk foreign key (event_id, wedding_id) references public.wedding_events (id, wedding_id) on delete set null (event_id),
  constraint tasks_proposal_fk foreign key (proposal_id, wedding_id) references public.proposals (id, wedding_id) on delete set null (proposal_id)
);
create index if not exists tasks_wedding_idx on public.tasks (wedding_id);
create index if not exists tasks_workspace_idx on public.tasks (workspace_id);

-- ── wedding_goal_overrides (What's-next: only what detection can't see) ──────
create table if not exists public.wedding_goal_overrides (
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  goal_key text not null,
  status public.goal_override_status not null,
  set_by uuid references public.profiles (id) on delete set null,
  note text,
  updated_at timestamptz not null default now(),
  primary key (wedding_id, goal_key)
);

-- ── documents (§8 + amendment B: absorbs the contract-artifact bridge) ───────
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  title text not null,
  source public.document_source not null default 'upload',
  storage_path text,
  engagement_id uuid, contract_id uuid, event_id uuid,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(wedding_id, workspace_id) = 1),
  constraint documents_wedding_fk foreign key (wedding_id) references public.weddings (id) on delete cascade,
  constraint documents_engagement_fk foreign key (engagement_id, wedding_id) references public.wedding_vendors (id, wedding_id) on delete set null (engagement_id),
  constraint documents_contract_fk foreign key (contract_id, wedding_id) references public.contracts (id, wedding_id) on delete set null (contract_id),
  constraint documents_event_fk foreign key (event_id, wedding_id) references public.wedding_events (id, wedding_id) on delete set null (event_id)
);
create index if not exists documents_wedding_idx on public.documents (wedding_id);
create index if not exists documents_contract_idx on public.documents (contract_id);
-- one artifact document per contract (idempotent bridge)
create unique index if not exists documents_contract_artifact_uniq on public.documents (contract_id) where source = 'contract_artifact';

-- ── design boards + items ────────────────────────────────────────────────────
create table if not exists public.design_boards (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  title text not null,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, wedding_id)
);
create index if not exists design_boards_wedding_idx on public.design_boards (wedding_id);

create table if not exists public.design_items (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null,
  wedding_id uuid not null,
  title text not null,
  note text,
  storage_path text,
  event_id uuid,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (id, wedding_id),
  constraint design_items_board_fk foreign key (board_id, wedding_id) references public.design_boards (id, wedding_id) on delete cascade,
  constraint design_items_event_fk foreign key (event_id, wedding_id) references public.wedding_events (id, wedding_id) on delete set null (event_id)
);
create index if not exists design_items_board_idx on public.design_items (board_id);

-- ── proposals widen (final planned subjects: menu_id, design_item_id) ────────
-- Note: proposals has no quote_id column (M4 added engagement_id only); the CHECK
-- widens over the actual subjects.
alter table public.proposals add column if not exists menu_id uuid;
alter table public.proposals add column if not exists design_item_id uuid;
do $$ begin
  alter table public.proposals add constraint proposals_menu_fk foreign key (menu_id, wedding_id) references public.menus (id, wedding_id) on delete set null (menu_id);
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.proposals add constraint proposals_design_fk foreign key (design_item_id, wedding_id) references public.design_items (id, wedding_id) on delete set null (design_item_id);
exception when duplicate_object then null; end $$;
alter table public.proposals drop constraint if exists proposals_one_subject;
alter table public.proposals add constraint proposals_one_subject check (num_nonnulls(event_ref, engagement_id, menu_id, design_item_id) <= 1);

-- ── touch triggers ───────────────────────────────────────────────────────────
drop trigger if exists touch_schedule_items on public.schedule_items;
create trigger touch_schedule_items before update on public.schedule_items for each row execute function private.touch_updated_at();
drop trigger if exists touch_menus on public.menus;
create trigger touch_menus before update on public.menus for each row execute function private.touch_updated_at();
drop trigger if exists touch_floor_plans on public.floor_plans;
create trigger touch_floor_plans before update on public.floor_plans for each row execute function private.touch_updated_at();
drop trigger if exists touch_tasks on public.tasks;
create trigger touch_tasks before update on public.tasks for each row execute function private.touch_updated_at();
drop trigger if exists touch_design_boards on public.design_boards;
create trigger touch_design_boards before update on public.design_boards for each row execute function private.touch_updated_at();

-- ═══ helpers ═════════════════════════════════════════════════════════════════
-- A billing/couple member is a wedding member who is NOT a day_of coordinator —
-- day_of sees the run of show, never money/contracts/guest contact.
create or replace function private.is_wedding_billing_member(w uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.wedding_members m where m.wedding_id = w and m.user_id = (select auth.uid()) and m.role <> 'day_of');
$$;

-- ═══ operations functions (staff unless noted; each logs activity) ══════════
create or replace function private.check_schedule_item(p_item uuid, p_done boolean)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid; ttl text; was timestamptz;
begin
  select wedding_id, title, done_at into w, ttl, was from public.schedule_items where id = p_item;
  if w is null then raise exception 'no such item' using errcode = 'FV000'; end if;
  if not (private.is_wedding_staff(w) or private.is_wedding_member(w)) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if p_done then
    update public.schedule_items set done_at = coalesce(done_at, now()), done_by = (select auth.uid()) where id = p_item;
    if was is null then perform private.log_activity(w, (select auth.uid()), 'schedule_checked', ttl, jsonb_build_object('item_id', p_item)); end if;
  else
    update public.schedule_items set done_at = null, done_by = null where id = p_item;
  end if;
end $$;

create or replace function private.lock_menu(p_menu uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid; ttl text;
begin
  select wedding_id, title into w, ttl from public.menus where id = p_menu;
  if w is null then raise exception 'no such menu' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(w) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  update public.menus set locked_at = coalesce(locked_at, now()) where id = p_menu;
  perform private.log_activity(w, (select auth.uid()), 'menu_locked', ttl, jsonb_build_object('menu_id', p_menu));
end $$;

create or replace function private.unlock_menu(p_menu uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid;
begin
  select wedding_id into w from public.menus where id = p_menu;
  if w is null then raise exception 'no such menu' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(w) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  update public.menus set locked_at = null where id = p_menu;
end $$;

-- assign a confirmed guest to a seat at their own event (structurally enforced)
create or replace function private.assign_seat(p_event uuid, p_guest uuid, p_table uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare w uuid; s uuid;
begin
  select wedding_id into w from public.seating_tables where id = p_table;
  if w is null then raise exception 'no such table' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(w) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  delete from public.seats where event_id = p_event and guest_id = p_guest;  -- reseat = move
  insert into public.seats (wedding_id, table_id, event_id, guest_id) values (w, p_table, p_event, p_guest) returning id into s;
  update public.event_guests set seat_ref = s where event_id = p_event and guest_id = p_guest;
  return s;
end $$;

create or replace function private.unseat(p_event uuid, p_guest uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid;
begin
  select wedding_id into w from public.event_guests where event_id = p_event and guest_id = p_guest;
  if w is null then raise exception 'no such event guest' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(w) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  delete from public.seats where event_id = p_event and guest_id = p_guest;
end $$;

-- day-of extras land on the ledger as a due line (they block close until settled)
create or replace function private.add_day_of_extra(p_wedding uuid, p_event uuid, p_title text, p_amount numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare l uuid;
begin
  if not private.is_wedding_staff(p_wedding) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  insert into public.ledger_lines (wedding_id, title, amount, status, kind, event_id)
    values (p_wedding, p_title, p_amount, 'due', 'day_of_extra', p_event) returning id into l;
  perform private.log_activity(p_wedding, (select auth.uid()), 'day_of_extra_added', p_title, jsonb_build_object('ledger_line_id', l));
  return l;
end $$;

-- ── 3→4 becomes date-driven (§1F / §9): the first event's date has arrived ────
create or replace function private.advance_wedding_phase(w uuid)
returns public.wedding_phase language plpgsql security definer set search_path = public as $$
declare wd public.weddings; wk public.workspace_kind; undated int; unvenued int; ok boolean; firstd date;
begin
  select * into wd from public.weddings where id = w;
  if not found then raise exception 'wedding % not found', w using errcode = 'FV000'; end if;
  if (select auth.uid()) is not null and not private.is_wedding_staff(w) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  select kind into wk from public.workspaces where id = wd.workspace_id;
  if wd.phase = 'hiring' then
    if wk = 'couple' then update public.weddings set phase = 'foundations' where id = w; return 'foundations'; end if;
    select exists (select 1 from public.contracts c join public.ledger_lines l on l.contract_id = c.id and l.wedding_id = c.wedding_id
      where c.wedding_id = w and c.kind = 'planner_agreement' and c.status = 'completed' and l.kind = 'planner_fee' and l.status = 'paid') into ok;
    if not ok then raise exception 'planner agreement must complete and its deposit be paid' using errcode = 'FV101'; end if;
    update public.weddings set phase = 'foundations' where id = w;
    perform private.log_activity(w, (select auth.uid()), 'phase_advanced', 'foundations', jsonb_build_object('phase','foundations'));
    return 'foundations';
  elsif wd.phase = 'foundations' then
    if coalesce(wd.budget_total, 0) <= 0 then raise exception 'budget must be set above zero' using errcode = 'FV201'; end if;
    if coalesce(wd.guest_target, 0) <= 0 then raise exception 'a guest target is required' using errcode = 'FV202'; end if;
    if wd.location_city is null or wd.location_country is null then raise exception 'the location must be set' using errcode = 'FV203'; end if;
    select count(*) into undated from public.wedding_events where wedding_id = w and event_date is null;
    if undated > 0 then raise exception '% event(s) still need a date', undated using errcode = 'FV204'; end if;
    select count(*) into unvenued from public.wedding_events e where e.wedding_id = w and not exists (select 1 from public.event_vendors ev where ev.event_id = e.id and ev.venue_booked);
    if unvenued > 0 then raise exception '% event(s) still need a booked venue', unvenued using errcode = 'FV205'; end if;
    update public.weddings set phase = 'details' where id = w;
    perform private.log_activity(w, (select auth.uid()), 'phase_advanced', 'details', jsonb_build_object('phase','details'));
    return 'details';
  elsif wd.phase = 'details' then
    select min(event_date) into firstd from public.wedding_events where wedding_id = w and event_date is not null;
    if firstd is null or firstd > current_date then raise exception 'the wedding days have not arrived yet' using errcode = 'FV301'; end if;
    update public.weddings set phase = 'wedding_days' where id = w;
    perform private.log_activity(w, (select auth.uid()), 'phase_advanced', 'wedding_days', jsonb_build_object('phase','wedding_days'));
    return 'wedding_days';
  elsif wd.phase = 'wedding_days' then
    raise exception 'closing runs through close_wedding, not advance' using errcode = 'FV401';
  else
    raise exception 'the wedding is already closed' using errcode = 'FV299';
  end if;
end $$;

-- close_wedding also logs + is unchanged from 0007's predicate; the M6 UI calls the
-- existing public.close_wedding wrapper (defined in 0007).

-- ── contract completion now ALSO files a documents row (amendment B) ─────────
create or replace function private.on_contract_completed()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed' then
    if new.kind = 'venue' and new.engagement_id is not null then
      perform set_config('forma.eng_via_fn', 'on', true);
      update public.wedding_vendors set status = 'booked' where id = new.engagement_id and status in ('quoted','shortlisted','presented','quote_requested');
      perform set_config('forma.eng_via_fn', 'off', true);
      perform private.log_activity(new.wedding_id, null, 'engagement_booked',
        (select v.name from public.wedding_vendors wv join public.vendors v on v.id = wv.vendor_id where wv.id = new.engagement_id), jsonb_build_object('engagement_id', new.engagement_id));
    end if;
    -- the artifact bridge: a documents row for the stamped copy (idempotent)
    if new.artifact_path is not null then
      insert into public.documents (wedding_id, title, source, storage_path, contract_id)
        values (new.wedding_id, new.title, 'contract_artifact', new.artifact_path, new.id)
        on conflict (contract_id) where (source = 'contract_artifact') do nothing;
      perform private.log_activity(new.wedding_id, null, 'document_filed', new.title, jsonb_build_object('contract_id', new.id));
    end if;
    perform private.run_phase1_gate(new.wedding_id);
  end if;
  return new;
end $$;
-- (trigger already bound in 0007; CREATE OR REPLACE swaps the body)

-- ═══ the anon menu surface (amendment C) ═════════════════════════════════════
-- menu_lookup(code): the guest's attending events that have an unlocked menu with
-- options, plus their current choice. Same 16-hex rsvp_code as RSVP.
create or replace function private.menu_lookup(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare g public.guests;
begin
  if p_code !~ '^[a-f0-9]{16}$' then raise exception 'malformed code' using errcode = 'FM013'; end if;
  select * into g from public.guests where rsvp_code = p_code;
  if not found then raise exception 'no such guest' using errcode = 'FM010'; end if;
  return jsonb_build_object(
    'guest', jsonb_build_object('full_name', g.full_name),
    'events', coalesce((
      select jsonb_agg(jsonb_build_object(
        'event_id', e.id, 'label', e.label, 'menu_id', m.id, 'locked', m.locked_at is not null,
        'choice_id', eg.menu_choice_id,
        'options', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label, 'diet_tags', o.diet_tags) order by o.sort) from public.menu_options o where o.menu_id = m.id), '[]'::jsonb)
      ) order by e.event_date nulls last, e.order_index)
      from public.event_guests eg
      join public.wedding_events e on e.id = eg.event_id
      join public.menus m on m.event_id = e.id
      where eg.guest_id = g.id and eg.invited and eg.rsvp_status = 'yes'
        and exists (select 1 from public.menu_options o2 where o2.menu_id = m.id)
    ), '[]'::jsonb));
end $$;

create or replace function private.menu_submit(p_code text, p_payload jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare g public.guests; r jsonb; eid uuid; oid uuid; mlocked timestamptz;
begin
  if p_code !~ '^[a-f0-9]{16}$' then raise exception 'malformed code' using errcode = 'FM013'; end if;
  select * into g from public.guests where rsvp_code = p_code for update;
  if not found then raise exception 'no such guest' using errcode = 'FM010'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_payload -> 'choices', '[]'::jsonb)) loop
    eid := (r ->> 'event_id')::uuid;
    oid := nullif(r ->> 'option_id', '')::uuid;
    -- must be attending this event
    if not exists (select 1 from public.event_guests where event_id = eid and guest_id = g.id and rsvp_status = 'yes') then
      raise exception 'not attending that event' using errcode = 'FO012'; end if;
    -- menu must be unlocked
    select locked_at into mlocked from public.menus where event_id = eid;
    if mlocked is not null then raise exception 'menu is locked' using errcode = 'FO011'; end if;
    -- option (if given) must belong to that event's menu
    if oid is not null and not exists (
      select 1 from public.menu_options o join public.menus m on m.id = o.menu_id where o.id = oid and m.event_id = eid
    ) then raise exception 'option not on this menu' using errcode = 'FO014'; end if;
    update public.event_guests set menu_choice_id = oid where event_id = eid and guest_id = g.id;
  end loop;
  perform private.log_activity(g.wedding_id, null, 'guest_menu_chosen', g.full_name, jsonb_build_object('guest_id', g.id));
end $$;

-- ── build_touchpoint_sends: menu_collect + day_of_schedule audiences ─────────
create or replace function public.build_touchpoint_sends(p_touchpoint uuid)
returns table (guest_id uuid, email text, full_name text, rsvp_code text, token text)
language plpgsql security definer set search_path = public as $$
declare t public.touchpoints; scope text;
begin
  select * into t from public.touchpoints where id = p_touchpoint;
  if not found then return; end if;
  scope := coalesce(t.audience_rule ->> 'scope', 'all_invited');

  if t.kind = 'menu_collect' then
    insert into public.touchpoint_sends (touchpoint_id, guest_id, wedding_id)
    select p_touchpoint, g.id, g.wedding_id from public.guests g
    where g.wedding_id = t.wedding_id and g.email is not null and g.email <> ''
      and exists (
        select 1 from public.event_guests eg join public.menus m on m.event_id = eg.event_id
        where eg.guest_id = g.id and eg.rsvp_status = 'yes' and exists (select 1 from public.menu_options o where o.menu_id = m.id))
    on conflict do nothing;
  elsif t.kind = 'day_of_schedule' then
    insert into public.touchpoint_sends (touchpoint_id, guest_id, wedding_id)
    select p_touchpoint, g.id, g.wedding_id from public.guests g
    where g.wedding_id = t.wedding_id and g.email is not null and g.email <> ''
      and exists (select 1 from public.event_guests eg where eg.guest_id = g.id and eg.rsvp_status = 'yes')
    on conflict do nothing;
  else
    insert into public.touchpoint_sends (touchpoint_id, guest_id, wedding_id)
    select p_touchpoint, g.id, g.wedding_id from public.guests g
    where g.wedding_id = t.wedding_id and g.email is not null and g.email <> ''
      and exists (select 1 from public.event_guests eg where eg.guest_id = g.id and eg.invited)
      and (scope <> 'non_responders' or not exists (select 1 from public.event_guests eg where eg.guest_id = g.id and eg.invited and eg.rsvp_status <> 'pending'))
    on conflict do nothing;
  end if;

  return query
  select ts.guest_id, g.email, g.full_name, g.rsvp_code::text, ts.token::text
  from public.touchpoint_sends ts join public.guests g on g.id = ts.guest_id
  where ts.touchpoint_id = p_touchpoint and ts.sent_at is null;
end $$;

-- ═══ public invoker wrappers ═════════════════════════════════════════════════
create or replace function public.check_schedule_item(p_item uuid, p_done boolean) returns void language sql security invoker set search_path = public as $$ select private.check_schedule_item(p_item, p_done); $$;
create or replace function public.lock_menu(p_menu uuid) returns void language sql security invoker set search_path = public as $$ select private.lock_menu(p_menu); $$;
create or replace function public.unlock_menu(p_menu uuid) returns void language sql security invoker set search_path = public as $$ select private.unlock_menu(p_menu); $$;
create or replace function public.assign_seat(p_event uuid, p_guest uuid, p_table uuid) returns uuid language sql security invoker set search_path = public as $$ select private.assign_seat(p_event, p_guest, p_table); $$;
create or replace function public.unseat(p_event uuid, p_guest uuid) returns void language sql security invoker set search_path = public as $$ select private.unseat(p_event, p_guest); $$;
create or replace function public.add_day_of_extra(p_wedding uuid, p_event uuid, p_title text, p_amount numeric) returns uuid language sql security invoker set search_path = public as $$ select private.add_day_of_extra(p_wedding, p_event, p_title, p_amount); $$;
create or replace function public.menu_lookup(code text) returns jsonb language sql security invoker set search_path = public as $$ select private.menu_lookup(code); $$;
create or replace function public.menu_submit(code text, payload jsonb) returns void language sql security invoker set search_path = public as $$ select private.menu_submit(code, payload); $$;

-- ═══ documents backfill (amendment B): one row per completed contract artifact ═
insert into public.documents (wedding_id, title, source, storage_path, contract_id)
select c.wedding_id, c.title, 'contract_artifact', c.artifact_path, c.id
from public.contracts c
where c.status = 'completed' and c.artifact_path is not null
on conflict (contract_id) where (source = 'contract_artifact') do nothing;

-- ═══ RLS ═════════════════════════════════════════════════════════════════════
alter table public.schedule_items enable row level security;
alter table public.menus enable row level security;
alter table public.menu_options enable row level security;
alter table public.floor_plans enable row level security;
alter table public.seating_tables enable row level security;
alter table public.seats enable row level security;
alter table public.tasks enable row level security;
alter table public.wedding_goal_overrides enable row level security;
alter table public.documents enable row level security;
alter table public.design_boards enable row level security;
alter table public.design_items enable row level security;

-- event-owned ops: staff CRUD; any wedding member (incl. day_of) SELECT
do $$
declare tbl text;
begin
  foreach tbl in array array['schedule_items','menus','menu_options','floor_plans','seating_tables','seats'] loop
    execute format('drop policy if exists %I_staff on public.%I', tbl, tbl);
    execute format('create policy %I_staff on public.%I for all to authenticated using (private.is_wedding_staff(wedding_id)) with check (private.is_wedding_staff(wedding_id))', tbl, tbl);
    execute format('drop policy if exists %I_member on public.%I', tbl, tbl);
    execute format('create policy %I_member on public.%I for select to authenticated using (private.is_wedding_member(wedding_id))', tbl, tbl);
  end loop;
end $$;

-- design: staff + couple (billing) members read-write; day_of not
drop policy if exists design_boards_staff on public.design_boards;
create policy design_boards_staff on public.design_boards for all to authenticated using (private.is_wedding_staff(wedding_id) or private.is_wedding_billing_member(wedding_id)) with check (private.is_wedding_staff(wedding_id) or private.is_wedding_billing_member(wedding_id));
drop policy if exists design_items_staff on public.design_items;
create policy design_items_staff on public.design_items for all to authenticated using (private.is_wedding_staff(wedding_id) or private.is_wedding_billing_member(wedding_id)) with check (private.is_wedding_staff(wedding_id) or private.is_wedding_billing_member(wedding_id));

-- tasks: workspace tasks staff-only; wedding tasks staff CRUD + billing member SELECT
drop policy if exists tasks_workspace on public.tasks;
create policy tasks_workspace on public.tasks for all to authenticated using (workspace_id is not null and private.is_workspace_member(workspace_id)) with check (workspace_id is not null and private.is_workspace_member(workspace_id));
drop policy if exists tasks_wedding_staff on public.tasks;
create policy tasks_wedding_staff on public.tasks for all to authenticated using (wedding_id is not null and private.is_wedding_staff(wedding_id)) with check (wedding_id is not null and private.is_wedding_staff(wedding_id));
drop policy if exists tasks_wedding_member on public.tasks;
create policy tasks_wedding_member on public.tasks for select to authenticated using (wedding_id is not null and private.is_wedding_billing_member(wedding_id));

drop policy if exists goal_overrides_staff on public.wedding_goal_overrides;
create policy goal_overrides_staff on public.wedding_goal_overrides for all to authenticated using (private.is_wedding_staff(wedding_id)) with check (private.is_wedding_staff(wedding_id));
drop policy if exists goal_overrides_member on public.wedding_goal_overrides;
create policy goal_overrides_member on public.wedding_goal_overrides for select to authenticated using (private.is_wedding_billing_member(wedding_id));

-- documents: staff CRUD; billing members SELECT + INSERT (source upload)
drop policy if exists documents_staff on public.documents;
create policy documents_staff on public.documents for all to authenticated using (wedding_id is not null and private.is_wedding_staff(wedding_id)) with check (wedding_id is not null and private.is_wedding_staff(wedding_id));
drop policy if exists documents_ws_staff on public.documents;
create policy documents_ws_staff on public.documents for all to authenticated using (workspace_id is not null and private.is_workspace_member(workspace_id)) with check (workspace_id is not null and private.is_workspace_member(workspace_id));
drop policy if exists documents_member_read on public.documents;
create policy documents_member_read on public.documents for select to authenticated using (wedding_id is not null and private.is_wedding_billing_member(wedding_id));
drop policy if exists documents_member_upload on public.documents;
create policy documents_member_upload on public.documents for insert to authenticated with check (wedding_id is not null and private.is_wedding_billing_member(wedding_id) and source = 'upload');

-- day_of must NOT see money/contracts/guests — re-scope M5/M3 member reads to
-- billing members (excludes day_of). (CREATE OR REPLACE the merged policies.)
drop policy if exists ledger_member_read on public.ledger_lines;
create policy ledger_member_read on public.ledger_lines for select to authenticated using (private.is_wedding_billing_member(wedding_id));
drop policy if exists contracts_member_read on public.contracts;
create policy contracts_member_read on public.contracts for select to authenticated using (private.is_wedding_billing_member(wedding_id));
drop policy if exists fee_payments_read on public.fee_payments;
create policy fee_payments_read on public.fee_payments for select to authenticated using (private.is_wedding_staff(wedding_id) or private.is_wedding_billing_member(wedding_id));

-- day_of gets the run of show and NOTHING else — re-scope the M3/M4 guest, vendor
-- and quote member reads to billing members (partner/family). day_of never reads
-- guest contact detail, vendor/quote surfaces, or the money rollup.
drop policy if exists guests_select on public.guests;
create policy guests_select on public.guests for select to authenticated using (private.is_wedding_staff(wedding_id) or private.is_wedding_billing_member(wedding_id));
drop policy if exists guests_insert on public.guests;
create policy guests_insert on public.guests for insert to authenticated with check (private.is_wedding_staff(wedding_id) or private.is_wedding_billing_member(wedding_id));
drop policy if exists guests_update on public.guests;
create policy guests_update on public.guests for update to authenticated using (private.is_wedding_staff(wedding_id) or private.is_wedding_billing_member(wedding_id)) with check (private.is_wedding_staff(wedding_id) or private.is_wedding_billing_member(wedding_id));
drop policy if exists event_guests_select on public.event_guests;
create policy event_guests_select on public.event_guests for select to authenticated using (private.is_wedding_staff(wedding_id) or private.is_wedding_billing_member(wedding_id));
drop policy if exists event_guests_write on public.event_guests;
create policy event_guests_write on public.event_guests for update to authenticated using (private.is_wedding_staff(wedding_id) or private.is_wedding_billing_member(wedding_id)) with check (private.is_wedding_staff(wedding_id) or private.is_wedding_billing_member(wedding_id));
drop policy if exists wedding_vendors_select on public.wedding_vendors;
create policy wedding_vendors_select on public.wedding_vendors for select to authenticated using (private.is_wedding_staff(wedding_id) or private.is_wedding_billing_member(wedding_id));
drop policy if exists event_vendors_select on public.event_vendors;
create policy event_vendors_select on public.event_vendors for select to authenticated using (private.is_wedding_staff(wedding_id) or private.is_wedding_billing_member(wedding_id));
drop policy if exists quotes_select on public.quotes;
create policy quotes_select on public.quotes for select to authenticated using (private.is_wedding_staff(wedding_id) or private.is_wedding_billing_member(wedding_id));

-- the money rollup returns NO row to day_of (budget_total rides the weddings row,
-- which every member can read; the rollup is the money surface, so it is guarded).
create or replace view public.wedding_money_rollup with (security_invoker = true) as
  select w.id as wedding_id, w.budget_total,
    coalesce(sum(l.amount) filter (where l.status in ('paid','settled')), 0) as paid,
    coalesce(sum(l.amount) filter (where l.contract_id is not null and l.status in ('expected','scheduled','due')), 0) as committed,
    coalesce(w.budget_total, 0) - coalesce(sum(l.amount) filter (where l.status in ('paid','settled')), 0) - coalesce(sum(l.amount) filter (where l.contract_id is not null and l.status in ('expected','scheduled','due')), 0) as open
  from public.weddings w left join public.ledger_lines l on l.wedding_id = w.id
  where private.is_wedding_staff(w.id) or private.is_wedding_billing_member(w.id)
  group by w.id, w.budget_total;

-- ═══ Grants (§11) ════════════════════════════════════════════════════════════
revoke execute on function
  private.is_wedding_billing_member(uuid), private.check_schedule_item(uuid, boolean), private.lock_menu(uuid), private.unlock_menu(uuid),
  private.assign_seat(uuid, uuid, uuid), private.unseat(uuid, uuid), private.add_day_of_extra(uuid, uuid, text, numeric),
  private.menu_lookup(text), private.menu_submit(text, jsonb)
  from public, anon, authenticated;
grant execute on function private.is_wedding_billing_member(uuid) to authenticated;

-- staff/member entry points → authenticated
revoke execute on function
  public.check_schedule_item(uuid, boolean), public.lock_menu(uuid), public.unlock_menu(uuid),
  public.assign_seat(uuid, uuid, uuid), public.unseat(uuid, uuid), public.add_day_of_extra(uuid, uuid, text, numeric)
  from public, anon;
grant execute on function
  public.check_schedule_item(uuid, boolean), public.lock_menu(uuid), public.unlock_menu(uuid),
  public.assign_seat(uuid, uuid, uuid), public.unseat(uuid, uuid), public.add_day_of_extra(uuid, uuid, text, numeric)
  to authenticated;
grant execute on function
  private.check_schedule_item(uuid, boolean), private.lock_menu(uuid), private.unlock_menu(uuid),
  private.assign_seat(uuid, uuid, uuid), private.unseat(uuid, uuid), private.add_day_of_extra(uuid, uuid, text, numeric)
  to authenticated;

-- the anon menu surface (deliberate allowlist growth — sweep updated same change)
revoke execute on function public.menu_lookup(text), public.menu_submit(text, jsonb), private.menu_lookup(text), private.menu_submit(text, jsonb) from public;
grant execute on function public.menu_lookup(text), public.menu_submit(text, jsonb), private.menu_lookup(text), private.menu_submit(text, jsonb) to anon, authenticated;

-- build_touchpoint_sends stays service_role only
revoke execute on function public.build_touchpoint_sends(uuid) from public, anon, authenticated;
grant execute on function public.build_touchpoint_sends(uuid) to service_role;
