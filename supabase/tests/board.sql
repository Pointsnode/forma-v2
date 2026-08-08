-- MSG-1 — the Board: visibility matrix, DEFINER refusals, mentions/notifications, reactions,
-- task chips + completion line, and the concierge context-assembly money-scoping. Hermetic,
-- fixture-scoped, begin; … rollback;.

begin;

insert into auth.users (id, email) values
  ('a1000000-0000-0000-0000-000000000001', 'staffa@test.forma'),
  ('a1000000-0000-0000-0000-000000000002', 'staffb@test.forma'),
  ('a1000000-0000-0000-0000-000000000003', 'dayof@test.forma'),
  ('a1000000-0000-0000-0000-000000000004', 'outsider@test.forma');
insert into public.workspaces (id, kind, name, slug, created_by) values
  ('b1000000-0000-0000-0000-000000000001', 'studio', 'WS A', 'ws-a', 'a1000000-0000-0000-0000-000000000001'),
  ('b1000000-0000-0000-0000-000000000002', 'studio', 'WS B', 'ws-b', 'a1000000-0000-0000-0000-000000000004');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'owner'),
  ('b1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000002', 'planner'),
  ('b1000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000004', 'owner');
insert into public.weddings (id, workspace_id, slug, couple_display, kind, phase) values
  ('c1000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'w1', 'W One', 'city', 'wedding_days');
-- A day_of coordinator (wedding member, NOT workspace staff, money-blocked).
insert into public.wedding_members (wedding_id, user_id, role) values
  ('c1000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000003', 'day_of');
-- Money for W.
insert into public.ledger_lines (wedding_id, title, amount) values ('c1000000-0000-0000-0000-000000000001', 'Venue', 1000);
-- A client-lane row (seeded on the service path) must be structurally invisible this phase.
insert into public.board_messages (workspace_id, wedding_id, lane, author_kind, author_id, body)
  values ('b1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'client', 'user', 'a1000000-0000-0000-0000-000000000001', 'client-msg-1');

-- staffA posts a wedding-team message (mentioning staffB) and a studio message.
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin
  perform public.board_post('b1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'team-msg-1', array['a1000000-0000-0000-0000-000000000002','a1000000-0000-0000-0000-000000000004']::uuid[]);
  perform public.board_post('b1000000-0000-0000-0000-000000000001', null, 'studio-msg-1', null);
end $$;

-- (visibility) staffA sees the team message + studio message; the client-lane row stays invisible.
do $$ begin
  if (select count(*) from public.board_messages where body = 'team-msg-1') <> 1 then raise exception 'TEST FAIL: staff cannot read own team message'; end if;
  if (select count(*) from public.board_messages where body = 'studio-msg-1') <> 1 then raise exception 'TEST FAIL: staff cannot read studio message'; end if;
  if (select count(*) from public.board_messages where body = 'client-msg-1') <> 0 then raise exception 'TEST FAIL: client-lane row is visible'; end if;
end $$;
-- No client writes.
do $$ declare ok boolean; begin
  begin insert into public.board_messages (workspace_id, wedding_id, author_kind, author_id, body) values ('b1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'user', 'a1000000-0000-0000-0000-000000000001', 'hack'); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: client wrote board_messages directly'; end if;
end $$;
-- Reactions toggle; an invalid emoji is refused.
do $$ declare on1 boolean; on2 boolean; begin
  on1 := public.board_toggle_reaction((select id from public.board_messages where body = 'team-msg-1'), '👍');
  on2 := public.board_toggle_reaction((select id from public.board_messages where body = 'team-msg-1'), '👍');
  if not on1 or on2 then raise exception 'TEST FAIL: reaction toggle wrong (% then %)', on1, on2; end if;
end $$;
do $$ declare ok boolean; begin
  begin perform public.board_toggle_reaction((select id from public.board_messages where body = 'team-msg-1'), '💀'); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: a non-allowed reaction was accepted'; end if;
end $$;
-- Task from a message → task created + linked; completing it posts a system line.
do $$ declare v_task uuid; begin
  v_task := public.board_make_task((select id from public.board_messages where body = 'team-msg-1'), 'Book the florist', null);
  if (select task_id from public.board_messages where body = 'team-msg-1') <> v_task then raise exception 'TEST FAIL: message not linked to its task'; end if;
  update public.tasks set done_at = now(), status = 'completed' where id = v_task;
  if (select count(*) from public.board_messages where task_id = v_task and system_event = 'task_completed') <> 1 then raise exception 'TEST FAIL: no completion system line'; end if;
end $$;
-- Edit / delete own; mark read.
do $$ begin
  perform public.board_edit((select id from public.board_messages where body = 'studio-msg-1'), 'studio-msg-1-edited');
  if (select count(*) from public.board_messages where body = 'studio-msg-1-edited') <> 1 then raise exception 'TEST FAIL: edit did not apply'; end if;
  perform public.board_mark_read('b1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001');
  if (select count(*) from public.board_reads where user_id = 'a1000000-0000-0000-0000-000000000001' and wedding_id = 'c1000000-0000-0000-0000-000000000001') <> 1 then raise exception 'TEST FAIL: read marker not written'; end if;
end $$;
-- board_edit refuses a soft-deleted message (FV272).
do $$ declare v_id uuid; ok boolean; begin
  select id into v_id from public.board_messages where body = 'studio-msg-1-edited';
  perform public.board_delete(v_id);
  begin perform public.board_edit(v_id, 'resurrect'); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: a deleted message was edited'; end if;
end $$;
-- (money-scoping, context-assembly layer) staffA sees the wedding money; the day_of coordinator does not.
do $$ begin
  if (select count(*) from public.ledger_lines where wedding_id = 'c1000000-0000-0000-0000-000000000001') <> 1 then raise exception 'TEST FAIL: staff cannot see wedding money'; end if;
end $$;

-- (B) staffB reads the thread (also staff), owns their notification, and can mark it read.
set local request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.board_messages where body = 'team-msg-1') <> 1 then raise exception 'TEST FAIL: staffB cannot read the team thread'; end if;
  if (select count(*) from public.notifications where user_id = 'a1000000-0000-0000-0000-000000000002') <> 1 then raise exception 'TEST FAIL: staffB sees the wrong notification set'; end if;
  perform public.board_mark_notifications_read();
  if (select count(*) from public.notifications where user_id = 'a1000000-0000-0000-0000-000000000002' and read_at is null) <> 0 then raise exception 'TEST FAIL: notifications not marked read'; end if;
end $$;
-- staffB cannot edit or delete staffA's message.
do $$ declare ok boolean; begin
  begin perform public.board_edit((select id from public.board_messages where body = 'team-msg-1'), 'hijack'); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: staffB edited another author message'; end if;
end $$;

-- (day_of) coordinator is not team staff: the team thread and the money are both invisible.
set local request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-000000000003","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.board_messages where body = 'team-msg-1') <> 0 then raise exception 'TEST FAIL: day_of coordinator sees the team thread'; end if;
  if (select count(*) from public.ledger_lines where wedding_id = 'c1000000-0000-0000-0000-000000000001') <> 0 then raise exception 'TEST FAIL: money-blocked coordinator saw the money (context-assembly leak)'; end if;
end $$;

-- (outsider) another workspace: sees nothing, and every DEFINER refuses.
set local request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-000000000004","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.board_messages where body = 'team-msg-1') <> 0 then raise exception 'TEST FAIL: outsider reads the thread'; end if;
  -- The outsider was mentioned but has no access → no notification reached them (own-rows RLS).
  if (select count(*) from public.notifications where user_id = 'a1000000-0000-0000-0000-000000000004') <> 0 then raise exception 'TEST FAIL: outsider was notified of a thread they cannot see'; end if;
end $$;
do $$ declare ok boolean; begin
  begin perform public.board_post('b1000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000001', 'intrude', null); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: outsider posted to a thread they cannot see'; end if;
end $$;
do $$ declare ok boolean; begin
  begin perform public.board_make_task((select id from public.board_messages where body = 'team-msg-1'), 'x', null); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: outsider made a task on a hidden message'; end if;
end $$;

rollback;
