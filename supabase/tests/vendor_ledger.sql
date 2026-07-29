-- 0015 vendor ledger (M13) — the finished quote loop. Proves: request → record
-- (+file) → send → couple answers (approve keeps 'quoted' + quote 'accepted';
-- request_change opens a fresh quote + moves quoted→quote_requested; decline moves
-- the quote AND the engagement) → and every turn leaves a quotes row. send_quote
-- ordinals (Quote 1, Quote 2), FV241 (no amount), FV230 (couple can't), FV222 (empty
-- change note), the widened request_quote from-set ('quoted'), and the quote-less
-- presentation regression (approve → shortlisted). Hermetic, begin;…rollback;.
begin;

insert into auth.users (id, email) values
  ('11111111-0000-0000-0000-000000000001','staff@test.forma'),
  ('22222222-0000-0000-0000-000000000002','couple@test.forma');
insert into public.workspaces (id, kind, name, slug, created_by) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1','studio','Atelier','atelier-vl','11111111-0000-0000-0000-000000000001');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1','11111111-0000-0000-0000-000000000001','owner');
insert into public.weddings (id, workspace_id, slug, couple_display, kind, budget_total, guest_target, location_city, location_country)
  values ('cccccccc-0000-0000-0000-0000000000c1','aaaaaaaa-0000-0000-0000-0000000000a1','w1','W One','city',100000,100,'CDMX','MX');
insert into public.wedding_members (wedding_id, user_id, role)
  values ('cccccccc-0000-0000-0000-0000000000c1','22222222-0000-0000-0000-000000000002','partner');
insert into public.vendors (id, workspace_id, name, kind) values
  ('d0000000-0000-0000-0000-0000000000f3','aaaaaaaa-0000-0000-0000-0000000000a1','Flor y Canto','florals'),
  ('d0000000-0000-0000-0000-0000000000f7','aaaaaaaa-0000-0000-0000-0000000000a1','Luz Estudio','photo_video');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';

-- ── (1) present (single-event auto-attach) + the quote-less presentation approve
-- regression: couple approve → presented → shortlisted (unchanged from 0006) ─────
do $$ declare eng uuid; p0 uuid;
begin
  eng := public.present_vendor('d0000000-0000-0000-0000-0000000000f3','cccccccc-0000-0000-0000-0000000000c1', array[]::uuid[], 5000, 'spring florals');
  select id into p0 from public.proposals where engagement_id = eng and quote_id is null;
  set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';
  perform public.respond_to_proposal(p0, 'approve', null);
  if (select status from public.wedding_vendors where id = eng) <> 'shortlisted' then raise exception 'TEST FAIL: presentation approve did not move to shortlisted'; end if;
end $$;

-- ── (2) request → send-before-amount FV241 → record (+file) → send = Quote 1 ──
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ declare eng uuid; q1 uuid; p1 uuid;
begin
  select id into eng from public.wedding_vendors where vendor_id = 'd0000000-0000-0000-0000-0000000000f3';
  q1 := public.request_quote(eng);
  if (select status from public.wedding_vendors where id = eng) <> 'quote_requested' then raise exception 'TEST FAIL: not quote_requested'; end if;
  -- send before an amount exists → FV241
  begin perform public.send_quote(q1, null); raise exception 'TEST FAIL: sent a quote with no amount';
  exception when sqlstate 'FV241' then null; end;
  perform public.record_quote(q1, 5000, current_date + 30, 'incl delivery', 'cccccccc-0000-0000-0000-0000000000c1/quotes/' || q1 || '/f.pdf');
  if (select status from public.quotes where id = q1) <> 'received' then raise exception 'TEST FAIL: quote not received'; end if;
  if (select file from public.quotes where id = q1) is null then raise exception 'TEST FAIL: quote file not persisted (the whole M13 DB fix)'; end if;
  if (select status from public.wedding_vendors where id = eng) <> 'quoted' then raise exception 'TEST FAIL: engagement not quoted'; end if;
  p1 := public.send_quote(q1, 'our first quote');
  if (select title from public.proposals where id = p1) not like '%Quote 1' then raise exception 'TEST FAIL: sent proposal is not Quote 1'; end if;
  if (select estimate_amount from public.proposals where id = p1) <> 5000 then raise exception 'TEST FAIL: sent proposal amount wrong'; end if;
  if (select quote_id from public.proposals where id = p1) <> q1 then raise exception 'TEST FAIL: sent proposal not linked to the quote'; end if;
end $$;

-- ── (3) couple: empty change note FV222; then request_change opens Quote 2's row
-- and moves quoted → quote_requested; the message lands in the thread ───────────
set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ declare eng uuid; p1 uuid;
begin
  select id into eng from public.wedding_vendors where vendor_id = 'd0000000-0000-0000-0000-0000000000f3';
  select id into p1 from public.proposals where engagement_id = eng and quote_id is not null and status in ('sent','seen') order by created_at desc limit 1;
  begin perform public.respond_to_proposal(p1, 'request_change', '   '); raise exception 'TEST FAIL: empty change note accepted';
  exception when sqlstate 'FV222' then null; end;
  perform public.respond_to_proposal(p1, 'request_change', 'Could you come down a little?');
  if (select status from public.wedding_vendors where id = eng) <> 'quote_requested' then raise exception 'TEST FAIL: change_requested did not move engagement to quote_requested'; end if;
  if (select count(*) from public.quotes where engagement_id = eng and status = 'requested') <> 1 then raise exception 'TEST FAIL: a fresh requested quote was not opened'; end if;
  if (select count(*) from public.proposal_messages where proposal_id = p1) <> 1 then raise exception 'TEST FAIL: the couple message did not land in the thread'; end if;
end $$;

-- ── (4) staff records Quote 2 at a new amount, sends it = Quote 2 (ordinal) ────
-- Simulate real elapsed time: in production Quote 1 and Quote 2 are recorded in
-- separate transactions (distinct created_at); a single hermetic txn shares one
-- now(), so backdate the already-received Quote 1 to make send_quote's created_at
-- ordinal deterministic (exactly the order the ledger will render them in).
reset role;
update public.quotes set created_at = now() - interval '1 hour'
  where status = 'received' and engagement_id = (select id from public.wedding_vendors where vendor_id = 'd0000000-0000-0000-0000-0000000000f3');
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ declare eng uuid; q2 uuid; p2 uuid;
begin
  select id into eng from public.wedding_vendors where vendor_id = 'd0000000-0000-0000-0000-0000000000f3';
  select id into q2 from public.quotes where engagement_id = eng and status = 'requested' order by created_at desc limit 1;
  perform public.record_quote(q2, 4500, current_date + 30, 'revised down', 'cccccccc-0000-0000-0000-0000000000c1/quotes/' || q2 || '/f2.pdf');
  p2 := public.send_quote(q2, 'revised');
  if (select title from public.proposals where id = p2) not like '%Quote 2' then raise exception 'TEST FAIL: second sent quote is not Quote 2'; end if;
end $$;

-- ── (5) couple ACCEPTS Quote 2 → quote 'accepted', engagement STAYS 'quoted' ──
set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ declare eng uuid; p2 uuid;
begin
  select id into eng from public.wedding_vendors where vendor_id = 'd0000000-0000-0000-0000-0000000000f3';
  select id into p2 from public.proposals where engagement_id = eng and quote_id is not null and status in ('sent','seen') order by created_at desc limit 1;
  perform public.respond_to_proposal(p2, 'approve', null);
  if (select status from public.quotes where id = (select quote_id from public.proposals where id = p2)) <> 'accepted' then raise exception 'TEST FAIL: approved quote not accepted'; end if;
  if (select status from public.wedding_vendors where id = eng) <> 'quoted' then raise exception 'TEST FAIL: approve moved the engagement (booking is the planner''s act)'; end if;
end $$;

-- ── (6) planner books the accepted engagement ────────────────────────────────
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ declare eng uuid;
begin
  select id into eng from public.wedding_vendors where vendor_id = 'd0000000-0000-0000-0000-0000000000f3';
  perform public.book_engagement(eng);
  if (select status from public.wedding_vendors where id = eng) <> 'booked' then raise exception 'TEST FAIL: not booked'; end if;
end $$;

-- ── (7) request_quote from 'quoted' (widened from-set) + couple DECLINE moves
-- both the quote and the engagement; couple cannot send_quote (FV230) ───────────
do $$ declare eng uuid; q uuid; p uuid;
begin
  eng := public.present_vendor('d0000000-0000-0000-0000-0000000000f7','cccccccc-0000-0000-0000-0000000000c1', array[]::uuid[], 8000, 'photo');
  q := public.request_quote(eng);
  perform public.record_quote(q, 8000, current_date + 30, null, null);  -- → quoted
  -- widened: request a revised quote straight from 'quoted'
  if public.request_quote(eng) is null then raise exception 'TEST FAIL: request_quote from quoted returned null'; end if;
  if (select status from public.wedding_vendors where id = eng) <> 'quote_requested' then raise exception 'TEST FAIL: request_quote from quoted did not re-open'; end if;
  -- record + send the revised one, then couple declines
  select id into q from public.quotes where engagement_id = eng and status = 'requested' order by created_at desc limit 1;
  perform public.record_quote(q, 7500, current_date + 30, null, null);
  p := public.send_quote(q, 'photo quote');
  set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';
  -- couple cannot send a quote
  begin perform public.send_quote(q, 'nope'); raise exception 'TEST FAIL: couple sent a quote';
  exception when sqlstate 'FV230' then null; end;
  perform public.respond_to_proposal(p, 'decline', 'going another way');
  if (select status from public.quotes where id = q) <> 'declined' then raise exception 'TEST FAIL: declined quote not marked declined'; end if;
  if (select status from public.wedding_vendors where id = eng) <> 'declined' then raise exception 'TEST FAIL: decline did not move the engagement to declined'; end if;
end $$;

reset role;
select 'vendor_ledger: ALL TESTS PASSED' as result;
rollback;
