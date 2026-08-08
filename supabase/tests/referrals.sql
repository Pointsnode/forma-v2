-- REF-1 — referral isolation, constraints, and the one-credit interlock (both directions).
-- Hermetic, fixture-scoped, begin; … rollback;.
--   RLS: a workspace sees only its own code / funnel (as referrer) / credits; other tenants
--   see zero; the referred side sees nothing; a platform admin sees all; zero client writes.
--   Constraints: self-referral check, one-referral PK. Interlocks: record_referral refuses a
--   partner-attributed workspace; admin_set_attribution refuses a referred workspace.

begin;

insert into auth.users (id, email) values
  ('aaaa0000-0000-0000-0000-0000000000a1', 'a@test.forma'),   -- referrer owner
  ('bbbb0000-0000-0000-0000-0000000000b1', 'b@test.forma'),   -- referred owner
  ('cccc0000-0000-0000-0000-0000000000c1', 'c@test.forma'),   -- other tenant (partner-attributed)
  ('dddd0000-0000-0000-0000-0000000000d1', 'admin@test.forma'); -- platform owner
insert into public.platform_admins (user_id, role) values ('dddd0000-0000-0000-0000-0000000000d1', 'owner');
insert into public.partners (id, display_name, type, commission_rate_bps) values ('eeee0000-0000-0000-0000-0000000000e1', 'P1', 'founding', 3000);

insert into public.workspaces (id, kind, name, slug, created_by) values
  ('a5000000-0000-0000-0000-000000000001', 'studio', 'WS A', 'ws-a', 'aaaa0000-0000-0000-0000-0000000000a1'),
  ('b5000000-0000-0000-0000-000000000001', 'studio', 'WS B', 'ws-b', 'bbbb0000-0000-0000-0000-0000000000b1'),
  ('c5000000-0000-0000-0000-000000000001', 'studio', 'WS C', 'ws-c', 'cccc0000-0000-0000-0000-0000000000c1');
insert into public.workspace_members (workspace_id, user_id, role) values
  ('a5000000-0000-0000-0000-000000000001', 'aaaa0000-0000-0000-0000-0000000000a1', 'owner'),
  ('b5000000-0000-0000-0000-000000000001', 'bbbb0000-0000-0000-0000-0000000000b1', 'owner'),
  ('c5000000-0000-0000-0000-000000000001', 'cccc0000-0000-0000-0000-0000000000c1', 'owner');
insert into public.referral_codes (workspace_id, code) values ('a5000000-0000-0000-0000-000000000001', 'CODEAAA');
-- WS C is partner-attributed → record_referral must refuse it (interlock direction 1).
insert into public.partner_attributions (workspace_id, partner_id, source) values ('c5000000-0000-0000-0000-000000000001', 'eeee0000-0000-0000-0000-0000000000e1', 'manual');
-- WS B was referred by WS A (seeded directly; a client can't write this table).
insert into public.referrals (referred_workspace_id, referrer_workspace_id, code) values ('b5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'CODEAAA');
insert into public.referral_credits (workspace_id, kind, source_ref, amount_cents) values ('a5000000-0000-0000-0000-000000000001', 'credit', 'b5000000-0000-0000-0000-000000000001', 10000);

-- Self-referral check constraint (direct insert).
do $$ declare ok boolean; begin
  begin insert into public.referrals (referred_workspace_id, referrer_workspace_id, code) values ('a5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000001', 'X'); ok := true;
  exception when check_violation then ok := false; end;
  if ok then raise exception 'TEST FAIL: self-referral was accepted'; end if;
end $$;
-- One referral per account (PK on referred_workspace_id).
do $$ declare ok boolean; begin
  begin insert into public.referrals (referred_workspace_id, referrer_workspace_id, code) values ('b5000000-0000-0000-0000-000000000001', 'c5000000-0000-0000-0000-000000000001', 'Y'); ok := true;
  exception when unique_violation then ok := false; end;
  if ok then raise exception 'TEST FAIL: a workspace was referred twice'; end if;
end $$;

-- (A) The referrer sees its own code, funnel, and credit; cannot write these tables.
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaa0000-0000-0000-0000-0000000000a1","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.referral_codes where workspace_id = 'a5000000-0000-0000-0000-000000000001') <> 1 then raise exception 'TEST FAIL: referrer cannot read own code'; end if;
  if (select count(*) from public.referrals where referrer_workspace_id = 'a5000000-0000-0000-0000-000000000001') <> 1 then raise exception 'TEST FAIL: referrer cannot read own funnel'; end if;
  if (select count(*) from public.referral_credits where workspace_id = 'a5000000-0000-0000-0000-000000000001') <> 1 then raise exception 'TEST FAIL: referrer cannot read own credits'; end if;
end $$;
do $$ declare ok boolean; begin
  begin insert into public.referral_credits (workspace_id, kind, source_ref, amount_cents) values ('a5000000-0000-0000-0000-000000000001', 'adjustment', 'hack', 999); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: client wrote referral_credits'; end if;
end $$;
-- Self-referral via the DEFINER is a silent no-op (referrer = referred).
do $$ begin
  if public.record_referral('a5000000-0000-0000-0000-000000000001', 'CODEAAA') is not null then raise exception 'TEST FAIL: self-referral recorded'; end if;
end $$;

-- (B) The REFERRED side sees nothing (no dashboard); a non-member sees no code.
set local request.jwt.claims = '{"sub":"bbbb0000-0000-0000-0000-0000000000b1","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.referrals where referred_workspace_id = 'b5000000-0000-0000-0000-000000000001') <> 0 then raise exception 'TEST FAIL: referred side can see the referral'; end if;
  if (select count(*) from public.referral_codes where workspace_id = 'a5000000-0000-0000-0000-000000000001') <> 0 then raise exception 'TEST FAIL: non-member read another workspace code'; end if;
end $$;

-- (C) Other tenant sees zero, and record_referral refuses a partner-attributed workspace.
set local request.jwt.claims = '{"sub":"cccc0000-0000-0000-0000-0000000000c1","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.referral_credits where workspace_id = 'a5000000-0000-0000-0000-000000000001') <> 0 then raise exception 'TEST FAIL: other tenant read a credit'; end if;
  if public.record_referral('c5000000-0000-0000-0000-000000000001', 'CODEAAA') is not null then raise exception 'TEST FAIL: partner-attributed workspace was referred'; end if;
  if (select count(*) from public.referrals where referred_workspace_id = 'c5000000-0000-0000-0000-000000000001') <> 0 then raise exception 'TEST FAIL: interlock (attributed) let a referral through'; end if;
end $$;

-- (admin) sees all; and admin_set_attribution refuses a referred workspace but allows others.
set local request.jwt.claims = '{"sub":"dddd0000-0000-0000-0000-0000000000d1","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.referrals where referred_workspace_id = 'b5000000-0000-0000-0000-000000000001') <> 1 then raise exception 'TEST FAIL: admin cannot read referrals'; end if;
  if (select count(*) from public.referral_credits where workspace_id = 'a5000000-0000-0000-0000-000000000001') <> 1 then raise exception 'TEST FAIL: admin cannot read referral_credits'; end if;
end $$;
do $$ declare ok boolean; begin
  begin perform public.admin_set_attribution('b5000000-0000-0000-0000-000000000001', 'eeee0000-0000-0000-0000-0000000000e1', 'manual', null, null); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: a referred workspace was partner-attributed (interlock)'; end if;
end $$;
do $$ begin
  perform public.admin_set_attribution('a5000000-0000-0000-0000-000000000001', 'eeee0000-0000-0000-0000-0000000000e1', 'manual', null, null);
  if (select count(*) from public.partner_attributions where workspace_id = 'a5000000-0000-0000-0000-000000000001') <> 1 then raise exception 'TEST FAIL: attribution of a non-referred workspace was blocked'; end if;
end $$;

rollback;
