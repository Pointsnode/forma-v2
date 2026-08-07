-- ADM-2 — partners/attribution/commission isolation + constraints + owner-gated mutations.
-- Hermetic (PGlite), fixture-scoped, begin; … rollback;.
--   RLS both directions (tenant reads zero; platform admin reads); default-deny writes;
--   attribution PK (one partner per account); house check; idempotency-key conflict;
--   the mutation DEFINERs are OWNER-only (partner role refused) and audit-logged.

begin;

insert into auth.users (id, email) values
  ('11110001-0000-0000-0000-000000000001', 'owner@test.forma'),    -- platform owner
  ('11110002-0000-0000-0000-000000000002', 'padmin@test.forma'),   -- platform partner (read-only)
  ('11110003-0000-0000-0000-000000000003', 'tenant@test.forma');   -- plain tenant user
insert into public.platform_admins (user_id, role) values
  ('11110001-0000-0000-0000-000000000001', 'owner'),
  ('11110002-0000-0000-0000-000000000002', 'partner');
insert into public.partners (id, display_name, type, commission_rate_bps, activation_fee_cents)
  values ('22220001-0000-0000-0000-000000000001', 'P1', 'founding', 3000, 7500);
insert into public.workspaces (id, kind, name, slug, created_by) values
  ('33330001-0000-0000-0000-000000000001', 'studio', 'WS1', 'ws1', '11110003-0000-0000-0000-000000000003'),
  ('33330002-0000-0000-0000-000000000002', 'studio', 'WS2', 'ws2', '11110003-0000-0000-0000-000000000003');
insert into public.partner_attributions (workspace_id, partner_id, source)
  values ('33330001-0000-0000-0000-000000000001', '22220001-0000-0000-0000-000000000001', 'manual');
insert into public.commission_entries (id, partner_id, workspace_id, kind, source_ref, base_amount_cents, rate_bps, amount_cents)
  values ('44440001-0000-0000-0000-000000000001', '22220001-0000-0000-0000-000000000001', '33330001-0000-0000-0000-000000000001', 'commission', 'pay1', 7900, 3000, 2370);

-- One partner per account: a second attribution for ws1 conflicts on the PK.
do $$ declare ok boolean; begin
  begin insert into public.partner_attributions (workspace_id, partner_id, source) values ('33330001-0000-0000-0000-000000000001', '22220001-0000-0000-0000-000000000001', 'link'); ok := true;
  exception when unique_violation then ok := false; end;
  if ok then raise exception 'TEST FAIL: a second attribution for a workspace did not conflict'; end if;
end $$;

-- House check: house must have a null partner; a non-house source must have a partner.
do $$ declare ok boolean; begin
  begin insert into public.partner_attributions (workspace_id, partner_id, source) values ('33330002-0000-0000-0000-000000000002', '22220001-0000-0000-0000-000000000001', 'house'); ok := true;
  exception when check_violation then ok := false; end;
  if ok then raise exception 'TEST FAIL: house attribution accepted a partner_id'; end if;
end $$;
do $$ declare ok boolean; begin
  begin insert into public.partner_attributions (workspace_id, partner_id, source) values ('33330002-0000-0000-0000-000000000002', null, 'manual'); ok := true;
  exception when check_violation then ok := false; end;
  if ok then raise exception 'TEST FAIL: manual attribution accepted a null partner_id'; end if;
end $$;

-- Idempotency key: a duplicate (partner_id, kind, source_ref) conflicts.
do $$ declare ok boolean; begin
  begin insert into public.commission_entries (partner_id, workspace_id, kind, source_ref, amount_cents) values ('22220001-0000-0000-0000-000000000001', '33330001-0000-0000-0000-000000000001', 'commission', 'pay1', 2370); ok := true;
  exception when unique_violation then ok := false; end;
  if ok then raise exception 'TEST FAIL: duplicate (partner,kind,source_ref) did not conflict'; end if;
end $$;

-- (a) The tenant user reads ZERO admin rows, cannot write, cannot reach a mutation DEFINER.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11110003-0000-0000-0000-000000000003","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.partners where id = '22220001-0000-0000-0000-000000000001') <> 0 then raise exception 'TEST FAIL: tenant reads partners'; end if;
  if (select count(*) from public.partner_attributions where workspace_id = '33330001-0000-0000-0000-000000000001') <> 0 then raise exception 'TEST FAIL: tenant reads partner_attributions'; end if;
  if (select count(*) from public.commission_entries where id = '44440001-0000-0000-0000-000000000001') <> 0 then raise exception 'TEST FAIL: tenant reads commission_entries'; end if;
end $$;
do $$ declare ok boolean; begin
  begin insert into public.commission_entries (partner_id, kind, source_ref, amount_cents) values ('22220001-0000-0000-0000-000000000001', 'commission', 'hack', 1); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: tenant client-wrote commission_entries'; end if;
end $$;
do $$ declare ok boolean; begin
  begin perform public.admin_upsert_partner(null, 'X', 'founding', 3000, 0, true); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: tenant reached admin_upsert_partner'; end if;
end $$;

-- (b) The platform PARTNER (read-only) reads the rows but is refused the owner mutations.
set local request.jwt.claims = '{"sub":"11110002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.partners where id = '22220001-0000-0000-0000-000000000001') <> 1 then raise exception 'TEST FAIL: admin cannot read partners'; end if;
  if (select count(*) from public.partner_attributions where workspace_id = '33330001-0000-0000-0000-000000000001') <> 1 then raise exception 'TEST FAIL: admin cannot read partner_attributions'; end if;
  if (select count(*) from public.commission_entries where id = '44440001-0000-0000-0000-000000000001') <> 1 then raise exception 'TEST FAIL: admin cannot read commission_entries'; end if;
end $$;
do $$ declare ok boolean; begin
  begin perform public.admin_void_commission('44440001-0000-0000-0000-000000000001', 'nope'); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: partner-role reached admin_void_commission (owner-only)'; end if;
end $$;

-- (c) The OWNER can void (memo required), and it is audit-logged.
set local request.jwt.claims = '{"sub":"11110001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ declare ok boolean; begin
  begin perform public.admin_void_commission('44440001-0000-0000-0000-000000000001', ''); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: void accepted an empty memo'; end if;
end $$;
do $$ begin
  perform public.admin_void_commission('44440001-0000-0000-0000-000000000001', 'audited void');
  if (select status from public.commission_entries where id = '44440001-0000-0000-0000-000000000001') <> 'void' then raise exception 'TEST FAIL: owner void did not set status'; end if;
  if (select count(*) from public.admin_audit_log where entity_id = '44440001-0000-0000-0000-000000000001' and action = 'commission.void') <> 1 then raise exception 'TEST FAIL: void was not audit-logged'; end if;
end $$;

rollback;
