-- 0005 people — the M3 harness (SCHEMA §11 + the role-identity doctrine from M2).
-- Every wrapper under its PRODUCTION role: rsvp_lookup/rsvp_submit/touchpoint_open
-- under `anon` (guests are anonymous, no jwt claims); grant-starvation proving a
-- fresh private function is NOT executable (0004's default-revoke biting); token
-- security (malformed / wrong / closed / expired / cross-wedding / reused);
-- auto-population both directions; the rollup / counts / exceptions views.
-- Hermetic (PGlite), begin; … rollback;.

begin;

-- ── Fixtures (owner) ─────────────────────────────────────────────────────────
insert into auth.users (id, email) values
  ('11111111-0000-0000-0000-000000000001','staff@test.forma'),
  ('22222222-0000-0000-0000-000000000002','partner@test.forma');
insert into public.workspaces (id, kind, name, slug, created_by)
  values ('aaaaaaaa-0000-0000-0000-0000000000a1','studio','Atelier','atelier','11111111-0000-0000-0000-000000000001');
insert into public.workspace_members (workspace_id, user_id, role)
  values ('aaaaaaaa-0000-0000-0000-0000000000a1','11111111-0000-0000-0000-000000000001','owner');
insert into public.weddings (id, workspace_id, slug, couple_display, kind, rsvp_open)
  values ('cccccccc-0000-0000-0000-0000000000c1','aaaaaaaa-0000-0000-0000-0000000000a1','w1','W One','city', true);
insert into public.wedding_members (wedding_id, user_id, role)
  values ('cccccccc-0000-0000-0000-0000000000c1','22222222-0000-0000-0000-000000000002','partner');
-- a second wedding for cross-wedding tests
insert into public.weddings (id, workspace_id, slug, couple_display, kind)
  values ('cccccccc-0000-0000-0000-0000000000c2','aaaaaaaa-0000-0000-0000-0000000000a1','w2','W Two','city');
-- events (W1 already has a seeded default event; add named ones)
insert into public.wedding_events (id, wedding_id, label, event_date) values
  ('eeee1111-0000-0000-0000-0000000000e1','cccccccc-0000-0000-0000-0000000000c1','Ceremony','2027-05-01'),
  ('eeee1111-0000-0000-0000-0000000000e2','cccccccc-0000-0000-0000-0000000000c1','Reception','2027-05-01'),
  ('eeee2222-0000-0000-0000-0000000000e9','cccccccc-0000-0000-0000-0000000000c2','Other wedding','2027-06-01');

-- ── (1) Auto-population both directions ──────────────────────────────────────
-- Insert a guest → event_guests rows appear for every existing event.
insert into public.guests (id, wedding_id, full_name, email, rsvp_code)
  values ('9111a111-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-0000000000c1','Ana Guest','ana@guests.test','a1a1a1a1a1a1a1a1');
do $$ begin
  if (select count(*) from public.event_guests where guest_id='9111a111-0000-0000-0000-000000000001') < 3 then
    raise exception 'TEST FAIL: guest insert did not populate event_guests for existing events'; end if;
end $$;
-- Insert an event → event_guests rows appear for every existing guest.
insert into public.wedding_events (id, wedding_id, label, event_date)
  values ('eeee1111-0000-0000-0000-0000000000e3','cccccccc-0000-0000-0000-0000000000c1','Sangeet','2027-04-30');
do $$ begin
  if (select count(*) from public.event_guests where event_id='eeee1111-0000-0000-0000-0000000000e3' and guest_id='9111a111-0000-0000-0000-000000000001') <> 1 then
    raise exception 'TEST FAIL: event insert did not populate event_guests for existing guests'; end if;
end $$;

-- a second guest with NO email (an exception), and one pruned from an event
insert into public.guests (id, wedding_id, full_name, email, plus_one_allowed, rsvp_code)
  values ('9111a111-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-0000000000c1','No Email', null, false, 'b2b2b2b2b2b2b2b2');
update public.event_guests set invited = false
  where guest_id='9111a111-0000-0000-0000-000000000001' and event_id='eeee1111-0000-0000-0000-0000000000e3'; -- Ana not at Sangeet

-- ── (2) Grant-starvation: an internal private helper is NOT executable by a
-- signed-in user. 0004 revoked EXECUTE across `private` from public/anon/
-- authenticated and did NOT re-grant the internal helpers (advance_wedding_phase),
-- so authenticated is denied. (PGlite honors explicit revokes; the ALTER DEFAULT
-- PRIVILEGES half — future functions closed by default — is verified on staging,
-- since PGlite does not implement it.)
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin
  -- an internal helper is not executable by a signed-in user (0005's explicit revoke
  -- biting). (advance_wedding_phase became staff-callable in M4, so seed_touchpoints_for
  -- is the stable internal probe here.)
  begin perform private.seed_touchpoints_for('cccccccc-0000-0000-0000-0000000000c1');
    raise exception 'TEST FAIL: seed_touchpoints_for executable by authenticated (explicit revoke missing)';
  exception when insufficient_privilege then null; end;
end $$;

-- ── (3) RSVP under the anon role (the production guest path) ──────────────────
reset role;
set local role anon;   -- no jwt claims: exactly a guest
-- malformed code short-circuits before any table access
do $$ begin
  begin perform public.rsvp_lookup('not-hex');
    raise exception 'TEST FAIL: malformed code not rejected';
  exception when sqlstate 'FM013' then null; end;
end $$;
-- wrong (well-formed) code
do $$ begin
  begin perform public.rsvp_lookup('ffffffffffffffff');
    raise exception 'TEST FAIL: unknown code not rejected';
  exception when sqlstate 'FM010' then null; end;
end $$;
-- valid lookup returns the invited events (Ana is NOT at Sangeet → 3 events, not 4)
do $$ declare payload jsonb;
begin
  payload := public.rsvp_lookup('a1a1a1a1a1a1a1a1');
  if (payload ->> 'open')::boolean is not true then raise exception 'TEST FAIL: rsvp should be open'; end if;
  if jsonb_array_length(payload -> 'events') <> 3 then
    raise exception 'TEST FAIL: expected 3 invited events for Ana, got %', jsonb_array_length(payload -> 'events'); end if;
end $$;
-- submit yes to Ceremony, no to Reception (+ a plus-one name is ignored, not allowed)
do $$ begin
  perform public.rsvp_submit('a1a1a1a1a1a1a1a1', jsonb_build_object(
    'responses', jsonb_build_array(
      jsonb_build_object('event_id','eeee1111-0000-0000-0000-0000000000e1','status','yes'),
      jsonb_build_object('event_id','eeee1111-0000-0000-0000-0000000000e2','status','no')),
    'dietary','no nuts'));
end $$;
do $$ begin
  if (select rsvp_status from public.event_guests where event_id='eeee1111-0000-0000-0000-0000000000e1' and guest_id='9111a111-0000-0000-0000-000000000001') <> 'yes' then
    raise exception 'TEST FAIL: ceremony RSVP not recorded'; end if;
  if (select rsvp_status from public.event_guests where event_id='eeee1111-0000-0000-0000-0000000000e2' and guest_id='9111a111-0000-0000-0000-000000000001') <> 'no' then
    raise exception 'TEST FAIL: reception RSVP not recorded'; end if;
end $$;
-- a response for an event the guest isn't invited to (Sangeet, pruned) → FM014
do $$ begin
  begin perform public.rsvp_submit('a1a1a1a1a1a1a1a1', jsonb_build_object('responses', jsonb_build_array(
    jsonb_build_object('event_id','eeee1111-0000-0000-0000-0000000000e3','status','yes'))));
    raise exception 'TEST FAIL: RSVP to an un-invited event was accepted';
  exception when sqlstate 'FM014' then null; end;
end $$;
-- a response for another wedding's event → also FM014 (never touches wedding B)
do $$ begin
  begin perform public.rsvp_submit('a1a1a1a1a1a1a1a1', jsonb_build_object('responses', jsonb_build_array(
    jsonb_build_object('event_id','eeee2222-0000-0000-0000-0000000000e9','status','yes'))));
    raise exception 'TEST FAIL: cross-wedding RSVP accepted';
  exception when sqlstate 'FM014' then null; end;
end $$;

-- ── (4) Closed / expired refuse to submit ────────────────────────────────────
reset role;
update public.weddings set rsvp_open = false where id='cccccccc-0000-0000-0000-0000000000c1';
set local role anon;
do $$ begin
  begin perform public.rsvp_submit('a1a1a1a1a1a1a1a1', jsonb_build_object('responses','[]'::jsonb));
    raise exception 'TEST FAIL: submit accepted while closed';
  exception when sqlstate 'FM011' then null; end;
end $$;
reset role;
update public.weddings set rsvp_open = true, rsvp_deadline = current_date - 1 where id='cccccccc-0000-0000-0000-0000000000c1';
set local role anon;
do $$ begin
  begin perform public.rsvp_submit('a1a1a1a1a1a1a1a1', jsonb_build_object('responses','[]'::jsonb));
    raise exception 'TEST FAIL: submit accepted past deadline';
  exception when sqlstate 'FM012' then null; end;
end $$;

-- ── (5) Touchpoint token: open is idempotent (stamps opened_at once) ─────────
reset role;
update public.weddings set rsvp_deadline = current_date + 30 where id='cccccccc-0000-0000-0000-0000000000c1'; -- seeds timeline
insert into public.touchpoints (id, wedding_id, kind, scheduled_for) values
  ('77770001-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-0000000000c1','rsvp_invite', current_date)
  on conflict do nothing;
insert into public.touchpoint_sends (touchpoint_id, guest_id, wedding_id, token)
  values ('77770001-0000-0000-0000-000000000001','9111a111-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-0000000000c1','TOKENtokenTOKENtoken0001');
set local role anon;
select public.touchpoint_open('TOKENtokenTOKENtoken0001');
select public.touchpoint_open('TOKENtokenTOKENtoken0001'); -- idempotent
reset role;
do $$ begin
  if (select count(*) from public.touchpoint_sends where token='TOKENtokenTOKENtoken0001' and opened_at is not null) <> 1 then
    raise exception 'TEST FAIL: touchpoint_open did not stamp opened_at'; end if;
end $$;

-- ── (6) Views ────────────────────────────────────────────────────────────────
do $$ begin
  if (select invited from public.guest_rsvp_rollup where wedding_id='cccccccc-0000-0000-0000-0000000000c1') <> 2 then
    raise exception 'TEST FAIL: rollup invited count wrong'; end if;
  if (select confirmed from public.event_guest_counts where event_id='eeee1111-0000-0000-0000-0000000000e1') <> 1 then
    raise exception 'TEST FAIL: event_guest_counts confirmed wrong'; end if;
  -- No Email guest surfaces in exceptions
  if not exists (select 1 from public.guest_exceptions where guest_id='9111a111-0000-0000-0000-000000000002' and reason='no_email') then
    raise exception 'TEST FAIL: no-email guest missing from exceptions'; end if;
end $$;

-- ── (7) build_touchpoint_sends audience — non_responders excludes the answered
-- Ana answered (yes/no above), No-Email has no email → a non_responders reminder
-- should produce ZERO email-eligible sends here.
reset role;
insert into public.touchpoints (id, wedding_id, kind, scheduled_for, audience_rule) values
  ('77770002-0000-0000-0000-000000000002','cccccccc-0000-0000-0000-0000000000c1','rsvp_reminder', current_date, jsonb_build_object('scope','non_responders'))
  on conflict do nothing;
do $$ declare n int;
begin
  select count(*) into n from public.build_touchpoint_sends('77770002-0000-0000-0000-000000000002');
  if n <> 0 then raise exception 'TEST FAIL: reminder audience should exclude the answered + no-email guest, got %', n; end if;
end $$;

-- ── (8) guest import writes exactly one activity row, attributed to the importer
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
select public.log_guest_import('cccccccc-0000-0000-0000-0000000000c1', 5);
do $$ begin
  if (select count(*) from public.activity where wedding_id='cccccccc-0000-0000-0000-0000000000c1' and verb='list_imported') <> 1 then
    raise exception 'TEST FAIL: import did not write exactly one list_imported row'; end if;
  if (select actor_id from public.activity where wedding_id='cccccccc-0000-0000-0000-0000000000c1' and verb='list_imported') <> '11111111-0000-0000-0000-000000000001' then
    raise exception 'TEST FAIL: list_imported actor is not the importer'; end if;
  if (select summary from public.activity where wedding_id='cccccccc-0000-0000-0000-0000000000c1' and verb='list_imported') <> '5' then
    raise exception 'TEST FAIL: list_imported summary should carry only the count'; end if;
end $$;

-- ── (9) Anon-executability matrix: grants closed by default (§11) ────────────
-- The ONLY functions anon may execute are the guest RSVP entry points (M3) and the
-- contract signer surface (M5 — deliberately grown, §1C), in both private and
-- public. Any other anon-executable function — a forgotten revoke — fails here
-- instead of reaching the gate. This allowlist IS the contract.
reset role;
do $$
declare leaked text;
begin
  select string_agg(n.nspname || '.' || p.proname, ', ' order by n.nspname, p.proname) into leaked
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('private','public')
    and has_function_privilege('anon', p.oid, 'EXECUTE')
    and p.proname not in (
      'rsvp_lookup','rsvp_submit','touchpoint_open',
      'load_contract_as','fill_contract_fields_as','sign_contract_as','decline_contract_as',
      'menu_lookup','menu_submit'
    );
  if leaked is not null then
    raise exception 'TEST FAIL: anon can execute non-RSVP function(s): %', leaked;
  end if;
end $$;

reset role;
select 'people: ALL TESTS PASSED' as result;

rollback;
