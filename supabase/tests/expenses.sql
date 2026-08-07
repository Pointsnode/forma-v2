-- ADM-4 — expenses: isolation, owner-gated CRUD, void rules, voided-excluded-from-sums.
-- Hermetic, fixture-scoped, begin; … rollback;.

begin;

insert into auth.users (id, email) values
  ('11110001-0000-0000-0000-000000000001', 'owner@test.forma'),
  ('11110002-0000-0000-0000-000000000002', 'padmin@test.forma'),
  ('11110003-0000-0000-0000-000000000003', 'tenant@test.forma');
insert into public.platform_admins (user_id, role) values
  ('11110001-0000-0000-0000-000000000001', 'owner'),
  ('11110002-0000-0000-0000-000000000002', 'partner');
insert into public.expense_entries (id, paid_on, vendor, category, amount_cents) values
  ('66660001-0000-0000-0000-000000000001', '2026-08-05', 'Vercel', 'infrastructure', 2000),
  ('66660002-0000-0000-0000-000000000002', '2026-08-06', 'Figma', 'tooling', 999);

-- (a) The tenant reads zero and cannot write.
set local role authenticated;
set local request.jwt.claims = '{"sub":"11110003-0000-0000-0000-000000000003","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.expense_entries where id = '66660001-0000-0000-0000-000000000001') <> 0 then raise exception 'TEST FAIL: tenant reads expense_entries'; end if;
end $$;
do $$ declare ok boolean; begin
  begin insert into public.expense_entries (paid_on, category, amount_cents) values ('2026-08-01', 'other', 1); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: tenant client-wrote expense_entries'; end if;
end $$;

-- (b) The platform PARTNER reads but is refused the owner mutation.
set local request.jwt.claims = '{"sub":"11110002-0000-0000-0000-000000000002","role":"authenticated"}';
do $$ begin
  if (select count(*) from public.expense_entries where id = '66660001-0000-0000-0000-000000000001') <> 1 then raise exception 'TEST FAIL: admin cannot read expense_entries'; end if;
end $$;
do $$ declare ok boolean; begin
  begin perform public.admin_upsert_expense(null, '2026-08-01', 'x', 'other', 100, 'USD', null, null); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: partner-role reached admin_upsert_expense'; end if;
end $$;

-- (c) The OWNER: void requires a memo; a memo voids it and is audit-logged.
set local request.jwt.claims = '{"sub":"11110001-0000-0000-0000-000000000001","role":"authenticated"}';
do $$ declare ok boolean; begin
  begin perform public.admin_void_expense('66660002-0000-0000-0000-000000000002', ''); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: void accepted an empty memo'; end if;
end $$;
do $$ begin
  perform public.admin_void_expense('66660002-0000-0000-0000-000000000002', 'duplicate charge');
  if (select voided from public.expense_entries where id = '66660002-0000-0000-0000-000000000002') is not true then raise exception 'TEST FAIL: void did not set voided'; end if;
  if (select count(*) from public.admin_audit_log where entity_id = '66660002-0000-0000-0000-000000000002' and action = 'expense.void') <> 1 then raise exception 'TEST FAIL: void not audit-logged'; end if;
end $$;

-- (d) Voided rows are excluded from a NOT-voided sum (the shape the report uses): 2000, not 2999.
do $$ begin
  if (select coalesce(sum(amount_cents), 0) from public.expense_entries where not voided and id in ('66660001-0000-0000-0000-000000000001','66660002-0000-0000-0000-000000000002')) <> 2000 then
    raise exception 'TEST FAIL: voided expense not excluded from the sum'; end if;
end $$;

rollback;
