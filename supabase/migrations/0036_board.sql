-- ═══ MSG-1 — the Board (team side) ═══════════════════════════════════════════
-- Threaded team messaging per wedding + one studio thread. Default-deny RLS; the team lane is
-- readable by wedding STAFF (is_wedding_staff) / workspace MEMBERS; client-lane rows are
-- structurally invisible this phase (the SELECT requires lane='team'). No client write policies
-- anywhere — every write is a member-gated DEFINER (pinned search_path, full grant ritual).
-- Unread is COMPUTED from board_reads.last_read_at, never stored. @concierge replies post as
-- author_kind='concierge' (author_id null-tie). Realtime is a change-signal; the client always
-- re-fetches through RLS, so realtime never widens visibility.

create table if not exists public.board_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  wedding_id uuid references public.weddings (id) on delete cascade,          -- null = the studio thread
  lane text not null default 'team' check (lane in ('team', 'client')),       -- MSG-1 exposes only 'team'
  author_kind text not null default 'user' check (author_kind in ('user', 'concierge')),
  author_id uuid references auth.users (id) on delete set null,
  body text,
  task_id uuid references public.tasks (id) on delete set null,               -- a task chip references its task (live status)
  system_event text,                                                          -- e.g. 'task_completed' (a system line)
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint board_author_tie check ((author_kind = 'concierge') = (author_id is null))
);

create table if not exists public.board_reactions (
  message_id uuid not null references public.board_messages (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  emoji text not null check (emoji in ('👍', '❤️', '🎉', '👀', '✅', '🙏')),  -- the fixed six
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create table if not exists public.board_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  wedding_id uuid references public.weddings (id) on delete cascade,
  last_read_at timestamptz not null default now()
);
-- One read-marker per user per thread (the studio thread has a null wedding_id).
create unique index if not exists board_reads_uniq on public.board_reads (user_id, workspace_id, coalesce(wedding_id, '00000000-0000-0000-0000-000000000000'::uuid));

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,          -- the recipient
  kind text not null check (kind in ('mention', 'reply', 'task_assigned')),    -- MSG-1 emits 'mention'
  message_id uuid references public.board_messages (id) on delete cascade,
  workspace_id uuid references public.workspaces (id) on delete cascade,
  wedding_id uuid references public.weddings (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ── RLS: default-deny; team lane only (client rows invisible this phase).
alter table public.board_messages enable row level security;
drop policy if exists board_messages_select on public.board_messages;
create policy board_messages_select on public.board_messages for select to authenticated using (
  lane = 'team' and (
    (wedding_id is not null and private.is_wedding_staff(wedding_id))
    or (wedding_id is null and private.is_workspace_member(workspace_id))
  )
);

alter table public.board_reactions enable row level security;
drop policy if exists board_reactions_select on public.board_reactions;
create policy board_reactions_select on public.board_reactions for select to authenticated using (
  exists (
    select 1 from public.board_messages m where m.id = message_id and m.lane = 'team'
      and ((m.wedding_id is not null and private.is_wedding_staff(m.wedding_id)) or (m.wedding_id is null and private.is_workspace_member(m.workspace_id)))
  )
);

alter table public.board_reads enable row level security;
drop policy if exists board_reads_select on public.board_reads;
create policy board_reads_select on public.board_reads for select to authenticated using (user_id = (select auth.uid()));

alter table public.notifications enable row level security;
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated using (user_id = (select auth.uid()));

-- ── FK / scan indexes.
create index if not exists board_messages_thread_idx on public.board_messages (workspace_id, wedding_id, created_at desc);
create index if not exists board_messages_author_idx on public.board_messages (author_id);
create index if not exists board_messages_task_idx on public.board_messages (task_id);
create index if not exists board_reactions_user_idx on public.board_reactions (user_id);
create index if not exists board_reads_workspace_idx on public.board_reads (workspace_id);
create index if not exists board_reads_wedding_idx on public.board_reads (wedding_id);
create index if not exists notifications_user_idx on public.notifications (user_id, read_at);
create index if not exists notifications_message_idx on public.notifications (message_id);
create index if not exists notifications_workspace_idx on public.notifications (workspace_id);
create index if not exists notifications_wedding_idx on public.notifications (wedding_id);

drop trigger if exists touch_board_messages on public.board_messages;
create trigger touch_board_messages before update on public.board_messages for each row execute function private.touch_updated_at();

-- ══ Member-gated DEFINERs (all writes). A caller may act on a thread iff they are wedding STAFF
-- (wedding thread) or a workspace MEMBER (studio thread). ══════════════════════════════════════
create or replace function private.board_can_write(p_workspace uuid, p_wedding uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select case when p_wedding is not null then private.is_wedding_staff(p_wedding) else private.is_workspace_member(p_workspace) end;
$$;

-- Post a message; mint 'mention' notifications for the given recipients that can actually see the
-- thread (never leak a mention to someone without access). Returns the message id.
create or replace function private.board_post(p_workspace uuid, p_wedding uuid, p_body text, p_mentions uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_uid uuid;
begin
  if not private.board_can_write(p_workspace, p_wedding) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if coalesce(btrim(p_body), '') = '' then raise exception 'the message is empty' using errcode = 'FV270'; end if;
  insert into public.board_messages (workspace_id, wedding_id, author_kind, author_id, body)
    values (p_workspace, p_wedding, 'user', (select auth.uid()), p_body) returning id into v_id;
  if p_mentions is not null then
    foreach v_uid in array p_mentions loop
      if v_uid <> (select auth.uid())
         and (case when p_wedding is not null then private.is_wedding_staff(p_wedding) else true end)
         and exists (select 1 from public.workspace_members wm where wm.workspace_id = p_workspace and wm.user_id = v_uid) then
        insert into public.notifications (user_id, kind, message_id, workspace_id, wedding_id) values (v_uid, 'mention', v_id, p_workspace, p_wedding);
      end if;
    end loop;
  end if;
  return v_id;
end $$;

-- Post a concierge reply (author_kind='concierge'); called only from the concierge lane after the
-- turn runs. Owner of the thread already validated by the caller; re-checks access here too.
create or replace function private.board_post_concierge(p_workspace uuid, p_wedding uuid, p_body text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not private.board_can_write(p_workspace, p_wedding) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  insert into public.board_messages (workspace_id, wedding_id, author_kind, author_id, body)
    values (p_workspace, p_wedding, 'concierge', null, p_body) returning id into v_id;
  return v_id;
end $$;

-- Edit only your OWN human message (not concierge / system / deleted).
create or replace function private.board_edit(p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = public as $$
declare v_msg public.board_messages;
begin
  select * into v_msg from public.board_messages where id = p_id for update;
  if v_msg.id is null then raise exception 'no such message' using errcode = 'FV271'; end if;
  if v_msg.author_kind <> 'user' or v_msg.author_id <> (select auth.uid()) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if v_msg.deleted_at is not null or v_msg.system_event is not null then raise exception 'this message cannot be edited' using errcode = 'FV272'; end if;
  if coalesce(btrim(p_body), '') = '' then raise exception 'the message is empty' using errcode = 'FV270'; end if;
  update public.board_messages set body = p_body where id = p_id;
end $$;

-- Soft-delete your OWN message: blank the body, stamp deleted_at.
create or replace function private.board_delete(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare v_msg public.board_messages;
begin
  select * into v_msg from public.board_messages where id = p_id for update;
  if v_msg.id is null then raise exception 'no such message' using errcode = 'FV271'; end if;
  if v_msg.author_kind <> 'user' or v_msg.author_id <> (select auth.uid()) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  update public.board_messages set deleted_at = now(), body = null where id = p_id;
end $$;

-- Toggle one of the six reactions for the caller (idempotent add/remove).
create or replace function private.board_toggle_reaction(p_message uuid, p_emoji text) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_msg public.board_messages; v_on boolean;
begin
  select * into v_msg from public.board_messages where id = p_message;
  if v_msg.id is null or not private.board_can_write(v_msg.workspace_id, v_msg.wedding_id) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if p_emoji not in ('👍', '❤️', '🎉', '👀', '✅', '🙏') then raise exception 'not an allowed reaction' using errcode = 'FV273'; end if;
  if exists (select 1 from public.board_reactions where message_id = p_message and user_id = (select auth.uid()) and emoji = p_emoji) then
    delete from public.board_reactions where message_id = p_message and user_id = (select auth.uid()) and emoji = p_emoji;
    v_on := false;
  else
    insert into public.board_reactions (message_id, user_id, emoji) values (p_message, (select auth.uid()), p_emoji);
    v_on := true;
  end if;
  return v_on;
end $$;

-- Turn a message into a task (team-assigned), link the message to it. A completion system line is
-- posted by the trigger below when the task later completes.
create or replace function private.board_make_task(p_message uuid, p_title text, p_due date) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_msg public.board_messages; v_task uuid;
begin
  select * into v_msg from public.board_messages where id = p_message for update;
  if v_msg.id is null or not private.board_can_write(v_msg.workspace_id, v_msg.wedding_id) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'the task needs a title' using errcode = 'FV274'; end if;
  insert into public.tasks (wedding_id, workspace_id, title, due_date, created_by)
    values (v_msg.wedding_id, case when v_msg.wedding_id is null then v_msg.workspace_id else null end, p_title, p_due, (select auth.uid()))
    returning id into v_task;
  update public.board_messages set task_id = v_task where id = p_message;
  return v_task;
end $$;

-- Completion system line: when a chipped task completes, post a neutral 'task_completed' line into
-- the same thread as the chip (author_kind concierge = the system voice; body null).
create or replace function private.board_task_completed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.done_at is not null and (old.done_at is null) then
    insert into public.board_messages (workspace_id, wedding_id, author_kind, author_id, task_id, system_event)
      select m.workspace_id, m.wedding_id, 'concierge', null, new.id, 'task_completed'
      from public.board_messages m where m.task_id = new.id and m.system_event is null limit 1;
  end if;
  return new;
end $$;
drop trigger if exists board_on_task_complete on public.tasks;
create trigger board_on_task_complete after update on public.tasks for each row execute function private.board_task_completed();

-- Mark a thread read (upsert the marker; null wedding = studio thread).
create or replace function private.board_mark_read(p_workspace uuid, p_wedding uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not private.board_can_write(p_workspace, p_wedding) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  update public.board_reads set last_read_at = now()
    where user_id = (select auth.uid()) and workspace_id = p_workspace and wedding_id is not distinct from p_wedding;
  if not found then
    insert into public.board_reads (user_id, workspace_id, wedding_id) values ((select auth.uid()), p_workspace, p_wedding);
  end if;
end $$;

create or replace function private.board_mark_notifications_read() returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.notifications set read_at = now() where user_id = (select auth.uid()) and read_at is null;
end $$;

-- ── Read DEFINERs powering the rail (member-gated; assemble names/reactions/status server-side).
create or replace function private.board_summary(p_workspace uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not private.is_workspace_member(p_workspace) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  return jsonb_build_object(
    'notifications', (select count(*) from public.notifications where user_id = (select auth.uid()) and read_at is null),
    'threads', coalesce((
      select jsonb_agg(jsonb_build_object('wedding_id', t.wedding_id, 'unread', t.unread) order by t.unread desc)
      from (
        select m.wedding_id,
          count(*) filter (where m.author_id is distinct from (select auth.uid()) and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)) as unread
        from public.board_messages m
        left join public.board_reads r on r.user_id = (select auth.uid()) and r.workspace_id = m.workspace_id and r.wedding_id is not distinct from m.wedding_id
        where m.workspace_id = p_workspace and m.lane = 'team'
        group by m.wedding_id
      ) t
    ), '[]'::jsonb)
  );
end $$;

-- One thread's messages, newest last, with author display names, reaction tallies, the caller's
-- own reactions, and each task chip's LIVE status.
create or replace function private.board_thread(p_workspace uuid, p_wedding uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not private.board_can_write(p_workspace, p_wedding) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id, 'author_kind', m.author_kind, 'author_id', m.author_id,
      'author_name', case when m.author_kind = 'concierge' then null else p.display_name end,
      'body', m.body, 'task_id', m.task_id, 'task_status', tk.status, 'task_title', tk.title,
      'system_event', m.system_event, 'deleted_at', m.deleted_at, 'created_at', m.created_at,
      'mine', m.author_id = (select auth.uid()),
      'reactions', coalesce((select jsonb_object_agg(x.emoji, x.n) from (select emoji, count(*) n from public.board_reactions where message_id = m.id group by emoji) x), '{}'::jsonb),
      'my_reactions', coalesce((select jsonb_agg(emoji) from public.board_reactions where message_id = m.id and user_id = (select auth.uid())), '[]'::jsonb)
    ) order by m.created_at)
    from public.board_messages m
    left join public.profiles p on p.id = m.author_id
    left join public.tasks tk on tk.id = m.task_id
    where m.workspace_id = p_workspace and m.wedding_id is not distinct from p_wedding and m.lane = 'team'
  ), '[]'::jsonb);
end $$;

-- Workspace roster for @mention autocomplete (member names only).
create or replace function private.board_roster(p_workspace uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if not private.is_workspace_member(p_workspace) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('user_id', wm.user_id, 'name', p.display_name) order by p.display_name)
    from public.workspace_members wm join public.profiles p on p.id = wm.user_id where wm.workspace_id = p_workspace
  ), '[]'::jsonb);
end $$;

-- ── Public (invoker) wrappers + grants (authenticated-only → anon allowlist untouched).
create or replace function public.board_summary(p_workspace uuid) returns jsonb language sql security invoker set search_path = public as $$ select private.board_summary(p_workspace); $$;
create or replace function public.board_thread(p_workspace uuid, p_wedding uuid) returns jsonb language sql security invoker set search_path = public as $$ select private.board_thread(p_workspace, p_wedding); $$;
create or replace function public.board_roster(p_workspace uuid) returns jsonb language sql security invoker set search_path = public as $$ select private.board_roster(p_workspace); $$;
create or replace function public.board_post(p_workspace uuid, p_wedding uuid, p_body text, p_mentions uuid[]) returns uuid language sql security invoker set search_path = public as $$ select private.board_post(p_workspace, p_wedding, p_body, p_mentions); $$;
create or replace function public.board_post_concierge(p_workspace uuid, p_wedding uuid, p_body text) returns uuid language sql security invoker set search_path = public as $$ select private.board_post_concierge(p_workspace, p_wedding, p_body); $$;
create or replace function public.board_edit(p_id uuid, p_body text) returns void language sql security invoker set search_path = public as $$ select private.board_edit(p_id, p_body); $$;
create or replace function public.board_delete(p_id uuid) returns void language sql security invoker set search_path = public as $$ select private.board_delete(p_id); $$;
create or replace function public.board_toggle_reaction(p_message uuid, p_emoji text) returns boolean language sql security invoker set search_path = public as $$ select private.board_toggle_reaction(p_message, p_emoji); $$;
create or replace function public.board_make_task(p_message uuid, p_title text, p_due date) returns uuid language sql security invoker set search_path = public as $$ select private.board_make_task(p_message, p_title, p_due); $$;
create or replace function public.board_mark_read(p_workspace uuid, p_wedding uuid) returns void language sql security invoker set search_path = public as $$ select private.board_mark_read(p_workspace, p_wedding); $$;
create or replace function public.board_mark_notifications_read() returns void language sql security invoker set search_path = public as $$ select private.board_mark_notifications_read(); $$;

revoke execute on function
  private.board_can_write(uuid, uuid), private.board_task_completed(),
  private.board_post(uuid, uuid, text, uuid[]), private.board_post_concierge(uuid, uuid, text), private.board_edit(uuid, text), private.board_delete(uuid),
  private.board_toggle_reaction(uuid, text), private.board_make_task(uuid, text, date), private.board_mark_read(uuid, uuid), private.board_mark_notifications_read(),
  private.board_summary(uuid), private.board_thread(uuid, uuid), private.board_roster(uuid),
  public.board_post(uuid, uuid, text, uuid[]), public.board_post_concierge(uuid, uuid, text), public.board_edit(uuid, text), public.board_delete(uuid),
  public.board_toggle_reaction(uuid, text), public.board_make_task(uuid, text, date), public.board_mark_read(uuid, uuid), public.board_mark_notifications_read(),
  public.board_summary(uuid), public.board_thread(uuid, uuid), public.board_roster(uuid)
  from public, anon;
grant execute on function
  private.board_post(uuid, uuid, text, uuid[]), private.board_post_concierge(uuid, uuid, text), private.board_edit(uuid, text), private.board_delete(uuid),
  private.board_toggle_reaction(uuid, text), private.board_make_task(uuid, text, date), private.board_mark_read(uuid, uuid), private.board_mark_notifications_read(),
  private.board_summary(uuid), private.board_thread(uuid, uuid), private.board_roster(uuid),
  public.board_post(uuid, uuid, text, uuid[]), public.board_post_concierge(uuid, uuid, text), public.board_edit(uuid, text), public.board_delete(uuid),
  public.board_toggle_reaction(uuid, text), public.board_make_task(uuid, text, date), public.board_mark_read(uuid, uuid), public.board_mark_notifications_read(),
  public.board_summary(uuid), public.board_thread(uuid, uuid), public.board_roster(uuid)
  to authenticated;

-- ── Realtime: add the board tables to the supabase_realtime publication (guarded so the hermetic
-- harness, which has no such publication, skips it) + full replica identity for update/delete rows.
-- The client treats an event as a change-signal and re-fetches through RLS, so realtime never leaks.
alter table public.board_messages replica identity full;
alter table public.notifications replica identity full;
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.board_messages;
    alter publication supabase_realtime add table public.board_reactions;
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;
