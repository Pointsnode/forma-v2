-- 0010 concierge (M7) — the agent layer. SCHEMA §13.
--
-- An opted-in studio gets a concierge: an orchestrator (studio floor) over a mesh
-- of one-wedding agents. It reads the §12 computed surfaces and DRAFTS (proposals,
-- tasks, contracts-from-templates, ledger lines) — it never sends/signs/pays/
-- advances/closes. Draft-first is the toolset: the send/sign/pay/advance/close
-- functions are simply not exposed to it, and the 0009 guards + grants stand
-- behind that as the real wall.
--
-- Identity (Decision B): the concierge acts through the planner's own session — no
-- new auth user, no service-role in the loop. Its write RPCs are SECURITY DEFINER
-- but re-check is_wedding_staff / is_workspace_member (RLS-equivalent), and set a
-- transaction-local forma.acting_as_concierge flag so log_activity stamps
-- activity.actor_kind='concierge' — the 0009 flag pattern, verbatim.

-- ── activity.actor_kind (additive) ───────────────────────────────────────────
do $$ begin create type public.activity_actor_kind as enum ('user','concierge'); exception when duplicate_object then null; end $$;
alter table public.activity add column if not exists actor_kind public.activity_actor_kind not null default 'user';

-- log_activity now stamps actor_kind from the flag (the concierge write RPCs set
-- it; every other caller leaves it unset → 'user'). Signature unchanged.
create or replace function private.log_activity(w uuid, actor uuid, verb text, summary text, subj jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.activity (wedding_id, actor_id, verb, summary, subject, actor_kind)
  values (w, actor, verb, summary, subj,
    (case when coalesce(current_setting('forma.acting_as_concierge', true), '') = 'on'
       then 'concierge' else 'user' end)::public.activity_actor_kind);
$$;

-- ── concierge_settings — per-workspace entitlement + budget lever ─────────────
create table if not exists public.concierge_settings (
  workspace_id uuid primary key references public.workspaces (id) on delete cascade,
  enabled boolean not null default false,
  model_tier text not null default 'standard',
  monthly_token_cap bigint not null default 20000000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── concierge_threads — the two-story shape: NULL wedding_id = orchestrator ────
create table if not exists public.concierge_threads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  wedding_id uuid,
  title text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- a wedding-scoped thread's wedding must belong to the same workspace; NULL
  -- wedding_id (the orchestrator) passes MATCH SIMPLE untouched.
  constraint concierge_threads_wedding_fk foreign key (wedding_id, workspace_id)
    references public.weddings (id, workspace_id) on delete cascade
);
create index if not exists concierge_threads_ws_idx on public.concierge_threads (workspace_id, updated_at desc);
create index if not exists concierge_threads_wedding_idx on public.concierge_threads (wedding_id);

-- ── concierge_messages — planner/concierge turns ─────────────────────────────
-- Two lanes: draft_ref = an auto-created draft this message produced; action_ref =
-- a PROPOSED leave-the-studio action awaiting the planner's approval, of shape
-- {fn, args, summary, status: 'pending'|'approved'|'dismissed'|'failed', error?, resolved_at?}.
create table if not exists public.concierge_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.concierge_threads (id) on delete cascade,
  role text not null check (role in ('planner','concierge')),
  content text not null default '',
  draft_ref jsonb,
  action_ref jsonb,
  created_at timestamptz not null default now()
);
create index if not exists concierge_messages_thread_idx on public.concierge_messages (thread_id, created_at);

-- ── concierge_usage — tokens per workspace per day; the honest meter ──────────
create table if not exists public.concierge_usage (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  day date not null default current_date,
  tokens_in bigint not null default 0,
  tokens_out bigint not null default 0,
  primary key (workspace_id, day)
);

-- touch triggers
drop trigger if exists touch_concierge_settings on public.concierge_settings;
create trigger touch_concierge_settings before update on public.concierge_settings for each row execute function private.touch_updated_at();
drop trigger if exists touch_concierge_threads on public.concierge_threads;
create trigger touch_concierge_threads before update on public.concierge_threads for each row execute function private.touch_updated_at();

-- ── RLS: workspace staff only; couples and day_of never see concierge data ────
alter table public.concierge_settings enable row level security;
alter table public.concierge_threads enable row level security;
alter table public.concierge_messages enable row level security;
alter table public.concierge_usage enable row level security;

drop policy if exists concierge_settings_read on public.concierge_settings;
create policy concierge_settings_read on public.concierge_settings for select to authenticated
  using (private.is_workspace_member(workspace_id));   -- writes are the studio's lever (service/manual)

drop policy if exists concierge_threads_all on public.concierge_threads;
create policy concierge_threads_all on public.concierge_threads for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));

drop policy if exists concierge_messages_all on public.concierge_messages;
create policy concierge_messages_all on public.concierge_messages for all to authenticated
  using (exists (select 1 from public.concierge_threads t where t.id = thread_id and private.is_workspace_member(t.workspace_id)))
  with check (exists (select 1 from public.concierge_threads t where t.id = thread_id and private.is_workspace_member(t.workspace_id)));

drop policy if exists concierge_usage_read on public.concierge_usage;
create policy concierge_usage_read on public.concierge_usage for select to authenticated
  using (private.is_workspace_member(workspace_id));   -- writes via concierge_record_usage (definer)

-- ═══ Draft-write tools (SECURITY DEFINER; staff-checked; flag set) ════════════
-- Each mirrors the button action's insert, sets forma.acting_as_concierge so the
-- activity row is stamped 'concierge', and returns the new draft id. None of these
-- can send/sign/pay — that is the toolset's shape.

create or replace function private.concierge_draft_proposal(p_wedding uuid, p_title text, p_note text, p_estimate numeric, p_event_ref uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not private.is_wedding_staff(p_wedding) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'a title is required' using errcode = 'FV222'; end if;
  perform set_config('forma.acting_as_concierge', 'on', true);
  insert into public.proposals (wedding_id, title, note, estimate_amount, event_ref, created_by)
    values (p_wedding, btrim(p_title), nullif(btrim(coalesce(p_note,'')), ''), nullif(p_estimate, 0), p_event_ref, (select auth.uid()))
    returning id into v_id;
  perform private.log_activity(p_wedding, (select auth.uid()), 'proposal_drafted', btrim(p_title), jsonb_build_object('proposal_id', v_id));
  perform set_config('forma.acting_as_concierge', 'off', true);
  return v_id;
end $$;

create or replace function private.concierge_add_task(p_wedding uuid, p_workspace uuid, p_title text, p_due date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if coalesce(btrim(p_title), '') = '' then raise exception 'a title is required' using errcode = 'FV222'; end if;
  if p_wedding is not null then
    if not private.is_wedding_staff(p_wedding) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  else
    if not private.is_workspace_member(p_workspace) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  end if;
  perform set_config('forma.acting_as_concierge', 'on', true);
  insert into public.tasks (title, due_date, wedding_id, workspace_id)
    values (btrim(p_title), p_due, p_wedding, case when p_wedding is null then p_workspace else null end)
    returning id into v_id;
  -- activity is wedding-scoped (NOT NULL); a studio-level task has no wedding to log against.
  if p_wedding is not null then
    perform private.log_activity(p_wedding, (select auth.uid()), 'task_drafted', btrim(p_title), jsonb_build_object('task_id', v_id));
  end if;
  perform set_config('forma.acting_as_concierge', 'off', true);
  return v_id;
end $$;

create or replace function private.concierge_draft_contract(p_wedding uuid, p_template uuid, p_title text, p_kind text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_body text := ''; v_kind public.contract_kind;
begin
  if not private.is_wedding_staff(p_wedding) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'a title is required' using errcode = 'FV222'; end if;
  v_kind := (case when p_kind in ('planner_agreement','vendor','venue') then p_kind else 'vendor' end)::public.contract_kind;
  if p_template is not null then
    select coalesce(body, '') into v_body from public.contract_templates where id = p_template;
  end if;
  perform set_config('forma.acting_as_concierge', 'on', true);
  insert into public.contracts (wedding_id, template_id, kind, title, created_by)
    values (p_wedding, p_template, v_kind, btrim(p_title), (select auth.uid()))
    returning id into v_id;
  insert into public.contract_draft_content (contract_id, body) values (v_id, coalesce(v_body, ''));
  perform private.log_activity(p_wedding, (select auth.uid()), 'contract_created', btrim(p_title), jsonb_build_object('contract_id', v_id));
  perform set_config('forma.acting_as_concierge', 'off', true);
  return v_id;
end $$;

create or replace function private.concierge_add_ledger_line(p_wedding uuid, p_title text, p_amount numeric, p_due date)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not private.is_wedding_staff(p_wedding) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  if coalesce(btrim(p_title), '') = '' then raise exception 'a title is required' using errcode = 'FV222'; end if;
  perform set_config('forma.acting_as_concierge', 'on', true);
  insert into public.ledger_lines (wedding_id, title, amount, kind, status, due_date)
    values (p_wedding, btrim(p_title), coalesce(p_amount, 0), 'manual', 'expected', p_due)
    returning id into v_id;
  perform private.log_activity(p_wedding, (select auth.uid()), 'ledger_drafted', btrim(p_title), jsonb_build_object('ledger_line_id', v_id));
  perform set_config('forma.acting_as_concierge', 'off', true);
  return v_id;
end $$;

-- usage recorder (definer, not service-role — Decision B keeps service-role out of
-- the loop). Staff of the workspace only; upserts the day's running totals.
create or replace function private.concierge_record_usage(p_workspace uuid, p_in bigint, p_out bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not private.is_workspace_member(p_workspace) then raise exception 'not permitted' using errcode = 'FV230'; end if;
  -- clamp per-call to a sane ceiling: a workspace member can't inflate the meter to
  -- the cap (self-DoS + a false honest meter). The stronger posture (only the route
  -- writes) is a launch-time service decision — see the PR body.
  insert into public.concierge_usage (workspace_id, day, tokens_in, tokens_out)
    values (p_workspace, current_date, least(greatest(p_in, 0), 2000000), least(greatest(p_out, 0), 2000000))
  on conflict (workspace_id, day) do update
    set tokens_in = public.concierge_usage.tokens_in + least(greatest(excluded.tokens_in, 0), 2000000),
        tokens_out = public.concierge_usage.tokens_out + least(greatest(excluded.tokens_out, 0), 2000000);
end $$;

-- thin public invoker wrappers (the callable entry points)
create or replace function public.concierge_draft_proposal(p_wedding uuid, p_title text, p_note text, p_estimate numeric, p_event_ref uuid)
returns uuid language sql security invoker set search_path = public as $$ select private.concierge_draft_proposal(p_wedding, p_title, p_note, p_estimate, p_event_ref); $$;
create or replace function public.concierge_add_task(p_wedding uuid, p_workspace uuid, p_title text, p_due date)
returns uuid language sql security invoker set search_path = public as $$ select private.concierge_add_task(p_wedding, p_workspace, p_title, p_due); $$;
create or replace function public.concierge_draft_contract(p_wedding uuid, p_template uuid, p_title text, p_kind text)
returns uuid language sql security invoker set search_path = public as $$ select private.concierge_draft_contract(p_wedding, p_template, p_title, p_kind); $$;
create or replace function public.concierge_add_ledger_line(p_wedding uuid, p_title text, p_amount numeric, p_due date)
returns uuid language sql security invoker set search_path = public as $$ select private.concierge_add_ledger_line(p_wedding, p_title, p_amount, p_due); $$;
create or replace function public.concierge_record_usage(p_workspace uuid, p_in bigint, p_out bigint)
returns void language sql security invoker set search_path = public as $$ select private.concierge_record_usage(p_workspace, p_in, p_out); $$;

-- ═══ Grants (§11): authenticated-only entry points; nothing here is anon ══════
revoke execute on function
  private.concierge_draft_proposal(uuid, text, text, numeric, uuid),
  private.concierge_add_task(uuid, uuid, text, date),
  private.concierge_draft_contract(uuid, uuid, text, text),
  private.concierge_add_ledger_line(uuid, text, numeric, date),
  private.concierge_record_usage(uuid, bigint, bigint),
  public.concierge_draft_proposal(uuid, text, text, numeric, uuid),
  public.concierge_add_task(uuid, uuid, text, date),
  public.concierge_draft_contract(uuid, uuid, text, text),
  public.concierge_add_ledger_line(uuid, text, numeric, date),
  public.concierge_record_usage(uuid, bigint, bigint)
  from public, anon;
grant execute on function
  private.concierge_draft_proposal(uuid, text, text, numeric, uuid),
  private.concierge_add_task(uuid, uuid, text, date),
  private.concierge_draft_contract(uuid, uuid, text, text),
  private.concierge_add_ledger_line(uuid, text, numeric, date),
  private.concierge_record_usage(uuid, bigint, bigint),
  public.concierge_draft_proposal(uuid, text, text, numeric, uuid),
  public.concierge_add_task(uuid, uuid, text, date),
  public.concierge_draft_contract(uuid, uuid, text, text),
  public.concierge_add_ledger_line(uuid, text, numeric, date),
  public.concierge_record_usage(uuid, bigint, bigint)
  to authenticated;
