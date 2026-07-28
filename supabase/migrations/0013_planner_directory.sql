-- 0013 planner directory & public profiles (M10) — the growth engine. Additive.
-- Public /planners + /p/[slug] are the brand's SEO/LLM-facing face. v1's posture
-- ported onto v2's workspace model, with its mistakes fixed:
--   reads are service-role DEFINER (published+studio gate inside, NEVER unpublished,
--   NEVER a token) so the anon matrix does NOT grow for reads; the ONLY new anon
--   function is submit_inquiry → the matrix grows 9 → 10 (the explicit amendment).
--   Publish is gated on real-content minimums; the demo is never published.

do $$ begin create type public.inquiry_status as enum ('new','replied','converted','archived'); exception when duplicate_object then null; end $$;

-- ── workspaces gains the public profile (slug already exists + unique) ────────
alter table public.workspaces add column if not exists profile_published boolean not null default false;
alter table public.workspaces add column if not exists profile jsonb not null default '{}'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'workspaces_slug_format') then
    -- NOT VALID: existing slugs aren't re-checked; new/edited slugs must be url-safe
    alter table public.workspaces add constraint workspaces_slug_format check (slug ~ '^[a-z0-9][a-z0-9-]{1,60}$') not valid;
  end if;
end $$;

-- ── normalized service areas (directory counts + filters) ────────────────────
create table if not exists public.workspace_service_areas (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  country text not null,
  region text not null,
  city text,
  created_at timestamptz not null default now()
);
create index if not exists wsa_workspace_idx on public.workspace_service_areas (workspace_id);
create index if not exists wsa_region_idx on public.workspace_service_areas (country, region);

-- ── inquiries (the growth loop's inbox) ──────────────────────────────────────
create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null,
  partner_name text,
  email text not null,
  phone text,
  wedding_date date,
  message text not null,
  status public.inquiry_status not null default 'new',
  wedding_id uuid references public.weddings (id) on delete set null,  -- set on convert
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists inquiries_workspace_idx on public.inquiries (workspace_id, created_at desc);
drop trigger if exists touch_inquiries on public.inquiries;
create trigger touch_inquiries before update on public.inquiries for each row execute function private.touch_updated_at();

-- ── RLS: service areas + inquiries are staff-only; the public reads are DEFINER
alter table public.workspace_service_areas enable row level security;
drop policy if exists wsa_member on public.workspace_service_areas;
create policy wsa_member on public.workspace_service_areas for select to authenticated
  using (private.is_workspace_member(workspace_id));  -- writes via set_service_areas (definer)

alter table public.inquiries enable row level security;
drop policy if exists inquiries_staff on public.inquiries;
create policy inquiries_staff on public.inquiries for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));

-- ═══ Profile writes (member-checked DEFINER — workspaces_update is owner-only) ══
create or replace function private.save_profile(p_workspace uuid, p_profile jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.is_workspace_member(p_workspace) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  update public.workspaces set profile = coalesce(p_profile, '{}'::jsonb), updated_at = now() where id = p_workspace;
end $$;

create or replace function private.set_profile_slug(p_workspace uuid, p_slug text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.is_workspace_member(p_workspace) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if p_slug !~ '^[a-z0-9][a-z0-9-]{1,60}$' then raise exception 'the address can use lowercase letters, numbers and hyphens only' using errcode = 'FD010'; end if;
  if exists (select 1 from public.workspaces where slug = p_slug and id <> p_workspace) then raise exception 'that address is already taken' using errcode = 'FD011'; end if;
  update public.workspaces set slug = p_slug, updated_at = now() where id = p_workspace;
end $$;

create or replace function private.set_service_areas(p_workspace uuid, p_areas jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.is_workspace_member(p_workspace) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  delete from public.workspace_service_areas where workspace_id = p_workspace;
  insert into public.workspace_service_areas (workspace_id, country, region, city)
    select p_workspace, btrim(a->>'country'), btrim(a->>'region'), nullif(btrim(coalesce(a->>'city','')), '')
    from jsonb_array_elements(coalesce(p_areas, '[]'::jsonb)) a
    where coalesce(btrim(a->>'country'),'') <> '' and coalesce(btrim(a->>'region'),'') <> '';
end $$;

-- publish gate: real-content minimums, refused with human messages (kills v1 hole 1/2/4)
create or replace function private.publish_profile(p_workspace uuid)
returns void language plpgsql security definer set search_path = public as $$
declare pr jsonb;
begin
  if not private.is_workspace_member(p_workspace) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  select profile into pr from public.workspaces where id = p_workspace;
  pr := coalesce(pr, '{}'::jsonb);
  if coalesce(pr#>>'{tagline,en}','') = '' and coalesce(pr#>>'{tagline,es}','') = '' then
    raise exception 'add a tagline in at least one language before publishing' using errcode = 'FD020'; end if;
  if coalesce(pr#>>'{about,en}','') = '' and coalesce(pr#>>'{about,es}','') = '' then
    raise exception 'add an About in at least one language before publishing' using errcode = 'FD021'; end if;
  if not exists (select 1 from public.workspace_service_areas where workspace_id = p_workspace) then
    raise exception 'add at least one place you serve before publishing' using errcode = 'FD022'; end if;
  if coalesce(pr->>'hero','') = '' then
    raise exception 'add a hero photo before publishing' using errcode = 'FD023'; end if;
  if coalesce(jsonb_array_length(pr->'gallery'), 0) < 3 then
    raise exception 'add at least three gallery photos before publishing' using errcode = 'FD024'; end if;
  if coalesce(jsonb_array_length(pr->'services'), 0) < 1 then
    raise exception 'list at least one service before publishing' using errcode = 'FD025'; end if;
  update public.workspaces set profile_published = true, updated_at = now() where id = p_workspace;
end $$;

create or replace function private.unpublish_profile(p_workspace uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.is_workspace_member(p_workspace) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  update public.workspaces set profile_published = false, updated_at = now() where id = p_workspace;
end $$;

-- ═══ The one new anon function: submit_inquiry (matrix 9 → 10) ════════════════
create or replace function private.submit_inquiry(p_slug text, p_name text, p_partner text, p_email text, p_phone text, p_date date, p_message text, p_honeypot text)
returns uuid language plpgsql security definer set search_path = public as $$
declare w uuid; v_id uuid; recent int;
begin
  -- honeypot: a bot filled the hidden field → drop silently (no error, no insert)
  if coalesce(btrim(p_honeypot), '') <> '' then return null; end if;
  select id into w from public.workspaces where slug = p_slug and profile_published = true and kind = 'studio';
  if w is null then raise exception 'no such planner' using errcode = 'FD030'; end if;
  if coalesce(btrim(p_name), '') = '' or char_length(p_name) > 120 then raise exception 'please add your name' using errcode = 'FD031'; end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(p_email) > 200 then raise exception 'please add a valid email' using errcode = 'FD032'; end if;
  if coalesce(btrim(p_message), '') = '' or char_length(p_message) > 4000 then raise exception 'please add a message' using errcode = 'FD033'; end if;
  -- per-workspace rate limit: max 20 inquiries/hour (per-IP limiting is edge-level, M10 note)
  select count(*) into recent from public.inquiries where workspace_id = w and created_at > now() - interval '1 hour';
  if recent >= 20 then raise exception 'too many inquiries right now — please try again later' using errcode = 'FD034'; end if;
  insert into public.inquiries (workspace_id, name, partner_name, email, phone, wedding_date, message)
    values (w, btrim(p_name), nullif(btrim(coalesce(p_partner,'')), ''), lower(btrim(p_email)), nullif(btrim(coalesce(p_phone,'')), ''), p_date, btrim(p_message))
    returning id into v_id;
  return v_id;
end $$;

-- staff converts an inquiry → a foundations wedding (single-event law auto-creates
-- the default event) + marks converted + logs activity (a wedding now exists).
create or replace function private.convert_inquiry(p_inquiry uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare inq public.inquiries; w uuid; v_slug text; disp text; v_wedding uuid;
begin
  select * into inq from public.inquiries where id = p_inquiry;
  if not found then raise exception 'no such inquiry' using errcode = 'FV000'; end if;
  if not private.is_workspace_member(inq.workspace_id) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  disp := case when coalesce(inq.partner_name,'') <> '' then inq.name || ' & ' || inq.partner_name else inq.name end;
  v_slug := regexp_replace(lower(disp), '[^a-z0-9]+', '-', 'g') || '-' || substr(gen_random_uuid()::text, 1, 6);
  -- phase/date_start are NOT set here: phase defaults 'foundations'; date_start is
  -- trigger-derived from event dates, so we carry the inquiry date onto the default
  -- event (auto-created by seed_default_event), which recompute_wedding_dates rolls up.
  insert into public.weddings (workspace_id, slug, couple_display, partner_a, partner_b)
    values (inq.workspace_id, v_slug, disp, inq.name, nullif(inq.partner_name,''))
    returning id into v_wedding;
  if inq.wedding_date is not null then
    update public.wedding_events set event_date = inq.wedding_date where wedding_id = v_wedding and order_index = 0;
  end if;
  update public.inquiries set status = 'converted', wedding_id = v_wedding where id = p_inquiry;
  perform private.log_activity(v_wedding, (select auth.uid()), 'inquiry_converted', disp, jsonb_build_object('inquiry_id', p_inquiry));
  return v_wedding;
end $$;

-- ═══ Public reads — service-role DEFINER, published+studio gate inside ════════
create or replace function public.public_planner_directory()
returns jsonb language sql security definer set search_path = public as $$
  select coalesce(jsonb_agg(row order by name), '[]'::jsonb) from (
    select w.slug, w.name,
      w.profile as profile,
      coalesce((select jsonb_agg(distinct jsonb_build_object('country', a.country, 'region', a.region)) from public.workspace_service_areas a where a.workspace_id = w.id), '[]'::jsonb) as areas
    from public.workspaces w
    where w.profile_published = true and w.kind = 'studio'
  ) row;
$$;

create or replace function public.public_planner_profile(p_slug text)
returns jsonb language sql security definer set search_path = public as $$
  select case when w.id is null then null else jsonb_build_object(
    'slug', w.slug, 'name', w.name, 'profile', w.profile,
    'areas', coalesce((select jsonb_agg(jsonb_build_object('country', a.country, 'region', a.region, 'city', a.city) order by a.region) from public.workspace_service_areas a where a.workspace_id = w.id), '[]'::jsonb)
  ) end
  from (select * from public.workspaces where slug = p_slug and profile_published = true and kind = 'studio') w;
$$;

-- slugs + regions for the sitemap (only published — no empty shells)
create or replace function public.public_planner_slugs()
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object(
    'slugs', coalesce((select jsonb_agg(w.slug) from public.workspaces w where w.profile_published = true and w.kind = 'studio'), '[]'::jsonb),
    'regions', coalesce((select jsonb_agg(distinct jsonb_build_object('country', a.country, 'region', a.region))
                         from public.workspace_service_areas a join public.workspaces w on w.id = a.workspace_id
                         where w.profile_published = true and w.kind = 'studio'), '[]'::jsonb)
  );
$$;

-- ═══ Grants (§11) — matrix grows to EXACTLY 10 (only submit_inquiry to anon) ══
-- public wrappers for the member/staff functions (invoker → runs the DEFINER)
create or replace function public.save_profile(p_workspace uuid, p_profile jsonb) returns void language sql security invoker set search_path = public as $$ select private.save_profile(p_workspace, p_profile); $$;
create or replace function public.set_profile_slug(p_workspace uuid, p_slug text) returns void language sql security invoker set search_path = public as $$ select private.set_profile_slug(p_workspace, p_slug); $$;
create or replace function public.set_service_areas(p_workspace uuid, p_areas jsonb) returns void language sql security invoker set search_path = public as $$ select private.set_service_areas(p_workspace, p_areas); $$;
create or replace function public.publish_profile(p_workspace uuid) returns void language sql security invoker set search_path = public as $$ select private.publish_profile(p_workspace); $$;
create or replace function public.unpublish_profile(p_workspace uuid) returns void language sql security invoker set search_path = public as $$ select private.unpublish_profile(p_workspace); $$;
create or replace function public.convert_inquiry(p_inquiry uuid) returns uuid language sql security invoker set search_path = public as $$ select private.convert_inquiry(p_inquiry); $$;
create or replace function public.submit_inquiry(p_slug text, p_name text, p_partner text, p_email text, p_phone text, p_date date, p_message text, p_honeypot text)
  returns uuid language sql security invoker set search_path = public as $$ select private.submit_inquiry(p_slug, p_name, p_partner, p_email, p_phone, p_date, p_message, p_honeypot); $$;

-- member/staff functions → authenticated only
revoke execute on function
  private.save_profile(uuid, jsonb), private.set_profile_slug(uuid, text), private.set_service_areas(uuid, jsonb),
  private.publish_profile(uuid), private.unpublish_profile(uuid), private.convert_inquiry(uuid),
  public.save_profile(uuid, jsonb), public.set_profile_slug(uuid, text), public.set_service_areas(uuid, jsonb),
  public.publish_profile(uuid), public.unpublish_profile(uuid), public.convert_inquiry(uuid)
  from public, anon;
grant execute on function
  private.save_profile(uuid, jsonb), private.set_profile_slug(uuid, text), private.set_service_areas(uuid, jsonb),
  private.publish_profile(uuid), private.unpublish_profile(uuid), private.convert_inquiry(uuid),
  public.save_profile(uuid, jsonb), public.set_profile_slug(uuid, text), public.set_service_areas(uuid, jsonb),
  public.publish_profile(uuid), public.unpublish_profile(uuid), public.convert_inquiry(uuid)
  to authenticated;

-- the public reads → service_role ONLY (never anon; the pages call via the admin client)
revoke execute on function public.public_planner_directory(), public.public_planner_profile(text), public.public_planner_slugs() from public, anon, authenticated;
grant execute on function public.public_planner_directory(), public.public_planner_profile(text), public.public_planner_slugs() to service_role;

-- submit_inquiry → the ONE new anon function (matrix 9 → 10)
revoke execute on function private.submit_inquiry(text, text, text, text, text, date, text, text), public.submit_inquiry(text, text, text, text, text, date, text, text) from public;
grant execute on function private.submit_inquiry(text, text, text, text, text, date, text, text), public.submit_inquiry(text, text, text, text, text, date, text, text) to anon, authenticated;
