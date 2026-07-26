-- Event ordering tie-break (M1 gate fix). Everywhere events render, the app
-- orders by (order_index, event_date nulls last, start_time nulls last,
-- created_at). This pins that: with equal order_index, dated events sort
-- chronologically (and by start time within a day), and an undated event sorts
-- last — never Day 2 before Day 1. Hermetic (PGlite), begin; … rollback;.

begin;

insert into auth.users (id, email) values ('aaaa0009-0000-0000-0000-0000000000a9','orderer@test.forma');
insert into public.workspaces (id, kind, name, slug, created_by)
  values ('aaaa0009-0000-0000-0000-0000000000f9','studio','Ord','ord','aaaa0009-0000-0000-0000-0000000000a9');
insert into public.workspace_members (workspace_id, user_id, role)
  values ('aaaa0009-0000-0000-0000-0000000000f9','aaaa0009-0000-0000-0000-0000000000a9','owner');

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa0009-0000-0000-0000-0000000000a9","role":"authenticated"}';

-- Creating the wedding seeds a default "Wedding day" (order 0, NO date) → the
-- undated case, which must sort last.
insert into public.weddings (id, workspace_id, slug, couple_display, kind)
  values ('aaaa0009-0000-0000-0000-0000000000d9','aaaa0009-0000-0000-0000-0000000000f9','ord-w','Ord Couple','city');

-- Three more events, ALL order_index 0 (the tie the bug hit):
insert into public.wedding_events (wedding_id, label, kind, event_date, start_time, order_index) values
  ('aaaa0009-0000-0000-0000-0000000000d9','Morning',  'ceremony', '2026-10-10', '09:00', 0),
  ('aaaa0009-0000-0000-0000-0000000000d9','Evening',  'party',    '2026-10-10', '18:00', 0),
  ('aaaa0009-0000-0000-0000-0000000000d9','Next day', 'reception','2026-10-11', null,    0);

do $$
declare labels text[];
begin
  select array_agg(label order by order_index, event_date nulls last, start_time nulls last, created_at)
    into labels
    from public.wedding_events
    where wedding_id = 'aaaa0009-0000-0000-0000-0000000000d9';
  -- Morning (10-10 09:00) · Evening (10-10 18:00) · Next day (10-11) · Wedding day (null → last)
  if labels <> array['Morning','Evening','Next day','Wedding day'] then
    raise exception 'TEST FAIL: event order was %, expected Morning, Evening, Next day, Wedding day', labels;
  end if;
end $$;

reset role;
select 'event_order: ALL TESTS PASSED' as result;

rollback;
