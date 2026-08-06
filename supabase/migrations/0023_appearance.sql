-- 0023 — Night, the appearance preference. Additive only; anon matrix stays exactly 10
-- functions (no tables, no policies, no grants, no function changes).

-- A per-user theme choice, mirroring profiles.locale. NULL means bone (the brand default),
-- so a user who never touches the setting renders exactly as today, no backfill. 'default'
-- follows the device (prefers-color-scheme); 'night' is the dark register (the #36 tokens).
-- Text + check exactly as the spec wrote it (not an enum); the value only ever drives which
-- data-theme attribute the server puts on <html> for signed-in surfaces.
alter table public.profiles
  add column if not exists appearance text
  check (appearance in ('default', 'bone', 'night'));
