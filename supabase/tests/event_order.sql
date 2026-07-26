-- Event ordering (M1 gate fix, round 2). CHRONOLOGY IS THE TRUTH: everywhere
-- events render, the app orders by (event_date nulls last, start_time nulls last,
-- order_index, created_at). A later-date event sorts after an earlier-date one
-- REGARDLESS of order_index; order_index only arranges events within the same
-- date; undated events sort last. Hermetic (PGlite), begin; … rollback;.

begin;

insert into auth.users (id, email) values ('aaaa0009-0000-0000-0000-0000000000a9','orderer@test.forma');
insert into public.workspaces (id, kind, name, slug, created_by)
  values ('aaaa0009-0000-0000-0000-0000000000f9','studio','Ord','ord','aaaa0009-0000-0000-0000-0000000000a9');
insert into public.workspace_members (workspace_id, user_id, role)
  values ('aaaa0009-0000-0000-0000-0000000000f9','aaaa0009-0000-0000-0000-0000000000a9','owner');

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa0009-0000-0000-0000-0000000000a9","role":"authenticated"}';

-- Creating the wedding seeds a default "Wedding day" (NO date) → the undated
-- case, which must sort last.
insert into public.weddings (id, workspace_id, slug, couple_display, kind)
  values ('aaaa0009-0000-0000-0000-0000000000d9','aaaa0009-0000-0000-0000-0000000000f9','ord-w','Ord Couple','city');

-- The exact case that failed live: the later date has the LOWER order_index and
-- must still sort after the earlier date. Plus a same-date pair to prove
-- order_index only tie-breaks within a day.
insert into public.wedding_events (wedding_id, label, kind, event_date, start_time, order_index) values
  ('aaaa0009-0000-0000-0000-0000000000d9','After party', 'party',     '2026-10-11', null, 0),  -- later date, lower order
  ('aaaa0009-0000-0000-0000-0000000000d9','Brunch',      'other',     '2026-10-10', null, 5),  -- same date as below, higher order
  ('aaaa0009-0000-0000-0000-0000000000d9','Ceremony',    'ceremony',  '2026-10-10', null, 1);  -- same date, lower order → first

do $$
declare labels text[];
begin
  select array_agg(label order by event_date nulls last, start_time nulls last, order_index, created_at)
    into labels
    from public.wedding_events
    where wedding_id = 'aaaa0009-0000-0000-0000-0000000000d9';
  -- 10-10: Ceremony (order 1) then Brunch (order 5) · 10-11: After party (order 0,
  -- but LATER date wins) · Wedding day (undated → last)
  if labels <> array['Ceremony','Brunch','After party','Wedding day'] then
    raise exception 'TEST FAIL: event order was %, expected Ceremony, Brunch, After party, Wedding day', labels;
  end if;
end $$;

reset role;
select 'event_order: ALL TESTS PASSED' as result;

rollback;
