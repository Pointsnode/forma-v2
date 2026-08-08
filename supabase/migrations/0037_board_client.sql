-- ═══ MSG-2 — the Board (client lane) ═════════════════════════════════════════
-- Opens the client lane. A lane='client' row is one shared couple↔planner thread per wedding.
-- SELECT-visible to the couple side (is_wedding_member) AND the wedding's staff (is_wedding_staff);
-- the team lane stays staff-only, so the lane wall holds both directions. Still NO client write
-- policy anywhere — every write goes through board_post_client, gated to member-OR-staff, which
-- fixes lane='client' and never parses @mentions or @concierge (the concierge is structurally
-- absent from the client lane). A couple's post mints 'client_message' notifications for the
-- wedding's planners; a staff reply fires a branded Resend nudge to the couple, debounced to one
-- per wedding per hour (board_nudge_state). Realtime already carries board_messages; the client
-- panel treats an event as a change-signal and re-fetches through RLS, so it never widens access.

-- ── (1) A new notification kind for a couple's client-lane message.
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('mention', 'reply', 'task_assigned', 'client_message'));

-- ── (2) SELECT policies gain the client lane (member-or-staff), team lane unchanged.
drop policy if exists board_messages_select on public.board_messages;
create policy board_messages_select on public.board_messages for select to authenticated using (
  (lane = 'team' and (
    (wedding_id is not null and private.is_wedding_staff(wedding_id))
    or (wedding_id is null and private.is_workspace_member(workspace_id))
  ))
  or (lane = 'client' and wedding_id is not null and (private.is_wedding_member(wedding_id) or private.is_wedding_staff(wedding_id)))
);

drop policy if exists board_reactions_select on public.board_reactions;
create policy board_reactions_select on public.board_reactions for select to authenticated using (
  exists (
    select 1 from public.board_messages m where m.id = message_id and (
      (m.lane = 'team' and ((m.wedding_id is not null and private.is_wedding_staff(m.wedding_id)) or (m.wedding_id is null and private.is_workspace_member(m.workspace_id))))
      or (m.lane = 'client' and m.wedding_id is not null and (private.is_wedding_member(m.wedding_id) or private.is_wedding_staff(m.wedding_id)))
    )
  )
);

-- ── (3) Nudge debounce state — one row per wedding, DEFINER-only (default-deny, no policies).
create table if not exists public.board_nudge_state (
  wedding_id uuid primary key references public.weddings (id) on delete cascade,
  last_nudged_at timestamptz not null default now()
);
alter table public.board_nudge_state enable row level security;

-- ══ Client-lane DEFINERs ══════════════════════════════════════════════════════
-- A caller may participate in a wedding's client lane iff they are the couple side (member) or the
-- wedding's staff. The concierge is never invoked here and @mentions are not parsed.
create or replace function private.board_can_client(p_wedding uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select p_wedding is not null and (private.is_wedding_member(p_wedding) or private.is_wedding_staff(p_wedding));
$$;

-- Post to the client lane (from either side). When the author is the couple side, mint a
-- 'client_message' notification for each of the wedding's planners (the staff read them in the rail
-- inbox). A staff reply mints none — the couple is reached by the debounced email nudge instead.
create or replace function private.board_post_client(p_wedding uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_ws uuid; v_is_member boolean;
begin
  if not private.board_can_client(p_wedding) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if coalesce(btrim(p_body), '') = '' then raise exception 'the message is empty' using errcode = 'FV270'; end if;
  select workspace_id into v_ws from public.weddings where id = p_wedding;
  insert into public.board_messages (workspace_id, wedding_id, lane, author_kind, author_id, body)
    values (v_ws, p_wedding, 'client', 'user', (select auth.uid()), p_body) returning id into v_id;
  v_is_member := private.is_wedding_member(p_wedding);
  if v_is_member then
    insert into public.notifications (user_id, kind, message_id, workspace_id, wedding_id)
      select wm.user_id, 'client_message', v_id, v_ws, p_wedding
      from public.workspace_members wm where wm.workspace_id = v_ws;
  end if;
  return v_id;
end $$;

-- One wedding's client-lane thread, newest last: author names, reaction tallies, the caller's own
-- reactions, edited/deleted markers. Same shape as board_thread (no task chips — the client lane
-- has none). Member-or-staff.
create or replace function private.board_client_thread(p_wedding uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not private.board_can_client(p_wedding) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id, 'author_kind', m.author_kind, 'author_id', m.author_id,
      'author_name', p.display_name,
      'body', m.body, 'task_id', null, 'task_status', null, 'task_title', null,
      'system_event', m.system_event, 'deleted_at', m.deleted_at, 'edited_at', m.edited_at, 'created_at', m.created_at,
      'mine', m.author_id = (select auth.uid()),
      'reactions', coalesce((select jsonb_object_agg(x.emoji, x.n) from (select emoji, count(*) n from public.board_reactions where message_id = m.id group by emoji) x), '{}'::jsonb),
      'my_reactions', coalesce((select jsonb_agg(emoji) from public.board_reactions where message_id = m.id and user_id = (select auth.uid())), '[]'::jsonb)
    ) order by m.created_at)
    from public.board_messages m
    left join public.profiles p on p.id = m.author_id
    where m.wedding_id = p_wedding and m.lane = 'client'
  ), '[]'::jsonb);
end $$;

-- Staff-only: decide whether a client-lane nudge is due for this wedding (debounced one per hour),
-- stamping board_nudge_state when it is, and return the couple's addresses + language so the caller
-- can send the branded email. Reads auth.users under DEFINER (never exposed to app service-role).
create or replace function private.board_client_nudge(p_wedding uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_due boolean; v_last timestamptz; v_locale text; v_couple text; v_emails text[];
begin
  if not private.is_wedding_staff(p_wedding) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  select last_nudged_at into v_last from public.board_nudge_state where wedding_id = p_wedding;
  v_due := v_last is null or v_last < now() - interval '1 hour';
  if not v_due then return jsonb_build_object('due', false); end if;
  insert into public.board_nudge_state (wedding_id, last_nudged_at) values (p_wedding, now())
    on conflict (wedding_id) do update set last_nudged_at = now();
  select w.locale, w.couple_display into v_locale, v_couple from public.weddings w where w.id = p_wedding;
  select array_agg(distinct u.email) into v_emails
    from public.wedding_members wm join auth.users u on u.id = wm.user_id
    where wm.wedding_id = p_wedding and wm.role in ('partner', 'family') and u.email is not null;
  return jsonb_build_object('due', true, 'locale', coalesce(v_locale, 'en'), 'couple', v_couple, 'emails', coalesce(to_jsonb(v_emails), '[]'::jsonb));
end $$;

-- ── Public (invoker) wrappers.
create or replace function public.board_post_client(p_wedding uuid, p_body text) returns uuid language sql security invoker set search_path = public as $$ select private.board_post_client(p_wedding, p_body); $$;
create or replace function public.board_client_thread(p_wedding uuid) returns jsonb language sql security invoker set search_path = public as $$ select private.board_client_thread(p_wedding); $$;
create or replace function public.board_client_nudge(p_wedding uuid) returns jsonb language sql security invoker set search_path = public as $$ select private.board_client_nudge(p_wedding); $$;

-- ── Grants: authenticated-only (the anon allowlist stays at 12 — no new anon surface).
revoke execute on function
  private.board_can_client(uuid), private.board_post_client(uuid, text), private.board_client_thread(uuid), private.board_client_nudge(uuid),
  public.board_post_client(uuid, text), public.board_client_thread(uuid), public.board_client_nudge(uuid)
  from public, anon;
grant execute on function
  private.board_post_client(uuid, text), private.board_client_thread(uuid), private.board_client_nudge(uuid),
  public.board_post_client(uuid, text), public.board_client_thread(uuid), public.board_client_nudge(uuid)
  to authenticated;
