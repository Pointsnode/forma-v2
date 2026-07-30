-- 0016 team & clearances (M15). Invites (admin-gated create, email-matched accept,
-- idempotent), clearance enforcement AT THE DATABASE (a day-of member is refused
-- present_vendor/send_quote with FS050; ticking the vendors box unlocks present_vendor
-- while send stays refused), the last-admin guard (can't strip/remove the sole admin),
-- and anon refusal of both invite functions. Hermetic, begin;…rollback;.
begin;

insert into auth.users (id, email) values
  ('11111111-0000-0000-0000-000000000001','admin@test.forma'),
  ('22222222-0000-0000-0000-000000000002','dayof@test.forma'),
  ('33333333-0000-0000-0000-000000000003','planner@test.forma'),
  ('44444444-0000-0000-0000-000000000004','stranger@test.forma');
insert into public.profiles (id, display_name) values
  ('11111111-0000-0000-0000-000000000001','Admin'),
  ('22222222-0000-0000-0000-000000000002','Dayof'),
  ('33333333-0000-0000-0000-000000000003','Planner'),
  ('44444444-0000-0000-0000-000000000004','Stranger') on conflict do nothing;
insert into public.workspaces (id, kind, name, slug, created_by) values
  ('a0000000-0000-0000-0000-0000000000a1','studio','Atelier','atelier-team','11111111-0000-0000-0000-000000000001');
insert into public.workspace_members (workspace_id, user_id, role, grants) values
  ('a0000000-0000-0000-0000-0000000000a1','11111111-0000-0000-0000-000000000001','owner', array['admin']),
  ('a0000000-0000-0000-0000-0000000000a1','33333333-0000-0000-0000-000000000003','planner', array['tasks']);
insert into public.weddings (id, workspace_id, slug, couple_display, kind, budget_total, guest_target, location_city, location_country)
  values ('cccccccc-0000-0000-0000-0000000000c1','a0000000-0000-0000-0000-0000000000a1','w1','W One','city',100000,100,'CDMX','MX');
insert into public.vendors (id, workspace_id, name, kind) values
  ('d0000000-0000-0000-0000-0000000000f3','a0000000-0000-0000-0000-0000000000a1','Flor y Canto','florals');

-- ── (1) anon can execute neither invite function (matrix stays 10) ────────────
set local role anon;
do $$ begin
  begin perform public.create_workspace_invite('a0000000-0000-0000-0000-0000000000a1','x@y.com', array['tasks'], null);
    raise exception 'TEST FAIL: anon created an invite';
  exception when insufficient_privilege then null; end;
  begin perform public.accept_workspace_invite(gen_random_uuid());
    raise exception 'TEST FAIL: anon accepted an invite';
  exception when insufficient_privilege then null; end;
end $$;
reset role;

-- ── (2) admin creates an invite; a non-admin member cannot (FS050) ────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"33333333-0000-0000-0000-000000000003","role":"authenticated"}';  -- planner, grants {tasks}
do $$ begin
  begin perform public.create_workspace_invite('a0000000-0000-0000-0000-0000000000a1','dayof@test.forma', array['tasks','dayof'], 'Day-of');
    raise exception 'TEST FAIL: non-admin created an invite';
  exception when sqlstate 'FS050' then null; end;
end $$;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';  -- admin
do $$ declare inv uuid;
begin
  inv := public.create_workspace_invite('a0000000-0000-0000-0000-0000000000a1','dayof@test.forma', array['tasks','dayof'], 'Day-of coordinator');
  if (select count(*) from public.workspace_invites where id = inv and array['tasks','dayof']::text[] <@ grants and grants <@ array['tasks','dayof']::text[]) <> 1 then
    raise exception 'TEST FAIL: invite grants not stored'; end if;
  -- dup pending invite → FV241; inviting an existing member's email → FV241
  begin perform public.create_workspace_invite('a0000000-0000-0000-0000-0000000000a1','dayof@test.forma', array['tasks'], null);
    raise exception 'TEST FAIL: duplicate pending invite accepted';
  exception when sqlstate 'FV241' then null; end;
  begin perform public.create_workspace_invite('a0000000-0000-0000-0000-0000000000a1','planner@test.forma', array['tasks'], null);
    raise exception 'TEST FAIL: invited an existing member';
  exception when sqlstate 'FV241' then null; end;
end $$;

-- The invitee/stranger are not admins, so RLS hides workspace_invites from them —
-- capture the token as superuser (the invite email is the only thing they'd have).
reset role;
create temp table t_tok as select token from public.workspace_invites where email = 'dayof@test.forma' and accepted_at is null;
grant select on t_tok to authenticated;

-- ── (3) accept: wrong email refused; correct invitee joins; idempotent ────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"44444444-0000-0000-0000-000000000004","role":"authenticated"}';  -- stranger@ ≠ dayof@
do $$ declare tok uuid;
begin
  select token into tok from t_tok limit 1;
  begin perform public.accept_workspace_invite(tok);
    raise exception 'TEST FAIL: accepted an invite sent to a different email';
  exception when sqlstate 'FV241' then null; end;
end $$;
set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';  -- dayof@ (matches)
do $$ declare tok uuid; ws uuid;
begin
  select token into tok from t_tok limit 1;
  ws := public.accept_workspace_invite(tok);
  if ws <> 'a0000000-0000-0000-0000-0000000000a1' then raise exception 'TEST FAIL: accept returned wrong workspace'; end if;
  if (select role from public.workspace_members where workspace_id = ws and user_id = '22222222-0000-0000-0000-000000000002') <> 'planner' then
    raise exception 'TEST FAIL: non-admin invitee should not be owner'; end if;
  if not (array['tasks','dayof']::text[] <@ (select grants from public.workspace_members where workspace_id = ws and user_id = '22222222-0000-0000-0000-000000000002')) then
    raise exception 'TEST FAIL: invitee did not get the invited grants'; end if;
  -- idempotent second accept returns the workspace id (not an error)
  if public.accept_workspace_invite(tok) <> ws then raise exception 'TEST FAIL: second accept not idempotent'; end if;
end $$;

-- ── (4) has_clearance shape for the day-of member vs the admin ────────────────
do $$ begin
  if private.has_clearance('a0000000-0000-0000-0000-0000000000a1','tasks') is not true then raise exception 'TEST FAIL: day-of lacks tasks'; end if;
  if private.has_clearance('a0000000-0000-0000-0000-0000000000a1','contracts') is not false then raise exception 'TEST FAIL: day-of should not have contracts'; end if;
  if private.has_clearance('a0000000-0000-0000-0000-0000000000a1','admin') is not false then raise exception 'TEST FAIL: day-of should not be admin'; end if;
end $$;

-- ── (5) DoD-5 enforcement at the DB: day-of refused present_vendor + send (FS050);
-- ticking vendors unlocks present_vendor; send still refused ───────────────────
do $$ begin
  begin perform public.present_vendor('d0000000-0000-0000-0000-0000000000f3','cccccccc-0000-0000-0000-0000000000c1', array[]::uuid[], 5000, 'x');
    raise exception 'TEST FAIL: day-of presented a vendor without the box';
  exception when sqlstate 'FS050' then null; end;
end $$;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';  -- admin ticks vendors
do $$ begin
  perform public.set_member_clearances('a0000000-0000-0000-0000-0000000000a1','22222222-0000-0000-0000-000000000002', array['tasks','dayof','vendors'], 'Vendor & day-of');
end $$;
set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ declare eng uuid; q uuid;
begin
  eng := public.present_vendor('d0000000-0000-0000-0000-0000000000f3','cccccccc-0000-0000-0000-0000000000c1', array[]::uuid[], 5000, 'now allowed');
  if (select status from public.wedding_vendors where id = eng) <> 'presented' then raise exception 'TEST FAIL: vendors box did not unlock present_vendor'; end if;
  q := public.request_quote(eng);                       -- not box-gated
  perform public.record_quote(q, 5000, current_date + 30, null, null);  -- vendors box → ok
  begin perform public.send_quote(q, 'nope');           -- send box → still refused
    raise exception 'TEST FAIL: day-of sent a quote without the send box';
  exception when sqlstate 'FS050' then null; end;
end $$;

-- ── (6) last-admin guard: sole admin can't strip own admin nor remove self ────
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin
  begin perform public.set_member_clearances('a0000000-0000-0000-0000-0000000000a1','11111111-0000-0000-0000-000000000001', array['weddings'], null);
    raise exception 'TEST FAIL: sole admin stripped their own admin box';
  exception when sqlstate 'FV241' then null; end;
  begin perform public.remove_member('a0000000-0000-0000-0000-0000000000a1','11111111-0000-0000-0000-000000000001');
    raise exception 'TEST FAIL: sole admin removed themselves';
  exception when sqlstate 'FV241' then null; end;
  -- promote the day-of member to admin → now two admins → admin can step down
  perform public.set_member_clearances('a0000000-0000-0000-0000-0000000000a1','22222222-0000-0000-0000-000000000002', array['admin'], 'Co-admin');
  perform public.remove_member('a0000000-0000-0000-0000-0000000000a1','11111111-0000-0000-0000-000000000001');
  if (select count(*) from public.workspace_members where workspace_id='a0000000-0000-0000-0000-0000000000a1' and user_id='11111111-0000-0000-0000-000000000001') <> 0 then
    raise exception 'TEST FAIL: admin not removed once a second admin existed'; end if;
end $$;

reset role;
select 'team: ALL TESTS PASSED' as result;
rollback;
