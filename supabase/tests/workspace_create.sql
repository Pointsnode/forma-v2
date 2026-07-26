-- Workspace creation, mirroring the app's exact call sequence (round-3 gate).
-- The M0 UI failed live: the server action did INSERT ... RETURNING (a
-- .select().single()), whose RETURNING is evaluated against the workspaces
-- SELECT policy is_workspace_member(id). The creator is not a member at insert
-- time, so the read-back finds nothing and the insert dies with SQLSTATE 42501 —
-- nothing persists. rls_foundations passed only because it did a raw INSERT with
-- no RETURNING. This test pins BOTH: the trap must still raise, and the fixed
-- no-returning + membership sequence must land, for studio AND couple.
-- Hermetic (PGlite), fixture-scoped, begin; … rollback;.

begin;

insert into auth.users (id, email) values
  ('aaaa0007-0000-0000-0000-0000000000a7', 'creator@test.forma');

set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa0007-0000-0000-0000-0000000000a7","role":"authenticated"}';

-- (1) The trap: INSERT ... RETURNING as the not-yet-member creator must raise
-- an RLS error (42501). This is the exact shape the app used and the assertion
-- that would have caught the live failure.
do $$
declare v_id uuid;
begin
  begin
    insert into public.workspaces (id, kind, name, slug, created_by)
      values ('dddd0001-0000-0000-0000-0000000000d1','studio','Trap','trap','aaaa0007-0000-0000-0000-0000000000a7')
      returning id into v_id;
    raise exception 'TEST FAIL: INSERT ... RETURNING succeeded — the RLS read-back trap is gone, the app-side fix assumption is wrong';
  exception when insufficient_privilege then null; -- 42501: expected, the trap
  end;
end $$;

-- (2) Path A, studio: insert with NO returning, then seat self as owner. Both
-- inserts must succeed and the creator must then see the workspace + membership.
insert into public.workspaces (id, kind, name, slug, created_by)
  values ('dddd0002-0000-0000-0000-0000000000d2','studio','Atelier Demo Studio','atelier-demo-studio','aaaa0007-0000-0000-0000-0000000000a7');
insert into public.workspace_members (workspace_id, user_id, role)
  values ('dddd0002-0000-0000-0000-0000000000d2','aaaa0007-0000-0000-0000-0000000000a7','owner');
do $$ begin
  if (select count(*) from public.workspaces where id='dddd0002-0000-0000-0000-0000000000d2') <> 1 then
    raise exception 'TEST FAIL: studio workspace did not persist / not visible to creator'; end if;
  if (select count(*) from public.workspace_members
      where workspace_id='dddd0002-0000-0000-0000-0000000000d2'
        and user_id='aaaa0007-0000-0000-0000-0000000000a7' and role='owner') <> 1 then
    raise exception 'TEST FAIL: studio owner membership missing'; end if;
end $$;

-- (3) Path A, couple: same sequence, kind = couple.
insert into public.workspaces (id, kind, name, slug, created_by)
  values ('dddd0003-0000-0000-0000-0000000000d3','couple','Nuestra Boda','nuestra-boda','aaaa0007-0000-0000-0000-0000000000a7');
insert into public.workspace_members (workspace_id, user_id, role)
  values ('dddd0003-0000-0000-0000-0000000000d3','aaaa0007-0000-0000-0000-0000000000a7','owner');
do $$ begin
  if (select count(*) from public.workspaces where id='dddd0003-0000-0000-0000-0000000000d3' and kind='couple') <> 1 then
    raise exception 'TEST FAIL: couple workspace did not persist'; end if;
  if (select count(*) from public.workspace_members
      where workspace_id='dddd0003-0000-0000-0000-0000000000d3'
        and user_id='aaaa0007-0000-0000-0000-0000000000a7' and role='owner') <> 1 then
    raise exception 'TEST FAIL: couple owner membership missing'; end if;
end $$;

reset role;
select 'workspace_create: ALL TESTS PASSED' as result;

rollback;
