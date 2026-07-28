-- 0012 floor plan & seating (M9) — rebuild v1's konva artifact on v2's healed
-- foundations. Additive on 0008's floor_plans/seating_tables/seats (event-owned,
-- composite-FK'd — never rebuilt). Closes v1's five connectivity holes:
--   H1 wedding-scoped seating   → already healed (0008 is per-event)
--   H2 canvas ≠ list            → ONE entity: the seating table IS the canvas object
--   H3 lawless chair int        → seat_no NOT NULL + unique(table_id,seat_no) + capacity guard
--   H4 seatable ignored RSVPs   → assign_seat re-validates rsvp_status='yes' for THIS event
--   H5 couple editing bolted-on → couple write paths function-only from day one

do $$ begin create type public.table_shape as enum ('round','rect','banquet'); exception when duplicate_object then null; end $$;
do $$ begin create type public.floor_element_kind as enum
  ('stage','dancefloor','dj_booth','bar','buffet','cake_table','entrance','exit','restroom','photo_booth','lounge','custom');
  exception when duplicate_object then null; end $$;

-- ── H2: the seating table gains geometry — it IS the canvas object ────────────
alter table public.seating_tables add column if not exists shape public.table_shape not null default 'round';
alter table public.seating_tables add column if not exists x numeric not null default 40;
alter table public.seating_tables add column if not exists y numeric not null default 40;
alter table public.seating_tables add column if not exists rotation numeric not null default 0;
alter table public.seating_tables add column if not exists width numeric not null default 120;
alter table public.seating_tables add column if not exists height numeric not null default 120;
alter table public.seating_tables add column if not exists updated_at timestamptz not null default now();
drop trigger if exists touch_seating_tables on public.seating_tables;
create trigger touch_seating_tables before update on public.seating_tables for each row execute function private.touch_updated_at();

-- ── H2: décor lives in its own table — geometry + kind + label, NO capacity, no chairs
create table if not exists public.floor_elements (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  floor_plan_id uuid not null,
  kind public.floor_element_kind not null,
  label text,
  x numeric not null default 40,
  y numeric not null default 40,
  rotation numeric not null default 0,
  width numeric not null default 120,
  height numeric not null default 80,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, wedding_id),
  constraint floor_elements_plan_fk foreign key (floor_plan_id, wedding_id) references public.floor_plans (id, wedding_id) on delete cascade
);
create index if not exists floor_elements_plan_idx on public.floor_elements (floor_plan_id);
drop trigger if exists touch_floor_elements on public.floor_elements;
create trigger touch_floor_elements before update on public.floor_elements for each row execute function private.touch_updated_at();

-- ── the plan gains a canvas size + the couple-edit lens toggle ────────────────
alter table public.floor_plans add column if not exists canvas jsonb not null default '{"w":2000,"h":1200}'::jsonb;
alter table public.floor_plans add column if not exists couple_can_edit boolean not null default false;

-- ── H3: the chair becomes law-bound. Backfill existing seats sequentially per
-- table BEFORE the constraints/guards exist, then lock them down. seat_no is
-- 0-based (0 → chair A).
update public.seats s set seat_no = n.rn
  from (select id, (row_number() over (partition by table_id order by created_at) - 1)::int as rn from public.seats) n
  where s.id = n.id and s.seat_no is null;
alter table public.seats alter column seat_no set not null;
create unique index if not exists seats_table_seat_uniq on public.seats (table_id, seat_no);

-- a chair must be within its table's capacity
create or replace function private.guard_table_capacity()
returns trigger language plpgsql set search_path = public as $$
declare cap int;
begin
  select capacity into cap from public.seating_tables where id = new.table_id;
  if new.seat_no is null or new.seat_no < 0 or new.seat_no >= cap then
    raise exception 'seat is beyond this table''s capacity of %', cap using errcode = 'FS042';
  end if;
  return new;
end $$;
drop trigger if exists guard_table_capacity on public.seats;
create trigger guard_table_capacity before insert or update on public.seats for each row execute function private.guard_table_capacity();

-- shrinking capacity below an occupied chair refuses with the human message
create or replace function private.guard_capacity_shrink()
returns trigger language plpgsql set search_path = public as $$
declare hi int;
begin
  if new.capacity < old.capacity then
    select max(seat_no) into hi from public.seats where table_id = new.id;
    if hi is not null and hi >= new.capacity then
      raise exception 'chair % is taken — unseat before shrinking capacity', chr(65 + hi) using errcode = 'FS043';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_capacity_shrink on public.seating_tables;
create trigger guard_capacity_shrink before update on public.seating_tables for each row execute function private.guard_capacity_shrink();

-- ── seat lifecycle (widened): a specific chair, attending-only, staff + couple lanes
-- resolves the couple lane from the table's plan's couple_can_edit toggle.
create or replace function private.assign_seat(p_event uuid, p_guest uuid, p_table uuid, p_seat_no int)
returns uuid language plpgsql security definer set search_path = public as $$
declare w uuid; plan uuid; can_couple boolean; s uuid;
begin
  select st.wedding_id, st.floor_plan_id into w, plan from public.seating_tables st where st.id = p_table;
  if w is null then raise exception 'no such table' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(w) then
    select couple_can_edit into can_couple from public.floor_plans where id = plan;
    if not (coalesce(can_couple, false) and private.is_wedding_billing_member(w)) then
      raise exception 'not permitted' using errcode = 'FV230';
    end if;
  end if;
  -- H4: only a guest attending THIS event may be seated
  if not exists (select 1 from public.event_guests where event_id = p_event and guest_id = p_guest and rsvp_status = 'yes') then
    raise exception 'guest is not attending this event' using errcode = 'FS040';
  end if;
  -- H3: the chair can't be double-booked (friendly, before the unique constraint)
  if exists (select 1 from public.seats where table_id = p_table and seat_no = p_seat_no and guest_id <> p_guest) then
    raise exception 'chair % is already taken', chr(65 + p_seat_no) using errcode = 'FS041';
  end if;
  delete from public.seats where event_id = p_event and guest_id = p_guest;  -- reseat = move
  insert into public.seats (wedding_id, table_id, event_id, guest_id, seat_no)
    values (w, p_table, p_event, p_guest, p_seat_no) returning id into s;
  update public.event_guests set seat_ref = s where event_id = p_event and guest_id = p_guest;
  perform private.log_activity(w, (select auth.uid()), 'seat_assigned',
    (select full_name from public.guests where id = p_guest), jsonb_build_object('table_id', p_table, 'seat_no', p_seat_no, 'event_id', p_event));
  return s;
end $$;

create or replace function private.unseat(p_event uuid, p_guest uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid; plan uuid; can_couple boolean;
begin
  select eg.wedding_id into w from public.event_guests eg where eg.event_id = p_event and eg.guest_id = p_guest;
  if w is null then raise exception 'no such event guest' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(w) then
    select st.floor_plan_id into plan from public.seats se join public.seating_tables st on st.id = se.table_id
      where se.event_id = p_event and se.guest_id = p_guest;
    select couple_can_edit into can_couple from public.floor_plans where id = plan;
    if not (coalesce(can_couple, false) and private.is_wedding_billing_member(w)) then
      raise exception 'not permitted' using errcode = 'FV230';
    end if;
  end if;
  delete from public.seats where event_id = p_event and guest_id = p_guest;
  perform private.log_activity(w, (select auth.uid()), 'seat_unseated',
    (select full_name from public.guests where id = p_guest), jsonb_build_object('event_id', p_event));
end $$;

-- the couple's locked move (staff move geometry direct under RLS; this is the couple lane)
create or replace function private.move_floor_item(p_kind text, p_id uuid, p_x numeric, p_y numeric, p_rotation numeric)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid; plan uuid; can_couple boolean; v_staff boolean; v_name text;
begin
  if p_kind = 'table' then select wedding_id, floor_plan_id, name into w, plan, v_name from public.seating_tables where id = p_id;
  elsif p_kind = 'element' then select wedding_id, floor_plan_id, coalesce(label, kind::text) into w, plan, v_name from public.floor_elements where id = p_id;
  else raise exception 'bad kind' using errcode = 'FV000'; end if;
  if w is null then raise exception 'no such item' using errcode = 'FV000'; end if;
  v_staff := private.is_wedding_staff(w);
  if not v_staff then
    select couple_can_edit into can_couple from public.floor_plans where id = plan;
    if not (coalesce(can_couple, false) and private.is_wedding_billing_member(w)) then
      raise exception 'not permitted' using errcode = 'FV230';
    end if;
  end if;
  if p_kind = 'table' then update public.seating_tables set x = p_x, y = p_y, rotation = coalesce(p_rotation, rotation) where id = p_id;
  else update public.floor_elements set x = p_x, y = p_y, rotation = coalesce(p_rotation, rotation) where id = p_id; end if;
  -- log only the couple's moves (a planner wants to know the couple rearranged the
  -- room); staff geometry (incl. transform/resize via direct RLS) doesn't log —
  -- avoids flooding the feed with a drag session's dozens of saves. summary = the
  -- moved item's name (never null — activity.summary is NOT NULL).
  if not v_staff then
    perform private.log_activity(w, (select auth.uid()), 'floor_plan_updated', coalesce(v_name, p_kind), jsonb_build_object('floor_plan_id', plan, 'kind', p_kind));
  end if;
end $$;

create or replace function private.set_couple_can_edit(p_plan uuid, p_on boolean)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid;
begin
  select wedding_id into w from public.floor_plans where id = p_plan;
  if w is null then raise exception 'no such plan' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(w) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  update public.floor_plans set couple_can_edit = p_on where id = p_plan;
end $$;

-- ── public wrappers: drop the old 3-arg assign_seat, expose the new surface ───
drop function if exists public.assign_seat(uuid, uuid, uuid);
drop function if exists private.assign_seat(uuid, uuid, uuid);
create or replace function public.assign_seat(p_event uuid, p_guest uuid, p_table uuid, p_seat_no int)
returns uuid language sql security invoker set search_path = public as $$ select private.assign_seat(p_event, p_guest, p_table, p_seat_no); $$;
create or replace function public.unseat(p_event uuid, p_guest uuid)
returns void language sql security invoker set search_path = public as $$ select private.unseat(p_event, p_guest); $$;
create or replace function public.move_floor_item(p_kind text, p_id uuid, p_x numeric, p_y numeric, p_rotation numeric)
returns void language sql security invoker set search_path = public as $$ select private.move_floor_item(p_kind, p_id, p_x, p_y, p_rotation); $$;
create or replace function public.set_couple_can_edit(p_plan uuid, p_on boolean)
returns void language sql security invoker set search_path = public as $$ select private.set_couple_can_edit(p_plan, p_on); $$;

-- ── RLS: floor_elements = staff CRUD + any wedding member SELECT (day_of runs the
-- room on the day; names-on-a-chart are visible to them — documented). Others reuse
-- 0008's *_staff/*_member policies.
alter table public.floor_elements enable row level security;
drop policy if exists floor_elements_staff on public.floor_elements;
create policy floor_elements_staff on public.floor_elements for all to authenticated
  using (private.is_wedding_staff(wedding_id)) with check (private.is_wedding_staff(wedding_id));
drop policy if exists floor_elements_member on public.floor_elements;
create policy floor_elements_member on public.floor_elements for select to authenticated
  using (private.is_wedding_member(wedding_id));

-- ═══ Grants (§11) — authenticated entry points; nothing anon; matrix stays 9 ══
revoke execute on function private.guard_table_capacity(), private.guard_capacity_shrink() from public, anon, authenticated;
revoke execute on function
  private.assign_seat(uuid, uuid, uuid, int), private.unseat(uuid, uuid),
  private.move_floor_item(text, uuid, numeric, numeric, numeric), private.set_couple_can_edit(uuid, boolean),
  public.assign_seat(uuid, uuid, uuid, int), public.unseat(uuid, uuid),
  public.move_floor_item(text, uuid, numeric, numeric, numeric), public.set_couple_can_edit(uuid, boolean)
  from public, anon;
grant execute on function
  private.assign_seat(uuid, uuid, uuid, int), private.unseat(uuid, uuid),
  private.move_floor_item(text, uuid, numeric, numeric, numeric), private.set_couple_can_edit(uuid, boolean),
  public.assign_seat(uuid, uuid, uuid, int), public.unseat(uuid, uuid),
  public.move_floor_item(text, uuid, numeric, numeric, numeric), public.set_couple_can_edit(uuid, boolean)
  to authenticated;
