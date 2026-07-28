-- 0010 concierge — thread/message RLS isolation (staff yes; couple + day_of zero
-- WITH rows present), actor_kind stamping under the flag (+ no leak), the draft
-- write tools, cap arithmetic, and composite-FK cross-workspace rejection.
-- begin;…rollback; hermetic.
begin;

insert into auth.users (id, email) values
  ('11111111-0000-0000-0000-000000000001','staff@test.forma'),
  ('22222222-0000-0000-0000-000000000002','partner@test.forma'),
  ('44444444-0000-0000-0000-000000000004','dayof@test.forma');
insert into public.profiles (id, display_name) values
  ('11111111-0000-0000-0000-000000000001','Jorge'),
  ('22222222-0000-0000-0000-000000000002','Darya'),
  ('44444444-0000-0000-0000-000000000004','Dara D') on conflict do nothing;

insert into public.workspaces (id, kind, name, slug, created_by) values
  ('a0000000-0000-0000-0000-0000000000a1','studio','Atelier','atelier','11111111-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-0000000000a2','studio','Other Studio','other','11111111-0000-0000-0000-000000000001');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('a0000000-0000-0000-0000-0000000000a1','11111111-0000-0000-0000-000000000001','owner');

insert into public.weddings (id, workspace_id, slug, couple_display, kind, phase) values
  ('c0000000-0000-0000-0000-0000000000c1','a0000000-0000-0000-0000-0000000000a1','w1','Priya & Arjun','destination','foundations'),
  ('c0000000-0000-0000-0000-0000000000c2','a0000000-0000-0000-0000-0000000000a2','w2','Other Pair','city','foundations');
insert into public.wedding_members (wedding_id, user_id, role) values
  ('c0000000-0000-0000-0000-0000000000c1','22222222-0000-0000-0000-000000000002','partner'),
  ('c0000000-0000-0000-0000-0000000000c1','44444444-0000-0000-0000-000000000004','day_of');

insert into public.concierge_settings (workspace_id, enabled) values
  ('a0000000-0000-0000-0000-0000000000a1', true);

-- an orchestrator thread (NULL wedding) + a wedding thread, each with a message
insert into public.concierge_threads (id, workspace_id, wedding_id, title, created_by) values
  ('d0000000-0000-0000-0000-0000000000d1','a0000000-0000-0000-0000-0000000000a1', null, 'What''s next this week','11111111-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-0000000000d2','a0000000-0000-0000-0000-0000000000a1','c0000000-0000-0000-0000-0000000000c1','P&A','11111111-0000-0000-0000-000000000001');
insert into public.concierge_messages (thread_id, role, content) values
  ('d0000000-0000-0000-0000-0000000000d1','planner','¿Qué sigue esta semana?'),
  ('d0000000-0000-0000-0000-0000000000d2','concierge','Borrador listo.');

insert into public.contract_templates (id, workspace_id, kind, name, body) values
  ('e0000000-0000-0000-0000-0000000000e1','a0000000-0000-0000-0000-0000000000a1','full','Full planning','This agreement is between {couple_names} and the studio.');

-- ── (1) staff sees both threads + messages ───────────────────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.concierge_threads where workspace_id='a0000000-0000-0000-0000-0000000000a1') <> 2 then raise exception 'TEST FAIL: staff cannot see both threads'; end if;
  if (select count(*) from public.concierge_messages where thread_id in ('d0000000-0000-0000-0000-0000000000d1','d0000000-0000-0000-0000-0000000000d2')) <> 2 then raise exception 'TEST FAIL: staff cannot see messages'; end if;
  if (select count(*) from public.concierge_settings where workspace_id='a0000000-0000-0000-0000-0000000000a1') <> 1 then raise exception 'TEST FAIL: staff cannot see settings'; end if;
end $$;

-- ── (2) couple + day_of see ZERO, with rows present (the isolation leg) ───────
set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.concierge_threads where workspace_id='a0000000-0000-0000-0000-0000000000a1') <> 0 then raise exception 'TEST FAIL: couple can see concierge threads'; end if;
  if (select count(*) from public.concierge_messages where thread_id in ('d0000000-0000-0000-0000-0000000000d1','d0000000-0000-0000-0000-0000000000d2')) <> 0 then raise exception 'TEST FAIL: couple can see concierge messages'; end if;
  if (select count(*) from public.concierge_settings where workspace_id='a0000000-0000-0000-0000-0000000000a1') <> 0 then raise exception 'TEST FAIL: couple can see concierge settings'; end if;
end $$;
set local request.jwt.claims = '{"sub":"44444444-0000-0000-0000-000000000004","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.concierge_threads where workspace_id='a0000000-0000-0000-0000-0000000000a1') <> 0 then raise exception 'TEST FAIL: day_of can see concierge threads'; end if;
  if (select count(*) from public.concierge_messages where thread_id in ('d0000000-0000-0000-0000-0000000000d1','d0000000-0000-0000-0000-0000000000d2')) <> 0 then raise exception 'TEST FAIL: day_of can see concierge messages'; end if;
end $$;

-- ── (3) draft-write tools stamp actor_kind='concierge' ───────────────────────
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ declare v_prop uuid; v_task uuid; v_led uuid; v_con uuid; begin
  v_prop := public.concierge_draft_proposal('c0000000-0000-0000-0000-0000000000c1','Venue follow-up','let''s revisit', 5000, null);
  if (select status from public.proposals where id = v_prop) <> 'draft' then raise exception 'TEST FAIL: concierge proposal not a draft'; end if;
  if (select actor_kind from public.activity where verb='proposal_drafted' and (subject->>'proposal_id')=v_prop::text) <> 'concierge' then
    raise exception 'TEST FAIL: proposal_drafted not stamped concierge'; end if;

  v_task := public.concierge_add_task('c0000000-0000-0000-0000-0000000000c1', null, 'Chase the florist', current_date + 7, null, null, null, null);
  if (select actor_kind from public.activity where verb='task_created' and (subject->>'task_id')=v_task::text) <> 'concierge' then
    raise exception 'TEST FAIL: concierge task_created not stamped concierge'; end if;

  v_led := public.concierge_add_ledger_line('c0000000-0000-0000-0000-0000000000c1','Overtime estimate', 450, null);
  if (select status from public.ledger_lines where id = v_led) <> 'expected' then raise exception 'TEST FAIL: ledger line not expected'; end if;
  if (select kind from public.ledger_lines where id = v_led) <> 'manual' then raise exception 'TEST FAIL: ledger line not manual'; end if;

  v_con := public.concierge_draft_contract('c0000000-0000-0000-0000-0000000000c1','e0000000-0000-0000-0000-0000000000e1','Planner agreement','planner_agreement');
  if (select status from public.contracts where id = v_con) <> 'draft' then raise exception 'TEST FAIL: concierge contract not a draft'; end if;
  if (select body from public.contract_draft_content where contract_id = v_con) not like 'This agreement is between%' then
    raise exception 'TEST FAIL: template body not copied into draft'; end if;
  if (select actor_kind from public.activity where verb='contract_created' and (subject->>'contract_id')=v_con::text) <> 'concierge' then
    raise exception 'TEST FAIL: contract_created not stamped concierge'; end if;
end $$;

-- ── (4) the flag does not leak — a plain log after concierge calls is 'user' ──
reset role;
do $$ begin
  perform private.log_activity('c0000000-0000-0000-0000-0000000000c1', null, 'test_plain_verb', 'x', '{}'::jsonb);
  if (select actor_kind from public.activity where verb='test_plain_verb') <> 'user' then
    raise exception 'TEST FAIL: plain activity stamped concierge (flag leaked past the RPC)'; end if;
end $$;

-- ── (5) a non-staff cannot drive the write tools (FV230) ─────────────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ begin
  begin perform public.concierge_draft_proposal('c0000000-0000-0000-0000-0000000000c1','sneak',null,null,null);
    raise exception 'TEST FAIL: couple drafted a proposal via the concierge tool';
  exception when sqlstate 'FV230' then null; end;
end $$;

-- ── (6) cap arithmetic: usage accumulates per workspace per day ──────────────
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin
  perform public.concierge_record_usage('a0000000-0000-0000-0000-0000000000a1', 1000, 200);
  perform public.concierge_record_usage('a0000000-0000-0000-0000-0000000000a1', 500, 100);
  if (select tokens_in from public.concierge_usage where workspace_id='a0000000-0000-0000-0000-0000000000a1' and day=current_date) <> 1500 then
    raise exception 'TEST FAIL: usage tokens_in did not accumulate'; end if;
  if (select tokens_out from public.concierge_usage where workspace_id='a0000000-0000-0000-0000-0000000000a1' and day=current_date) <> 300 then
    raise exception 'TEST FAIL: usage tokens_out did not accumulate'; end if;
end $$;

-- ── (7) composite FK: a thread cannot bind a wedding from another workspace ───
reset role;
do $$ begin
  begin insert into public.concierge_threads (workspace_id, wedding_id, title)
    values ('a0000000-0000-0000-0000-0000000000a1','c0000000-0000-0000-0000-0000000000c2','cross');  -- ws A + wedding B
    raise exception 'TEST FAIL: thread accepted a cross-workspace wedding';
  exception when foreign_key_violation then null; end;
end $$;

-- ── (8) approval lane: a pending action card, approve = the mapped fn run as the
-- planner ('user', not concierge), and drift = the fn's own refusal ────────────
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ declare v_prop uuid; begin
  -- a fresh DRAFT proposal (via the concierge draft tool)
  v_prop := public.concierge_draft_proposal('c0000000-0000-0000-0000-0000000000c1','Venue deposit proposal', null, 12000, null);
  -- TWO propose_action cards in one turn each persist as their own row (finding 2)
  insert into public.concierge_messages (thread_id, role, content, action_ref) values
    ('d0000000-0000-0000-0000-0000000000d2','concierge','Prepared for your approval',
     jsonb_build_object('fn','send_proposal','args', jsonb_build_object('proposal_id', v_prop), 'summary','Send the venue deposit proposal','status','pending')),
    ('d0000000-0000-0000-0000-0000000000d2','concierge','And one more',
     jsonb_build_object('fn','advance_phase','args', jsonb_build_object('wedding_id','c0000000-0000-0000-0000-0000000000c1'), 'summary','Advance the phase','status','pending'));
  if (select count(*) from public.concierge_messages where thread_id='d0000000-0000-0000-0000-0000000000d2' and action_ref is not null) <> 2 then
    raise exception 'TEST FAIL: two proposed actions did not both persist'; end if;

  -- APPROVE = the endpoint's exact call shape (send_proposal as the planner). No
  -- acting_as_concierge flag → the resulting activity is stamped 'user'.
  perform public.send_proposal(v_prop);
  if (select status from public.proposals where id = v_prop) <> 'sent' then
    raise exception 'TEST FAIL: approval did not send the proposal'; end if;
  if (select actor_kind from public.activity where verb='proposal_sent' and (subject->>'proposal_id')=v_prop::text) <> 'user' then
    raise exception 'TEST FAIL: approved action stamped concierge, not user'; end if;

  -- DRIFT: approving again (already sent) surfaces the function's own refusal (FV221)
  begin perform public.send_proposal(v_prop);
    raise exception 'TEST FAIL: re-approval sent an already-sent proposal';
  exception when sqlstate 'FV221' then null; end;
end $$;

-- action cards obey the same RLS: the couple sees zero of that thread's messages
set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.concierge_messages where thread_id='d0000000-0000-0000-0000-0000000000d2' and action_ref is not null) <> 0 then
    raise exception 'TEST FAIL: couple can see a concierge action card'; end if;
end $$;

reset role;
select 'concierge: ALL TESTS PASSED' as result;
rollback;
