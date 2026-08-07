-- ═══ ADM-0 — the platform-admin door ═════════════════════════════════════════
-- The internal company portal (/admin). Two platform roles, DISJOINT from tenant
-- workspace roles: holding one grants nothing in the other direction (proven by the
-- isolation test). Every ADM table is default-deny RLS; reads are gated by a single
-- SECURITY DEFINER predicate; there are NO client write policies at all — every
-- mutation goes through a server route on the service role after an explicit owner
-- check. Admin-owned tables are never written by product code.

create type public.platform_role as enum ('owner', 'partner');

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role public.platform_role not null,
  created_at timestamptz not null default now()
);

-- SECURITY DEFINER predicate — mirrors is_workspace_member. Referencing platform_admins
-- from ITS OWN select policy would recurse ("infinite recursion detected in policy");
-- the definer function reads the table with RLS bypassed, so the policy is safe.
create or replace function private.is_platform_admin(p_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = p_user);
$$;

alter table public.platform_admins enable row level security;
-- Read: platform admins only (both roles see the whole seat list — transparency).
drop policy if exists platform_admins_select on public.platform_admins;
create policy platform_admins_select on public.platform_admins for select to authenticated
  using (private.is_platform_admin());
-- No insert/update/delete policy → seats change by SQL / service role only (v1: no UI).

-- ── The audit log. Every mutating admin action writes here (actor, action, entity,
-- before/after). Partners read it too — transparency includes what the owner changed.
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_log enable row level security;
drop policy if exists admin_audit_select on public.admin_audit_log;
create policy admin_audit_select on public.admin_audit_log for select to authenticated
  using (private.is_platform_admin());
-- No write policy → the log is written only by the service role (server routes).

-- FK / list indexes (advisors: every FK indexed; audit lists read newest-first).
create index if not exists admin_audit_actor_idx on public.admin_audit_log (actor_id);
create index if not exists admin_audit_created_idx on public.admin_audit_log (created_at desc);

-- ── Grants. is_platform_admin is RLS-referenced, so authenticated must EXECUTE it.
-- Revoke PUBLIC/anon first (belt for the anon-matrix guard) then grant authenticated.
revoke execute on function private.is_platform_admin(uuid) from public, anon;
grant execute on function private.is_platform_admin(uuid) to authenticated;

-- ── Seed. Jorge (advisory@statusbitcoin.com) is the owner; resolved by email at apply
-- time so it is correct on the real project and a no-op in the hermetic harness (empty
-- auth.users). Darya (partner) and Nikki (partner) seats are added by Jorge once their
-- emails/accounts exist — the template, NOT executed here:
--   insert into public.platform_admins (user_id, role)
--     select id, 'partner' from auth.users where email = '<darya-email>' on conflict do nothing;
insert into public.platform_admins (user_id, role)
  select id, 'owner'::public.platform_role from auth.users where email = 'advisory@statusbitcoin.com'
  on conflict (user_id) do nothing;
