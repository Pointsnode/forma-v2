-- 0001 foundations — RLS matrix + tenancy isolation (schema §10) and the
-- FK-rejection harness pattern that later composite-FK migrations inherit (§11).
-- Hermetic (PGlite), fixture-scoped, begin; … rollback;.

begin;

-- signup trigger creates profiles
insert into auth.users (id, email) values
  ('aaaa0001-0000-0000-0000-0000000000a1', 'u1@test.forma'),
  ('aaaa0002-0000-0000-0000-0000000000a2', 'u2@test.forma'),
  ('aaaa0003-0000-0000-0000-0000000000a3', 'u3@test.forma');

do $$ begin
  if (select count(*) from public.profiles where id in
      ('aaaa0001-0000-0000-0000-0000000000a1','aaaa0002-0000-0000-0000-0000000000a2','aaaa0003-0000-0000-0000-0000000000a3')) <> 3 then
    raise exception 'TEST FAIL: handle_new_user did not create profiles'; end if;
end $$;

-- (1) RLS bootstrap: u1 creates a workspace (created_by self) + seats self as owner
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa0001-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$ begin
  insert into public.workspaces (id, kind, name, slug, created_by)
    values ('bbbb0001-0000-0000-0000-0000000000b1','studio','Studio A','studio-a','aaaa0001-0000-0000-0000-0000000000a1');
  insert into public.workspace_members (workspace_id, user_id, role)
    values ('bbbb0001-0000-0000-0000-0000000000b1','aaaa0001-0000-0000-0000-0000000000a1','owner');
  if (select count(*) from public.workspaces where id='bbbb0001-0000-0000-0000-0000000000b1') <> 1 then
    raise exception 'TEST FAIL: owner cannot see own workspace'; end if;
end $$;

-- (2) a non-member (u2) cannot see workspace A
set local request.jwt.claims = '{"sub":"aaaa0002-0000-0000-0000-0000000000a2","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.workspaces where id='bbbb0001-0000-0000-0000-0000000000b1') <> 0 then
    raise exception 'TEST FAIL: non-member sees workspace A'; end if;
  -- and cannot create a workspace owned by someone else
  begin
    insert into public.workspaces (kind, name, slug, created_by)
      values ('studio','Sneaky','sneaky','aaaa0001-0000-0000-0000-0000000000a1');
    raise exception 'TEST FAIL: created a workspace owned by another user';
  exception when insufficient_privilege then null; end;
end $$;

-- (3) owner (u1) adds u2 as planner; a non-owner (u3) cannot touch the roster
set local request.jwt.claims = '{"sub":"aaaa0001-0000-0000-0000-0000000000a1","role":"authenticated"}';
insert into public.workspace_members (workspace_id, user_id, role)
  values ('bbbb0001-0000-0000-0000-0000000000b1','aaaa0002-0000-0000-0000-0000000000a2','planner');
set local request.jwt.claims = '{"sub":"aaaa0003-0000-0000-0000-0000000000a3","role":"authenticated"}';
do $$ begin
  begin
    insert into public.workspace_members (workspace_id, user_id, role)
      values ('bbbb0001-0000-0000-0000-0000000000b1','aaaa0003-0000-0000-0000-0000000000a3','planner');
    raise exception 'TEST FAIL: non-owner added a member';
  exception when insufficient_privilege then null; end;
end $$;

-- (4) the added planner (u2) now sees A; u3 still does not
set local request.jwt.claims = '{"sub":"aaaa0002-0000-0000-0000-0000000000a2","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.workspaces where id='bbbb0001-0000-0000-0000-0000000000b1') <> 1 then
    raise exception 'TEST FAIL: added planner cannot see workspace A'; end if;
end $$;
set local request.jwt.claims = '{"sub":"aaaa0003-0000-0000-0000-0000000000a3","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.workspaces where id='bbbb0001-0000-0000-0000-0000000000b1') <> 0 then
    raise exception 'TEST FAIL: non-member u3 sees workspace A'; end if;
end $$;

-- (5) profiles: co-members read each other (avatars); a non-co-member does not
set local request.jwt.claims = '{"sub":"aaaa0001-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.profiles where id='aaaa0002-0000-0000-0000-0000000000a2') <> 1 then
    raise exception 'TEST FAIL: co-member profile not readable'; end if;
  if (select count(*) from public.profiles where id='aaaa0003-0000-0000-0000-0000000000a3') <> 0 then
    raise exception 'TEST FAIL: non-co-member profile leaked'; end if;
end $$;

-- (6) FK-rejection harness (M0 analogue of the composite cross-wedding pattern):
-- a membership pointing at a non-existent workspace is rejected by the FK itself.
reset role;
do $$ begin
  begin
    insert into public.workspace_members (workspace_id, user_id, role)
      values ('cccc0009-0000-0000-0000-0000000000c9','aaaa0001-0000-0000-0000-0000000000a1','owner');
    raise exception 'TEST FAIL: membership to a non-existent workspace allowed';
  exception when foreign_key_violation then null; end;
end $$;

-- (7) anon sees nothing
set local role anon;
do $$ begin
  if (select count(*) from public.workspaces where id='bbbb0001-0000-0000-0000-0000000000b1') <> 0 then
    raise exception 'TEST FAIL: anon reads workspaces'; end if;
end $$;

reset role;
select 'rls_foundations: ALL TESTS PASSED' as result;

rollback;
