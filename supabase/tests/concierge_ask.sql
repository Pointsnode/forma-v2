-- M16a — the DB truth behind FC010 (§A). assertWeddingReachable is TypeScript, but it rests on
-- two database facts this test pins: (1) weddings_select RLS hides another workspace's wedding
-- from a studio's staff, so the orchestrator can never even read it; (2) the concierge draft RPCs
-- enforce is_wedding_staff, so lifting them to orchestrator scope with an arbitrary wedding_id is
-- safe BY CONSTRUCTION — a wedding outside the studio raises FV230, never a write. Hermetic.
begin;

insert into auth.users (id, email) values
  ('11111111-0000-0000-0000-000000000001','a@test.forma'),
  ('22222222-0000-0000-0000-000000000002','b@test.forma'),
  ('33333333-0000-0000-0000-000000000003','coord@test.forma');
insert into public.profiles (id, display_name) values
  ('11111111-0000-0000-0000-000000000001','Studio A'),
  ('22222222-0000-0000-0000-000000000002','Studio B'),
  ('33333333-0000-0000-0000-000000000003','Coordinator') on conflict do nothing;

-- Two studios; user A owns workspace A, user B owns workspace B. A coordinator in A holds only
-- the 'couples' box (no 'tasks') — used in (3) to pin the predicate the concierge task gate reads.
insert into public.workspaces (id, kind, name, slug, created_by) values
  ('a0000000-0000-0000-0000-0000000000a1','studio','Studio A','studio-a','11111111-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-0000000000b1','studio','Studio B','studio-b','22222222-0000-0000-0000-000000000002');
insert into public.workspace_members (workspace_id, user_id, role, grants) values
  ('a0000000-0000-0000-0000-0000000000a1','11111111-0000-0000-0000-000000000001','owner', array['admin']),
  ('b0000000-0000-0000-0000-0000000000b1','22222222-0000-0000-0000-000000000002','owner', array['admin']),
  ('a0000000-0000-0000-0000-0000000000a1','33333333-0000-0000-0000-000000000003','planner', array['couples']);
insert into public.weddings (id, workspace_id, slug, couple_display, kind, phase) values
  ('c0000000-0000-0000-0000-0000000000a1','a0000000-0000-0000-0000-0000000000a1','wa','A Couple','city','foundations'),
  ('c0000000-0000-0000-0000-0000000000b1','b0000000-0000-0000-0000-0000000000b1','wb','B Couple','city','foundations');

-- ── (1) RLS: A's staff sees its own wedding, NOT workspace B's (the read side of FC010) ──
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.weddings where id = 'c0000000-0000-0000-0000-0000000000a1') <> 1 then
    raise exception 'TEST FAIL: A cannot see its own wedding'; end if;
  if (select count(*) from public.weddings where id = 'c0000000-0000-0000-0000-0000000000b1') <> 0 then
    raise exception 'TEST FAIL: A can see workspace B''s wedding (assertWeddingReachable would leak)'; end if;
end $$;

-- ── (2) draft RPC is staff-gated: A drafting into B's wedding → FV230 (safe by construction) ──
do $$ begin
  begin perform public.concierge_add_ledger_line('c0000000-0000-0000-0000-0000000000b1','sneak', 100, null);
    raise exception 'TEST FAIL: A drafted a ledger line into workspace B''s wedding';
  exception when sqlstate 'FV230' then null; end;
  -- and the same draft into A's OWN wedding works, as a safe expected draft (no send)
  declare v uuid;
  begin
    v := public.concierge_add_ledger_line('c0000000-0000-0000-0000-0000000000a1','Overtime', 450, null);
    if (select status from public.ledger_lines where id = v) <> 'expected' then raise exception 'TEST FAIL: draft not expected'; end if;
  end;
end $$;

-- ── (3) §H the tasks-box predicate the concierge add_task/add_studio_task gate reads ──────
-- The FS050 refusal itself lives in the tool lane (clearanceGate over has_clearance), the same
-- shape as M15's boxes and the draft_contract/draft_proposal/add_ledger_line gates — boxes are
-- enforced at the function lane, not RLS. This pins the exact truth that gate keys on: a member
-- WITHOUT the 'tasks' box has no tasks clearance (→ FS050), while the admin does.
set local request.jwt.claims = '{"sub":"33333333-0000-0000-0000-000000000003","role":"authenticated"}';
do $$ begin
  if private.has_clearance('a0000000-0000-0000-0000-0000000000a1','tasks') is not false then
    raise exception 'TEST FAIL: coordinator without the tasks box has tasks clearance (concierge add_task would not refuse)'; end if;
  if private.has_clearance('a0000000-0000-0000-0000-0000000000a1','couples') is not true then
    raise exception 'TEST FAIL: coordinator lacks its own couples box'; end if;
end $$;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin
  if private.has_clearance('a0000000-0000-0000-0000-0000000000a1','tasks') is not true then
    raise exception 'TEST FAIL: admin lacks tasks clearance'; end if;
end $$;

reset role;
select 'concierge_ask: ALL TESTS PASSED' as result;
rollback;
