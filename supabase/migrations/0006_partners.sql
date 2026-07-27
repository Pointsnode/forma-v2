-- 0006_partners.sql — Forma v2 M4: catalog, presenting, the venue loop.
-- Normative: docs/FORMA-V2-SCHEMA.md §5/§9/§10/§11/§12, with amendments (doc updated):
--   §1A proposals gains engagement_id; CHECK widens to num_nonnulls(event_ref,
--       engagement_id) <= 1 (freeform stays legal).
--   §1B approval-moves-the-mesh (first instance): approving an engagement-subject
--       proposal advances presented→shortlisted; declining → declined.
--   §1C storage bucket vendor-media (created in the storage seed alongside this).
-- Presenting is ONE atomic act (present_vendor): engagement + event links + the
-- proposal, together. Function-only writes; grants closed-by-default (§11).

-- ── Enums ────────────────────────────────────────────────────────────────────
do $$ begin create type public.vendor_kind as enum ('venue','catering','florals','music','photo_video','beauty','decor','rentals','other'); exception when duplicate_object then null; end $$;
do $$ begin create type public.engagement_status as enum ('presented','shortlisted','quote_requested','quoted','booked','declined','archived'); exception when duplicate_object then null; end $$;
do $$ begin create type public.quote_status as enum ('requested','received','accepted','declined','expired'); exception when duplicate_object then null; end $$;
do $$ begin create type public.vendor_file_label as enum ('packet','rates','menu','other'); exception when duplicate_object then null; end $$;

-- ── vendors (the private catalog) ────────────────────────────────────────────
create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 200),
  kind public.vendor_kind not null default 'other',
  description text,
  tags text[] not null default '{}',
  cities text[] not null default '{}',
  services text, restrictions text, perks text,
  contact_name text, contact_email text, contact_phone text,
  capacity int, address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);
create index if not exists vendors_workspace_idx on public.vendors (workspace_id);
create index if not exists vendors_cities_gin on public.vendors using gin (cities);
create index if not exists vendors_kind_idx on public.vendors (workspace_id, kind);

create table if not exists public.vendor_photos (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  storage_path text not null,
  sort int not null default 0,
  caption text,
  created_at timestamptz not null default now()
);
create index if not exists vendor_photos_vendor_idx on public.vendor_photos (vendor_id, sort);

create table if not exists public.vendor_files (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors (id) on delete cascade,
  storage_path text not null,
  label public.vendor_file_label not null default 'other',
  uploaded_at timestamptz not null default now()
);
create index if not exists vendor_files_vendor_idx on public.vendor_files (vendor_id);

-- ── wedding_vendors (THE ENGAGEMENT) ─────────────────────────────────────────
create table if not exists public.wedding_vendors (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  vendor_id uuid not null references public.vendors (id) on delete restrict,
  status public.engagement_status not null default 'presented',
  presented_note text,
  presented_estimate numeric(12,2),
  presented_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, wedding_id),
  unique (wedding_id, vendor_id)
);
create index if not exists wedding_vendors_wedding_idx on public.wedding_vendors (wedding_id);
create index if not exists wedding_vendors_vendor_idx on public.wedding_vendors (vendor_id);
create index if not exists wedding_vendors_status_idx on public.wedding_vendors (wedding_id, status);

-- ── event_vendors (which events an engagement covers) ────────────────────────
-- venue_booked is a denormalized flag (maintained by trigger) so a partial unique
-- index can enforce at-most-one booked venue per event structurally.
create table if not exists public.event_vendors (
  engagement_id uuid not null,
  event_id uuid not null,
  wedding_id uuid not null,
  role text,
  venue_booked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (engagement_id, event_id),
  constraint event_vendors_engagement_fk foreign key (engagement_id, wedding_id) references public.wedding_vendors (id, wedding_id) on delete cascade,
  constraint event_vendors_event_fk foreign key (event_id, wedding_id) references public.wedding_events (id, wedding_id) on delete cascade
);
create index if not exists event_vendors_event_idx on public.event_vendors (event_id);
create index if not exists event_vendors_wedding_idx on public.event_vendors (wedding_id);
create unique index if not exists event_vendors_one_venue_per_event on public.event_vendors (event_id) where venue_booked;

-- ── quotes ───────────────────────────────────────────────────────────────────
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null,
  engagement_id uuid not null,
  status public.quote_status not null default 'requested',
  amount numeric(12,2),
  currency char(3) not null default 'USD',
  valid_until date,
  note text,
  file text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quotes_engagement_fk foreign key (engagement_id, wedding_id) references public.wedding_vendors (id, wedding_id) on delete cascade
);
create index if not exists quotes_engagement_idx on public.quotes (engagement_id);
create index if not exists quotes_wedding_idx on public.quotes (wedding_id);

-- ── proposals gain the engagement subject (§1A) ──────────────────────────────
alter table public.proposals add column if not exists engagement_id uuid;
do $$ begin
  alter table public.proposals add constraint proposals_engagement_fk
    foreign key (engagement_id, wedding_id) references public.wedding_vendors (id, wedding_id) on delete set null (engagement_id);
exception when duplicate_object then null; end $$;
alter table public.proposals drop constraint if exists proposals_check;  -- (unnamed check re-added below if present)
do $$ begin
  alter table public.proposals add constraint proposals_one_subject check (num_nonnulls(event_ref, engagement_id) <= 1);
exception when duplicate_object then null; end $$;
create index if not exists proposals_engagement_idx on public.proposals (engagement_id);

-- ── touch triggers ────────────────────────────────────────────────────────────
drop trigger if exists touch_vendors on public.vendors;
create trigger touch_vendors before update on public.vendors for each row execute function private.touch_updated_at();
drop trigger if exists touch_wedding_vendors on public.wedding_vendors;
create trigger touch_wedding_vendors before update on public.wedding_vendors for each row execute function private.touch_updated_at();
drop trigger if exists touch_event_vendors on public.event_vendors;
create trigger touch_event_vendors before update on public.event_vendors for each row execute function private.touch_updated_at();
drop trigger if exists touch_quotes on public.quotes;
create trigger touch_quotes before update on public.quotes for each row execute function private.touch_updated_at();

-- ── Cross-scope guard: present only out of your own catalog ──────────────────
create or replace function private.guard_engagement_scope()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ws uuid; w_ws uuid;
begin
  select workspace_id into v_ws from public.vendors where id = new.vendor_id;
  select workspace_id into w_ws from public.weddings where id = new.wedding_id;
  if v_ws is distinct from w_ws then
    raise exception 'a vendor can only be presented onto a wedding in its own workspace' using errcode = 'FV243';
  end if;
  return new;
end $$;
drop trigger if exists guard_engagement_scope on public.wedding_vendors;
create trigger guard_engagement_scope before insert on public.wedding_vendors for each row execute function private.guard_engagement_scope();

-- ── Engagement status is function-only (BEFORE trigger, forma.eng_via_fn flag) ─
create or replace function private.guard_engagement_status()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('forma.eng_via_fn', true), '') <> 'on' then
    raise exception 'engagement status changes go through the lifecycle functions' using errcode = 'FV241';
  end if;
  return new;
end $$;
drop trigger if exists guard_engagement_status on public.wedding_vendors;
create trigger guard_engagement_status before update on public.wedding_vendors for each row execute function private.guard_engagement_status();

-- ── Maintain venue_booked (structural one-venue-per-event) ───────────────────
create or replace function private.sync_venue_booked()
returns trigger language plpgsql security definer set search_path = public as $$
declare is_venue boolean;
begin
  select (v.kind = 'venue') into is_venue from public.vendors v where v.id = new.vendor_id;
  if is_venue then
    update public.event_vendors set venue_booked = (new.status = 'booked') where engagement_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists sync_venue_booked on public.wedding_vendors;
create trigger sync_venue_booked after update of status on public.wedding_vendors for each row execute function private.sync_venue_booked();

-- ── Approval moves the mesh (§1B): proposal approve/decline → engagement ─────
create or replace function private.on_engagement_proposal_responded()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.engagement_id is null then return new; end if;
  if new.status = old.status then return new; end if;
  perform set_config('forma.eng_via_fn', 'on', true);
  if new.status = 'approved' then
    update public.wedding_vendors set status = 'shortlisted' where id = new.engagement_id and status = 'presented';
  elsif new.status = 'declined' then
    update public.wedding_vendors set status = 'declined' where id = new.engagement_id and status = 'presented';
  end if;
  perform set_config('forma.eng_via_fn', 'off', true);
  return new;
end $$;
drop trigger if exists on_engagement_proposal_responded on public.proposals;
create trigger on_engagement_proposal_responded after update on public.proposals for each row execute function private.on_engagement_proposal_responded();

-- ── present_vendor: the loop's opening move, one transaction ─────────────────
-- FV230 not staff · FV000 no vendor · FV243 cross-workspace · a bad event id dies
-- on the composite FK and rolls the whole thing back (atomic).
create or replace function private.present_vendor(p_vendor uuid, p_wedding uuid, p_event_ids uuid[], p_estimate numeric, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v public.vendors; eng uuid; e uuid; ttl text;
begin
  if not private.is_wedding_staff(p_wedding) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  select * into v from public.vendors where id = p_vendor;
  if not found then raise exception 'no such vendor' using errcode = 'FV000'; end if;
  -- guard_engagement_scope also checks, but fail early with the same code:
  if v.workspace_id <> (select workspace_id from public.weddings where id = p_wedding) then
    raise exception 'present only from your own catalog' using errcode = 'FV243';
  end if;

  insert into public.wedding_vendors (wedding_id, vendor_id, status, presented_note, presented_estimate, presented_at)
    values (p_wedding, p_vendor, 'presented', p_note, p_estimate, now())
    returning id into eng;
  foreach e in array coalesce(p_event_ids, '{}'::uuid[]) loop
    insert into public.event_vendors (engagement_id, event_id, wedding_id) values (eng, e, p_wedding);
  end loop;

  ttl := v.name || ' — ' || v.kind::text;
  insert into public.proposals (wedding_id, status, title, note, estimate_amount, engagement_id, created_by, sent_at)
    values (p_wedding, 'sent', ttl, p_note, p_estimate, eng, (select auth.uid()), now());

  perform private.log_activity(p_wedding, (select auth.uid()), 'vendor_presented', v.name, jsonb_build_object('engagement_id', eng));
  return eng;
end $$;

-- ── Engagement lifecycle (staff-only, function-only writes, each logs activity) ─
create or replace function private.set_engagement_status(p_eng uuid, p_from public.engagement_status[], p_to public.engagement_status, verb text)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid; st public.engagement_status; nm text;
begin
  select wv.wedding_id, wv.status, v.name into w, st, nm
    from public.wedding_vendors wv join public.vendors v on v.id = wv.vendor_id where wv.id = p_eng;
  if not found then raise exception 'no such engagement' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(w) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if not (st = any (p_from)) then raise exception 'engagement cannot move to % from %', p_to, st using errcode = 'FV241'; end if;
  perform set_config('forma.eng_via_fn', 'on', true);
  update public.wedding_vendors set status = p_to where id = p_eng;
  perform set_config('forma.eng_via_fn', 'off', true);
  perform private.log_activity(w, (select auth.uid()), verb, nm, jsonb_build_object('engagement_id', p_eng));
end $$;

create or replace function private.request_quote(p_eng uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare w uuid; q uuid;
begin
  select wedding_id into w from public.wedding_vendors where id = p_eng;
  if w is null then raise exception 'no such engagement' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(w) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  perform private.set_engagement_status(p_eng, array['presented','shortlisted']::public.engagement_status[], 'quote_requested', 'quote_requested');
  insert into public.quotes (wedding_id, engagement_id, status) values (w, p_eng, 'requested') returning id into q;
  return q;
end $$;

create or replace function private.record_quote(p_quote uuid, p_amount numeric, p_valid_until date, p_note text, p_file text default null)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid; eng uuid;
begin
  select wedding_id, engagement_id into w, eng from public.quotes where id = p_quote;
  if w is null then raise exception 'no such quote' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(w) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  update public.quotes set status = 'received', amount = p_amount, valid_until = p_valid_until, note = p_note, file = p_file where id = p_quote;
  perform private.set_engagement_status(eng, array['quote_requested','quoted','shortlisted','presented']::public.engagement_status[], 'quoted', 'quote_received');
end $$;

create or replace function private.accept_quote(p_quote uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid;
begin
  select wedding_id into w from public.quotes where id = p_quote;
  if w is null then raise exception 'no such quote' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(w) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  update public.quotes set status = 'accepted' where id = p_quote;
end $$;

create or replace function private.decline_quote(p_quote uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid;
begin
  select wedding_id into w from public.quotes where id = p_quote;
  if w is null then raise exception 'no such quote' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(w) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  update public.quotes set status = 'declined' where id = p_quote;
end $$;

create or replace function private.book_engagement(p_eng uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid; is_venue boolean; conflict_event uuid;
begin
  select wv.wedding_id, (v.kind = 'venue') into w, is_venue
    from public.wedding_vendors wv join public.vendors v on v.id = wv.vendor_id where wv.id = p_eng;
  if w is null then raise exception 'no such engagement' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(w) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if is_venue then
    -- one booked venue per event: reject with a human message before the index would
    select ev.event_id into conflict_event
      from public.event_vendors ev
      where ev.engagement_id = p_eng
        and exists (select 1 from public.event_vendors other where other.event_id = ev.event_id and other.venue_booked and other.engagement_id <> p_eng)
      limit 1;
    if conflict_event is not null then raise exception 'another venue is already booked for one of these events' using errcode = 'FV240'; end if;
  end if;
  perform private.set_engagement_status(p_eng, array['quoted','shortlisted']::public.engagement_status[], 'booked', 'engagement_booked');
end $$;

create or replace function private.archive_engagement(p_eng uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid;
begin
  select wedding_id into w from public.wedding_vendors where id = p_eng;
  if w is null then raise exception 'no such engagement' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(w) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  perform private.set_engagement_status(p_eng, array['presented','shortlisted','quote_requested','quoted','declined']::public.engagement_status[], 'archived', 'engagement_archived');
end $$;

-- ── advance_wedding_phase: FV205 becomes a real, satisfiable venue predicate ──
create or replace function private.advance_wedding_phase(w uuid)
returns public.wedding_phase language plpgsql security definer set search_path = public as $$
declare wd public.weddings; wk public.workspace_kind; undated int; unvenued int;
begin
  select * into wd from public.weddings where id = w;
  if not found then raise exception 'wedding % not found', w using errcode = 'FV000'; end if;
  -- M4 makes this staff-callable (the planning-room Advance button). A signed-in
  -- caller must be staff; a no-jwt owner/service context (tests, seeds) is trusted.
  if (select auth.uid()) is not null and not private.is_wedding_staff(w) then
    raise exception 'not permitted' using errcode = 'FV230';
  end if;
  select kind into wk from public.workspaces where id = wd.workspace_id;

  if wd.phase = 'hiring' then
    if wk = 'couple' then
      update public.weddings set phase = 'foundations' where id = w;
      return 'foundations';
    end if;
    raise exception 'planner agreement must complete and its deposit be paid (arrives M5)' using errcode = 'FV101';
  elsif wd.phase = 'foundations' then
    if coalesce(wd.budget_total, 0) <= 0 then raise exception 'budget must be set above zero' using errcode = 'FV201'; end if;
    if coalesce(wd.guest_target, 0) <= 0 then raise exception 'a guest target is required' using errcode = 'FV202'; end if;
    if wd.location_city is null or wd.location_country is null then raise exception 'the location must be set' using errcode = 'FV203'; end if;
    select count(*) into undated from public.wedding_events where wedding_id = w and event_date is null;
    if undated > 0 then raise exception '% event(s) still need a date', undated using errcode = 'FV204'; end if;
    -- every event now needs a booked venue (real predicate)
    select count(*) into unvenued from public.wedding_events e
      where e.wedding_id = w
        and not exists (select 1 from public.event_vendors ev where ev.event_id = e.id and ev.venue_booked);
    if unvenued > 0 then raise exception '% event(s) still need a booked venue', unvenued using errcode = 'FV205'; end if;
    update public.weddings set phase = 'details' where id = w;
    perform private.log_activity(w, (select auth.uid()), 'phase_advanced', 'details', jsonb_build_object('phase', 'details'));
    return 'details';
  elsif wd.phase = 'details' then
    raise exception 'phase 3 to 4 is date-driven, not advanced by this function in M1' using errcode = 'FV301';
  elsif wd.phase = 'wedding_days' then
    raise exception 'closing requires a settled ledger (arrives M5)' using errcode = 'FV401';
  else
    raise exception 'the wedding is already closed' using errcode = 'FV299';
  end if;
end $$;

-- ── Public wrappers (SECURITY INVOKER) + grants (closed by default, §11) ─────
create or replace function public.present_vendor(p_vendor uuid, p_wedding uuid, p_event_ids uuid[], p_estimate numeric, p_note text)
returns uuid language sql security invoker set search_path = public as $$ select private.present_vendor(p_vendor, p_wedding, p_event_ids, p_estimate, p_note); $$;
create or replace function public.request_quote(p_eng uuid)
returns uuid language sql security invoker set search_path = public as $$ select private.request_quote(p_eng); $$;
create or replace function public.record_quote(p_quote uuid, p_amount numeric, p_valid_until date, p_note text, p_file text default null)
returns void language sql security invoker set search_path = public as $$ select private.record_quote(p_quote, p_amount, p_valid_until, p_note, p_file); $$;
create or replace function public.accept_quote(p_quote uuid)
returns void language sql security invoker set search_path = public as $$ select private.accept_quote(p_quote); $$;
create or replace function public.decline_quote(p_quote uuid)
returns void language sql security invoker set search_path = public as $$ select private.decline_quote(p_quote); $$;
create or replace function public.book_engagement(p_eng uuid)
returns void language sql security invoker set search_path = public as $$ select private.book_engagement(p_eng); $$;
create or replace function public.archive_engagement(p_eng uuid)
returns void language sql security invoker set search_path = public as $$ select private.archive_engagement(p_eng); $$;
create or replace function public.advance_phase(w uuid)
returns public.wedding_phase language sql security invoker set search_path = public as $$ select private.advance_wedding_phase(w); $$;

-- advance_wedding_phase becomes staff-callable in M4 (via public.advance_phase);
-- 0004 had revoked it from authenticated as internal-only. Re-grant it (its own
-- staff guard now protects it), leaving anon closed.
revoke execute on function private.advance_wedding_phase(uuid) from public, anon;
grant execute on function private.advance_wedding_phase(uuid) to authenticated;

-- internal helpers created here: close them explicitly (ADP is only a backstop)
revoke execute on function
  private.guard_engagement_scope(), private.guard_engagement_status(), private.sync_venue_booked(),
  private.on_engagement_proposal_responded(), private.set_engagement_status(uuid, public.engagement_status[], public.engagement_status, text)
  from public, anon, authenticated;

-- staff entry points: private targets + public wrappers to authenticated only
revoke execute on function
  private.present_vendor(uuid, uuid, uuid[], numeric, text), private.request_quote(uuid),
  private.record_quote(uuid, numeric, date, text, text), private.accept_quote(uuid), private.decline_quote(uuid),
  private.book_engagement(uuid), private.archive_engagement(uuid)
  from public, anon;
grant execute on function
  private.present_vendor(uuid, uuid, uuid[], numeric, text), private.request_quote(uuid),
  private.record_quote(uuid, numeric, date, text, text), private.accept_quote(uuid), private.decline_quote(uuid),
  private.book_engagement(uuid), private.archive_engagement(uuid)
  to authenticated;
revoke execute on function
  public.present_vendor(uuid, uuid, uuid[], numeric, text), public.request_quote(uuid),
  public.record_quote(uuid, numeric, date, text, text), public.accept_quote(uuid), public.decline_quote(uuid),
  public.book_engagement(uuid), public.archive_engagement(uuid), public.advance_phase(uuid)
  from public, anon;
grant execute on function
  public.present_vendor(uuid, uuid, uuid[], numeric, text), public.request_quote(uuid),
  public.record_quote(uuid, numeric, date, text, text), public.accept_quote(uuid), public.decline_quote(uuid),
  public.book_engagement(uuid), public.archive_engagement(uuid), public.advance_phase(uuid)
  to authenticated;

-- ── Couple's partner view — a membership-scoped projection over the private
-- catalog. A security_invoker view can't work (the couple has no RLS on vendors,
-- by design), and a security_definer VIEW trips the security_definer_view advisor;
-- so it's a private SECURITY DEFINER function (joins the catalog as owner, filtered
-- to the caller's wedding) behind a public invoker wrapper. The catalog stays
-- structurally invisible — the couple only ever sees vendors engaged on THEIR
-- wedding, with photos, never the rest.
create or replace function private.wedding_partners(w uuid)
returns table (engagement_id uuid, status public.engagement_status, presented_estimate numeric,
  vendor_name text, vendor_kind public.vendor_kind, description text, photos jsonb, event_ids jsonb)
language sql stable security definer set search_path = public as $$
  select wv.id, wv.status, wv.presented_estimate, v.name, v.kind, v.description,
    (select coalesce(jsonb_agg(jsonb_build_object('path', vp.storage_path, 'caption', vp.caption) order by vp.sort), '[]'::jsonb)
       from public.vendor_photos vp where vp.vendor_id = v.id),
    (select coalesce(jsonb_agg(distinct ev.event_id), '[]'::jsonb) from public.event_vendors ev where ev.engagement_id = wv.id)
  from public.wedding_vendors wv join public.vendors v on v.id = wv.vendor_id
  where wv.wedding_id = w and (private.is_wedding_staff(w) or private.is_wedding_member(w));
$$;
create or replace function public.wedding_partners(w uuid)
returns table (engagement_id uuid, status public.engagement_status, presented_estimate numeric,
  vendor_name text, vendor_kind public.vendor_kind, description text, photos jsonb, event_ids jsonb)
language sql security invoker set search_path = public as $$ select * from private.wedding_partners(w); $$;
revoke execute on function private.wedding_partners(uuid), public.wedding_partners(uuid) from public, anon;
grant execute on function private.wedding_partners(uuid), public.wedding_partners(uuid) to authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.vendors enable row level security;
alter table public.vendor_photos enable row level security;
alter table public.vendor_files enable row level security;
alter table public.wedding_vendors enable row level security;
alter table public.event_vendors enable row level security;
alter table public.quotes enable row level security;

-- vendors + media: workspace members CRUD; couple has NO policy (catalog private).
drop policy if exists vendors_all on public.vendors;
create policy vendors_all on public.vendors for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));
drop policy if exists vendor_photos_all on public.vendor_photos;
create policy vendor_photos_all on public.vendor_photos for all to authenticated
  using (exists (select 1 from public.vendors v where v.id = vendor_id and private.is_workspace_member(v.workspace_id)))
  with check (exists (select 1 from public.vendors v where v.id = vendor_id and private.is_workspace_member(v.workspace_id)));
drop policy if exists vendor_files_all on public.vendor_files;
create policy vendor_files_all on public.vendor_files for all to authenticated
  using (exists (select 1 from public.vendors v where v.id = vendor_id and private.is_workspace_member(v.workspace_id)))
  with check (exists (select 1 from public.vendors v where v.id = vendor_id and private.is_workspace_member(v.workspace_id)));

-- engagements/events/quotes: staff CRUD (status via functions), members SELECT.
drop policy if exists wedding_vendors_select on public.wedding_vendors;
create policy wedding_vendors_select on public.wedding_vendors for select to authenticated
  using (private.is_wedding_staff(wedding_id) or private.is_wedding_member(wedding_id));
drop policy if exists wedding_vendors_write on public.wedding_vendors;
create policy wedding_vendors_write on public.wedding_vendors for all to authenticated
  using (private.is_wedding_staff(wedding_id)) with check (private.is_wedding_staff(wedding_id));
drop policy if exists event_vendors_select on public.event_vendors;
create policy event_vendors_select on public.event_vendors for select to authenticated
  using (private.is_wedding_staff(wedding_id) or private.is_wedding_member(wedding_id));
drop policy if exists event_vendors_write on public.event_vendors;
create policy event_vendors_write on public.event_vendors for all to authenticated
  using (private.is_wedding_staff(wedding_id)) with check (private.is_wedding_staff(wedding_id));
drop policy if exists quotes_select on public.quotes;
create policy quotes_select on public.quotes for select to authenticated
  using (private.is_wedding_staff(wedding_id) or private.is_wedding_member(wedding_id));
drop policy if exists quotes_write on public.quotes;
create policy quotes_write on public.quotes for all to authenticated
  using (private.is_wedding_staff(wedding_id)) with check (private.is_wedding_staff(wedding_id));
