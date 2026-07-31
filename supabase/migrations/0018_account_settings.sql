-- 0018 — Account menu & Settings (M17, PR1: Parts A–E). Additive only. Two profile
-- preference columns (render-time only — no stored UTC value changes, same contract as
-- the M11 Calendly design) and a windowed workspace-deletion request flag. NO new anon
-- surface, NO new public function (the anon matrix stays exactly 10), NO RLS rewrite:
-- both new profiles columns fall under the existing table-level self-update policy
-- (profiles_update: using id = auth.uid()), and the deletion flag falls under the
-- existing owner-only workspaces_update policy. The studio subscription table
-- (workspace_subscriptions) ships with its reader in PR2's 0019 — not here.

-- ── §B language & region: per-account timezone + date-format preference ───────────
-- timezone default matches calendly_connections' studio-grid default. date_format is a
-- checked text column ('auto' derives from locale: es→DMY, en→MDY) — no new enum type.
alter table public.profiles
  add column timezone text not null default 'America/Mexico_City',
  add column date_format text not null default 'auto';

alter table public.profiles
  add constraint profiles_date_format_chk check (date_format in ('auto', 'DMY', 'MDY', 'YMD'));

-- ── §D privacy: windowed account/workspace deletion request ───────────────────────
-- A guarded, reversible request — NOT a purge. Setting the flag marks the workspace for
-- an ops-side hard-delete after a grace window; the owner can undo (clear it) until then.
-- Owner-only via the existing workspaces_update policy (is_workspace_owner); the actual
-- destructive delete is an ops/backend step, never a self-serve instant action.
alter table public.workspaces
  add column deletion_requested_at timestamptz null,
  add column deletion_requested_by uuid null references public.profiles (id) on delete set null;
