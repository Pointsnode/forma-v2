-- 0017 — Seating, reachable (M14). Additive only: the loose seat + seat-sides on seating_tables,
-- and the venue-blueprint background on seating_plans. NO new RLS (a loose seat is a seating_tables
-- row and inherits its gating; the blueprint file lives in the existing wedding docs bucket). NO
-- table_shape enum change (ALTER TYPE … ADD VALUE can't be used in the same transaction — a known
-- passes-review-fails-apply trap; a boolean column has none of it). NO anon grant. seats is UNTOUCHED.

-- ── §D loose seat + §C seat-sides ────────────────────────────────────────────────
alter table public.seating_tables
  add column is_loose boolean not null default false,
  add column grouped_with uuid null references public.seating_tables(id) on delete set null,
  add column seat_sides text not null default 'all';

alter table public.seating_tables
  add constraint seating_tables_seat_sides_chk check (seat_sides in ('all', 'long', 'one')),
  add constraint seating_tables_loose_chk check (not is_loose or (capacity = 1 and grouped_with is distinct from id));

create index seating_tables_grouped_with_idx on public.seating_tables (grouped_with) where grouped_with is not null;

-- ── §L venue blueprint: the stored file's path (existing wedding docs bucket) + its display
-- settings (opacity/scale/offset/locked). Additive; nullable; no backfill needed.
-- NOTE: the spec calls the plan table "seating_plans"; the real table is public.floor_plans
-- (0008 base, widened by 0012 — there is no seating_plans table). Columns land on floor_plans.
alter table public.floor_plans
  add column background text null,
  add column background_settings jsonb not null default '{}'::jsonb;
