-- 0014 calendar (M11) — stored Calendly meetings + the connection. Additive.
-- Kills v1's fetch-and-forget: a booking is STORED (webhook → a meetings row), so
-- the grid renders from Forma's own DB and a booking can join a wedding/task/trail.
-- No DEFINER functions: writes ride the service-role webhook route (Stripe
-- precedent). Nothing anon anywhere here — the anon matrix stays EXACTLY 10.
-- Tokens/signing-key are AES-256-GCM app-layer ciphertext: stored as text, never
-- decrypted in SQL (decryption is app-side only, under CALENDLY_TOKEN_ENC_KEY).

do $$ begin create type public.calendly_status as enum ('active','revoked'); exception when duplicate_object then null; end $$;
do $$ begin create type public.meeting_status as enum ('scheduled','canceled'); exception when duplicate_object then null; end $$;

-- ── one Calendly connection per workspace ────────────────────────────────────
create table if not exists public.calendly_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces (id) on delete cascade,
  calendly_user_uri text not null,
  calendly_org_uri text not null,
  access_token_enc text not null,        -- AES-256-GCM ciphertext (app-side only)
  refresh_token_enc text not null,
  token_expires_at timestamptz not null,
  webhook_subscription_id text,          -- Calendly's subscription URI (for delete on disconnect)
  webhook_signing_key_enc text,          -- returned at subscription-create, stored encrypted
  timezone text not null default 'America/Mexico_City',  -- the studio grid zone (from Calendly user)
  status public.calendly_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists touch_calendly_connections on public.calendly_connections;
create trigger touch_calendly_connections before update on public.calendly_connections for each row execute function private.touch_updated_at();

-- ── stored bookings (the calendar renders from these, never from Calendly's API)
create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  calendly_event_uri text not null,
  calendly_invitee_uri text not null,
  title text,
  event_type_name text,
  invitee_name text,
  invitee_email text,
  start_at timestamptz not null,   -- stored UTC; the connection's tz is a render + bucketing input
  end_at timestamptz,
  status public.meeting_status not null default 'scheduled',
  join_url text,
  cancel_url text,
  reschedule_url text,
  wedding_id uuid references public.weddings (id) on delete set null,  -- reserved (no UI in M11)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- idempotency: a Calendly (event, invitee) pair is ONE meeting — replays/retries
  -- land on the same row (upsert target).
  unique (workspace_id, calendly_event_uri, calendly_invitee_uri)
);
create index if not exists meetings_workspace_start_idx on public.meetings (workspace_id, start_at);
drop trigger if exists touch_meetings on public.meetings;
create trigger touch_meetings before update on public.meetings for each row execute function private.touch_updated_at();

-- ── RLS: both tables are staff-only (a studio instrument). Writes bypass RLS via
-- the service-role webhook route; there is no anon or couple lane in M11.
alter table public.calendly_connections enable row level security;
drop policy if exists calendly_connections_staff on public.calendly_connections;
create policy calendly_connections_staff on public.calendly_connections for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));

alter table public.meetings enable row level security;
drop policy if exists meetings_staff on public.meetings;
create policy meetings_staff on public.meetings for all to authenticated
  using (private.is_workspace_member(workspace_id)) with check (private.is_workspace_member(workspace_id));

-- §11: no functions added, so no wrapper grants and no anon surface — the matrix
-- stays exactly 10. Table access is the harness/Supabase default (authenticated +
-- service_role CRUD, anon SELECT) fenced by the staff-only RLS above; a guest and a
-- non-member both see zero rows.
