-- 0003 loop — the full M2 harness (SCHEMA §11): proposal lifecycle state machine
-- (every legal + illegal transition), function-only status enforcement, the app's
-- call shapes, court view, composite-FK cross-wedding rejection, invite single-use
-- / expiry / revoke, and the RLS matrix. Hermetic (PGlite), begin; … rollback;.

begin;

-- ── Fixtures (superuser — RLS asserted separately below) ─────────────────────
insert into auth.users (id, email) values
  ('11111111-0000-0000-0000-000000000001','staff@test.forma'),
  ('22222222-0000-0000-0000-000000000002','partner@test.forma'),
  ('33333333-0000-0000-0000-000000000003','stranger@test.forma'),
  ('44444444-0000-0000-0000-000000000004','invitee@test.forma');
insert into public.workspaces (id, kind, name, slug, created_by)
  values ('aaaaaaaa-0000-0000-0000-0000000000a1','studio','Atelier','atelier','11111111-0000-0000-0000-000000000001');
insert into public.workspace_members (workspace_id, user_id, role)
  values ('aaaaaaaa-0000-0000-0000-0000000000a1','11111111-0000-0000-0000-000000000001','owner');
insert into public.weddings (id, workspace_id, slug, couple_display, kind) values
  ('cccccccc-0000-0000-0000-0000000000c1','aaaaaaaa-0000-0000-0000-0000000000a1','w1','W One','city'),
  ('cccccccc-0000-0000-0000-0000000000c2','aaaaaaaa-0000-0000-0000-0000000000a1','w2','W Two','city');
insert into public.wedding_members (wedding_id, user_id, role)
  values ('cccccccc-0000-0000-0000-0000000000c1','22222222-0000-0000-0000-000000000002','partner');
insert into public.wedding_events (id, wedding_id, label, event_date) values
  ('eeee1111-0000-0000-0000-0000000000e1','cccccccc-0000-0000-0000-0000000000c1','Ceremony','2027-05-01'),
  ('eeee2222-0000-0000-0000-0000000000e2','cccccccc-0000-0000-0000-0000000000c2','Ceremony','2027-06-01');

-- ── (1) app call shape: staff INSERT draft ... RETURNING; member can't see draft
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ declare v uuid;
begin
  insert into public.proposals (id, wedding_id, title, note, estimate_amount, event_ref, created_by)
    values ('aaaa0001-0000-0000-0000-0000000000f1','cccccccc-0000-0000-0000-0000000000c1','Floral concept','less orange', 37000, 'eeee1111-0000-0000-0000-0000000000e1','11111111-0000-0000-0000-000000000001')
    returning id into v;
  if v is null then raise exception 'TEST FAIL: staff proposal INSERT ... RETURNING read back null'; end if;
end $$;

-- (1b) direct status change is rejected (function-only); content edit is fine.
do $$ begin
  begin
    update public.proposals set status = 'sent' where id = 'aaaa0001-0000-0000-0000-0000000000f1';
    raise exception 'TEST FAIL: direct status change allowed';
  exception when sqlstate 'FV220' then null; end;
end $$;
update public.proposals set title = 'Floral concept v1' where id = 'aaaa0001-0000-0000-0000-0000000000f1'; -- content edit ok

-- (1c) member cannot see a draft
set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.proposals where id = 'aaaa0001-0000-0000-0000-0000000000f1') <> 0 then
    raise exception 'TEST FAIL: member sees a draft proposal'; end if;
end $$;

-- ── (2) send_proposal: authz + transition ───────────────────────────────────
-- member cannot send
do $$ begin
  begin perform public.send_proposal('aaaa0001-0000-0000-0000-0000000000f1');
    raise exception 'TEST FAIL: member sent a proposal';
  exception when sqlstate 'FV230' then null; end;
end $$;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
select public.send_proposal('aaaa0001-0000-0000-0000-0000000000f1');
do $$ begin
  if (select status from public.proposals where id='aaaa0001-0000-0000-0000-0000000000f1') <> 'sent' then
    raise exception 'TEST FAIL: proposal not sent'; end if;
  if (select sent_at from public.proposals where id='aaaa0001-0000-0000-0000-0000000000f1') is null then
    raise exception 'TEST FAIL: sent_at not stamped'; end if;
  if (select count(*) from public.activity where verb='proposal_sent' and wedding_id='cccccccc-0000-0000-0000-0000000000c1') <> 1 then
    raise exception 'TEST FAIL: proposal_sent activity missing'; end if;
end $$;
-- re-send is illegal
do $$ begin
  begin perform public.send_proposal('aaaa0001-0000-0000-0000-0000000000f1');
    raise exception 'TEST FAIL: re-sent a non-draft';
  exception when sqlstate 'FV221' then null; end;
end $$;

-- ── (3) mark_proposal_seen: member first-call-wins; stranger denied ──────────
set local request.jwt.claims = '{"sub":"33333333-0000-0000-0000-000000000003","role":"authenticated"}';
do $$ begin
  begin perform public.mark_proposal_seen('aaaa0001-0000-0000-0000-0000000000f1');
    raise exception 'TEST FAIL: stranger marked seen';
  exception when sqlstate 'FV230' then null; end;
end $$;
set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';
select public.mark_proposal_seen('aaaa0001-0000-0000-0000-0000000000f1');
select public.mark_proposal_seen('aaaa0001-0000-0000-0000-0000000000f1'); -- idempotent no-op
do $$ begin
  if (select status from public.proposals where id='aaaa0001-0000-0000-0000-0000000000f1') <> 'seen' then
    raise exception 'TEST FAIL: not seen'; end if;
  if (select count(*) from public.activity where verb='proposal_seen') <> 1 then
    raise exception 'TEST FAIL: seen logged more than once (first call should win)'; end if;
end $$;

-- ── (4) respond_to_proposal: staff denied; message required for change ───────
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin
  begin perform public.respond_to_proposal('aaaa0001-0000-0000-0000-0000000000f1','approve',null);
    raise exception 'TEST FAIL: staff responded as the couple';
  exception when sqlstate 'FV230' then null; end;
end $$;
set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ begin
  begin perform public.respond_to_proposal('aaaa0001-0000-0000-0000-0000000000f1','request_change',null);
    raise exception 'TEST FAIL: change requested without a message';
  exception when sqlstate 'FV222' then null; end;
end $$;
select public.respond_to_proposal('aaaa0001-0000-0000-0000-0000000000f1','request_change','less orange, more blush');
do $$ begin
  if (select status from public.proposals where id='aaaa0001-0000-0000-0000-0000000000f1') <> 'change_requested' then
    raise exception 'TEST FAIL: not change_requested'; end if;
  if (select responded_by from public.proposals where id='aaaa0001-0000-0000-0000-0000000000f1') <> '22222222-0000-0000-0000-000000000002' then
    raise exception 'TEST FAIL: responded_by not stamped'; end if;
  if (select count(*) from public.proposal_messages where proposal_id='aaaa0001-0000-0000-0000-0000000000f1') <> 1 then
    raise exception 'TEST FAIL: change message not appended'; end if;
end $$;
-- cannot respond again (change_requested is not sent/seen)
do $$ begin
  begin perform public.respond_to_proposal('aaaa0001-0000-0000-0000-0000000000f1','approve',null);
    raise exception 'TEST FAIL: responded to a change_requested proposal';
  exception when sqlstate 'FV221' then null; end;
end $$;

-- (4b) post_proposal_message wrapper — the private→wrapper hop under the
-- authenticated role (the shape that broke in production; 0004 fixes it).
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
select public.post_proposal_message('aaaa0001-0000-0000-0000-0000000000f1', 'Asked Flor y Canto for a blush-forward revision.');
do $$ begin
  if (select count(*) from public.proposal_messages where proposal_id='aaaa0001-0000-0000-0000-0000000000f1') <> 2 then
    raise exception 'TEST FAIL: post_proposal_message did not append'; end if;
end $$;

-- ── (5) approve path + withdraw ──────────────────────────────────────────────
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
insert into public.proposals (id, wedding_id, title, created_by)
  values ('aaaa0002-0000-0000-0000-0000000000f2','cccccccc-0000-0000-0000-0000000000c1','Menu v2','11111111-0000-0000-0000-000000000001');
select public.send_proposal('aaaa0002-0000-0000-0000-0000000000f2');
set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';
select public.respond_to_proposal('aaaa0002-0000-0000-0000-0000000000f2','approve',null);
do $$ begin
  if (select status from public.proposals where id='aaaa0002-0000-0000-0000-0000000000f2') <> 'approved' then
    raise exception 'TEST FAIL: not approved'; end if;
end $$;
-- withdraw a fresh sent proposal (staff)
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
insert into public.proposals (id, wedding_id, title, created_by)
  values ('aaaa0003-0000-0000-0000-0000000000f3','cccccccc-0000-0000-0000-0000000000c1','DJ set','11111111-0000-0000-0000-000000000001');
select public.send_proposal('aaaa0003-0000-0000-0000-0000000000f3');
select public.withdraw_proposal('aaaa0003-0000-0000-0000-0000000000f3');
do $$ begin
  if (select status from public.proposals where id='aaaa0003-0000-0000-0000-0000000000f3') <> 'withdrawn' then
    raise exception 'TEST FAIL: not withdrawn'; end if;
  begin perform public.withdraw_proposal('aaaa0003-0000-0000-0000-0000000000f3');
    raise exception 'TEST FAIL: withdrew a settled proposal';
  exception when sqlstate 'FV221' then null; end;
end $$;

-- ── (6) court view ───────────────────────────────────────────────────────────
do $$ begin
  if (select court from public.proposal_court where proposal_id='aaaa0001-0000-0000-0000-0000000000f1') <> 'planner' then
    raise exception 'TEST FAIL: change_requested court should be planner'; end if;
  if (select court from public.proposal_court where proposal_id='aaaa0002-0000-0000-0000-0000000000f2') <> 'none' then
    raise exception 'TEST FAIL: approved court should be none'; end if;
end $$;

-- ── (7) composite-FK cross-wedding rejection (superuser: FK, not RLS) ─────────
reset role;
do $$ begin
  begin
    insert into public.proposals (wedding_id, title, event_ref)
      values ('cccccccc-0000-0000-0000-0000000000c1','Cross','eeee2222-0000-0000-0000-0000000000e2'); -- W2's event on a W1 proposal
    raise exception 'TEST FAIL: proposal linked an event of another wedding';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.proposal_messages (proposal_id, wedding_id, body)
      values ('aaaa0001-0000-0000-0000-0000000000f1','cccccccc-0000-0000-0000-0000000000c2','x'); -- wrong wedding_id
    raise exception 'TEST FAIL: message crossed weddings';
  exception when foreign_key_violation then null; end;
end $$;

-- ── (8) invites: accept, single-use, expiry, invalid, revoke ─────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
insert into public.wedding_invites (id, wedding_id, role, token, created_by)
  values ('bbbb0001-0000-0000-0000-0000000000b1','cccccccc-0000-0000-0000-0000000000c1','partner','TOKENtokenTOKENtoken1234','11111111-0000-0000-0000-000000000001');
-- invalid + expired
set local request.jwt.claims = '{"sub":"44444444-0000-0000-0000-000000000004","role":"authenticated"}';
do $$ begin
  begin perform public.accept_wedding_invite('nope-nope-nope-nope-nope1');
    raise exception 'TEST FAIL: accepted an invalid token';
  exception when sqlstate 'FV223' then null; end;
end $$;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
insert into public.wedding_invites (id, wedding_id, role, token, created_by, expires_at)
  values ('bbbb0002-0000-0000-0000-0000000000b2','cccccccc-0000-0000-0000-0000000000c1','family','EXPIREDexpiredEXPIRE1234','11111111-0000-0000-0000-000000000001', now() - interval '1 day');
set local request.jwt.claims = '{"sub":"44444444-0000-0000-0000-000000000004","role":"authenticated"}';
do $$ begin
  begin perform public.accept_wedding_invite('EXPIREDexpiredEXPIRE1234');
    raise exception 'TEST FAIL: accepted an expired invite';
  exception when sqlstate 'FV225' then null; end;
end $$;
-- valid accept → joins + single-use
select public.accept_wedding_invite('TOKENtokenTOKENtoken1234');
do $$ begin
  if (select count(*) from public.wedding_members where wedding_id='cccccccc-0000-0000-0000-0000000000c1' and user_id='44444444-0000-0000-0000-000000000004') <> 1 then
    raise exception 'TEST FAIL: invitee did not become a member'; end if;
  begin perform public.accept_wedding_invite('TOKENtokenTOKENtoken1234');
    raise exception 'TEST FAIL: reused a single-use invite';
  exception when sqlstate 'FV224' then null; end;
end $$;
-- couple never sees the invites table
do $$ begin
  if (select count(*) from public.wedding_invites where wedding_id='cccccccc-0000-0000-0000-0000000000c1') <> 0 then
    raise exception 'TEST FAIL: member can read wedding_invites'; end if;
end $$;
-- staff revoke unused
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
delete from public.wedding_invites where id='bbbb0002-0000-0000-0000-0000000000b2';
do $$ begin
  if (select count(*) from public.wedding_invites where id='bbbb0002-0000-0000-0000-0000000000b2') <> 0 then
    raise exception 'TEST FAIL: unused invite not revoked'; end if;
end $$;

-- ── (9) RLS read matrix ──────────────────────────────────────────────────────
-- member (a2) sees non-draft proposals, messages, activity; not invites.
set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.proposals where wedding_id='cccccccc-0000-0000-0000-0000000000c1') < 3 then
    raise exception 'TEST FAIL: member cannot see sent proposals'; end if;
  if (select count(*) from public.proposal_messages where wedding_id='cccccccc-0000-0000-0000-0000000000c1') < 1 then
    raise exception 'TEST FAIL: member cannot see messages'; end if;
  if (select count(*) from public.activity where wedding_id='cccccccc-0000-0000-0000-0000000000c1') < 1 then
    raise exception 'TEST FAIL: member cannot see activity'; end if;
end $$;
-- stranger (a3) sees nothing
set local request.jwt.claims = '{"sub":"33333333-0000-0000-0000-000000000003","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.proposals where wedding_id='cccccccc-0000-0000-0000-0000000000c1') <> 0 then raise exception 'TEST FAIL: stranger sees proposals'; end if;
  if (select count(*) from public.proposal_messages where wedding_id='cccccccc-0000-0000-0000-0000000000c1') <> 0 then raise exception 'TEST FAIL: stranger sees messages'; end if;
  if (select count(*) from public.activity where wedding_id='cccccccc-0000-0000-0000-0000000000c1') <> 0 then raise exception 'TEST FAIL: stranger sees activity'; end if;
end $$;

-- ── (10) profiles: staff ↔ couple see each other across a shared wedding ─────
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.profiles where id = '22222222-0000-0000-0000-000000000002') <> 1 then
    raise exception 'TEST FAIL: staff cannot see the couple member profile'; end if;
end $$;
set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.profiles where id = '11111111-0000-0000-0000-000000000001') <> 1 then
    raise exception 'TEST FAIL: couple member cannot see the staff profile'; end if;
  -- but a stranger's profile stays hidden
  if (select count(*) from public.profiles where id = '33333333-0000-0000-0000-000000000003') <> 0 then
    raise exception 'TEST FAIL: couple member sees an unrelated profile'; end if;
end $$;

reset role;
select 'loop: ALL TESTS PASSED' as result;

rollback;
