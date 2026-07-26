-- 0003_loop.sql — Forma v2 M2: the loop (proposals, messages, activity, invites).
-- Normative: docs/FORMA-V2-SCHEMA.md §3/§10/§11, with two amendments made in this
-- PR (doc updated to match):
--   §1A Freeform proposals are legal — CHECK (num_nonnulls(subjects) <= 1), not = 1.
--       In M2 the only subject column is event_ref (composite-FK'd to wedding_events);
--       later migrations add engagement_id/quote_id/menu_id/design_item_id and widen
--       the check. The M:N proposal_events table is deferred with those subjects.
--   §1B wedding_invites — tokenized invite links bridge to a couple until the M5
--       contract gate + M3 email exist.
--
-- The proposal lifecycle is FUNCTION-ONLY: status changes go through the private
-- SECURITY DEFINER functions below (exposed via thin public SECURITY INVOKER
-- wrappers — SCHEMA §0), each doing its own authorization and writing an activity
-- row. A BEFORE trigger rejects any direct status change.

-- ── Enum ─────────────────────────────────────────────────────────────────────
do $$ begin
  create type public.proposal_status as enum ('draft','sent','seen','change_requested','approved','declined','withdrawn');
exception when duplicate_object then null; end $$;

-- ── profiles.last_seen_at (feeds the cockpit "Since you were away") ───────────
alter table public.profiles add column if not exists last_seen_at timestamptz;

-- ── proposals ────────────────────────────────────────────────────────────────
create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  status public.proposal_status not null default 'draft',
  title text not null check (char_length(title) between 1 and 200),
  note text,
  estimate_amount numeric(12,2),
  currency char(3) not null default 'USD',
  event_ref uuid,
  created_by uuid references public.profiles (id) on delete set null,
  responded_by uuid references public.profiles (id) on delete set null,
  responded_at timestamptz,
  sent_at timestamptz,
  seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, wedding_id),
  -- at most one mesh subject (§1A); only event_ref exists in M2
  check (num_nonnulls(event_ref) <= 1),
  -- a proposal's event must belong to the SAME wedding (composite FK); when the
  -- event is deleted only event_ref is nulled (wedding_id is NOT NULL). PG15+.
  constraint proposals_event_fk foreign key (event_ref, wedding_id)
    references public.wedding_events (id, wedding_id) on delete set null (event_ref)
);
create index if not exists proposals_wedding_idx on public.proposals (wedding_id);
create index if not exists proposals_event_idx on public.proposals (event_ref);
create index if not exists proposals_created_by_idx on public.proposals (created_by);
create index if not exists proposals_status_idx on public.proposals (wedding_id, status);

-- ── proposal_messages (append-only) ──────────────────────────────────────────
create table if not exists public.proposal_messages (
  id uuid primary key default gen_random_uuid(),
  proposal_id uuid not null,
  wedding_id uuid not null,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  constraint proposal_messages_proposal_fk foreign key (proposal_id, wedding_id)
    references public.proposals (id, wedding_id) on delete cascade
);
create index if not exists proposal_messages_thread_idx on public.proposal_messages (proposal_id, created_at);
create index if not exists proposal_messages_author_idx on public.proposal_messages (author_id);

-- ── activity (append-only; feeds Since-you-were-away + chase list context) ────
create table if not exists public.activity (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null, -- null = system
  verb text not null,
  summary text not null,
  subject jsonb,
  created_at timestamptz not null default now()
);
create index if not exists activity_wedding_time_idx on public.activity (wedding_id, created_at desc);
create index if not exists activity_actor_idx on public.activity (actor_id);

-- ── wedding_invites (§1B) ────────────────────────────────────────────────────
create table if not exists public.wedding_invites (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  role public.wedding_member_role not null,
  token char(24) not null unique
    default substr(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 1, 24)
    check (token ~ '^[A-Za-z0-9_-]{24}$'),
  created_by uuid references public.profiles (id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  used_by uuid references public.profiles (id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, wedding_id)
);
create index if not exists wedding_invites_wedding_idx on public.wedding_invites (wedding_id);
create index if not exists wedding_invites_created_by_idx on public.wedding_invites (created_by);
create index if not exists wedding_invites_used_by_idx on public.wedding_invites (used_by);

-- ── updated_at triggers (mutating tables only; messages/activity are append-only)
drop trigger if exists touch_proposals on public.proposals;
create trigger touch_proposals before update on public.proposals for each row execute function private.touch_updated_at();
drop trigger if exists touch_wedding_invites on public.wedding_invites;
create trigger touch_wedding_invites before update on public.wedding_invites for each row execute function private.touch_updated_at();

-- ── activity writer (used by every lifecycle function) ───────────────────────
create or replace function private.log_activity(w uuid, actor uuid, verb text, summary text, subj jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.activity (wedding_id, actor_id, verb, summary, subject) values (w, actor, verb, summary, subj);
$$;

-- ── function-only status guard ───────────────────────────────────────────────
-- Direct UPDATEs may edit a draft's content but never touch status. The lifecycle
-- functions set forma.status_via_fn = 'on' around their status write; anything
-- else that changes status is rejected.
create or replace function private.guard_proposal_status()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('forma.status_via_fn', true), '') <> 'on' then
    raise exception 'proposal status changes go through the lifecycle functions' using errcode = 'FV220';
  end if;
  return new;
end $$;
drop trigger if exists guard_proposal_status on public.proposals;
create trigger guard_proposal_status before update on public.proposals for each row execute function private.guard_proposal_status();

-- ── Lifecycle functions (private, SECURITY DEFINER) ──────────────────────────
-- Each does its own authorization (SECURITY DEFINER bypasses RLS) and logs activity.
-- Error codes: FV230 not authorized · FV221 illegal transition · FV222 change needs
-- a message · FV000 not found.

create or replace function private.send_proposal(p uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid; st public.proposal_status; ttl text;
begin
  select wedding_id, status, title into w, st, ttl from public.proposals where id = p;
  if not found then raise exception 'no such proposal' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(w) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if st <> 'draft' then raise exception 'only a draft can be sent' using errcode = 'FV221'; end if;
  perform set_config('forma.status_via_fn', 'on', true);
  update public.proposals set status = 'sent', sent_at = now() where id = p;
  perform set_config('forma.status_via_fn', 'off', true);
  perform private.log_activity(w, (select auth.uid()), 'proposal_sent', ttl, jsonb_build_object('proposal_id', p));
end $$;

create or replace function private.mark_proposal_seen(p uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid; st public.proposal_status; ttl text;
begin
  select wedding_id, status, title into w, st, ttl from public.proposals where id = p;
  if not found then raise exception 'no such proposal' using errcode = 'FV000'; end if;
  if not private.is_wedding_member(w) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if st = 'sent' then -- first call wins; otherwise a silent no-op
    perform set_config('forma.status_via_fn', 'on', true);
    update public.proposals set status = 'seen', seen_at = now() where id = p;
    perform set_config('forma.status_via_fn', 'off', true);
    perform private.log_activity(w, (select auth.uid()), 'proposal_seen', ttl, jsonb_build_object('proposal_id', p));
  end if;
end $$;

create or replace function private.respond_to_proposal(p uuid, action text, message text default null)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid; st public.proposal_status; ttl text; new_status public.proposal_status; verb text; uid uuid := (select auth.uid());
begin
  select wedding_id, status, title into w, st, ttl from public.proposals where id = p;
  if not found then raise exception 'no such proposal' using errcode = 'FV000'; end if;
  if not private.is_wedding_member(w) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if st not in ('sent','seen') then raise exception 'this proposal is not open for a response' using errcode = 'FV221'; end if;
  if action = 'approve' then new_status := 'approved'; verb := 'proposal_approved';
  elsif action = 'decline' then new_status := 'declined'; verb := 'proposal_declined';
  elsif action = 'request_change' then
    if message is null or char_length(btrim(message)) = 0 then raise exception 'a change request needs a message' using errcode = 'FV222'; end if;
    new_status := 'change_requested'; verb := 'proposal_change_requested';
  else raise exception 'unknown action' using errcode = 'FV221'; end if;

  if message is not null and char_length(btrim(message)) > 0 then
    insert into public.proposal_messages (proposal_id, wedding_id, author_id, body) values (p, w, uid, btrim(message));
  end if;
  perform set_config('forma.status_via_fn', 'on', true);
  update public.proposals set status = new_status, responded_by = uid, responded_at = now() where id = p;
  perform set_config('forma.status_via_fn', 'off', true);
  perform private.log_activity(w, uid, verb, ttl, jsonb_build_object('proposal_id', p));
end $$;

create or replace function private.withdraw_proposal(p uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid; st public.proposal_status; ttl text;
begin
  select wedding_id, status, title into w, st, ttl from public.proposals where id = p;
  if not found then raise exception 'no such proposal' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(w) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if st in ('approved','declined','withdrawn') then raise exception 'this proposal is already settled' using errcode = 'FV221'; end if;
  perform set_config('forma.status_via_fn', 'on', true);
  update public.proposals set status = 'withdrawn' where id = p;
  perform set_config('forma.status_via_fn', 'off', true);
  perform private.log_activity(w, (select auth.uid()), 'proposal_withdrawn', ttl, jsonb_build_object('proposal_id', p));
end $$;

create or replace function private.post_proposal_message(p uuid, body text)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid; st public.proposal_status; ttl text; uid uuid := (select auth.uid());
begin
  select wedding_id, status, title into w, st, ttl from public.proposals where id = p;
  if not found then raise exception 'no such proposal' using errcode = 'FV000'; end if;
  if not (private.is_wedding_staff(w) or private.is_wedding_member(w)) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if st = 'withdrawn' then raise exception 'this proposal is withdrawn' using errcode = 'FV221'; end if;
  if body is null or char_length(btrim(body)) = 0 then raise exception 'empty message' using errcode = 'FV222'; end if;
  insert into public.proposal_messages (proposal_id, wedding_id, author_id, body) values (p, w, uid, btrim(body));
  perform private.log_activity(w, uid, 'proposal_message', ttl, jsonb_build_object('proposal_id', p));
end $$;

create or replace function private.accept_wedding_invite(p_token text)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv public.wedding_invites; uid uuid := (select auth.uid());
begin
  if uid is null then raise exception 'must be signed in' using errcode = 'FV230'; end if;
  select * into inv from public.wedding_invites where token = p_token for update;
  if not found then raise exception 'invalid invite' using errcode = 'FV223'; end if;
  if inv.used_at is not null then raise exception 'invite already used' using errcode = 'FV224'; end if;
  if inv.expires_at < now() then raise exception 'invite expired' using errcode = 'FV225'; end if;
  insert into public.wedding_members (wedding_id, user_id, role) values (inv.wedding_id, uid, inv.role) on conflict do nothing;
  update public.wedding_invites set used_by = uid, used_at = now() where id = inv.id;
  perform private.log_activity(inv.wedding_id, uid, 'member_joined', 'joined the wedding', jsonb_build_object('role', inv.role));
  return inv.wedding_id;
end $$;

-- ── Thin public wrappers (SECURITY INVOKER) — the RPC surface ────────────────
-- The heavy SECURITY DEFINER logic lives in `private` (not API-exposed); these
-- public wrappers are what PostgREST exposes and the app calls. Keeping the
-- definer functions out of the API schema is the SCHEMA §0 pattern and keeps the
-- advisors clean (no public SECURITY DEFINER RPC surface).
create or replace function public.send_proposal(p uuid)
returns void language sql security invoker set search_path = public as $$ select private.send_proposal(p); $$;
create or replace function public.mark_proposal_seen(p uuid)
returns void language sql security invoker set search_path = public as $$ select private.mark_proposal_seen(p); $$;
create or replace function public.respond_to_proposal(p uuid, action text, message text default null)
returns void language sql security invoker set search_path = public as $$ select private.respond_to_proposal(p, action, message); $$;
create or replace function public.withdraw_proposal(p uuid)
returns void language sql security invoker set search_path = public as $$ select private.withdraw_proposal(p); $$;
create or replace function public.post_proposal_message(p uuid, body text)
returns void language sql security invoker set search_path = public as $$ select private.post_proposal_message(p, body); $$;
create or replace function public.accept_wedding_invite(p_token text)
returns uuid language sql security invoker set search_path = public as $$ select private.accept_wedding_invite(p_token); $$;

-- The invoker wrappers run as the caller, so the caller needs EXECUTE on the
-- private functions. Grant to authenticated only (never anon).
grant execute on function
  private.send_proposal(uuid), private.mark_proposal_seen(uuid),
  private.respond_to_proposal(uuid, text, text), private.withdraw_proposal(uuid),
  private.post_proposal_message(uuid, text), private.accept_wedding_invite(text)
  to authenticated;
revoke execute on function
  public.send_proposal(uuid), public.mark_proposal_seen(uuid),
  public.respond_to_proposal(uuid, text, text), public.withdraw_proposal(uuid),
  public.post_proposal_message(uuid, text), public.accept_wedding_invite(text)
  from anon;

-- ── proposal_court view (derived court + age; RLS of proposals applies) ───────
create or replace view public.proposal_court
with (security_invoker = true) as
select
  p.id as proposal_id,
  p.wedding_id,
  case p.status
    when 'draft' then 'planner'
    when 'change_requested' then 'planner'
    when 'sent' then 'couple'
    when 'seen' then 'couple'
    else 'none'
  end as court,
  case
    when p.status in ('sent','seen') then floor(extract(epoch from now() - coalesce(p.sent_at, p.created_at)) / 86400)::int
    when p.status = 'change_requested' then floor(extract(epoch from now() - coalesce(p.responded_at, p.updated_at)) / 86400)::int
    when p.status = 'draft' then floor(extract(epoch from now() - p.created_at) / 86400)::int
    else 0
  end as age_days
from public.proposals p;

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.proposals enable row level security;
alter table public.proposal_messages enable row level security;
alter table public.activity enable row level security;
alter table public.wedding_invites enable row level security;

-- proposals: staff full read + draft content edits; members read non-drafts.
-- Status only ever changes via the lifecycle functions (guarded by trigger).
drop policy if exists proposals_select on public.proposals;
create policy proposals_select on public.proposals for select to authenticated
  using (private.is_wedding_staff(wedding_id) or (private.is_wedding_member(wedding_id) and status <> 'draft'));
drop policy if exists proposals_insert on public.proposals;
create policy proposals_insert on public.proposals for insert to authenticated
  with check (private.is_wedding_staff(wedding_id) and status = 'draft');
drop policy if exists proposals_update on public.proposals;
create policy proposals_update on public.proposals for update to authenticated
  using (private.is_wedding_staff(wedding_id) and status = 'draft')
  with check (private.is_wedding_staff(wedding_id));
drop policy if exists proposals_delete on public.proposals;
create policy proposals_delete on public.proposals for delete to authenticated
  using (private.is_wedding_staff(wedding_id) and status = 'draft');

-- messages: both sides read; INSERT only via post_proposal_message / respond
-- (SECURITY DEFINER, owner-bypass). No direct insert/update/delete policy.
drop policy if exists proposal_messages_select on public.proposal_messages;
create policy proposal_messages_select on public.proposal_messages for select to authenticated
  using (private.is_wedding_staff(wedding_id) or private.is_wedding_member(wedding_id));

-- activity: both sides read (no money verbs in M2); system writes via functions.
drop policy if exists activity_select on public.activity;
create policy activity_select on public.activity for select to authenticated
  using (private.is_wedding_staff(wedding_id) or private.is_wedding_member(wedding_id));

-- invites: staff-only in every verb; the couple never sees the table (they accept
-- via accept_wedding_invite, which is SECURITY DEFINER and reads by token).
drop policy if exists wedding_invites_select on public.wedding_invites;
create policy wedding_invites_select on public.wedding_invites for select to authenticated
  using (private.is_wedding_staff(wedding_id));
drop policy if exists wedding_invites_insert on public.wedding_invites;
create policy wedding_invites_insert on public.wedding_invites for insert to authenticated
  with check (private.is_wedding_staff(wedding_id));
drop policy if exists wedding_invites_delete on public.wedding_invites;
create policy wedding_invites_delete on public.wedding_invites for delete to authenticated
  using (private.is_wedding_staff(wedding_id) and used_at is null);

-- ── Profiles: widen visibility to shared WEDDING loops ───────────────────────
-- M0 let workspace co-members see each other's profile (avatars). The loop pairs
-- staff and couple who share a WEDDING but not a workspace, and both sides need
-- to render the other's name/avatar in threads. shares_wedding_loop covers the
-- three cases: co-members of a wedding, staff↔member either direction.
create or replace function private.shares_wedding_loop(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.wedding_members a
      join public.wedding_members b on a.wedding_id = b.wedding_id
      where a.user_id = (select auth.uid()) and b.user_id = other
    union all
    select 1 from public.weddings w
      join public.workspace_members wm on wm.workspace_id = w.workspace_id
      join public.wedding_members m on m.wedding_id = w.id
      where wm.user_id = (select auth.uid()) and m.user_id = other
    union all
    select 1 from public.weddings w
      join public.workspace_members wm on wm.workspace_id = w.workspace_id
      join public.wedding_members m on m.wedding_id = w.id
      where wm.user_id = other and m.user_id = (select auth.uid())
  );
$$;

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.workspace_members me
      join public.workspace_members them on them.workspace_id = me.workspace_id
      where me.user_id = (select auth.uid()) and them.user_id = public.profiles.id
    )
    or private.shares_wedding_loop(id)
  );
