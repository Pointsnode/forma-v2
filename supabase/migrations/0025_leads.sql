-- 0025 — L1, the lead desk. Additive only: two new workspace-scoped tables + one nullable
-- FK on inquiries. NO anon access, no DEFINER functions, no grant changes; the public
-- directory inquiry path is untouched, so the anon-executability matrix stays exactly 10.

-- ── leads: a lead is its own record, not a proto-wedding. Every field beyond the name is
-- optional and rough; wedding_id is set only at conversion (stage → 'won'). ───────────────
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  couple_display text not null,
  email text,
  phone text,
  locale text check (locale in ('en', 'es', 'fr', 'it')),
  date_feel text,                 -- "next fall", "sometime in 2027" — the rough feel
  date_start date,                -- a real date once one exists (carried on conversion)
  city text,
  guest_feel text,
  budget_feel text,               -- free text; parsed to a number only when clean, on convert
  source text not null check (source in ('directory', 'website', 'instagram', 'referral', 'met_at', 'other')),
  source_note text,               -- "Referral · {who}", the met-at event, etc.
  stage text not null default 'new' check (stage in ('new', 'conversation', 'consultation', 'quote_out', 'won', 'lost')),
  lost_reason text check (lost_reason in ('budget', 'date_taken', 'went_quiet', 'chose_another')),
  next_step text,                 -- an open lead always earns a next step; absence reads as neglect
  next_step_at date,
  consult_at timestamptz,         -- L1: a plain editable field (Calendly wiring is deferred to L3)
  consult_confirmed boolean not null default false,
  wedding_id uuid references public.weddings (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leads_workspace_stage_idx on public.leads (workspace_id, stage);
create index if not exists leads_workspace_nextstep_idx on public.leads (workspace_id, next_step_at);
drop trigger if exists touch_leads on public.leads;
create trigger touch_leads before update on public.leads for each row execute function private.touch_updated_at();

-- ── lead_events: the timeline. 'email', 'automated' and 'quote' are reserved for L2/L3 (in
-- the check now so the constraint never churns); L1 writes only the first six kinds. ───────
create table if not exists public.lead_events (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  kind text not null check (kind in ('arrived', 'note', 'stage', 'consult', 'converted', 'lost', 'email', 'automated', 'quote')),
  body text,
  meta jsonb,
  author_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists lead_events_lead_idx on public.lead_events (lead_id, created_at);

-- ── Promotion link: which lead an inquiry became (nullable, additive). The inquiries table
-- is ours (0013); this never touches its public DEFINER path or the matrix. ────────────────
alter table public.inquiries add column if not exists lead_id uuid references public.leads (id) on delete set null;

-- ── RLS: both tables are workspace-member only (the inquiries/service-area pattern). leads
-- keys off its own workspace_id; lead_events keys off its parent lead's workspace. No anon.
alter table public.leads enable row level security;
drop policy if exists leads_member on public.leads;
create policy leads_member on public.leads for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));

alter table public.lead_events enable row level security;
drop policy if exists lead_events_member on public.lead_events;
create policy lead_events_member on public.lead_events for all to authenticated
  using (exists (select 1 from public.leads l where l.id = lead_id and private.is_workspace_member(l.workspace_id)))
  with check (exists (select 1 from public.leads l where l.id = lead_id and private.is_workspace_member(l.workspace_id)));
