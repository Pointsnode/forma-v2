-- 0012 floor plan & seating — the closed holes: law-bound chair (double-book +
-- capacity refusals), attending-only assignment, and the couple/day_of lanes
-- (couple can only when the plan allows; day_of never; all WITH rows present).
-- begin;…rollback; hermetic.
begin;

insert into auth.users (id, email) values
  ('11111111-0000-0000-0000-000000000001','staff@test.forma'),
  ('22222222-0000-0000-0000-000000000002','couple@test.forma'),
  ('44444444-0000-0000-0000-000000000004','dayof@test.forma');
insert into public.profiles (id, display_name) values
  ('11111111-0000-0000-0000-000000000001','Gio'),
  ('22222222-0000-0000-0000-000000000002','Darya'),
  ('44444444-0000-0000-0000-000000000004','Coord') on conflict do nothing;

insert into public.workspaces (id, kind, name, slug, created_by) values
  ('a0000000-0000-0000-0000-0000000000a1','studio','Atelier','atelier','11111111-0000-0000-0000-000000000001');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('a0000000-0000-0000-0000-0000000000a1','11111111-0000-0000-0000-000000000001','owner');
insert into public.weddings (id, workspace_id, slug, couple_display, kind, phase) values
  ('c0000000-0000-0000-0000-0000000000c1','a0000000-0000-0000-0000-0000000000a1','w1','Priya & Arjun','destination','details');
insert into public.wedding_members (wedding_id, user_id, role) values
  ('c0000000-0000-0000-0000-0000000000c1','22222222-0000-0000-0000-000000000002','partner'),
  ('c0000000-0000-0000-0000-0000000000c1','44444444-0000-0000-0000-000000000004','day_of');

insert into public.wedding_events (id, wedding_id, label, kind, order_index) values
  ('e0000000-0000-0000-0000-0000000000e1','c0000000-0000-0000-0000-0000000000c1','Sangeet','ritual',0);

-- three guests: two attending (yes), one pending. event_guests are auto-created by
-- the populate_eg_for_guest trigger — we just set invited + rsvp_status.
insert into public.guests (id, wedding_id, full_name) values
  ('91110000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-0000000000c1','Ana García'),
  ('91110000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-0000000000c1','Beto López'),
  ('91110000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-0000000000c1','Cata Ruiz');
update public.event_guests set invited = true, rsvp_status = 'yes'
  where event_id='e0000000-0000-0000-0000-0000000000e1' and guest_id in ('91110000-0000-0000-0000-000000000001','91110000-0000-0000-0000-000000000002');
update public.event_guests set invited = true, rsvp_status = 'pending'
  where event_id='e0000000-0000-0000-0000-0000000000e1' and guest_id = '91110000-0000-0000-0000-000000000003';

insert into public.floor_plans (id, wedding_id, event_id, name) values
  ('f0000000-0000-0000-0000-0000000000f1','c0000000-0000-0000-0000-0000000000c1','e0000000-0000-0000-0000-0000000000e1','Sangeet room');
insert into public.seating_tables (id, wedding_id, floor_plan_id, name, capacity, shape) values
  ('7ab10000-0000-0000-0000-0000000000a1','c0000000-0000-0000-0000-0000000000c1','f0000000-0000-0000-0000-0000000000f1','Table 1', 2, 'round');

-- ── (1) staff seats a guest on a SPECIFIC chair; seat_no + seat_ref agree ─────
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ declare s uuid; begin
  s := public.assign_seat('e0000000-0000-0000-0000-0000000000e1','91110000-0000-0000-0000-000000000001','7ab10000-0000-0000-0000-0000000000a1', 0);
  if (select seat_no from public.seats where id = s) <> 0 then raise exception 'TEST FAIL: seat_no not 0'; end if;
  if (select seat_ref from public.event_guests where event_id='e0000000-0000-0000-0000-0000000000e1' and guest_id='91110000-0000-0000-0000-000000000001') <> s then
    raise exception 'TEST FAIL: seat_ref not linked'; end if;
end $$;

-- ── (2) H3: the same chair refuses a second guest (human message) ────────────
do $$ begin
  begin perform public.assign_seat('e0000000-0000-0000-0000-0000000000e1','91110000-0000-0000-0000-000000000002','7ab10000-0000-0000-0000-0000000000a1', 0);
    raise exception 'TEST FAIL: double-booked chair accepted';
  exception when sqlstate 'FS041' then null; end;
end $$;

-- ── (3) H3: a chair beyond capacity refuses ──────────────────────────────────
do $$ begin
  begin perform public.assign_seat('e0000000-0000-0000-0000-0000000000e1','91110000-0000-0000-0000-000000000002','7ab10000-0000-0000-0000-0000000000a1', 2);  -- cap 2 → seats 0,1
    raise exception 'TEST FAIL: over-capacity chair accepted';
  exception when sqlstate 'FS042' then null; end;
end $$;

-- ── (4) H4: a non-attending guest cannot be seated ───────────────────────────
do $$ begin
  begin perform public.assign_seat('e0000000-0000-0000-0000-0000000000e1','91110000-0000-0000-0000-000000000003','7ab10000-0000-0000-0000-0000000000a1', 1);  -- 'pending'
    raise exception 'TEST FAIL: non-attending guest seated';
  exception when sqlstate 'FS040' then null; end;
end $$;

-- ── (5) capacity shrink below an occupied chair refuses ──────────────────────
-- seat guest 2 on chair 1, then try to shrink capacity to 1
do $$ begin
  perform public.assign_seat('e0000000-0000-0000-0000-0000000000e1','91110000-0000-0000-0000-000000000002','7ab10000-0000-0000-0000-0000000000a1', 1);
  begin update public.seating_tables set capacity = 1 where id = '7ab10000-0000-0000-0000-0000000000a1';
    raise exception 'TEST FAIL: shrank capacity below an occupied chair';
  exception when sqlstate 'FS043' then null; end;
end $$;

-- ── (6) couple lane: OFF → the couple cannot seat; ON → she can ──────────────
set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ begin
  begin perform public.unseat('e0000000-0000-0000-0000-0000000000e1','91110000-0000-0000-0000-000000000001');
    raise exception 'TEST FAIL: couple unseated while couple_can_edit off';
  exception when sqlstate 'FV230' then null; end;
end $$;
reset role;
update public.floor_plans set couple_can_edit = true where id = 'f0000000-0000-0000-0000-0000000000f1';
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ begin
  perform public.unseat('e0000000-0000-0000-0000-0000000000e1','91110000-0000-0000-0000-000000000001');  -- now allowed
  if (select count(*) from public.seats where event_id='e0000000-0000-0000-0000-0000000000e1' and guest_id='91110000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'TEST FAIL: couple unseat did not free the chair'; end if;
  if (select actor_id from public.activity where verb='seat_unseated' order by created_at desc limit 1) <> '22222222-0000-0000-0000-000000000002' then
    raise exception 'TEST FAIL: couple unseat actor not the couple'; end if;
end $$;

-- ── (7) day_of NEVER writes, even with couple_can_edit on ────────────────────
set local request.jwt.claims = '{"sub":"44444444-0000-0000-0000-000000000004","role":"authenticated"}';
do $$ begin
  begin perform public.assign_seat('e0000000-0000-0000-0000-0000000000e1','91110000-0000-0000-0000-000000000001','7ab10000-0000-0000-0000-0000000000a1', 0);
    raise exception 'TEST FAIL: day_of seated a guest';
  exception when sqlstate 'FV230' then null; end;
end $$;

reset role;
select 'floor_plan: ALL TESTS PASSED' as result;
rollback;
