-- 0001_foundations.sql — Forma v2 M0: identity & tenancy.
-- Normative source: docs/FORMA-V2-SCHEMA.md §1. Additive, idempotent, RLS on
-- from birth. v2 house rules: every FK indexed the day it's born; every table
-- carries created_at/updated_at + the shared touch_updated_at trigger; all enums
-- are Postgres enums; on delete chosen per edge. SECURITY DEFINER helpers live
-- in `private` with pinned search_path; writes that bootstrap a tenancy root go
-- through a thin public wrapper over a private function.

create schema if not exists private;

-- ── Enums ──────────────────────────────────────────────────────────────────
do $$ begin create type public.locale_code as enum ('en', 'es'); exception when duplicate_object then null; end $$;
do $$ begin create type public.workspace_kind as enum ('studio', 'couple'); exception when duplicate_object then null; end $$;
do $$ begin create type public.member_role as enum ('owner', 'planner', 'coordinator'); exception when duplicate_object then null; end $$;

-- ── Shared updated_at trigger ────────────────────────────────────────────────
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- ── profiles ─────────────────────────────────────────────────────────────────
-- One per auth user; id IS auth.users.id. Created by AFTER-INSERT trigger on
-- auth.users. Avatar present from day one (presence bubbles depend on it).
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  locale public.locale_code not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── workspaces ───────────────────────────────────────────────────────────────
-- The tenancy root. "Planner is a role, not a business": a studio holds weddings
-- for clients; a couple workspace is a self-planning couple wearing the role.
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  kind public.workspace_kind not null,
  name text not null,
  slug text not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists workspaces_created_by_idx on public.workspaces (created_by);

-- ── workspace_members ────────────────────────────────────────────────────────
create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
-- PK (workspace_id, user_id) covers workspace_id (leading) + the UNIQUE; the
-- user_id FK needs its own index (v2: every FK indexed the day it's born).
create index if not exists workspace_members_user_idx on public.workspace_members (user_id);

-- updated_at triggers
drop trigger if exists touch_profiles on public.profiles;
create trigger touch_profiles before update on public.profiles for each row execute function private.touch_updated_at();
drop trigger if exists touch_workspaces on public.workspaces;
create trigger touch_workspaces before update on public.workspaces for each row execute function private.touch_updated_at();
drop trigger if exists touch_workspace_members on public.workspace_members;
create trigger touch_workspace_members before update on public.workspace_members for each row execute function private.touch_updated_at();

-- ── Signup → profile trigger ─────────────────────────────────────────────────
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    coalesce((new.raw_user_meta_data ->> 'locale')::public.locale_code, 'en')
  )
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function private.handle_new_user();

-- ── Membership helpers (used by all later policies) ──────────────────────────
create or replace function private.is_workspace_member(w uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = w and m.user_id = (select auth.uid())
  );
$$;

create or replace function private.is_workspace_owner(w uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = w and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

-- Definer reads for the workspace-members bootstrap policy: the creator is not a
-- member yet, so a direct RLS read of workspaces would hide their own workspace.
create or replace function private.workspace_creator(w uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select created_by from public.workspaces where id = w;
$$;
create or replace function private.workspace_has_member(w uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members m where m.workspace_id = w);
$$;

-- Workspace bootstrap is done under RLS (no exposed SECURITY DEFINER RPC): the
-- creator inserts the workspace (created_by = self) then inserts themselves as
-- the first owner; the members INSERT policy admits exactly that first-owner
-- case (see below) and thereafter only owners manage the roster. The server
-- action runs both inserts in one request.

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

-- profiles: self read/write, plus readable by co-members of a shared workspace
-- (needed to render avatars).
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.workspace_members me
      join public.workspace_members them on them.workspace_id = me.workspace_id
      where me.user_id = (select auth.uid()) and them.user_id = public.profiles.id
    )
  );
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert to authenticated with check (id = (select auth.uid()));
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- workspaces: members read; any authenticated user creates one they own; owner
-- updates/deletes.
drop policy if exists workspaces_select on public.workspaces;
create policy workspaces_select on public.workspaces for select to authenticated
  using (private.is_workspace_member(id));
drop policy if exists workspaces_insert on public.workspaces;
create policy workspaces_insert on public.workspaces for insert to authenticated
  with check (created_by = (select auth.uid()));
drop policy if exists workspaces_update on public.workspaces;
create policy workspaces_update on public.workspaces for update to authenticated
  using (private.is_workspace_owner(id)) with check (private.is_workspace_owner(id));
drop policy if exists workspaces_delete on public.workspaces;
create policy workspaces_delete on public.workspaces for delete to authenticated
  using (private.is_workspace_owner(id));

-- workspace_members: members read the roster; owners manage it.
drop policy if exists workspace_members_select on public.workspace_members;
create policy workspace_members_select on public.workspace_members for select to authenticated
  using (private.is_workspace_member(workspace_id));
-- INSERT: an existing owner manages the roster, OR the workspace creator seats
-- themselves as the first owner (bootstrap — allowed only while the roster is
-- empty and only for their own workspace).
drop policy if exists workspace_members_insert on public.workspace_members;
create policy workspace_members_insert on public.workspace_members for insert to authenticated
  with check (
    private.is_workspace_owner(workspace_id)
    or (
      user_id = (select auth.uid()) and role = 'owner'
      and private.workspace_creator(workspace_id) = (select auth.uid())
      and not private.workspace_has_member(workspace_id)
    )
  );
drop policy if exists workspace_members_update on public.workspace_members;
create policy workspace_members_update on public.workspace_members for update to authenticated
  using (private.is_workspace_owner(workspace_id)) with check (private.is_workspace_owner(workspace_id));
drop policy if exists workspace_members_delete on public.workspace_members;
create policy workspace_members_delete on public.workspace_members for delete to authenticated
  using (private.is_workspace_owner(workspace_id));
