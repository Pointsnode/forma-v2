-- 0026 — L2, the quote builder. Additive tables + the TWO new anon-executable lookups that
-- move the matrix from 10 to exactly 12. The two functions mirror rsvp_lookup exactly: a
-- SECURITY DEFINER private fn (search_path locked) + a security-invoker public wrapper granted
-- to anon + authenticated. No anon TABLE grants — anon reads pass ONLY through quote_lookup.
--
-- FORCED NAMING NOTE: public.quotes ALREADY EXISTS (0006 — the M13 VENDOR quote loop:
-- engagement_id, quote_status requested/received, quotes_engagement_fk). The spec named the
-- new client-facing table public.quotes, but that name is taken and the two concepts are
-- opposite directions (vendor→planner vs planner→client) with different lifecycles and RLS.
-- Overloading it would tangle both. So the client-facing tables are named client_quote*; the
-- concept, the routes (/quote, /quotes), the functions (quote_lookup/quote_accept) and all UI
-- stay "quote". Flagged in the PR.

-- ── client_quotes: a quote can stand alone, or link a lead and/or a wedding. number is
-- per-workspace (computed max+1 in the action; the unique index enforces it). ──
create table if not exists public.client_quotes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  lead_id uuid references public.leads (id) on delete set null,
  wedding_id uuid references public.weddings (id) on delete set null,
  number int not null,
  title text,
  intro text,
  currency text not null default 'USD',                 -- display-unit law: one currency per quote
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'withdrawn')),
  valid_until date,
  deposit_note text,
  locale text check (locale in ('en', 'es', 'fr', 'it')),
  access_token text unique,                             -- 16-hex, set at send
  accepted_at timestamptz,
  accepted_name text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists client_quotes_workspace_number_idx on public.client_quotes (workspace_id, number);
create index if not exists client_quotes_lead_idx on public.client_quotes (lead_id) where lead_id is not null;
create index if not exists client_quotes_wedding_idx on public.client_quotes (wedding_id) where wedding_id is not null;
drop trigger if exists touch_client_quotes on public.client_quotes;
create trigger touch_client_quotes before update on public.client_quotes for each row execute function private.touch_updated_at();

-- ── client_quote_lines: grouped + ordered by (section_sort, sort). section is free text. ──
create table if not exists public.client_quote_lines (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.client_quotes (id) on delete cascade,
  section text,
  section_sort int not null default 0,
  title text not null,
  description text,
  amount numeric not null check (amount >= 0),
  sort int not null default 0
);
create index if not exists client_quote_lines_quote_idx on public.client_quote_lines (quote_id, section_sort, sort);

-- ── client_quote_templates: a studio's saved quote skeleton (intro/deposit/lines snapshot). ──
create table if not exists public.client_quote_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  title text not null,
  payload jsonb not null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists touch_client_quote_templates on public.client_quote_templates;
create trigger touch_client_quote_templates before update on public.client_quote_templates for each row execute function private.touch_updated_at();

-- ── RLS: all three are workspace-member full (the leads pattern). NO anon table grants. ──
alter table public.client_quotes enable row level security;
drop policy if exists client_quotes_member on public.client_quotes;
create policy client_quotes_member on public.client_quotes for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));

alter table public.client_quote_lines enable row level security;
drop policy if exists client_quote_lines_member on public.client_quote_lines;
create policy client_quote_lines_member on public.client_quote_lines for all to authenticated
  using (exists (select 1 from public.client_quotes q where q.id = quote_id and private.is_workspace_member(q.workspace_id)))
  with check (exists (select 1 from public.client_quotes q where q.id = quote_id and private.is_workspace_member(q.workspace_id)));

alter table public.client_quote_templates enable row level security;
drop policy if exists client_quote_templates_member on public.client_quote_templates;
create policy client_quote_templates_member on public.client_quote_templates for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));

-- ════ The two anon-executable lookups (matrix 10 → 12) ════════════════════════════════════

-- quote_lookup — returns ONLY what the public page renders. The DEFINER may read the workspace
-- name (this is what finally puts the studio's name on a public surface). No ids beyond the
-- quote's own, no emails, no workspace ids. locale resolves quote → lead → workspace-creator
-- → 'en' (the 0021 pattern).
create or replace function private.quote_lookup(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare q public.client_quotes; ws_name text; prepared text; lead_loc text; cloc text;
begin
  if p_token !~ '^[a-f0-9]{16}$' then raise exception 'malformed token' using errcode = 'FM013'; end if;
  select * into q from public.client_quotes where access_token = p_token;
  if not found then raise exception 'unknown quote' using errcode = 'FM010'; end if;

  select name into ws_name from public.workspaces where id = q.workspace_id;
  select couple_display into prepared from public.leads where id = q.lead_id;
  if prepared is null then select couple_display into prepared from public.weddings where id = q.wedding_id; end if;
  select locale into lead_loc from public.leads where id = q.lead_id;
  select p.locale::text into cloc from public.workspaces ws join public.profiles p on p.id = ws.created_by where ws.id = q.workspace_id;

  return jsonb_build_object(
    'quote', jsonb_build_object(
      'id', q.id, 'number', q.number, 'title', q.title, 'intro', q.intro, 'currency', q.currency,
      'status', q.status, 'valid_until', q.valid_until, 'deposit_note', q.deposit_note,
      'accepted_at', q.accepted_at, 'accepted_name', q.accepted_name),
    'lines', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'section', ql.section, 'section_sort', ql.section_sort,
        'title', ql.title, 'description', ql.description, 'amount', ql.amount, 'sort', ql.sort)
        order by ql.section_sort, ql.sort), '[]'::jsonb)
      from public.client_quote_lines ql where ql.quote_id = q.id),
    'studio_name', ws_name,
    'prepared_for', prepared,
    'locale', coalesce(q.locale, lead_loc, cloc, 'en')
  );
end $$;

-- quote_accept — the intent. status must be 'sent' and unexpired; idempotent on 'accepted';
-- on success sets accepted_*, and when lead-linked moves the lead to 'won' + logs a 'quote'
-- event (the accepter is the anonymous recipient, so author_id stays null).
create or replace function private.quote_accept(p_token text, p_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare q public.client_quotes; nm text;
begin
  if p_token !~ '^[a-f0-9]{16}$' then raise exception 'malformed token' using errcode = 'FM013'; end if;
  select * into q from public.client_quotes where access_token = p_token;
  if not found then raise exception 'unknown quote' using errcode = 'FM010'; end if;
  if q.status = 'accepted' then return private.quote_lookup(p_token); end if;               -- idempotent
  if q.status <> 'sent' then raise exception 'closed' using errcode = 'FM011'; end if;        -- draft/withdrawn
  if q.valid_until is not null and q.valid_until < current_date then raise exception 'expired' using errcode = 'FM011'; end if;
  nm := btrim(coalesce(p_name, ''));
  if length(nm) < 1 or length(nm) > 120 then raise exception 'name required' using errcode = 'FM013'; end if;

  update public.client_quotes set status = 'accepted', accepted_at = now(), accepted_name = nm where id = q.id;
  if q.lead_id is not null then
    update public.leads set stage = 'won' where id = q.lead_id;
    insert into public.lead_events (lead_id, kind, body) values (q.lead_id, 'quote', 'accepted');
  end if;
  return private.quote_lookup(p_token);
end $$;

-- Public invoker wrappers (the rsvp shape). Param names match the .rpc() call sites.
create or replace function public.quote_lookup(token text)
returns jsonb language sql security invoker set search_path = public as $$ select private.quote_lookup(token); $$;
create or replace function public.quote_accept(token text, p_name text)
returns jsonb language sql security invoker set search_path = public as $$ select private.quote_accept(token, p_name); $$;

grant execute on function
  private.quote_lookup(text), private.quote_accept(text, text),
  public.quote_lookup(text), public.quote_accept(text, text)
  to anon, authenticated;
