-- 0027 — L3, automation v1. Additive only: one workspace-scoped rules table + one boolean on
-- leads. NO functions, no grants; the sweep runs on the service-role client (allowlisted, one
-- lib file), so the anon-executability matrix stays exactly 12, untouched.

-- Two named rules per workspace (enabled off by default; the planner authors them in Settings).
-- days applies to the quiet follow-up (1..30); consult_confirm ignores it.
create table if not exists public.lead_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  rule text not null check (rule in ('consult_confirm', 'quiet_follow_up')),
  enabled boolean not null default false,
  days int not null default 4 check (days between 1 and 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, rule)
);
drop trigger if exists touch_lead_rules on public.lead_rules;
create trigger touch_lead_rules before update on public.lead_rules for each row execute function private.touch_updated_at();

-- Per-lead opt-out: no automated email ever fires for a muted lead.
alter table public.leads add column if not exists automation_muted boolean not null default false;

alter table public.lead_rules enable row level security;
drop policy if exists lead_rules_member on public.lead_rules;
create policy lead_rules_member on public.lead_rules for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));
