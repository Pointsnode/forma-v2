-- 0011 tasks (M8) — the four-column board on v2's foundations. Additive on the
-- tasks table (0008), which already carries the XOR wedding/workspace scope and
-- composite-FK links (engagement/contract/event/proposal). SCHEMA gains its section.
--
-- Columns: pending | working | waiting | completed. "Waiting on" is the manual-task
-- twin of the chase list's "someone else's court". A task is a POINTER (§1E): its
-- typed nullable links deep-link the card body to the object's room; ON DELETE SET
-- NULL means a deleted target degrades the task to unlinked, never dangles, and the
-- composite FKs mean a link can't cross weddings.

do $$ begin create type public.task_status as enum ('pending','working','waiting','completed'); exception when duplicate_object then null; end $$;
do $$ begin create type public.task_assignee_kind as enum ('team','couple','vendor'); exception when duplicate_object then null; end $$;

-- ── additive columns ─────────────────────────────────────────────────────────
alter table public.tasks add column if not exists status public.task_status not null default 'pending';
alter table public.tasks add column if not exists assignee_kind public.task_assignee_kind;
alter table public.tasks add column if not exists assignee_member uuid references public.profiles (id) on delete set null;
alter table public.tasks add column if not exists assignee_vendor uuid references public.vendors (id) on delete set null;
alter table public.tasks add column if not exists document_id uuid references public.documents (id) on delete set null;
alter table public.tasks add column if not exists link_section text;
alter table public.tasks add column if not exists note text;

create index if not exists tasks_status_idx on public.tasks (status);
create index if not exists tasks_assignee_member_idx on public.tasks (assignee_member);
create index if not exists tasks_assignee_vendor_idx on public.tasks (assignee_vendor);

-- ── invariants (DB-enforced — the UI writes these tables directly) ───────────
do $$ begin
  -- assignee is exactly one of three shapes (couple = the wedding's couple side, no person row)
  if not exists (select 1 from pg_constraint where conname = 'tasks_assignee_shape') then
    alter table public.tasks add constraint tasks_assignee_shape check (
      (assignee_kind is null   and assignee_member is null and assignee_vendor is null) or
      (assignee_kind = 'team'  and assignee_member is not null and assignee_vendor is null) or
      (assignee_kind = 'vendor' and assignee_vendor is not null and assignee_member is null) or
      (assignee_kind = 'couple' and assignee_member is null and assignee_vendor is null)
    ) not valid;
    alter table public.tasks validate constraint tasks_assignee_shape;
  end if;
  -- at most one subject link (event_id + link_section is the event-section anchor, separate)
  if not exists (select 1 from pg_constraint where conname = 'tasks_one_link') then
    alter table public.tasks add constraint tasks_one_link check (
      num_nonnulls(proposal_id, contract_id, engagement_id, document_id) <= 1
    ) not valid;
    alter table public.tasks validate constraint tasks_one_link;
  end if;
  -- a section anchor rides an event link
  if not exists (select 1 from pg_constraint where conname = 'tasks_section_needs_event') then
    alter table public.tasks add constraint tasks_section_needs_event check (
      link_section is null or event_id is not null
    ) not valid;
    alter table public.tasks validate constraint tasks_section_needs_event;
  end if;
  -- link_section is a closed vocabulary of event-page anchors
  if not exists (select 1 from pg_constraint where conname = 'tasks_section_vocab') then
    alter table public.tasks add constraint tasks_section_vocab check (
      link_section is null or link_section in ('schedule','menus','seating','guests','budget','design')
    ) not valid;
    alter table public.tasks validate constraint tasks_section_vocab;
  end if;
end $$;

-- document link cannot cross weddings (documents carry an XOR wedding/workspace, so
-- a composite FK is awkward; a trigger keeps the invariant) + vendor must be in the
-- task's workspace.
create or replace function private.guard_task_links()
returns trigger language plpgsql set search_path = public as $$
declare v_ws uuid; v_doc_wedding uuid;
begin
  if new.assignee_vendor is not null then
    if new.wedding_id is not null then select workspace_id into v_ws from public.weddings where id = new.wedding_id;
    else v_ws := new.workspace_id; end if;
    if not exists (select 1 from public.vendors where id = new.assignee_vendor and workspace_id = v_ws) then
      raise exception 'assignee vendor is not in this workspace' using errcode = 'FT010';
    end if;
  end if;
  if new.document_id is not null and new.wedding_id is not null then
    select wedding_id into v_doc_wedding from public.documents where id = new.document_id;
    if v_doc_wedding is distinct from new.wedding_id then
      raise exception 'linked document is not in this wedding' using errcode = 'FT011';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists guard_task_links on public.tasks;
create trigger guard_task_links before insert or update on public.tasks for each row execute function private.guard_task_links();

-- status/assignment rules: couple/vendor assignment auto-moves pending→waiting
-- (overridable by an explicit status write in the same statement); completed ⇔ done_at.
create or replace function private.task_state_sync()
returns trigger language plpgsql set search_path = public as $$
begin
  -- a legacy done_at write (toggle) promotes to completed
  if tg_op = 'UPDATE' and new.done_at is not null and old.done_at is null and new.status = old.status then
    new.status := 'completed';
  end if;
  -- auto-waiting on assignment to couple/vendor, unless status is explicitly set here
  if new.assignee_kind in ('couple','vendor') and new.status = 'pending' then
    if tg_op = 'INSERT' or (new.assignee_kind is distinct from old.assignee_kind and new.status = old.status) then
      new.status := 'waiting';
    end if;
  end if;
  -- completed ⇔ done_at (status is the source of truth)
  if new.status = 'completed' then new.done_at := coalesce(new.done_at, now());
  else new.done_at := null; end if;
  return new;
end $$;
drop trigger if exists task_state_sync on public.tasks;
create trigger task_state_sync before insert or update on public.tasks for each row execute function private.task_state_sync();

drop trigger if exists touch_tasks on public.tasks;
create trigger touch_tasks before update on public.tasks for each row execute function private.touch_updated_at();

-- Task activity from an AFTER trigger — one path for staff (direct writes), the
-- concierge (RPC), and couple completion (complete_task). actor is auth.uid();
-- actor_kind follows the acting_as_concierge flag via log_activity. Wedding-scoped
-- only (activity.wedding_id is NOT NULL; studio-level tasks don't log).
create or replace function private.on_task_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.wedding_id is null then return new; end if;
  if tg_op = 'INSERT' then
    perform private.log_activity(new.wedding_id, (select auth.uid()), 'task_created', new.title, jsonb_build_object('task_id', new.id));
  elsif tg_op = 'UPDATE' then
    if new.status = 'completed' and old.status is distinct from 'completed' then
      perform private.log_activity(new.wedding_id, (select auth.uid()), 'task_completed', new.title, jsonb_build_object('task_id', new.id));
    end if;
    if (new.assignee_kind is distinct from old.assignee_kind
        or new.assignee_member is distinct from old.assignee_member
        or new.assignee_vendor is distinct from old.assignee_vendor)
       and new.assignee_kind is not null then
      perform private.log_activity(new.wedding_id, (select auth.uid()), 'task_assigned', new.title, jsonb_build_object('task_id', new.id, 'assignee', new.assignee_kind));
    end if;
  end if;
  return new;
end $$;
drop trigger if exists on_task_activity on public.tasks;
create trigger on_task_activity after insert or update on public.tasks for each row execute function private.on_task_activity();

-- ── completion function: staff always; couple only for couple-assigned on their
-- wedding; logs activity with the caller as actor (couple completion shows the
-- couple-side actor honestly). No direct couple UPDATE exists.
create or replace function private.complete_task(p_task uuid)
returns void language plpgsql security definer set search_path = public as $$
declare t public.tasks;
begin
  select * into t from public.tasks where id = p_task;
  if not found then raise exception 'no such task' using errcode = 'FT000'; end if;
  if t.wedding_id is null then
    if not private.is_workspace_member(t.workspace_id) then raise exception 'not permitted' using errcode = 'FT030'; end if;
  elsif private.is_wedding_staff(t.wedding_id) then
    null;
  elsif t.assignee_kind = 'couple' and private.is_wedding_billing_member(t.wedding_id) then
    null;
  else
    raise exception 'not permitted' using errcode = 'FT030';
  end if;
  update public.tasks set status = 'completed' where id = p_task;  -- on_task_activity logs task_completed (actor = caller)
end $$;
create or replace function public.complete_task(p_task uuid)
returns void language sql security invoker set search_path = public as $$ select private.complete_task(p_task); $$;

-- ── concierge_add_task: reconcile the verb to 'task_created' and gain assignee +
-- event args (§3). Replaces the 0010 4-arg version.
drop function if exists public.concierge_add_task(uuid, uuid, text, date);
drop function if exists private.concierge_add_task(uuid, uuid, text, date);
create or replace function private.concierge_add_task(
  p_wedding uuid, p_workspace uuid, p_title text, p_due date,
  p_assignee_kind text, p_assignee_member uuid, p_assignee_vendor uuid, p_event uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_kind public.task_assignee_kind;
begin
  if coalesce(btrim(p_title), '') = '' then raise exception 'a title is required' using errcode = 'FV222'; end if;
  if p_wedding is not null then
    if not private.is_wedding_staff(p_wedding) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  else
    if not private.is_workspace_member(p_workspace) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  end if;
  v_kind := (case when p_assignee_kind in ('team','couple','vendor') then p_assignee_kind else null end)::public.task_assignee_kind;
  perform set_config('forma.acting_as_concierge', 'on', true);
  insert into public.tasks (title, due_date, wedding_id, workspace_id, event_id,
      assignee_kind, assignee_member, assignee_vendor)
    values (btrim(p_title), p_due, p_wedding, case when p_wedding is null then p_workspace else null end,
      case when p_wedding is not null then p_event else null end,
      v_kind,
      case when v_kind = 'team' then p_assignee_member else null end,
      case when v_kind = 'vendor' then p_assignee_vendor else null end)
    returning id into v_id;  -- on_task_activity logs task_created with actor_kind='concierge' (flag set)
  perform set_config('forma.acting_as_concierge', 'off', true);
  return v_id;
end $$;
create or replace function public.concierge_add_task(
  p_wedding uuid, p_workspace uuid, p_title text, p_due date,
  p_assignee_kind text, p_assignee_member uuid, p_assignee_vendor uuid, p_event uuid)
returns uuid language sql security invoker set search_path = public as $$
  select private.concierge_add_task(p_wedding, p_workspace, p_title, p_due, p_assignee_kind, p_assignee_member, p_assignee_vendor, p_event); $$;

-- ── RLS: staff full CRUD stays; restrict the member SELECT to couple-assigned only
-- (couple/family see their tasks; day_of sees none — is_wedding_billing_member
-- excludes day_of). Completion is function-only for the couple.
drop policy if exists tasks_wedding_member on public.tasks;
create policy tasks_wedding_member on public.tasks for select to authenticated
  using (wedding_id is not null and assignee_kind = 'couple' and private.is_wedding_billing_member(wedding_id));

-- ═══ Grants (§11) — nothing anon; the matrix stays exactly 9 ══════════════════
revoke execute on function
  private.guard_task_links(), private.task_state_sync(), private.on_task_activity(),
  private.complete_task(uuid), public.complete_task(uuid),
  private.concierge_add_task(uuid, uuid, text, date, text, uuid, uuid, uuid),
  public.concierge_add_task(uuid, uuid, text, date, text, uuid, uuid, uuid)
  from public, anon;
grant execute on function
  private.complete_task(uuid), public.complete_task(uuid),
  private.concierge_add_task(uuid, uuid, text, date, text, uuid, uuid, uuid),
  public.concierge_add_task(uuid, uuid, text, date, text, uuid, uuid, uuid)
  to authenticated;
