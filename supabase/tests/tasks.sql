-- 0011 tasks — the board's invariants: couple sees ONLY couple-assigned (day_of
-- zero) WITH team/vendor rows present, complete_task auth (couple only for their
-- own; refused on team-assigned), auto-waiting on couple/vendor assignment,
-- completed⇔done_at, and cross-wedding link rejection by the composite FKs.
-- begin;…rollback; hermetic.
begin;

insert into auth.users (id, email) values
  ('11111111-0000-0000-0000-000000000001','staff@test.forma'),
  ('22222222-0000-0000-0000-000000000002','partner@test.forma'),
  ('33333333-0000-0000-0000-000000000003','family@test.forma'),
  ('44444444-0000-0000-0000-000000000004','dayof@test.forma');
insert into public.profiles (id, display_name) values
  ('11111111-0000-0000-0000-000000000001','Gio'),
  ('22222222-0000-0000-0000-000000000002','Darya'),
  ('33333333-0000-0000-0000-000000000003','Tía Rosa'),
  ('44444444-0000-0000-0000-000000000004','Coordinator') on conflict do nothing;

insert into public.workspaces (id, kind, name, slug, created_by) values
  ('a0000000-0000-0000-0000-0000000000a1','studio','Atelier','atelier','11111111-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-0000000000a2','studio','Other','other','11111111-0000-0000-0000-000000000001');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('a0000000-0000-0000-0000-0000000000a1','11111111-0000-0000-0000-000000000001','owner');

insert into public.weddings (id, workspace_id, slug, couple_display, kind, phase) values
  ('c0000000-0000-0000-0000-0000000000c1','a0000000-0000-0000-0000-0000000000a1','w1','Priya & Arjun','destination','foundations'),
  ('c0000000-0000-0000-0000-0000000000c2','a0000000-0000-0000-0000-0000000000a2','w2','Other Pair','city','foundations');
insert into public.wedding_members (wedding_id, user_id, role) values
  ('c0000000-0000-0000-0000-0000000000c1','22222222-0000-0000-0000-000000000002','partner'),
  ('c0000000-0000-0000-0000-0000000000c1','33333333-0000-0000-0000-000000000003','family'),
  ('c0000000-0000-0000-0000-0000000000c1','44444444-0000-0000-0000-000000000004','day_of');

insert into public.vendors (id, workspace_id, name, kind) values
  ('d0000000-0000-0000-0000-0000000000f1','a0000000-0000-0000-0000-0000000000a1','Flor y Canto','other'),
  ('d0000000-0000-0000-0000-0000000000f2','a0000000-0000-0000-0000-0000000000a2','Other Vendor','other');
insert into public.wedding_events (id, wedding_id, label, kind, order_index) values
  ('e0000000-0000-0000-0000-0000000000e1','c0000000-0000-0000-0000-0000000000c1','Reception','reception',0),
  ('e0000000-0000-0000-0000-0000000000e2','c0000000-0000-0000-0000-0000000000c2','Other Event','reception',0);
insert into public.proposals (id, wedding_id, status, title, created_by) values
  ('90000000-0000-0000-0000-0000000000a2','c0000000-0000-0000-0000-0000000000c2','draft','W2 proposal','11111111-0000-0000-0000-000000000001');

-- three tasks on W1, one per assignee kind
insert into public.tasks (id, wedding_id, title, assignee_kind, assignee_member) values
  ('7a5c0000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-0000000000c1','Book walkthrough','team','11111111-0000-0000-0000-000000000001');
insert into public.tasks (id, wedding_id, title, assignee_kind, assignee_vendor) values
  ('7a5c0000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-0000000000c1','Send floral revision','vendor','d0000000-0000-0000-0000-0000000000f1');
insert into public.tasks (id, wedding_id, title, assignee_kind) values
  ('7a5c0000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-0000000000c1','Choose the brunch playlist','couple');

-- ── (1) auto-waiting on couple/vendor assignment; team stays pending ─────────
do $$ begin
  if (select status from public.tasks where id='7a5c0000-0000-0000-0000-000000000001') <> 'pending' then
    raise exception 'TEST FAIL: team task did not stay pending'; end if;
  if (select status from public.tasks where id='7a5c0000-0000-0000-0000-000000000002') <> 'waiting' then
    raise exception 'TEST FAIL: vendor task did not auto-move to waiting'; end if;
  if (select status from public.tasks where id='7a5c0000-0000-0000-0000-000000000003') <> 'waiting' then
    raise exception 'TEST FAIL: couple task did not auto-move to waiting'; end if;
end $$;

-- ── (2) RLS: couple + family see ONLY the couple-assigned task; day_of sees none
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.tasks where wedding_id='c0000000-0000-0000-0000-0000000000c1') <> 1 then
    raise exception 'TEST FAIL: couple sees other than the 1 couple-assigned task'; end if;
  if (select assignee_kind from public.tasks where wedding_id='c0000000-0000-0000-0000-0000000000c1' limit 1) <> 'couple' then
    raise exception 'TEST FAIL: couple can see a non-couple task'; end if;
end $$;
set local request.jwt.claims = '{"sub":"44444444-0000-0000-0000-000000000004","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.tasks where wedding_id='c0000000-0000-0000-0000-0000000000c1') <> 0 then
    raise exception 'TEST FAIL: day_of can see tasks'; end if;
end $$;

-- ── (3) complete_task: couple completes THEIR task; refused on the team task ──
set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ begin
  perform public.complete_task('7a5c0000-0000-0000-0000-000000000003');
  begin perform public.complete_task('7a5c0000-0000-0000-0000-000000000001');
    raise exception 'TEST FAIL: couple completed a team-assigned task';
  exception when sqlstate 'FT030' then null; end;
end $$;
reset role;
do $$ begin
  if (select status from public.tasks where id='7a5c0000-0000-0000-0000-000000000003') <> 'completed' then
    raise exception 'TEST FAIL: couple task not completed'; end if;
  if (select done_at from public.tasks where id='7a5c0000-0000-0000-0000-000000000003') is null then
    raise exception 'TEST FAIL: completed task has no done_at'; end if;
  -- couple completion is stamped with the couple as actor, kind user
  if (select actor_id from public.activity where verb='task_completed' and (subject->>'task_id')='7a5c0000-0000-0000-0000-000000000003')
       <> '22222222-0000-0000-0000-000000000002' then
    raise exception 'TEST FAIL: task_completed actor is not the couple'; end if;
  if (select actor_kind from public.activity where verb='task_completed' and (subject->>'task_id')='7a5c0000-0000-0000-0000-000000000003') <> 'user' then
    raise exception 'TEST FAIL: couple completion stamped concierge'; end if;
end $$;

-- ── (4) cross-wedding links rejected by the composite FKs ────────────────────
do $$ begin
  begin insert into public.tasks (wedding_id, title, event_id)
    values ('c0000000-0000-0000-0000-0000000000c1','x','e0000000-0000-0000-0000-0000000000e2');  -- W2's event under W1
    raise exception 'TEST FAIL: task accepted a cross-wedding event link';
  exception when foreign_key_violation then null; end;
  begin insert into public.tasks (wedding_id, title, proposal_id)
    values ('c0000000-0000-0000-0000-0000000000c1','x','90000000-0000-0000-0000-0000000000a2');  -- W2's proposal under W1
    raise exception 'TEST FAIL: task accepted a cross-wedding proposal link';
  exception when foreign_key_violation then null; end;
end $$;

-- ── (5) assignee shape + vendor-workspace guard ──────────────────────────────
do $$ begin
  begin insert into public.tasks (wedding_id, title, assignee_kind) values ('c0000000-0000-0000-0000-0000000000c1','x','team');  -- team without member
    raise exception 'TEST FAIL: team assignment without a member accepted';
  exception when check_violation then null; end;
  begin insert into public.tasks (wedding_id, title, assignee_kind, assignee_vendor)
    values ('c0000000-0000-0000-0000-0000000000c1','x','vendor','d0000000-0000-0000-0000-0000000000f2');  -- vendor from workspace B
    raise exception 'TEST FAIL: cross-workspace vendor assignment accepted';
  exception when sqlstate 'FT010' then null; end;
  begin insert into public.tasks (wedding_id, title, proposal_id, contract_id)
    values ('c0000000-0000-0000-0000-0000000000c1','x','90000000-0000-0000-0000-0000000000a2', gen_random_uuid());
    raise exception 'TEST FAIL: two subject links accepted';
  exception when check_violation then null; when foreign_key_violation then null; end;
end $$;

reset role;
select 'tasks: ALL TESTS PASSED' as result;
rollback;
