-- 0013 planner directory (M10) — the growth engine's laws, hermetic. Proves the
-- six v1 mistakes are fixed at the DB floor: (1) unpublished is invisible through
-- EVERY read even with a published peer present (incl. the sitemap fn); publish is
-- gated on real-content minimums (tagline/about/areas/hero/≥3 gallery/≥1 service);
-- reads are service-role (never anon — see people.sql matrix); submit_inquiry is
-- the one anon surface (honeypot/validation/rate-limit); inquiries are staff-RLS;
-- convert builds a foundations wedding (auto-event) + marks converted + logs.
-- begin;…rollback; hermetic.
begin;

insert into auth.users (id, email) values
  ('11111111-0000-0000-0000-000000000001','owner@a.forma'),
  ('22222222-0000-0000-0000-000000000002','member@a.forma'),
  ('33333333-0000-0000-0000-000000000003','owner@b.forma');
insert into public.profiles (id, display_name) values
  ('11111111-0000-0000-0000-000000000001','Gio'),
  ('22222222-0000-0000-0000-000000000002','Ivy'),
  ('33333333-0000-0000-0000-000000000003','Rival') on conflict do nothing;

-- workspace A (the profile under test) + a second studio B (the published-peer /
-- taken-slug / non-member foil).
insert into public.workspaces (id, kind, name, slug, created_by) values
  ('a0000000-0000-0000-0000-0000000000a1','studio','Atelier Lumière','atelier','11111111-0000-0000-0000-000000000001'),
  ('b0000000-0000-0000-0000-0000000000b1','studio','Rival Studio','rival','33333333-0000-0000-0000-000000000003');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('a0000000-0000-0000-0000-0000000000a1','11111111-0000-0000-0000-000000000001','owner'),
  ('a0000000-0000-0000-0000-0000000000a1','22222222-0000-0000-0000-000000000002','planner'),
  ('b0000000-0000-0000-0000-0000000000b1','33333333-0000-0000-0000-000000000003','owner');

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';

-- ── (1) publish gate: each missing minimum refuses with its own human errcode ──
do $$ begin
  begin perform public.publish_profile('a0000000-0000-0000-0000-0000000000a1');
    raise exception 'TEST FAIL: published with an empty profile';
  exception when sqlstate 'FD020' then null; end;  -- tagline
end $$;
select public.save_profile('a0000000-0000-0000-0000-0000000000a1', '{"tagline":{"en":"Weddings on the coast"}}'::jsonb);
do $$ begin
  begin perform public.publish_profile('a0000000-0000-0000-0000-0000000000a1'); raise exception 'TEST FAIL: published without About';
  exception when sqlstate 'FD021' then null; end;  -- about
end $$;
select public.save_profile('a0000000-0000-0000-0000-0000000000a1', '{"tagline":{"en":"Weddings on the coast"},"about":{"en":"We plan slow, beautiful weddings."}}'::jsonb);
do $$ begin
  begin perform public.publish_profile('a0000000-0000-0000-0000-0000000000a1'); raise exception 'TEST FAIL: published without a service area';
  exception when sqlstate 'FD022' then null; end;  -- areas
end $$;

-- set_service_areas REPLACES (not appends): set 1, then set 2 → count is 2
select public.set_service_areas('a0000000-0000-0000-0000-0000000000a1', '[{"country":"MX","region":"Yucatán","city":"Mérida"}]'::jsonb);
select public.set_service_areas('a0000000-0000-0000-0000-0000000000a1', '[{"country":"MX","region":"Yucatán","city":"Mérida"},{"country":"MX","region":"Quintana Roo"}]'::jsonb);
do $$ begin
  if (select count(*) from public.workspace_service_areas where workspace_id='a0000000-0000-0000-0000-0000000000a1') <> 2 then
    raise exception 'TEST FAIL: set_service_areas did not replace to exactly 2'; end if;
end $$;

do $$ begin
  begin perform public.publish_profile('a0000000-0000-0000-0000-0000000000a1'); raise exception 'TEST FAIL: published without a hero';
  exception when sqlstate 'FD023' then null; end;  -- hero
end $$;
select public.save_profile('a0000000-0000-0000-0000-0000000000a1',
  '{"tagline":{"en":"Weddings on the coast"},"about":{"en":"We plan slow, beautiful weddings."},"hero":"a0000000-0000-0000-0000-0000000000a1/hero.jpg"}'::jsonb);
do $$ begin
  begin perform public.publish_profile('a0000000-0000-0000-0000-0000000000a1'); raise exception 'TEST FAIL: published with fewer than 3 gallery photos';
  exception when sqlstate 'FD024' then null; end;  -- gallery < 3
end $$;
select public.save_profile('a0000000-0000-0000-0000-0000000000a1',
  '{"tagline":{"en":"Weddings on the coast"},"about":{"en":"We plan slow, beautiful weddings."},"hero":"a/hero.jpg","gallery":["a/1.jpg","a/2.jpg","a/3.jpg"]}'::jsonb);
do $$ begin
  begin perform public.publish_profile('a0000000-0000-0000-0000-0000000000a1'); raise exception 'TEST FAIL: published without a service';
  exception when sqlstate 'FD025' then null; end;  -- services
end $$;

-- the complete profile → publish succeeds
select public.save_profile('a0000000-0000-0000-0000-0000000000a1',
  '{"tagline":{"en":"Weddings on the coast","es":"Bodas frente al mar"},"about":{"en":"We plan slow, beautiful weddings.","es":"Diseñamos bodas serenas."},"hero":"a/hero.jpg","gallery":["a/1.jpg","a/2.jpg","a/3.jpg"],"services":[{"name":"Full planning"}],"booking_url":"https://calendly.com/atelier/discovery","discovery_calls_enabled":true}'::jsonb);
select public.publish_profile('a0000000-0000-0000-0000-0000000000a1');
do $$ begin
  if (select profile_published from public.workspaces where id='a0000000-0000-0000-0000-0000000000a1') is not true then
    raise exception 'TEST FAIL: a complete profile did not publish'; end if;
end $$;

-- ── (2) reads are service-role, and the gate hides the UNPUBLISHED peer (B) even
-- though a published one (A) is present — the v1 hole-1 proof, incl. the sitemap fn
reset role;
set local role service_role;
do $$ declare dir jsonb; slugs jsonb;
begin
  dir := public.public_planner_directory();
  if jsonb_array_length(dir) <> 1 then raise exception 'TEST FAIL: directory should list exactly the 1 published studio, got %', jsonb_array_length(dir); end if;
  if (dir->0->>'slug') <> 'atelier' then raise exception 'TEST FAIL: directory listed the wrong / unpublished studio'; end if;
  if public.public_planner_profile('atelier') is null then raise exception 'TEST FAIL: published profile not returned'; end if;
  if public.public_planner_profile('rival') is not null then raise exception 'TEST FAIL: UNPUBLISHED profile leaked through the read'; end if;
  slugs := public.public_planner_slugs();
  if not (slugs->'slugs' ? 'atelier') then raise exception 'TEST FAIL: sitemap missing the published slug'; end if;
  if (slugs->'slugs' ? 'rival') then raise exception 'TEST FAIL: sitemap leaked the UNPUBLISHED slug'; end if;
end $$;

-- unpublish hides it everywhere; re-publish for the inquiry tests
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
select public.unpublish_profile('a0000000-0000-0000-0000-0000000000a1');
reset role; set local role service_role;
do $$ begin
  if jsonb_array_length(public.public_planner_directory()) <> 0 then raise exception 'TEST FAIL: unpublish did not hide the profile'; end if;
  if public.public_planner_profile('atelier') is not null then raise exception 'TEST FAIL: unpublished profile still readable'; end if;
end $$;
reset role; set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
select public.publish_profile('a0000000-0000-0000-0000-0000000000a1');

-- ── (3) submit_inquiry — the one anon surface: honeypot + validation + gate ────
reset role;
set local role anon;
-- honeypot filled → drops silently (returns null, no row)
do $$ begin
  if public.submit_inquiry('atelier','Bot','','bot@spam.com','',null,'buy pills','i-am-a-bot') is not null then
    raise exception 'TEST FAIL: honeypot submission was not dropped'; end if;
  if (select count(*) from public.inquiries where workspace_id = 'a0000000-0000-0000-0000-0000000000a1') <> 0 then raise exception 'TEST FAIL: honeypot inserted a row'; end if;
end $$;
-- validation refusals
do $$ begin
  begin perform public.submit_inquiry('atelier','','','a@b.com','',null,'hi',''); raise exception 'TEST FAIL: empty name accepted';
  exception when sqlstate 'FD031' then null; end;
  begin perform public.submit_inquiry('atelier','Ana','','not-an-email','',null,'hi',''); raise exception 'TEST FAIL: bad email accepted';
  exception when sqlstate 'FD032' then null; end;
  begin perform public.submit_inquiry('atelier','Ana','','a@b.com','',null,'',''); raise exception 'TEST FAIL: empty message accepted';
  exception when sqlstate 'FD033' then null; end;
  -- unpublished/unknown slug is not an inquiry target
  begin perform public.submit_inquiry('rival','Ana','','a@b.com','',null,'hi',''); raise exception 'TEST FAIL: inquiry to an unpublished studio accepted';
  exception when sqlstate 'FD030' then null; end;
end $$;
-- a real inquiry lands as 'new', email normalized
do $$ declare v uuid; begin
  v := public.submit_inquiry('atelier','Ana García','Beto','ANA@Novia.mx','+52 999','2027-05-01','We would love to talk about our May wedding.','');
  if v is null then raise exception 'TEST FAIL: valid inquiry returned null'; end if;
  if (select status from public.inquiries where id = v) <> 'new' then raise exception 'TEST FAIL: inquiry not new'; end if;
  if (select email from public.inquiries where id = v) <> 'ana@novia.mx' then raise exception 'TEST FAIL: email not normalized'; end if;
end $$;

-- a fixed-id inquiry (staged via superuser) so the non-member gate can be probed
-- with a REAL id it could never obtain through RLS — the point of the gate.
reset role;
insert into public.inquiries (id, workspace_id, name, partner_name, email, wedding_date, message)
  values ('dddd0000-0000-4000-a000-000000000001','a0000000-0000-0000-0000-0000000000a1','Ana García','Beto','ana@novia.mx','2027-05-01','Our May wedding.');

-- ── (4) inquiries are staff-RLS: A's member sees it; B's owner (non-member) can't
set local role authenticated;
set local request.jwt.claims = '{"sub":"22222222-0000-0000-0000-000000000002","role":"authenticated"}';  -- A's planner
do $$ begin
  if (select count(*) from public.inquiries where id='dddd0000-0000-4000-a000-000000000001') <> 1 then raise exception 'TEST FAIL: A member cannot see A inquiry'; end if;
end $$;
set local request.jwt.claims = '{"sub":"33333333-0000-0000-0000-000000000003","role":"authenticated"}';  -- B owner, not an A member
do $$ begin
  if (select count(*) from public.inquiries where id='dddd0000-0000-4000-a000-000000000001') <> 0 then raise exception 'TEST FAIL: a non-member read A''s inquiries'; end if;
  -- and cannot convert it (passing the REAL id → the member gate refuses, FV230)
  begin perform public.convert_inquiry('dddd0000-0000-4000-a000-000000000001'); raise exception 'TEST FAIL: non-member converted an inquiry';
  exception when sqlstate 'FV230' then null; end;
end $$;

-- ── (5) convert → a foundations wedding (auto-event), marked converted, logged ──
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';  -- A owner
do $$ declare inq uuid := 'dddd0000-0000-4000-a000-000000000001'; wed uuid; begin
  wed := public.convert_inquiry(inq);
  if (select phase from public.weddings where id = wed) <> 'foundations' then raise exception 'TEST FAIL: converted wedding not in foundations'; end if;
  if (select couple_display from public.weddings where id = wed) <> 'Ana García & Beto' then raise exception 'TEST FAIL: couple_display not composed from the inquiry'; end if;
  if (select date_start from public.weddings where id = wed) is distinct from date '2027-05-01' then raise exception 'TEST FAIL: wedding date not carried from the inquiry'; end if;
  if (select count(*) from public.wedding_events where wedding_id = wed) < 1 then raise exception 'TEST FAIL: single-event law did not seed a default event'; end if;
  if (select status from public.inquiries where id = inq) <> 'converted' then raise exception 'TEST FAIL: inquiry not marked converted'; end if;
  if (select wedding_id from public.inquiries where id = inq) <> wed then raise exception 'TEST FAIL: inquiry not linked to the wedding'; end if;
  if not exists (select 1 from public.activity where wedding_id = wed and verb = 'inquiry_converted' and actor_id = '11111111-0000-0000-0000-000000000001') then
    raise exception 'TEST FAIL: convert did not log inquiry_converted with the staff actor'; end if;
end $$;

-- ── (6) per-workspace rate limit trips on hammering (20/hour) ─────────────────
reset role;  -- superuser bypasses RLS to stage 19 more (total 20 this hour)
insert into public.inquiries (workspace_id, name, email, message)
  select 'a0000000-0000-0000-0000-0000000000a1','Flood '||g,'f'||g||'@x.com','spam' from generate_series(1,19) g;
set local role anon;
do $$ begin
  begin perform public.submit_inquiry('atelier','Ana','','a@b.com','',null,'hi',''); raise exception 'TEST FAIL: rate limit did not trip at 20/hour';
  exception when sqlstate 'FD034' then null; end;
end $$;

-- ── (7) slug edits: format + taken refusals; a valid slug lands ──────────────
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ begin
  begin perform public.set_profile_slug('a0000000-0000-0000-0000-0000000000a1','Bad Slug'); raise exception 'TEST FAIL: malformed slug accepted';
  exception when sqlstate 'FD010' then null; end;
  begin perform public.set_profile_slug('a0000000-0000-0000-0000-0000000000a1','rival'); raise exception 'TEST FAIL: taken slug accepted';
  exception when sqlstate 'FD011' then null; end;
end $$;
select public.set_profile_slug('a0000000-0000-0000-0000-0000000000a1','atelier-lumiere');
do $$ begin
  if (select slug from public.workspaces where id='a0000000-0000-0000-0000-0000000000a1') <> 'atelier-lumiere' then
    raise exception 'TEST FAIL: valid slug did not persist'; end if;
end $$;

reset role;
select 'directory: ALL TESTS PASSED' as result;
rollback;
