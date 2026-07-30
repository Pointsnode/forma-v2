-- 0016 team seats & clearance boxes (M15). Additive. 0001–0015 immutable.
-- A role is a display preset; authority is a set of clearance BOXES the admin ticks
-- per account, stored on workspace_members.grants and enforced INSIDE the powerful
-- functions (law 2) — is_workspace_member stays role-blind, workspace_members RLS is
-- untouched. Invites are redeemed by SIGNED-IN users (wedding-invite shape) so the
-- anon matrix stays exactly 10. No member_role enum change (in-txn ADD VALUE hazard):
-- role='owner' is kept in sync with the 'admin' box by the functions, so
-- is_workspace_owner keeps working everywhere it's used today.

-- ── §B storage: grants + title on workspace_members, creator backfilled to admin ──
alter table public.workspace_members add column if not exists grants text[] not null default '{}';
alter table public.workspace_members add column if not exists title text;
-- Every existing member is a workspace creator (single-member workspaces) → the admin
-- box, so nothing anyone can do today is lost.
update public.workspace_members set grants = array['admin'] where role = 'owner' and grants = '{}';

-- ── §B predicates (private; applied inside functions only, never in RLS) ─────────
create or replace function private.workspace_grants(w uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select grants from public.workspace_members where workspace_id = w and user_id = (select auth.uid());
$$;

create or replace function private.has_clearance(w uuid, k text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = w and m.user_id = (select auth.uid())
      -- role='owner' IS the admin box (§B, kept in sync by the functions) — so an
      -- owner has every clearance even if grants weren't backfilled (belt + braces).
      and (m.role = 'owner' or 'admin' = any (m.grants) or k = any (m.grants))
  );
$$;

-- Close PUBLIC's default EXECUTE on the new private helpers (0004's law: every new
-- private function is explicitly revoked, else the anon matrix leaks). authenticated
-- needs EXECUTE — has_clearance is invoked by the workspace_invites RLS policy as the
-- querying role, and both are called inside the DEFINER functions.
revoke execute on function private.workspace_grants(uuid), private.has_clearance(uuid, text) from public, anon;
grant execute on function private.workspace_grants(uuid), private.has_clearance(uuid, text) to authenticated;

-- ── §E workspace_invites (modelled on wedding_invites) ───────────────────────────
-- email is text + compared case-insensitively (no citext extension in this project).
create table if not exists public.workspace_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email text not null,
  grants text[] not null default '{}',
  title text,
  token uuid not null unique default gen_random_uuid(),
  invited_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id) on delete set null
);
create index if not exists workspace_invites_workspace_idx on public.workspace_invites (workspace_id);
-- one live (unaccepted) invite per email per workspace; accepted ones don't block re-invite
create unique index if not exists workspace_invites_pending_idx on public.workspace_invites (workspace_id, lower(email)) where accepted_at is null;
drop trigger if exists touch_workspace_invites on public.workspace_invites;
create trigger touch_workspace_invites before update on public.workspace_invites for each row execute function private.touch_updated_at();

-- RLS: only an admin of the workspace ever touches this table (all verbs). The invitee
-- never reads it — accept_workspace_invite is SECURITY DEFINER and keys off the token.
alter table public.workspace_invites enable row level security;
drop policy if exists workspace_invites_admin on public.workspace_invites;
create policy workspace_invites_admin on public.workspace_invites for all to authenticated
  using (private.has_clearance(workspace_id, 'admin')) with check (private.has_clearance(workspace_id, 'admin'));

-- ── §E invite functions ──────────────────────────────────────────────────────────
create or replace function private.create_workspace_invite(p_workspace uuid, p_email text, p_grants text[], p_title text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_email text := lower(btrim(p_email));
begin
  if not private.has_clearance(p_workspace, 'admin') then raise exception 'your role does not allow that' using errcode = 'FS050'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'that is not a valid email' using errcode = 'FV241'; end if;
  if exists (
    select 1 from public.workspace_members m join auth.users u on u.id = m.user_id
    where m.workspace_id = p_workspace and lower(u.email) = v_email
  ) then raise exception 'that person is already on your team' using errcode = 'FV241'; end if;
  if exists (
    select 1 from public.workspace_invites i
    where i.workspace_id = p_workspace and lower(i.email) = v_email and i.accepted_at is null and i.expires_at > now()
  ) then raise exception 'that person already has a pending invitation' using errcode = 'FV241'; end if;
  insert into public.workspace_invites (workspace_id, email, grants, title, invited_by)
    values (p_workspace, v_email, coalesce(p_grants, '{}'), nullif(btrim(coalesce(p_title, '')), ''), (select auth.uid()))
    returning id into v_id;
  return v_id;
end $$;

-- Accept as the signed-in invitee. Idempotent: a second accept by the same user returns
-- the workspace id. role syncs with the admin box so is_workspace_owner keeps working.
create or replace function private.accept_workspace_invite(p_token uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv public.workspace_invites; uid uuid := (select auth.uid()); u_email text; v_role public.member_role;
begin
  if uid is null then raise exception 'must be signed in' using errcode = 'FV230'; end if;
  select * into inv from public.workspace_invites where token = p_token for update;
  if not found then raise exception 'no such invitation' using errcode = 'FV000'; end if;
  if inv.accepted_at is not null then
    if inv.accepted_by = uid then return inv.workspace_id; end if; -- idempotent re-accept
    raise exception 'this invitation has already been used' using errcode = 'FV241';
  end if;
  if inv.expires_at < now() then raise exception 'this invitation has expired' using errcode = 'FV241'; end if;
  select email into u_email from auth.users where id = uid;
  if lower(coalesce(u_email, '')) <> lower(inv.email) then
    raise exception 'this invitation was sent to a different email address' using errcode = 'FV241';
  end if;
  v_role := case when 'admin' = any (inv.grants) then 'owner'::public.member_role else 'planner'::public.member_role end;
  insert into public.workspace_members (workspace_id, user_id, role, grants, title)
    values (inv.workspace_id, uid, v_role, inv.grants, inv.title)
    on conflict (workspace_id, user_id) do nothing;
  update public.workspace_invites set accepted_at = now(), accepted_by = uid where id = inv.id;
  return inv.workspace_id;
end $$;

-- public wrappers (SECURITY INVOKER) — authenticated only, never anon (matrix stays 10)
create or replace function public.create_workspace_invite(p_workspace uuid, p_email text, p_grants text[], p_title text)
returns uuid language sql security invoker set search_path = public as $$ select private.create_workspace_invite(p_workspace, p_email, p_grants, p_title); $$;
create or replace function public.accept_workspace_invite(p_token uuid)
returns uuid language sql security invoker set search_path = public as $$ select private.accept_workspace_invite(p_token); $$;

revoke execute on function
  private.create_workspace_invite(uuid, text, text[], text), public.create_workspace_invite(uuid, text, text[], text),
  private.accept_workspace_invite(uuid), public.accept_workspace_invite(uuid)
  from public, anon;
grant execute on function
  private.create_workspace_invite(uuid, text, text[], text), public.create_workspace_invite(uuid, text, text[], text),
  private.accept_workspace_invite(uuid), public.accept_workspace_invite(uuid)
  to authenticated;

-- ── Member management (§D edit/remove + §4 law-4 last-admin guard) ───────────────
-- NOTE: §2's migration list did not name these two, but §D (edit clearances / remove)
-- and law 4 (last admin can never lock the studio out) require them, and the guard
-- can't live in RLS — flagged in the PR as a §2-list gap filled. Both admin-gated;
-- role stays in sync with the admin box so is_workspace_owner keeps working.
create or replace function private.set_member_clearances(p_workspace uuid, p_user uuid, p_grants text[], p_title text)
returns void language plpgsql security definer set search_path = public as $$
declare v_grants text[] := coalesce(p_grants, '{}'); v_role public.member_role; admin_count int;
begin
  if not private.has_clearance(p_workspace, 'admin') then raise exception 'your role does not allow that' using errcode = 'FS050'; end if;
  -- law 4: can't strip the admin box off the last admin (whether self or another).
  if exists (select 1 from public.workspace_members where workspace_id = p_workspace and user_id = p_user and ('admin' = any (grants) or role = 'owner'))
     and not ('admin' = any (v_grants)) then
    select count(*) into admin_count from public.workspace_members where workspace_id = p_workspace and ('admin' = any (grants) or role = 'owner');
    if admin_count <= 1 then raise exception 'you are the last admin — give someone else the admin box first' using errcode = 'FV241'; end if;
  end if;
  v_role := case when 'admin' = any (v_grants) then 'owner'::public.member_role else 'planner'::public.member_role end;
  update public.workspace_members set grants = v_grants, title = nullif(btrim(coalesce(p_title, '')), ''), role = v_role
    where workspace_id = p_workspace and user_id = p_user;
  if not found then raise exception 'no such member' using errcode = 'FV000'; end if;
end $$;

create or replace function private.remove_member(p_workspace uuid, p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
declare admin_count int;
begin
  if not private.has_clearance(p_workspace, 'admin') then raise exception 'your role does not allow that' using errcode = 'FS050'; end if;
  -- law 4: can't remove the last admin (covers "cannot remove themselves" when sole admin).
  if exists (select 1 from public.workspace_members where workspace_id = p_workspace and user_id = p_user and ('admin' = any (grants) or role = 'owner')) then
    select count(*) into admin_count from public.workspace_members where workspace_id = p_workspace and ('admin' = any (grants) or role = 'owner');
    if admin_count <= 1 then raise exception 'you are the last admin — give someone else the admin box first' using errcode = 'FV241'; end if;
  end if;
  delete from public.workspace_members where workspace_id = p_workspace and user_id = p_user;
end $$;

create or replace function public.set_member_clearances(p_workspace uuid, p_user uuid, p_grants text[], p_title text)
returns void language sql security invoker set search_path = public as $$ select private.set_member_clearances(p_workspace, p_user, p_grants, p_title); $$;
create or replace function public.remove_member(p_workspace uuid, p_user uuid)
returns void language sql security invoker set search_path = public as $$ select private.remove_member(p_workspace, p_user); $$;

revoke execute on function
  private.set_member_clearances(uuid, uuid, text[], text), public.set_member_clearances(uuid, uuid, text[], text),
  private.remove_member(uuid, uuid), public.remove_member(uuid, uuid)
  from public, anon;
grant execute on function
  private.set_member_clearances(uuid, uuid, text[], text), public.set_member_clearances(uuid, uuid, text[], text),
  private.remove_member(uuid, uuid), public.remove_member(uuid, uuid)
  to authenticated;

-- ── has_wedding_clearance: the box check for wedding-scoped staff functions ──────
-- Resolves the wedding's workspace, then has_clearance. These staff functions already
-- reject non-staff (FV230), so a team member without the box is the only new refusal
-- (FS050) — couples/day-of never reach them, so their lanes are untouched.
create or replace function private.has_wedding_clearance(w uuid, k text)
returns boolean language sql stable security definer set search_path = public as $$
  select private.has_clearance((select workspace_id from public.weddings where id = w), k);
$$;
revoke execute on function private.has_wedding_clearance(uuid, text) from public, anon;
grant execute on function private.has_wedding_clearance(uuid, text) to authenticated;

-- ── §1H concierge cap setter — the admin-gated write route.ts:86 finally points at ─
create or replace function private.set_concierge_cap(p_workspace uuid, p_cap bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.has_clearance(p_workspace, 'admin') then raise exception 'your role does not allow that' using errcode = 'FS050'; end if;
  insert into public.concierge_settings (workspace_id, monthly_token_cap) values (p_workspace, greatest(0, p_cap))
    on conflict (workspace_id) do update set monthly_token_cap = greatest(0, excluded.monthly_token_cap), updated_at = now();
end $$;
create or replace function public.set_concierge_cap(p_workspace uuid, p_cap bigint)
returns void language sql security invoker set search_path = public as $$ select private.set_concierge_cap(p_workspace, p_cap); $$;
revoke execute on function private.set_concierge_cap(uuid, bigint), public.set_concierge_cap(uuid, bigint) from public, anon;
grant execute on function private.set_concierge_cap(uuid, bigint), public.set_concierge_cap(uuid, bigint) to authenticated;

-- ═══ §G FS050 enforcement sweep — each fn re-emitted byte-identical to its current
-- body with ONE clearance line added after its existing staff/member gate ═════════

create or replace function private.present_vendor(p_vendor uuid, p_wedding uuid, p_event_ids uuid[], p_estimate numeric, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v public.vendors; eng uuid; e uuid; ttl text; evids uuid[]; nevents int;
begin
  if not private.is_wedding_staff(p_wedding) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if not private.has_wedding_clearance(p_wedding, 'vendors') then raise exception 'your role does not allow that' using errcode = 'FS050'; end if;
  select * into v from public.vendors where id = p_vendor;
  if not found then raise exception 'no such vendor' using errcode = 'FV000'; end if;
  if v.workspace_id <> (select workspace_id from public.weddings where id = p_wedding) then
    raise exception 'present only from your own catalog' using errcode = 'FV243';
  end if;
  evids := coalesce(p_event_ids, '{}'::uuid[]);
  select count(*) into nevents from public.wedding_events where wedding_id = p_wedding;
  if coalesce(array_length(evids, 1), 0) = 0 and nevents = 1 then
    select array_agg(id) into evids from public.wedding_events where wedding_id = p_wedding;
  end if;
  if v.kind = 'venue' and nevents >= 2 and coalesce(array_length(evids, 1), 0) = 0 then
    raise exception 'a venue must be presented for at least one event' using errcode = 'FV244';
  end if;
  insert into public.wedding_vendors (wedding_id, vendor_id, status, presented_note, presented_estimate, presented_at)
    values (p_wedding, p_vendor, 'presented', p_note, p_estimate, now())
    returning id into eng;
  foreach e in array evids loop
    insert into public.event_vendors (engagement_id, event_id, wedding_id) values (eng, e, p_wedding);
  end loop;
  ttl := v.name || ' — ' || v.kind::text;
  insert into public.proposals (wedding_id, status, title, note, estimate_amount, engagement_id, created_by, sent_at)
    values (p_wedding, 'sent', ttl, p_note, p_estimate, eng, (select auth.uid()), now());
  perform private.log_activity(p_wedding, (select auth.uid()), 'vendor_presented', v.name, jsonb_build_object('engagement_id', eng));
  return eng;
end $$;

create or replace function private.record_quote(p_quote uuid, p_amount numeric, p_valid_until date, p_note text, p_file text default null)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid; eng uuid;
begin
  select wedding_id, engagement_id into w, eng from public.quotes where id = p_quote;
  if w is null then raise exception 'no such quote' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(w) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if not private.has_wedding_clearance(w, 'vendors') then raise exception 'your role does not allow that' using errcode = 'FS050'; end if;
  update public.quotes set status = 'received', amount = p_amount, valid_until = p_valid_until, note = p_note, file = p_file where id = p_quote;
  perform private.set_engagement_status(eng, array['quote_requested','quoted','shortlisted','presented']::public.engagement_status[], 'quoted', 'quote_received');
end $$;

create or replace function private.send_quote(p_quote uuid, p_note text)
returns uuid language plpgsql security definer set search_path = public as $$
declare q public.quotes; vname text; n int; pid uuid;
begin
  select * into q from public.quotes where id = p_quote;
  if not found then raise exception 'no such quote' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(q.wedding_id) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if not private.has_wedding_clearance(q.wedding_id, 'send') then raise exception 'your role does not allow that' using errcode = 'FS050'; end if;
  if q.amount is null then raise exception 'record the quote amount before sending it to the couple' using errcode = 'FV241'; end if;
  if q.status <> 'received' then raise exception 'that quote is no longer awaiting the couple' using errcode = 'FV241'; end if;
  select v.name into vname from public.wedding_vendors wv join public.vendors v on v.id = wv.vendor_id where wv.id = q.engagement_id;
  select count(*) into n from public.quotes
    where engagement_id = q.engagement_id and (created_at < q.created_at or (created_at = q.created_at and id <= q.id));
  insert into public.proposals (wedding_id, status, title, note, estimate_amount, engagement_id, quote_id, created_by, sent_at)
    values (q.wedding_id, 'sent', vname || ' — Quote ' || n, p_note, q.amount, q.engagement_id, p_quote, (select auth.uid()), now())
    returning id into pid;
  perform private.log_activity(q.wedding_id, (select auth.uid()), 'quote_sent', vname, jsonb_build_object('engagement_id', q.engagement_id, 'quote_id', p_quote, 'proposal_id', pid));
  return pid;
end $$;

create or replace function private.accept_quote(p_quote uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid; eng uuid; amt numeric; nm text;
begin
  select q.wedding_id, q.engagement_id, q.amount into w, eng, amt from public.quotes q where q.id = p_quote;
  if w is null then raise exception 'no such quote' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(w) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if not private.has_wedding_clearance(w, 'ledger') then raise exception 'your role does not allow that' using errcode = 'FS050'; end if;
  update public.quotes set status = 'accepted' where id = p_quote;
  select v.name into nm from public.wedding_vendors wv join public.vendors v on v.id = wv.vendor_id where wv.id = eng;
  if not exists (select 1 from public.ledger_lines where quote_id = p_quote) then
    insert into public.ledger_lines (wedding_id, title, amount, status, kind, category, engagement_id, quote_id)
      values (w, coalesce(nm, 'Vendor') || ' — balance', coalesce(amt, 0), 'expected', 'balance', 'vendor', eng, p_quote);
  end if;
end $$;

create or replace function private.send_proposal(p uuid)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid; st public.proposal_status; ttl text;
begin
  select wedding_id, status, title into w, st, ttl from public.proposals where id = p;
  if not found then raise exception 'no such proposal' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(w) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if not private.has_wedding_clearance(w, 'send') then raise exception 'your role does not allow that' using errcode = 'FS050'; end if;
  if st <> 'draft' then raise exception 'only a draft can be sent' using errcode = 'FV221'; end if;
  perform set_config('forma.status_via_fn', 'on', true);
  update public.proposals set status = 'sent', sent_at = now() where id = p;
  perform set_config('forma.status_via_fn', 'off', true);
  perform private.log_activity(w, (select auth.uid()), 'proposal_sent', ttl, jsonb_build_object('proposal_id', p));
end $$;

create or replace function private.send_contract(p_contract uuid, p_resolved jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare w uuid;
begin
  select wedding_id into w from public.contracts where id = p_contract;
  if w is null then raise exception 'no such contract' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(w) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if not private.has_wedding_clearance(w, 'contracts') then raise exception 'your role does not allow that' using errcode = 'FS050'; end if;
  perform private.do_send_contract(p_contract, coalesce(p_resolved, '{}'::jsonb));
end $$;

create or replace function private.void_contract(p_contract uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.contracts;
begin
  select * into c from public.contracts where id = p_contract for update;
  if not found then raise exception 'no such contract' using errcode = 'FV000'; end if;
  if not private.is_wedding_staff(c.wedding_id) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if not private.has_wedding_clearance(c.wedding_id, 'contracts') then raise exception 'your role does not allow that' using errcode = 'FS050'; end if;
  if c.status = 'completed' then raise exception 'a completed contract cannot be voided' using errcode = 'FM027'; end if;
  update public.contracts set status = 'voided' where id = p_contract;
  perform private.log_activity(c.wedding_id, (select auth.uid()), 'contract_voided', c.title, jsonb_build_object('contract_id', p_contract));
end $$;

create or replace function private.save_profile(p_workspace uuid, p_profile jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.is_workspace_member(p_workspace) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if not private.has_clearance(p_workspace, 'profile') then raise exception 'your role does not allow that' using errcode = 'FS050'; end if;
  update public.workspaces set profile = coalesce(p_profile, '{}'::jsonb), updated_at = now() where id = p_workspace;
end $$;

create or replace function private.set_profile_slug(p_workspace uuid, p_slug text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.is_workspace_member(p_workspace) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if not private.has_clearance(p_workspace, 'profile') then raise exception 'your role does not allow that' using errcode = 'FS050'; end if;
  if p_slug !~ '^[a-z0-9][a-z0-9-]{1,60}$' then raise exception 'the address can use lowercase letters, numbers and hyphens only' using errcode = 'FD010'; end if;
  if exists (select 1 from public.workspaces where slug = p_slug and id <> p_workspace) then raise exception 'that address is already taken' using errcode = 'FD011'; end if;
  update public.workspaces set slug = p_slug, updated_at = now() where id = p_workspace;
end $$;

create or replace function private.set_service_areas(p_workspace uuid, p_areas jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.is_workspace_member(p_workspace) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if not private.has_clearance(p_workspace, 'profile') then raise exception 'your role does not allow that' using errcode = 'FS050'; end if;
  delete from public.workspace_service_areas where workspace_id = p_workspace;
  insert into public.workspace_service_areas (workspace_id, country, region, city)
    select p_workspace, btrim(a->>'country'), btrim(a->>'region'), nullif(btrim(coalesce(a->>'city','')), '')
    from jsonb_array_elements(coalesce(p_areas, '[]'::jsonb)) a
    where coalesce(btrim(a->>'country'),'') <> '' and coalesce(btrim(a->>'region'),'') <> '';
end $$;

create or replace function private.publish_profile(p_workspace uuid)
returns void language plpgsql security definer set search_path = public as $$
declare pr jsonb;
begin
  if not private.is_workspace_member(p_workspace) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if not private.has_clearance(p_workspace, 'profile') then raise exception 'your role does not allow that' using errcode = 'FS050'; end if;
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
  if not private.has_clearance(p_workspace, 'profile') then raise exception 'your role does not allow that' using errcode = 'FS050'; end if;
  update public.workspaces set profile_published = false, updated_at = now() where id = p_workspace;
end $$;

create or replace function private.convert_inquiry(p_inquiry uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare inq public.inquiries; w uuid; v_slug text; disp text; v_wedding uuid;
begin
  select * into inq from public.inquiries where id = p_inquiry;
  if not found then raise exception 'no such inquiry' using errcode = 'FV000'; end if;
  if not private.is_workspace_member(inq.workspace_id) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if not private.has_clearance(inq.workspace_id, 'weddings') then raise exception 'your role does not allow that' using errcode = 'FS050'; end if;
  disp := case when coalesce(inq.partner_name,'') <> '' then inq.name || ' & ' || inq.partner_name else inq.name end;
  v_slug := regexp_replace(lower(disp), '[^a-z0-9]+', '-', 'g') || '-' || substr(gen_random_uuid()::text, 1, 6);
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
