-- 0006 partners — the M4 harness (SCHEMA §11 + role-identity doctrine).
-- present_vendor atomicity + cross-workspace + cross-wedding rejection; engagement
-- & quote state machines (legal/illegal); one-booked-venue-per-event; approval-
-- moves-the-mesh (approve→shortlisted, decline→declined, no regression); couple
-- sees engagements via the view but never the catalog; the venue predicate going
-- live so a wedding crosses 2→3 honestly. Hermetic (PGlite), begin; … rollback;.

begin;

insert into auth.users (id, email) values
  ('11111111-0000-0000-0000-000000000001','staff@test.forma'),
  ('22222222-0000-0000-0000-000000000002','partner@test.forma'),
  ('33333333-0000-0000-0000-000000000003','other@test.forma');
insert into public.workspaces (id, kind, name, slug, created_by) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1','studio','Atelier','atelier','11111111-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2','studio','Other','other','33333333-0000-0000-0000-000000000003');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1','11111111-0000-0000-0000-000000000001','owner'),
  ('aaaaaaaa-0000-0000-0000-0000000000a2','33333333-0000-0000-0000-000000000003','owner');
insert into public.weddings (id, workspace_id, slug, couple_display, kind, budget_total, guest_target, location_city, location_country)
  values ('cccccccc-0000-0000-0000-0000000000c1','aaaaaaaa-0000-0000-0000-0000000000a1','w1','W One','city', 100000, 100, 'CDMX', 'MX');
insert into public.wedding_members (wedding_id, user_id, role)
  values ('cccccccc-0000-0000-0000-0000000000c1','22222222-0000-0000-0000-000000000002','partner');
-- two dated events (default seeded event exists too; date it so the phase gate can pass)
update public.wedding_events set event_date = '2027-09-01' where wedding_id = 'cccccccc-0000-0000-0000-0000000000c1';
insert into public.wedding_events (id, wedding_id, label, event_date) values
  ('eeee0000-0000-0000-0000-0000000000e1','cccccccc-0000-0000-0000-0000000000c1','Ceremony','2027-09-01'),
  ('eeee0000-0000-0000-0000-0000000000e2','cccccccc-0000-0000-0000-0000000000c1','Reception','2027-09-01');
-- vendors: V1/V2/V4 venues + V3 florals in WS1; VX in WS2
insert into public.vendors (id, workspace_id, name, kind) values
  ('d0000000-0000-0000-0000-0000000000f1','aaaaaaaa-0000-0000-0000-0000000000a1','Hacienda Uno','venue'),
  ('d0000000-0000-0000-0000-0000000000f2','aaaaaaaa-0000-0000-0000-0000000000a1','Hacienda Dos','venue'),
  ('d0000000-0000-0000-0000-0000000000f4','aaaaaaaa-0000-0000-0000-0000000000a1','Hacienda Tres','venue'),
  ('d0000000-0000-0000-0000-0000000000f3','aaaaaaaa-0000-0000-0000-0000000000a1','Flor y Canto','florals'),
  ('d0000000-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-0000000000a2','Foreign Vendor','venue');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';

-- ── (1) present_vendor: engagement + event link + proposal, one act ──────────
do $$ declare eng uuid;
begin
  eng := public.present_vendor('d0000000-0000-0000-0000-0000000000f1','cccccccc-0000-0000-0000-0000000000c1', array['eeee0000-0000-0000-0000-0000000000e1']::uuid[], 20000, 'Lovely courtyard');
  if (select status from public.wedding_vendors where id=eng) <> 'presented' then raise exception 'TEST FAIL: engagement not presented'; end if;
  if (select count(*) from public.event_vendors where engagement_id=eng) <> 1 then raise exception 'TEST FAIL: event_vendors not linked'; end if;
  if (select count(*) from public.proposals where engagement_id=eng and status='sent') <> 1 then raise exception 'TEST FAIL: proposal not created/sent'; end if;
end $$;

-- ── (2) atomicity: a bad event id rolls back the whole present ───────────────
do $$ begin
  begin
    perform public.present_vendor('d0000000-0000-0000-0000-0000000000f2','cccccccc-0000-0000-0000-0000000000c1', array['eeee0000-0000-0000-0000-00000000dead']::uuid[], 1, 'x');
    raise exception 'TEST FAIL: present with a bad event id succeeded';
  exception when foreign_key_violation then null; end;
  if (select count(*) from public.wedding_vendors where vendor_id='d0000000-0000-0000-0000-0000000000f2') <> 0 then
    raise exception 'TEST FAIL: failed present left an engagement behind (not atomic)'; end if;
end $$;

-- ── (3) cross-workspace present rejected ─────────────────────────────────────
do $$ begin
  begin perform public.present_vendor('d0000000-0000-0000-0000-00000000000a','cccccccc-0000-0000-0000-0000000000c1', array['eeee0000-0000-0000-0000-0000000000e1']::uuid[], 1, 'x');
    raise exception 'TEST FAIL: presented a foreign-workspace vendor';
  exception when sqlstate 'FV243' then null; end;
end $$;

-- ── (4) member cannot present ────────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ begin
  begin perform public.present_vendor('d0000000-0000-0000-0000-0000000000f3','cccccccc-0000-0000-0000-0000000000c1', array[]::uuid[], 1, 'x');
    raise exception 'TEST FAIL: member presented a vendor';
  exception when sqlstate 'FV230' then null; end;
end $$;

-- ── (5) approval moves the mesh: approve → shortlisted ───────────────────────
do $$ declare prop uuid;
begin
  select id into prop from public.proposals where engagement_id = (select id from public.wedding_vendors where vendor_id='d0000000-0000-0000-0000-0000000000f1');
  perform public.mark_proposal_seen(prop);
  perform public.respond_to_proposal(prop, 'approve', null);
  if (select status from public.wedding_vendors where vendor_id='d0000000-0000-0000-0000-0000000000f1') <> 'shortlisted' then
    raise exception 'TEST FAIL: approve did not move engagement to shortlisted'; end if;
end $$;

-- decline path (present V3 florals, member declines → declined)
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ declare eng uuid; prop uuid;
begin
  eng := public.present_vendor('d0000000-0000-0000-0000-0000000000f3','cccccccc-0000-0000-0000-0000000000c1', array['eeee0000-0000-0000-0000-0000000000e2']::uuid[], 5000, 'florals');
  select id into prop from public.proposals where engagement_id = eng;
  set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';
  perform public.respond_to_proposal(prop, 'decline', null);
  if (select status from public.wedding_vendors where id=eng) <> 'declined' then raise exception 'TEST FAIL: decline did not move engagement to declined'; end if;
end $$;

-- ── (6) quote flow + book (V1 venue for E1) ──────────────────────────────────
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ declare eng uuid; q uuid;
begin
  select id into eng from public.wedding_vendors where vendor_id='d0000000-0000-0000-0000-0000000000f1';
  q := public.request_quote(eng);
  if (select status from public.wedding_vendors where id=eng) <> 'quote_requested' then raise exception 'TEST FAIL: not quote_requested'; end if;
  perform public.record_quote(q, 18500, current_date + 30, 'incl tax', null);
  if (select status from public.quotes where id=q) <> 'received' then raise exception 'TEST FAIL: quote not received'; end if;
  if (select status from public.wedding_vendors where id=eng) <> 'quoted' then raise exception 'TEST FAIL: engagement not quoted'; end if;
  perform public.book_engagement(eng);
  if (select status from public.wedding_vendors where id=eng) <> 'booked' then raise exception 'TEST FAIL: engagement not booked'; end if;
  if not (select venue_booked from public.event_vendors where engagement_id=eng and event_id='eeee0000-0000-0000-0000-0000000000e1') then
    raise exception 'TEST FAIL: venue_booked not set on the event'; end if;
end $$;

-- ── (7) one booked venue per event: V2 for E1 → book fails FV240 ─────────────
do $$ declare eng2 uuid;
begin
  eng2 := public.present_vendor('d0000000-0000-0000-0000-0000000000f2','cccccccc-0000-0000-0000-0000000000c1', array['eeee0000-0000-0000-0000-0000000000e1']::uuid[], 1, 'second venue');
  perform public.request_quote(eng2);
  begin perform public.book_engagement(eng2);
    raise exception 'TEST FAIL: booked a second venue for an event that already has one';
  exception when sqlstate 'FV240' then null; end;
end $$;

-- ── (8) cross-wedding composite FK (superuser: FK, not RLS) ──────────────────
reset role;
do $$ declare eng uuid;
begin
  select id into eng from public.wedding_vendors where vendor_id='d0000000-0000-0000-0000-0000000000f1';
  begin
    insert into public.event_vendors (engagement_id, event_id, wedding_id) values (eng, 'eeee0000-0000-0000-0000-0000000000e2', 'cccccccc-0000-0000-0000-0000000000c9');
    raise exception 'TEST FAIL: event_vendors accepted a mismatched wedding_id';
  exception when foreign_key_violation then null; end;
end $$;

-- ── (9) couple-view scoping: view yes, catalog no ───────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.wedding_partners('cccccccc-0000-0000-0000-0000000000c1') where engagement_id is not null) < 1 then
    raise exception 'TEST FAIL: couple cannot see engagements via the partner function'; end if;
  if (select count(*) from public.vendors where workspace_id = 'aaaaaaaa-0000-0000-0000-0000000000a1') <> 0 then
    raise exception 'TEST FAIL: couple can read the vendor catalog directly'; end if;
end $$;

-- ── (10) venue predicate goes live: book a venue for E2, then advance 2→3 ────
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
-- before E2 has a venue → FV205
do $$ begin
  begin perform public.advance_phase('cccccccc-0000-0000-0000-0000000000c1');
    raise exception 'TEST FAIL: advanced before every event had a booked venue';
  exception when sqlstate 'FV205' then null; end;
end $$;
-- book V4 for E2 (and the seeded default event also needs a venue — give it V4 too? one venue can cover multiple events)
do $$ declare eng4 uuid; q4 uuid;
begin
  -- cover EVERY event except E1 (already has V1) with V4 so all events have a venue
  eng4 := public.present_vendor('d0000000-0000-0000-0000-0000000000f4','cccccccc-0000-0000-0000-0000000000c1',
    (select array_agg(id) from public.wedding_events where wedding_id='cccccccc-0000-0000-0000-0000000000c1' and id <> 'eeee0000-0000-0000-0000-0000000000e1'), 1, 'covers the rest');
  q4 := public.request_quote(eng4);
  perform public.record_quote(q4, 25000, current_date + 30, null, null);
  perform public.book_engagement(eng4);
end $$;
do $$ begin
  if public.advance_phase('cccccccc-0000-0000-0000-0000000000c1') <> 'details' then
    raise exception 'TEST FAIL: wedding did not reach details with all predicates met'; end if;
  if (select phase from public.weddings where id='cccccccc-0000-0000-0000-0000000000c1') <> 'details' then
    raise exception 'TEST FAIL: phase not persisted as details'; end if;
end $$;

-- ── (11) single-event law: present with no events auto-attaches to the one ────
-- A fresh wedding auto-seeds one default event → single-event. Presenting with an
-- empty event array must attach the engagement to that lone event.
insert into public.weddings (id, workspace_id, slug, couple_display, kind, budget_total, guest_target, location_city, location_country)
  values ('cccccccc-0000-0000-0000-0000000000c2','aaaaaaaa-0000-0000-0000-0000000000a1','w2','W Two','city', 50000, 50, 'CDMX', 'MX');
do $$ declare eng uuid;
begin
  if (select count(*) from public.wedding_events where wedding_id='cccccccc-0000-0000-0000-0000000000c2') <> 1 then
    raise exception 'TEST SETUP: expected a single auto-seeded event'; end if;
  eng := public.present_vendor('d0000000-0000-0000-0000-0000000000f2','cccccccc-0000-0000-0000-0000000000c2', array[]::uuid[], 1000, 'auto');
  if (select count(*) from public.event_vendors where engagement_id=eng) <> 1 then
    raise exception 'TEST FAIL: single-event present did not auto-attach to the only event'; end if;
end $$;

-- ── (12) a venue on a multi-event wedding must name at least one event → FV244 ─
insert into public.vendors (id, workspace_id, name, kind) values
  ('d0000000-0000-0000-0000-0000000000f5','aaaaaaaa-0000-0000-0000-0000000000a1','Hacienda Cinco','venue'),
  ('d0000000-0000-0000-0000-0000000000f6','aaaaaaaa-0000-0000-0000-0000000000a1','Cocina Seis','catering');
do $$ begin
  begin perform public.present_vendor('d0000000-0000-0000-0000-0000000000f5','cccccccc-0000-0000-0000-0000000000c1', array[]::uuid[], 1, 'no events');
    raise exception 'TEST FAIL: presented a venue to a multi-event wedding with no event';
  exception when sqlstate 'FV244' then null; end;
end $$;

-- non-venue kinds stay event-optional even on a multi-event wedding (0 links ok)
do $$ declare eng uuid;
begin
  eng := public.present_vendor('d0000000-0000-0000-0000-0000000000f6','cccccccc-0000-0000-0000-0000000000c1', array[]::uuid[], 1, 'general');
  if (select count(*) from public.event_vendors where engagement_id=eng) <> 0 then
    raise exception 'TEST FAIL: event-optional non-venue present unexpectedly linked events'; end if;
end $$;

reset role;
select 'partners: ALL TESTS PASSED' as result;

rollback;
