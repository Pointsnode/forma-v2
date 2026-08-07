-- ADM-0 — platform-admin isolation matrix, BOTH directions. Hermetic (PGlite),
-- fixture-scoped, begin; … rollback;.
--   (a) no tenant user, in any workspace role, reads any ADM table;
--   (b) the platform-admin role grants ZERO tenant access (an admin who is not a
--       workspace member cannot read that workspace);
--   plus: ADM tables are default-deny for writes (no client write policy at all).

begin;

insert into auth.users (id, email) values
  ('dddd0001-0000-0000-0000-0000000000d1', 'padmin@test.forma'),   -- platform owner
  ('dddd0002-0000-0000-0000-0000000000d2', 'tenant@test.forma');   -- plain tenant user

-- Seed the platform owner via the SQL/owner path (there is NO client write policy).
insert into public.platform_admins (user_id, role) values ('dddd0001-0000-0000-0000-0000000000d1', 'owner');

-- One fixture audit row (service path — superuser here, as the service role would),
-- so the read assertions below are scoped AND meaningful: invisible to the tenant,
-- visible to the admin.
insert into public.admin_audit_log (actor_id, action, entity)
  values ('dddd0001-0000-0000-0000-0000000000d1', 'fixture.seed', 'test');

-- The tenant user owns a workspace — used to prove admin-role != tenant access.
set local role authenticated;
set local request.jwt.claims = '{"sub":"dddd0002-0000-0000-0000-0000000000d2","role":"authenticated"}';
do $$ begin
  insert into public.workspaces (id, kind, name, slug, created_by)
    values ('eeee0001-0000-0000-0000-0000000000e1', 'studio', 'Tenant WS', 'tenant-ws', 'dddd0002-0000-0000-0000-0000000000d2');
  insert into public.workspace_members (workspace_id, user_id, role)
    values ('eeee0001-0000-0000-0000-0000000000e1', 'dddd0002-0000-0000-0000-0000000000d2', 'owner');
end $$;

-- (a) The tenant user is not a platform admin: zero ADM rows, predicate false.
do $$ begin
  if private.is_platform_admin() then raise exception 'TEST FAIL: tenant user is_platform_admin true'; end if;
  if (select count(*) from public.platform_admins where user_id = 'dddd0001-0000-0000-0000-0000000000d1') <> 0 then raise exception 'TEST FAIL: tenant user reads platform_admins'; end if;
  if (select count(*) from public.admin_audit_log where actor_id = 'dddd0001-0000-0000-0000-0000000000d1') <> 0 then raise exception 'TEST FAIL: tenant user reads admin_audit_log'; end if;
end $$;

-- Default-deny writes: the tenant user cannot insert into an ADM table.
do $$ declare ok boolean; begin
  begin insert into public.platform_admins (user_id, role) values ('dddd0002-0000-0000-0000-0000000000d2', 'partner'); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: tenant user client-wrote platform_admins'; end if;
end $$;

-- (b) The platform owner sees ADM rows, but the admin role grants NO tenant access.
set local request.jwt.claims = '{"sub":"dddd0001-0000-0000-0000-0000000000d1","role":"authenticated"}';
do $$ begin
  if not private.is_platform_admin() then raise exception 'TEST FAIL: owner not recognized as platform admin'; end if;
  if (select count(*) from public.platform_admins where user_id = 'dddd0001-0000-0000-0000-0000000000d1') < 1 then raise exception 'TEST FAIL: admin cannot read platform_admins'; end if;
  if (select count(*) from public.admin_audit_log where actor_id = 'dddd0001-0000-0000-0000-0000000000d1') < 1 then raise exception 'TEST FAIL: admin cannot read admin_audit_log'; end if;
  if (select count(*) from public.workspaces where id = 'eeee0001-0000-0000-0000-0000000000e1') <> 0 then
    raise exception 'TEST FAIL: platform admin read a tenant workspace they do not belong to'; end if;
end $$;

-- Even an admin cannot CLIENT-write the audit log (service-role/server routes only).
do $$ declare ok boolean; begin
  begin insert into public.admin_audit_log (actor_id, action, entity) values ('dddd0001-0000-0000-0000-0000000000d1', 'x', 'y'); ok := true;
  exception when others then ok := false; end;
  if ok then raise exception 'TEST FAIL: admin client-wrote admin_audit_log (must be service-role only)'; end if;
end $$;

rollback;
