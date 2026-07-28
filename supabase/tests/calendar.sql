-- 0014 calendar (M11) — the storage laws: meetings + connections are staff-only,
-- the webhook upsert is idempotent (a Calendly event/invitee pair is ONE row across
-- replays), and a cancel FLIPS status while KEEPING the row (history, not deletion).
-- Cross-workspace blindness for both tables. begin;…rollback; hermetic.
begin;

insert into auth.users (id, email) values
  ('11111111-0000-0000-0000-000000000001','ownerA@test.forma'),
  ('22222222-0000-0000-0000-000000000002','memberA@test.forma'),
  ('33333333-0000-0000-0000-000000000003','ownerB@test.forma');
insert into public.profiles (id, display_name) values
  ('11111111-0000-0000-0000-000000000001','Gio'),
  ('22222222-0000-0000-0000-000000000002','Ivy'),
  ('33333333-0000-0000-0000-000000000003','Rival') on conflict do nothing;

insert into public.workspaces (id, kind, name, slug, created_by) values
  ('a0000000-0000-0000-0000-0000000000a1','studio','Atelier','atelier-cal','11111111-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-0000000000b1','studio','Rival','rival-cal','33333333-0000-0000-0000-000000000003');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('a0000000-0000-0000-0000-0000000000a1','11111111-0000-0000-0000-000000000001','owner'),
  ('a0000000-0000-0000-0000-0000000000a1','22222222-0000-0000-0000-000000000002','planner'),
  ('b0000000-0000-0000-0000-0000000000b1','33333333-0000-0000-0000-000000000003','owner');

-- The webhook writes as service-role (bypasses RLS); we simulate that under the
-- superuser (reset role), exactly as the route would.
reset role;
insert into public.calendly_connections (workspace_id, calendly_user_uri, calendly_org_uri, access_token_enc, refresh_token_enc, token_expires_at, timezone)
  values ('a0000000-0000-0000-0000-0000000000a1','https://api.calendly.com/users/UA','https://api.calendly.com/organizations/OA','enc-access','enc-refresh', now() + interval '1 hour', 'America/Mexico_City');

-- webhook upsert #1 (invitee.created)
insert into public.meetings (workspace_id, calendly_event_uri, calendly_invitee_uri, invitee_name, invitee_email, start_at, end_at, status, event_type_name)
  values ('a0000000-0000-0000-0000-0000000000a1','https://api.calendly.com/scheduled_events/EV1','https://api.calendly.com/scheduled_events/EV1/invitees/IN1','Camila Reyes','camila@example.com','2027-03-10T17:00:00Z','2027-03-10T17:30:00Z','scheduled','Discovery call — 30 min')
  on conflict (workspace_id, calendly_event_uri, calendly_invitee_uri) do update set
    status = excluded.status, invitee_name = excluded.invitee_name, updated_at = now();

-- ── (1) staff-only reads: A's member sees the connection + meeting; B's owner is blind
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';  -- A's planner
do $$ begin
  if (select count(*) from public.calendly_connections where workspace_id='a0000000-0000-0000-0000-0000000000a1') <> 1 then raise exception 'TEST FAIL: A member cannot see A connection'; end if;
  if (select count(*) from public.meetings where workspace_id='a0000000-0000-0000-0000-0000000000a1') <> 1 then raise exception 'TEST FAIL: A member cannot see A meeting'; end if;
end $$;
set local request.jwt.claims = '{"sub":"33333333-0000-0000-0000-000000000003","role":"authenticated"}';  -- B owner, not an A member
do $$ begin
  if (select count(*) from public.calendly_connections where workspace_id='a0000000-0000-0000-0000-0000000000a1') <> 0 then raise exception 'TEST FAIL: non-member read A connection'; end if;
  if (select count(*) from public.meetings where workspace_id='a0000000-0000-0000-0000-0000000000a1') <> 0 then raise exception 'TEST FAIL: non-member read A meeting'; end if;
end $$;

-- ── (2) anon (a guest) sees zero rows of either table ────────────────────────
reset role;
set local role anon;
do $$ begin
  if (select count(*) from public.meetings where workspace_id='a0000000-0000-0000-0000-0000000000a1') <> 0 then raise exception 'TEST FAIL: anon read meetings'; end if;
  if (select count(*) from public.calendly_connections where workspace_id='a0000000-0000-0000-0000-0000000000a1') <> 0 then raise exception 'TEST FAIL: anon read connections'; end if;
end $$;

-- ── (3) idempotent upsert: the SAME (event, invitee) again → still ONE row ────
reset role;
insert into public.meetings (workspace_id, calendly_event_uri, calendly_invitee_uri, invitee_name, start_at, status)
  values ('a0000000-0000-0000-0000-0000000000a1','https://api.calendly.com/scheduled_events/EV1','https://api.calendly.com/scheduled_events/EV1/invitees/IN1','Camila Reyes','2027-03-10T17:00:00Z','scheduled')
  on conflict (workspace_id, calendly_event_uri, calendly_invitee_uri) do update set updated_at = now();
do $$ begin
  if (select count(*) from public.meetings where workspace_id='a0000000-0000-0000-0000-0000000000a1') <> 1 then raise exception 'TEST FAIL: replay duplicated the meeting'; end if;
end $$;

-- ── (4) cancel (invitee.canceled) FLIPS status, KEEPS the row ────────────────
insert into public.meetings (workspace_id, calendly_event_uri, calendly_invitee_uri, invitee_name, start_at, status)
  values ('a0000000-0000-0000-0000-0000000000a1','https://api.calendly.com/scheduled_events/EV1','https://api.calendly.com/scheduled_events/EV1/invitees/IN1','Camila Reyes','2027-03-10T17:00:00Z','canceled')
  on conflict (workspace_id, calendly_event_uri, calendly_invitee_uri) do update set status = excluded.status, updated_at = now();
do $$ begin
  if (select count(*) from public.meetings where workspace_id='a0000000-0000-0000-0000-0000000000a1') <> 1 then raise exception 'TEST FAIL: cancel deleted the row'; end if;
  if (select status from public.meetings where workspace_id='a0000000-0000-0000-0000-0000000000a1') <> 'canceled' then raise exception 'TEST FAIL: cancel did not flip status'; end if;
end $$;

reset role;
select 'calendar: ALL TESTS PASSED' as result;
rollback;
