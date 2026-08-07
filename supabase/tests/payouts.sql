-- ADM-3 — payouts: owner-gated atomic record, isolation, constraints. Hermetic, fixture-
-- scoped, begin; … rollback;.
--   role refusal (partner cannot record); atomic abort when ANY selected entry is void /
--   foreign / paid (valid ones left accrued); net-negative abort; payout_items uniqueness
--   (one payout per entry); void refuses a paid-by-payout entry.

begin;

insert into auth.users (id, email) values
  ('11110001-0000-0000-0000-000000000001', 'owner@test.forma'),
  ('11110002-0000-0000-0000-000000000002', 'padmin@test.forma'),
  ('11110003-0000-0000-0000-000000000003', 'tenant@test.forma');
insert into public.platform_admins (user_id, role) values
  ('11110001-0000-0000-0000-000000000001', 'owner'),
  ('11110002-0000-0000-0000-000000000002', 'partner');
insert into public.partners (id, display_name, type, commission_rate_bps, activation_fee_cents) values
  ('22220001-0000-0000-0000-000000000001', 'P1', 'founding', 3000, 0),
  ('22220002-0000-0000-0000-000000000002', 'P2', 'founding', 3000, 0);
insert into public.workspaces (id, kind, name, slug, created_by)
  values ('33330001-0000-0000-0000-000000000001', 'studio', 'WS1', 'ws1', '11110003-0000-0000-0000-000000000003');
insert into public.commission_entries (id, partner_id, workspace_id, kind, source_ref, amount_cents, status) values
  ('44440001-0000-0000-0000-000000000001', '22220001-0000-0000-0000-000000000001', '33330001-0000-0000-0000-000000000001', 'commission', 'r1', 2370, 'accrued'),
  ('44440002-0000-0000-0000-000000000002', '22220001-0000-0000-0000-000000000001', '33330001-0000-0000-0000-000000000001', 'commission', 'r2', 1000, 'accrued'),
  ('44440003-0000-0000-0000-000000000003', '22220001-0000-0000-0000-000000000001', '33330001-0000-0000-0000-000000000001', 'commission', 'r3', 500, 'void'),
  ('44440004-0000-0000-0000-000000000004', '22220002-0000-0000-0000-000000000002', '33330001-0000-0000-0000-000000000001', 'commission', 'r4', 800, 'accrued'),
  ('44440005-0000-0000-0000-000000000005', '22220001-0000-0000-0000-000000000001', '33330001-0000-0000-0000-000000000001', 'clawback', 'r5', -5000, 'accrued'),
  ('44440006-0000-0000-0000-000000000006', '22220001-0000-0000-0000-000000000001', '33330001-0000-0000-0000-000000000001', 'commission', 'r6', 100, 'accrued');

-- payout_items uniqueness (superuser: RLS bypassed, but the unique(commission_entry_id) fires).
insert into public.payouts (id, partner_id, total_cents) values ('55550001-0000-0000-0000-000000000001', '22220001-0000-0000-0000-000000000001', 100);
insert into public.payout_items (payout_id, commission_entry_id) values ('55550001-0000-0000-0000-000000000001', '44440006-0000-0000-0000-000000000006');
insert into public.payouts (id, partner_id, total_cents) values ('55550002-0000-0000-0000-000000000002', '22220001-0000-0000-0000-000000000001', 100);
do $$ declare ok boolean; begin
  begin insert into public.payout_items (payout_id, commission_entry_id) values ('55550002-0000-0000-0000-000000000002', '44440006-0000-0000-0000-000000000006'); ok := true;
  exception when unique_violation then ok := false; end;
  if ok then raise exception 'TEST FAIL: an entry was placed in two payouts'; end if;
end $$;

-- Role refusal: a platform partner cannot record a payout.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11110002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ declare ok boolean; begin
  begin perform public.admin_record_payout('22220001-0000-0000-0000-000000000001', array['44440001-0000-0000-0000-000000000001']::uuid[], 'bank', 'r', '2026-08-01', 'Aug'); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: partner-role recorded a payout'; end if;
end $$;

set local request.jwt.claims = '{"sub":"11110001-0000-0000-0000-000000000001","role":"authenticated"}';
-- Atomic abort: a VOID entry in the selection aborts the whole call; the valid one stays accrued.
do $$ declare ok boolean; begin
  begin perform public.admin_record_payout('22220001-0000-0000-0000-000000000001', array['44440001-0000-0000-0000-000000000001','44440003-0000-0000-0000-000000000003']::uuid[], 'bank', 'r', '2026-08-01', 'Aug'); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: payout accepted a void entry'; end if;
  if (select status from public.commission_entries where id = '44440001-0000-0000-0000-000000000001') <> 'accrued' then raise exception 'TEST FAIL: aborted payout still flipped the valid entry'; end if;
end $$;
-- Atomic abort: a FOREIGN partner's entry aborts.
do $$ declare ok boolean; begin
  begin perform public.admin_record_payout('22220001-0000-0000-0000-000000000001', array['44440001-0000-0000-0000-000000000001','44440004-0000-0000-0000-000000000004']::uuid[], 'bank', 'r', '2026-08-01', 'Aug'); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: payout accepted a foreign partner entry'; end if;
  if (select status from public.commission_entries where id = '44440001-0000-0000-0000-000000000001') <> 'accrued' then raise exception 'TEST FAIL: aborted foreign payout flipped the valid entry'; end if;
end $$;
-- Net-negative abort: a selection summing <= 0 is refused.
do $$ declare ok boolean; begin
  begin perform public.admin_record_payout('22220001-0000-0000-0000-000000000001', array['44440005-0000-0000-0000-000000000005']::uuid[], 'bank', 'r', '2026-08-01', 'Aug'); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: payout accepted a non-positive total'; end if;
end $$;

-- Happy path: record e1 + e2 → payout total 3370, both flipped to paid, two items, audit row.
do $$ declare v_payout uuid; begin
  v_payout := public.admin_record_payout('22220001-0000-0000-0000-000000000001', array['44440001-0000-0000-0000-000000000001','44440002-0000-0000-0000-000000000002']::uuid[], 'bank transfer', 'wire-123', '2026-08-01', 'Aug 2026');
  if (select total_cents from public.payouts where id = v_payout) <> 3370 then raise exception 'TEST FAIL: payout total wrong'; end if;
  if (select count(*) from public.payout_items where payout_id = v_payout) <> 2 then raise exception 'TEST FAIL: payout_items count wrong'; end if;
  if (select count(*) from public.commission_entries where id in ('44440001-0000-0000-0000-000000000001','44440002-0000-0000-0000-000000000002') and status = 'paid') <> 2 then raise exception 'TEST FAIL: entries not flipped to paid'; end if;
  if (select count(*) from public.admin_audit_log where entity = 'payouts' and entity_id = v_payout::text and action = 'payout.record') <> 1 then raise exception 'TEST FAIL: payout not audit-logged'; end if;
end $$;

-- Re-record refused (e1 is now paid → not accrued → aborts): and a paid entry cannot be voided.
do $$ declare ok boolean; begin
  begin perform public.admin_record_payout('22220001-0000-0000-0000-000000000001', array['44440001-0000-0000-0000-000000000001']::uuid[], 'bank', 'r', '2026-08-01', 'Aug'); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: a paid entry was paid again'; end if;
end $$;
do $$ declare ok boolean; begin
  begin perform public.admin_void_commission('44440001-0000-0000-0000-000000000001', 'try void a paid entry'); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: a paid-by-payout entry was voided'; end if;
end $$;

rollback;
