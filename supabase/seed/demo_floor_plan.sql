-- Demo floor plan — M9 showcase. STAGING ONLY, service-role, idempotent. Augments
-- the P&A Sangeet plan into the stress-case: 8 mixed tables spread out + stage/
-- dancefloor/bar décor, couple_can_edit ON (Darya's lens), ~30 attending seated
-- with a few left unseated, and one seated-then-declined guest (the RSVP-flip
-- exception chip). Reception gets a sparse plan (proves per-event isolation).
do $$
declare
  v_wed uuid := 'd1a00001-0000-4000-a000-000000000001';
  v_sangeet uuid := 'd1a00001-0000-4000-a000-0000000000e3';
  v_reception uuid := 'd1a00001-0000-4000-a000-0000000000e5';
  v_plan uuid; tbl uuid; g record; seatn int; last_g uuid; ntables int;
begin
  select id into v_plan from public.floor_plans where event_id = v_sangeet order by created_at limit 1;
  if v_plan is null then
    insert into public.floor_plans (wedding_id, event_id, name, couple_can_edit) values (v_wed, v_sangeet, 'Sangeet — Terraza Vista', true) returning id into v_plan;
  else
    update public.floor_plans set couple_can_edit = true where id = v_plan;
  end if;

  -- a fuller attending pool for the stress case — but PRESERVE any 'no' (the
  -- exception guest stays declined across re-seeds).
  update public.event_guests set invited = true, rsvp_status = 'yes'
    where event_id = v_sangeet and rsvp_status <> 'no'
      and guest_id in (select guest_id from public.event_guests where event_id = v_sangeet order by guest_id limit 45);

  -- spread + reshape existing tables (round · round · banquet · rect, cycling)
  with ranked as (select id, (row_number() over (order by sort, created_at) - 1)::int as rn from public.seating_tables where floor_plan_id = v_plan)
  update public.seating_tables st set
    x = 240 + (r.rn % 4) * 240, y = 260 + (r.rn / 4) * 320,
    shape = (array['round','round','banquet','rect']::public.table_shape[])[(r.rn % 4) + 1],
    width = (array[150,150,240,200])[(r.rn % 4) + 1], height = (array[150,150,100,110])[(r.rn % 4) + 1],
    name = 'Mesa ' || (r.rn + 1)
  from ranked r where st.id = r.id;

  -- top up to 8 tables
  select count(*) into ntables from public.seating_tables where floor_plan_id = v_plan;
  while ntables < 8 loop
    insert into public.seating_tables (wedding_id, floor_plan_id, name, capacity, shape, x, y, width, height, sort)
      values (v_wed, v_plan, 'Mesa ' || (ntables + 1), 10, 'round', 240 + (ntables % 4) * 240, 260 + (ntables / 4) * 320, 150, 150, ntables);
    ntables := ntables + 1;
  end loop;

  if not exists (select 1 from public.floor_elements where floor_plan_id = v_plan) then
    insert into public.floor_elements (wedding_id, floor_plan_id, kind, label, x, y, width, height) values
      (v_wed, v_plan, 'stage','Escenario', 640, 80, 320, 90),
      (v_wed, v_plan, 'dancefloor','Pista', 640, 820, 300, 220),
      (v_wed, v_plan, 'bar','Barra', 1220, 100, 170, 80);
  end if;

  -- seat attending guests round-robin (least-full table), up to 30, on empty chairs
  for g in select eg.guest_id from public.event_guests eg
           where eg.event_id = v_sangeet and eg.rsvp_status = 'yes'
             and not exists (select 1 from public.seats se where se.event_id = v_sangeet and se.guest_id = eg.guest_id)
           order by eg.guest_id
           limit greatest(0, 30 - (select count(*) from public.seats where event_id = v_sangeet)) loop
    select st.id into tbl from public.seating_tables st where st.floor_plan_id = v_plan
      and (select count(*) from public.seats where table_id = st.id) < st.capacity
      order by (select count(*) from public.seats where table_id = st.id) limit 1;
    exit when tbl is null;
    -- the LOWEST FREE chair (heals A,B,C rather than leaving gaps from cascades)
    select coalesce(min(gs), 0) into seatn from generate_series(0, (select capacity from public.seating_tables where id = tbl) - 1) gs
      where gs not in (select seat_no from public.seats where table_id = tbl);
    insert into public.seats (wedding_id, table_id, event_id, guest_id, seat_no) values (v_wed, tbl, v_sangeet, g.guest_id, seatn) on conflict (event_id, guest_id) do nothing;
    last_g := g.guest_id;
  end loop;

  -- one seated-then-declined guest → the exception chip. Deterministic (smallest
  -- guest_id among the seated) so it survives re-seeds; the widen above preserves 'no'.
  if not exists (select 1 from public.seats se join public.event_guests eg on eg.event_id = se.event_id and eg.guest_id = se.guest_id where se.event_id = v_sangeet and eg.rsvp_status <> 'yes') then
    update public.event_guests set rsvp_status = 'no' where event_id = v_sangeet
      and guest_id = (select guest_id from public.seats where event_id = v_sangeet order by guest_id limit 1);
  end if;

  -- Reception: a sparse plan on the OTHER event proves per-event isolation
  if not exists (select 1 from public.floor_plans where event_id = v_reception) then
    insert into public.floor_plans (wedding_id, event_id, name) values (v_wed, v_reception, 'Reception — Salón principal') returning id into tbl;
    insert into public.seating_tables (wedding_id, floor_plan_id, name, capacity, shape, x, y) values (v_wed, tbl, 'Mesa de honor', 12, 'round', 320, 300);
  end if;
end $$;
