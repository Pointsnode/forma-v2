-- 0008 operations — seat law (cross-wedding + wrong-event structurally rejected),
-- menu collection (lock/attending gates), day_of sees the run of show but not the
-- ledger, close blocked by an open line then passes, documents backfill idempotent.
-- Reads under reset role (RLS-hidden rows false-pass as NULL under a role). Hermetic.
begin;

insert into auth.users (id, email) values
  ('11111111-0000-0000-0000-000000000001','staff@test.forma'),
  ('22222222-0000-0000-0000-000000000002','couple@test.forma'),
  ('44444444-0000-0000-0000-000000000004','dayof@test.forma');
insert into public.profiles (id, display_name) values
  ('11111111-0000-0000-0000-000000000001','Gio'),('22222222-0000-0000-0000-000000000002','Priya'),('44444444-0000-0000-0000-000000000004','Rob') on conflict do nothing;
insert into public.workspaces (id, kind, name, slug, created_by) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1','studio','Atelier','atelier','11111111-0000-0000-0000-000000000001');
insert into public.workspace_members (workspace_id, user_id, role) values ('aaaaaaaa-0000-0000-0000-0000000000a1','11111111-0000-0000-0000-000000000001','owner');

-- W1 in wedding_days with one PAST event (for close); W2 for cross-wedding
insert into public.weddings (id, workspace_id, slug, couple_display, kind, phase, budget_total, guest_target, location_city, location_country) values
  ('cccccccc-0000-0000-0000-0000000000c1','aaaaaaaa-0000-0000-0000-0000000000a1','w1','W One','city','wedding_days',100000,50,'CDMX','MX'),
  ('cccccccc-0000-0000-0000-0000000000c2','aaaaaaaa-0000-0000-0000-0000000000a1','w2','W Two','city','wedding_days',1,1,'CDMX','MX');
insert into public.wedding_members (wedding_id, user_id, role) values
  ('cccccccc-0000-0000-0000-0000000000c1','22222222-0000-0000-0000-000000000002','partner'),
  ('cccccccc-0000-0000-0000-0000000000c1','44444444-0000-0000-0000-000000000004','day_of');
update public.wedding_events set event_date = current_date - 1 where wedding_id = 'cccccccc-0000-0000-0000-0000000000c1';
insert into public.wedding_events (id, wedding_id, label, event_date) values
  ('eeee0000-0000-0000-0000-0000000000e1','cccccccc-0000-0000-0000-0000000000c1','Reception', current_date - 1);
update public.wedding_events set event_date = current_date - 1 where wedding_id = 'cccccccc-0000-0000-0000-0000000000c2';
insert into public.wedding_events (id, wedding_id, label, event_date) values
  ('eeee0000-0000-0000-0000-0000000000e2','cccccccc-0000-0000-0000-0000000000c2','Reception', current_date - 1);

-- guests auto-populate event_guests (populate_eg_for_guest) for events that exist
-- at insert time — so insert them AFTER E1, then set statuses. Meera = confirmed at
-- E1 (menu + seat); Pending = at E1 but 'pending' (menu FO012); NotInE1 = removed
-- from E1 (wrong-event seat).
insert into public.guests (id, wedding_id, full_name, rsvp_code) values
  ('9111a111-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-0000000000c1','Meera','a1a1a1a1a1a1a1a1'),
  ('9111a111-0000-0000-0000-000000000009','cccccccc-0000-0000-0000-0000000000c1','Pending','b1b1b1b1b1b1b1b1'),
  ('9111a111-0000-0000-0000-00000000000a','cccccccc-0000-0000-0000-0000000000c1','NotInE1','c1c1c1c1c1c1c1c1');
update public.event_guests set rsvp_status = 'yes' where event_id='eeee0000-0000-0000-0000-0000000000e1' and guest_id='9111a111-0000-0000-0000-000000000001';
delete from public.event_guests where event_id='eeee0000-0000-0000-0000-0000000000e1' and guest_id='9111a111-0000-0000-0000-00000000000a';

insert into public.menus (id, wedding_id, event_id, title) values ('11e01111-0000-0000-0000-0000000000a1','cccccccc-0000-0000-0000-0000000000c1','eeee0000-0000-0000-0000-0000000000e1','Reception dinner');
insert into public.menu_options (id, menu_id, wedding_id, label) values
  ('09010111-0000-0000-0000-0000000000a1','11e01111-0000-0000-0000-0000000000a1','cccccccc-0000-0000-0000-0000000000c1','Lamb'),
  ('09010111-0000-0000-0000-0000000000a2','11e01111-0000-0000-0000-0000000000a1','cccccccc-0000-0000-0000-0000000000c1','Paneer');
insert into public.floor_plans (id, wedding_id, event_id, name) values ('f100a111-0000-0000-0000-0000000000a1','cccccccc-0000-0000-0000-0000000000c1','eeee0000-0000-0000-0000-0000000000e1','Main hall');
insert into public.seating_tables (id, wedding_id, floor_plan_id, name, capacity) values ('7ab1e111-0000-0000-0000-0000000000a1','cccccccc-0000-0000-0000-0000000000c1','f100a111-0000-0000-0000-0000000000a1','Table 1', 8);
-- W2's table (cross-wedding target)
insert into public.floor_plans (id, wedding_id, event_id, name) values ('f100a111-0000-0000-0000-0000000000b1','cccccccc-0000-0000-0000-0000000000c2','eeee0000-0000-0000-0000-0000000000e2','Hall2');
insert into public.seating_tables (id, wedding_id, floor_plan_id, name) values ('7ab1e111-0000-0000-0000-0000000000b1','cccccccc-0000-0000-0000-0000000000c2','f100a111-0000-0000-0000-0000000000b1','T2');
-- a schedule item at E1
insert into public.schedule_items (id, wedding_id, event_id, time, title) values ('5c4ed111-0000-0000-0000-0000000000a1','cccccccc-0000-0000-0000-0000000000c1','eeee0000-0000-0000-0000-0000000000e1','19:00','Doors');
-- an open (due) ledger line that blocks close
insert into public.ledger_lines (id, wedding_id, title, amount, status, kind) values ('1ed00000-0000-0000-0000-0000000000a1','cccccccc-0000-0000-0000-0000000000c1','Balance', 500, 'due', 'balance');
-- day-of-blindness fixtures: real rows on W1 so the blindness asserts against DATA
insert into public.vendors (id, workspace_id, name, kind) values ('d0000000-0000-0000-0000-0000000000b1','aaaaaaaa-0000-0000-0000-0000000000a1','Flor','florals');
insert into public.wedding_vendors (id, wedding_id, vendor_id, status) values ('e0000000-0000-0000-0000-0000000000b1','cccccccc-0000-0000-0000-0000000000c1','d0000000-0000-0000-0000-0000000000b1','presented');
insert into public.quotes (id, wedding_id, engagement_id, status, amount) values ('90000000-0000-0000-0000-0000000000b1','cccccccc-0000-0000-0000-0000000000c1','e0000000-0000-0000-0000-0000000000b1','received', 100);
insert into public.documents (wedding_id, title, source) values ('cccccccc-0000-0000-0000-0000000000c1','A doc','upload');

-- ── (1) cross-wedding seat: W2's table under W1 → composite FK rejects ────────
do $$ begin
  begin insert into public.seats (wedding_id, table_id, event_id, guest_id)
    values ('cccccccc-0000-0000-0000-0000000000c1','7ab1e111-0000-0000-0000-0000000000b1','eeee0000-0000-0000-0000-0000000000e1','9111a111-0000-0000-0000-000000000001');
    raise exception 'TEST FAIL: seated at a cross-wedding table';
  exception when foreign_key_violation then null; end;
end $$;

-- ── (2) seat at the wrong event: guest not invited to E1 → FK rejects ────────
do $$ begin
  begin insert into public.seats (wedding_id, table_id, event_id, guest_id)
    values ('cccccccc-0000-0000-0000-0000000000c1','7ab1e111-0000-0000-0000-0000000000a1','eeee0000-0000-0000-0000-0000000000e1','9111a111-0000-0000-0000-00000000000a');
    raise exception 'TEST FAIL: seated a guest at an event they are not in';
  exception when foreign_key_violation then null; end;
end $$;

-- ── (3) staff seats the confirmed guest; unseat clears both sides ────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ declare s uuid; begin
  s := public.assign_seat('eeee0000-0000-0000-0000-0000000000e1','9111a111-0000-0000-0000-000000000001','7ab1e111-0000-0000-0000-0000000000a1');
  if s is null then raise exception 'TEST FAIL: assign_seat returned null'; end if;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.seats where event_id='eeee0000-0000-0000-0000-0000000000e1') <> 1 then raise exception 'TEST FAIL: seat not created'; end if;
  if (select seat_ref from public.event_guests where event_id='eeee0000-0000-0000-0000-0000000000e1' and guest_id='9111a111-0000-0000-0000-000000000001') is null then raise exception 'TEST FAIL: seat_ref not set'; end if;
end $$;

-- ── (4) menu_submit (anon): attending unlocked ok; non-attending + locked reject
set local role anon;
set local request.jwt.claims = '';
do $$ begin
  perform public.menu_submit('a1a1a1a1a1a1a1a1', jsonb_build_object('choices', jsonb_build_array(jsonb_build_object('event_id','eeee0000-0000-0000-0000-0000000000e1','option_id','09010111-0000-0000-0000-0000000000a1'))));
  -- non-attending guest tries the same event → FO012
  begin perform public.menu_submit('b1b1b1b1b1b1b1b1', jsonb_build_object('choices', jsonb_build_array(jsonb_build_object('event_id','eeee0000-0000-0000-0000-0000000000e1','option_id','09010111-0000-0000-0000-0000000000a1'))));
    raise exception 'TEST FAIL: non-attending guest set a menu choice';
  exception when sqlstate 'FO012' then null; end;
end $$;
reset role;
do $$ begin
  if (select menu_choice_id from public.event_guests where event_id='eeee0000-0000-0000-0000-0000000000e1' and guest_id='9111a111-0000-0000-0000-000000000001') <> '09010111-0000-0000-0000-0000000000a1' then
    raise exception 'TEST FAIL: menu choice not recorded'; end if;
end $$;
-- lock the menu, then a submit is rejected with the human error
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin perform public.lock_menu('11e01111-0000-0000-0000-0000000000a1'); end $$;
set local role anon;
set local request.jwt.claims = '';
do $$ begin
  begin perform public.menu_submit('a1a1a1a1a1a1a1a1', jsonb_build_object('choices', jsonb_build_array(jsonb_build_object('event_id','eeee0000-0000-0000-0000-0000000000e1','option_id','09010111-0000-0000-0000-0000000000a2'))));
    raise exception 'TEST FAIL: submitted to a locked menu';
  exception when sqlstate 'FO011' then null; end;
end $$;

-- ── (5) day_of checks off the run of show but CANNOT read the ledger ─────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-0000-0000-0000-000000000004","role":"authenticated"}';
do $$ begin
  perform public.check_schedule_item('5c4ed111-0000-0000-0000-0000000000a1', true);  -- allowed for day_of
  -- blind to money AND guest/vendor/quote/document surfaces, with rows present:
  if (select count(*) from public.ledger_lines where wedding_id='cccccccc-0000-0000-0000-0000000000c1') <> 0 then raise exception 'TEST FAIL: day_of reads the ledger'; end if;
  if (select count(*) from public.guests where wedding_id='cccccccc-0000-0000-0000-0000000000c1') <> 0 then raise exception 'TEST FAIL: day_of reads guests'; end if;
  if (select count(*) from public.event_guests where wedding_id='cccccccc-0000-0000-0000-0000000000c1') <> 0 then raise exception 'TEST FAIL: day_of reads event_guests'; end if;
  if (select count(*) from public.wedding_vendors where wedding_id='cccccccc-0000-0000-0000-0000000000c1') <> 0 then raise exception 'TEST FAIL: day_of reads vendors'; end if;
  if (select count(*) from public.quotes where wedding_id='cccccccc-0000-0000-0000-0000000000c1') <> 0 then raise exception 'TEST FAIL: day_of reads quotes'; end if;
  if (select count(*) from public.documents where wedding_id='cccccccc-0000-0000-0000-0000000000c1') <> 0 then raise exception 'TEST FAIL: day_of reads documents'; end if;
  if (select count(*) from public.wedding_money_rollup where wedding_id='cccccccc-0000-0000-0000-0000000000c1') <> 0 then raise exception 'TEST FAIL: day_of reads the money rollup'; end if;
  -- but the run of show IS visible (schedule_items member SELECT includes day_of)
  if (select count(*) from public.schedule_items where wedding_id='cccccccc-0000-0000-0000-0000000000c1') = 0 then raise exception 'TEST FAIL: day_of cannot see the run of show'; end if;
end $$;
reset role;
do $$ begin
  if (select done_at from public.schedule_items where id='5c4ed111-0000-0000-0000-0000000000a1') is null then raise exception 'TEST FAIL: schedule item not checked off'; end if;
end $$;

-- ── (6) close blocked by the open line, then passes once it is paid ─────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin
  begin perform public.close_wedding('cccccccc-0000-0000-0000-0000000000c1');
    raise exception 'TEST FAIL: closed with an open ledger line';
  exception when sqlstate 'FV403' then null; end;
  update public.ledger_lines set status='paid', paid_at=now() where id='1ed00000-0000-0000-0000-0000000000a1';
  perform public.close_wedding('cccccccc-0000-0000-0000-0000000000c1');
end $$;
reset role;
do $$ begin
  if (select phase from public.weddings where id='cccccccc-0000-0000-0000-0000000000c1') <> 'closed' then raise exception 'TEST FAIL: wedding did not close'; end if;
end $$;

-- ── (7) documents backfill is idempotent (re-run inserts nothing new) ───────
do $$ declare before int; begin
  select count(*) into before from public.documents where source='contract_artifact';
  insert into public.contracts (id, wedding_id, kind, status, title, artifact_path)
    values ('c0117ac0-0000-0000-0000-0000000000d1','cccccccc-0000-0000-0000-0000000000c1','vendor','completed','Doc test', 'cccccccc-0000-0000-0000-0000000000c1/c0117ac0-0000-0000-0000-0000000000d1.html');
  insert into public.documents (wedding_id, title, source, storage_path, contract_id)
    select wedding_id, title, 'contract_artifact', artifact_path, id from public.contracts where id='c0117ac0-0000-0000-0000-0000000000d1'
    on conflict (contract_id) where (source='contract_artifact') do nothing;
  insert into public.documents (wedding_id, title, source, storage_path, contract_id)
    select wedding_id, title, 'contract_artifact', artifact_path, id from public.contracts where id='c0117ac0-0000-0000-0000-0000000000d1'
    on conflict (contract_id) where (source='contract_artifact') do nothing;
  if (select count(*) from public.documents where contract_id='c0117ac0-0000-0000-0000-0000000000d1') <> 1 then
    raise exception 'TEST FAIL: documents artifact not idempotent'; end if;
end $$;

reset role;
select 'operations: ALL TESTS PASSED' as result;
rollback;
