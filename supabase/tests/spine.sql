-- 0002 spine — the full M1 harness (SCHEMA §11, extended per the M1 spec).
-- Seed-once + locale · derived dates on insert/update/delete · last-event guard
-- (+ cascade exemption) · RLS matrix (staff/member/stranger × verb) on all three
-- tables · the app's exact call shapes (insert-then-RETURNING, the M0 lesson) ·
-- FK rejection · advance_wedding_phase positive-per-predicate + fail-closed venue.
-- Hermetic (PGlite), fixture-scoped, begin; … rollback;.

begin;

-- ── Fixtures (as superuser — bypasses RLS; the M1 policies are asserted below) ─
insert into auth.users (id, email) values
  ('11111111-0000-0000-0000-000000000001','staff@test.forma'),
  ('22222222-0000-0000-0000-000000000002','partner@test.forma'),
  ('33333333-0000-0000-0000-000000000003','stranger@test.forma'),
  ('44444444-0000-0000-0000-000000000004','esowner@test.forma');
update public.profiles set locale = 'es' where id = '44444444-0000-0000-0000-000000000004';

-- studio workspace WS1 (staff = a1); couple workspace WS2 (owner = a4)
insert into public.workspaces (id, kind, name, slug, created_by) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1','studio','Atelier','atelier','11111111-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-0000000000b2','couple','Nuestra Boda','nuestra-boda','44444444-0000-0000-0000-000000000004');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1','11111111-0000-0000-0000-000000000001','owner'),
  ('bbbbbbbb-0000-0000-0000-0000000000b2','44444444-0000-0000-0000-000000000004','owner');

-- ── (1) Seed trigger fires exactly once, localized by the creator ────────────
-- Created under the en staff → "Wedding day"; a4 is es → "Día de la boda".
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
insert into public.weddings (id, workspace_id, slug, couple_display, kind)
  values ('cccccccc-0000-0000-0000-0000000000c1','aaaaaaaa-0000-0000-0000-0000000000a1','w1','Emma & Lucas','city');
do $$ begin
  if (select count(*) from public.wedding_events where wedding_id='cccccccc-0000-0000-0000-0000000000c1') <> 1 then
    raise exception 'TEST FAIL: seed trigger did not create exactly one event'; end if;
  if (select label from public.wedding_events where wedding_id='cccccccc-0000-0000-0000-0000000000c1') <> 'Wedding day' then
    raise exception 'TEST FAIL: en default event label wrong'; end if;
end $$;

set local request.jwt.claims = '{"sub":"44444444-0000-0000-0000-000000000004","role":"authenticated"}';
insert into public.weddings (id, workspace_id, slug, couple_display, kind)
  values ('cccccccc-0000-0000-0000-0000000000c9','bbbbbbbb-0000-0000-0000-0000000000b2','w9','Ana & Beto','city');
do $$ begin
  if (select label from public.wedding_events where wedding_id='cccccccc-0000-0000-0000-0000000000c9') <> 'Día de la boda' then
    raise exception 'TEST FAIL: es default event label wrong (locale not honored)'; end if;
end $$;

-- ── (2) Derived dates recompute on insert / update / delete ──────────────────
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
-- default event is undated → both null
do $$ begin
  if (select date_start from public.weddings where id='cccccccc-0000-0000-0000-0000000000c1') is not null then
    raise exception 'TEST FAIL: date_start should be null with no dated events'; end if;
end $$;
insert into public.wedding_events (id, wedding_id, label, kind, event_date, order_index) values
  ('eeee0001-0000-0000-0000-0000000000e1','cccccccc-0000-0000-0000-0000000000c1','Ceremony','ceremony','2027-01-17',1),
  ('eeee0002-0000-0000-0000-0000000000e2','cccccccc-0000-0000-0000-0000000000c1','Mehndi','ritual','2027-01-15',2);
do $$ begin
  if (select date_start from public.weddings where id='cccccccc-0000-0000-0000-0000000000c1') <> '2027-01-15'
     or (select date_end from public.weddings where id='cccccccc-0000-0000-0000-0000000000c1') <> '2027-01-17' then
    raise exception 'TEST FAIL: derived dates wrong after insert'; end if;
end $$;
update public.wedding_events set event_date='2027-01-20' where id='eeee0002-0000-0000-0000-0000000000e2';
do $$ begin
  if (select date_end from public.weddings where id='cccccccc-0000-0000-0000-0000000000c1') <> '2027-01-20' then
    raise exception 'TEST FAIL: derived date_end wrong after update'; end if;
end $$;
delete from public.wedding_events where id='eeee0002-0000-0000-0000-0000000000e2';
do $$ begin
  if (select date_end from public.weddings where id='cccccccc-0000-0000-0000-0000000000c1') <> '2027-01-17' then
    raise exception 'TEST FAIL: derived date_end wrong after delete'; end if;
end $$;

-- ── (3) Last-event guard, and its cascade exemption ──────────────────────────
-- W9 lives in WS2 → operate as its staff (a4).
set local request.jwt.claims = '{"sub":"44444444-0000-0000-0000-000000000004","role":"authenticated"}';
-- W9 has only its seeded default event → deleting it must be blocked (FV210).
do $$ begin
  begin
    delete from public.wedding_events where wedding_id='cccccccc-0000-0000-0000-0000000000c9';
    raise exception 'TEST FAIL: deleted a wedding''s last event';
  exception when sqlstate 'FV210' then null; end;
end $$;
-- Cascade delete of the wedding itself must succeed (guard stands down).
delete from public.weddings where id='cccccccc-0000-0000-0000-0000000000c9';
do $$ begin
  if (select count(*) from public.wedding_events where wedding_id='cccccccc-0000-0000-0000-0000000000c9') <> 0 then
    raise exception 'TEST FAIL: cascade did not remove events'; end if;
end $$;

-- ── (4) The app's exact call shape: INSERT ... RETURNING as staff succeeds ────
-- (The M0 trap does NOT recur: staff are workspace members, so the new row is
-- visible to weddings_select via is_wedding_staff — the RETURNING reads back.)
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
-- createWedding shape: INSERT ... RETURNING the new id (one statement).
do $$ declare v uuid;
begin
  insert into public.weddings (id, workspace_id, slug, couple_display, kind)
    values ('ffff0001-0000-0000-0000-0000000000f1','aaaaaaaa-0000-0000-0000-0000000000a1','w-rt','Round & Trip','city')
    returning id into v;
  if v is null then raise exception 'TEST FAIL: staff wedding INSERT ... RETURNING read back null'; end if;
end $$;
-- addEvent shape: INSERT ... RETURNING onto an already-existing wedding (its
-- parent is committed, so is_wedding_staff sees it — the everyday app path).
do $$ declare v uuid;
begin
  insert into public.wedding_events (wedding_id, label, kind) values ('ffff0001-0000-0000-0000-0000000000f1','Extra','party') returning id into v;
  if v is null then raise exception 'TEST FAIL: staff event INSERT ... RETURNING read back null'; end if;
end $$;

-- ── (5) FK rejection: an event pointing at a non-existent wedding ─────────────
-- Tested as superuser (RLS off): under RLS the staff check rejects it first with
-- 42501, so the FK constraint itself is only observable with RLS bypassed.
reset role;
do $$ begin
  begin
    insert into public.wedding_events (wedding_id, label) values ('dddddddd-0000-0000-0000-0000000000d9','Orphan');
    raise exception 'TEST FAIL: event to a non-existent wedding allowed';
  exception when foreign_key_violation then null; end;
end $$;
set local role authenticated;

-- ── (6) RLS matrix ───────────────────────────────────────────────────────────
-- Give a2 a wedding-member row on W1 (as staff), then assert visibility.
insert into public.wedding_members (wedding_id, user_id, role)
  values ('cccccccc-0000-0000-0000-0000000000c1','22222222-0000-0000-0000-000000000002','partner');

-- staff (a1): CRUD works — already exercised above (insert/update/delete). Confirm select.
do $$ begin
  if (select count(*) from public.weddings where id='cccccccc-0000-0000-0000-0000000000c1') <> 1 then
    raise exception 'TEST FAIL: staff cannot select own wedding'; end if;
end $$;

-- wedding member (a2): SELECT wedding + events; NO writes.
set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.weddings where id='cccccccc-0000-0000-0000-0000000000c1') <> 1 then
    raise exception 'TEST FAIL: wedding member cannot see the wedding'; end if;
  if (select count(*) from public.wedding_events where wedding_id='cccccccc-0000-0000-0000-0000000000c1') < 1 then
    raise exception 'TEST FAIL: wedding member cannot see events'; end if;
  begin
    insert into public.wedding_events (wedding_id, label) values ('cccccccc-0000-0000-0000-0000000000c1','Sneaky');
    raise exception 'TEST FAIL: wedding member inserted an event';
  exception when insufficient_privilege then null; end;
  begin
    update public.weddings set couple_display='Hacked' where id='cccccccc-0000-0000-0000-0000000000c1';
    if found then raise exception 'TEST FAIL: wedding member updated the wedding'; end if;
  exception when insufficient_privilege then null; end;
end $$;

-- stranger (a3): sees nothing, writes nothing.
set local request.jwt.claims = '{"sub":"33333333-0000-0000-0000-000000000003","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.weddings where id='cccccccc-0000-0000-0000-0000000000c1') <> 0 then
    raise exception 'TEST FAIL: stranger sees the wedding'; end if;
  if (select count(*) from public.wedding_events where wedding_id='cccccccc-0000-0000-0000-0000000000c1') <> 0 then
    raise exception 'TEST FAIL: stranger sees events'; end if;
  begin
    insert into public.weddings (workspace_id, slug, couple_display, kind)
      values ('aaaaaaaa-0000-0000-0000-0000000000a1','w-strange','No & Way','city');
    raise exception 'TEST FAIL: stranger created a wedding in a workspace they do not belong to';
  exception when insufficient_privilege then null; end;
end $$;

-- ── (7) advance_wedding_phase — positive per predicate, fail-closed venue ─────
-- Exercise as the owner (no jwt) — advance's staff guard trusts a no-jwt context;
-- clear the lingering claims so auth.uid() is null (reset role alone doesn't).
reset role;
set local request.jwt.claims = '';
-- W1 is foundations. Walk the predicates: each satisfied one uncovers the next.
do $$ begin
  begin perform private.advance_wedding_phase('cccccccc-0000-0000-0000-0000000000c1');
    raise exception 'TEST FAIL: advanced with no budget';
  exception when sqlstate 'FV201' then null; end;  -- budget
end $$;
update public.weddings set budget_total=1000 where id='cccccccc-0000-0000-0000-0000000000c1';
do $$ begin
  begin perform private.advance_wedding_phase('cccccccc-0000-0000-0000-0000000000c1');
    raise exception 'TEST FAIL: advanced with no guest target';
  exception when sqlstate 'FV202' then null; end;  -- guests
end $$;
update public.weddings set guest_target=100 where id='cccccccc-0000-0000-0000-0000000000c1';
do $$ begin
  begin perform private.advance_wedding_phase('cccccccc-0000-0000-0000-0000000000c1');
    raise exception 'TEST FAIL: advanced with no location';
  exception when sqlstate 'FV203' then null; end;  -- location
end $$;
update public.weddings set location_city='CDMX', location_country='MX' where id='cccccccc-0000-0000-0000-0000000000c1';
-- the default event is still undated
do $$ begin
  begin perform private.advance_wedding_phase('cccccccc-0000-0000-0000-0000000000c1');
    raise exception 'TEST FAIL: advanced with an undated event';
  exception when sqlstate 'FV204' then null; end;  -- undated event
end $$;
update public.wedding_events set event_date='2027-01-16' where wedding_id='cccccccc-0000-0000-0000-0000000000c1' and event_date is null;
-- now every M1 predicate passes → the M4 venue check fails closed
do $$ begin
  begin perform private.advance_wedding_phase('cccccccc-0000-0000-0000-0000000000c1');
    raise exception 'TEST FAIL: reached details without the venue predicate (fail-closed missing)';
  exception when sqlstate 'FV205' then null; end;  -- venue-booked, fail closed
end $$;
-- phase never moved
do $$ begin
  if (select phase from public.weddings where id='cccccccc-0000-0000-0000-0000000000c1') <> 'foundations' then
    raise exception 'TEST FAIL: phase advanced despite fail-closed venue'; end if;
end $$;

-- couple-workspace bypass: hiring → foundations via the function.
update public.weddings set phase='hiring' where id='cccccccc-0000-0000-0000-0000000000c1'; -- studio, must fail closed
do $$ begin
  begin perform private.advance_wedding_phase('cccccccc-0000-0000-0000-0000000000c1');
    raise exception 'TEST FAIL: studio hiring advanced without a planner agreement';
  exception when sqlstate 'FV101' then null; end;
end $$;
-- couple-workspace (WS2) wedding, still as owner
insert into public.weddings (id, workspace_id, slug, couple_display, kind, phase)
  values ('cccccccc-0000-0000-0000-0000000000c5','bbbbbbbb-0000-0000-0000-0000000000b2','w5','Self & Planned','city','hiring');
do $$ begin
  perform private.advance_wedding_phase('cccccccc-0000-0000-0000-0000000000c5');
  if (select phase from public.weddings where id='cccccccc-0000-0000-0000-0000000000c5') <> 'foundations' then
    raise exception 'TEST FAIL: couple-workspace hiring→foundations bypass did not apply'; end if;
end $$;

reset role;
select 'spine: ALL TESTS PASSED' as result;

rollback;
