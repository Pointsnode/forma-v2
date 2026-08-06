-- 0022 — the design studio v1 (M3). Additive only: new columns + three new tables with
-- RLS. NO new functions, NO anon access, NO re-creations — the anon matrix stays exactly
-- 10, untouched. design_items already carries `sort` (0008), so only design_boards grows.

-- ── design_boards: style-guide metadata + read-only pins ─────────────────────
-- category (free text), cover_item_id (a chosen item as the guide cover), and the two
-- pins (budget_category / engagement_id) that tie a guide to the money it becomes.
-- Loose uuids must not dangle: cover/engagement/source_item carry FKs, all on delete set
-- null. The cover FK creates a SECOND design_boards→design_items relationship, so every
-- nested design_items embed must name the board relationship (design_items!design_items_board_fk).
alter table public.design_boards
  add column if not exists category text,
  add column if not exists cover_item_id uuid references public.design_items (id) on delete set null,
  add column if not exists budget_category text,
  add column if not exists engagement_id uuid references public.wedding_vendors (id) on delete set null;

-- ── design_palette_swatches — the wedding's palette (grows from the imagery) ──
create table if not exists public.design_palette_swatches (
  id uuid primary key default gen_random_uuid(),
  wedding_id uuid not null references public.weddings (id) on delete cascade,
  hex text not null check (hex ~ '^#[0-9a-fA-F]{6}$'),
  name text,
  source_item_id uuid references public.design_items (id) on delete set null,
  sort int not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists design_palette_swatches_wedding_idx on public.design_palette_swatches (wedding_id, sort);

-- ── workspace_palette_swatches — the studio palette (swatches kept across weddings) ──
create table if not exists public.workspace_palette_swatches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  hex text not null check (hex ~ '^#[0-9a-fA-F]{6}$'),
  name text,
  sort int not null default 0,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists workspace_palette_swatches_ws_idx on public.workspace_palette_swatches (workspace_id, sort);

-- ── design_comments — the per-image thread (planner + couple) ─────────────────
create table if not exists public.design_comments (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.design_items (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  body text not null,
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index if not exists design_comments_item_idx on public.design_comments (item_id, created_at);

-- ── RLS. Palettes mirror design_boards exactly (staff write, couple read/write, day-of
-- excluded); the workspace palette is staff-only; comments read for staff+couple of the
-- item's wedding, write/edit/delete only one's own. NO anon. ──
alter table public.design_palette_swatches enable row level security;
drop policy if exists design_palette_swatches_all on public.design_palette_swatches;
create policy design_palette_swatches_all on public.design_palette_swatches for all to authenticated
  using (private.is_wedding_staff(wedding_id) or private.is_wedding_billing_member(wedding_id))
  with check (private.is_wedding_staff(wedding_id) or private.is_wedding_billing_member(wedding_id));

alter table public.workspace_palette_swatches enable row level security;
drop policy if exists workspace_palette_swatches_all on public.workspace_palette_swatches;
create policy workspace_palette_swatches_all on public.workspace_palette_swatches for all to authenticated
  using (private.is_workspace_member(workspace_id))
  with check (private.is_workspace_member(workspace_id));

alter table public.design_comments enable row level security;
drop policy if exists design_comments_read on public.design_comments;
create policy design_comments_read on public.design_comments for select to authenticated
  using (exists (select 1 from public.design_items di where di.id = item_id
    and (private.is_wedding_staff(di.wedding_id) or private.is_wedding_billing_member(di.wedding_id))));
drop policy if exists design_comments_insert on public.design_comments;
create policy design_comments_insert on public.design_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and exists (select 1 from public.design_items di where di.id = item_id
    and (private.is_wedding_staff(di.wedding_id) or private.is_wedding_billing_member(di.wedding_id))));
drop policy if exists design_comments_update on public.design_comments;
create policy design_comments_update on public.design_comments for update to authenticated
  using (author_id = (select auth.uid())) with check (author_id = (select auth.uid()));
drop policy if exists design_comments_delete on public.design_comments;
create policy design_comments_delete on public.design_comments for delete to authenticated
  using (author_id = (select auth.uid()));
